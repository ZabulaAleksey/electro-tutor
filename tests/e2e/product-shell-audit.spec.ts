import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
function pages(root: string, path = ""): string[] {
 return readdirSync(join(root,path),{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? pages(root,join(path,entry.name)) : entry.name === "index.html" ? ["/"+path.replaceAll("\\","/")+"/"] : []);
}
const routes = pages("dist").filter(path=>/^\/(ru|uk)\//.test(path));
for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]) {
 test(`RC1 all public routes semantic and responsive ${viewport.width}`,async({page})=>{
  test.setTimeout(240_000);
  await page.setViewportSize(viewport);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  for(const route of routes){
   await page.goto(route);await expect(page.locator("main h1:visible"),route).toHaveCount(1);
   await expect(page.locator('nav a[href$="/board/"]')).toHaveCount(1);
   const issues=await page.evaluate(()=>{
    const visible=(e:Element)=>e.getClientRects().length>0 && getComputedStyle(e).visibility!=="hidden";
    const problems:string[]=[];
    if(document.documentElement.scrollWidth>innerWidth+2) problems.push("horizontal overflow");
    const seen=new Set<string>();for(const e of document.querySelectorAll("[id]")){if(seen.has(e.id))problems.push("duplicate id "+e.id);seen.add(e.id);}
    for(const e of document.querySelectorAll("[aria-labelledby],[aria-describedby]")){for(const id of ((e.getAttribute("aria-labelledby")||"")+" "+(e.getAttribute("aria-describedby")||"")).trim().split(/\s+/)){if(id&&!document.getElementById(id))problems.push("missing ARIA reference "+id);}}
    for(const e of document.querySelectorAll("button,input,select,textarea")){
     if(!visible(e)||e instanceof HTMLInputElement&&["hidden","submit"].includes(e.type))continue;
     const label=e.getAttribute("aria-label")||e.getAttribute("aria-labelledby")||e.getAttribute("title")||e.textContent?.trim()||("labels" in e && Array.from((e as HTMLInputElement).labels||[]).some(l=>l.textContent?.trim()));
     if(!label)problems.push("unnamed control "+e.tagName+" "+e.id);
    }
    return problems;
   });
   expect(issues,route).toEqual([]);
  }
  expect(errors).toEqual([]);
 });
}
test("RC1 built internal links resolve and unknown route remains 404",async({page,request})=>{
 test.setTimeout(180_000);const paths=new Set<string>();
 for(const route of routes){await page.goto(route);for(const href of await page.locator("a[href]").evaluateAll(a=>a.map(e=>(e as HTMLAnchorElement).href))){const url=new URL(href);if(url.origin==="http://127.0.0.1:4322" && !url.pathname.startsWith("/api/"))paths.add(url.pathname);}}
 for(const path of paths)expect((await request.get(path)).status(),path).toBeLessThan(400);
 expect((await request.get("/ru/rc1-no-such-screen/")).status()).toBe(404);
});

test("RC1 unavailable and timed-out account requests remain product-level",async({page})=>{
 test.setTimeout(45_000);
 await page.route("http://127.0.0.1:8000/api/v1/me",async route=>{await new Promise(resolve=>setTimeout(resolve,12_000));await route.fulfill({status:503,body:""}).catch(()=>{});});
 await page.goto("/ru/account/");
 await expect(page.locator("[data-session-status]")).toContainText("Не удалось проверить сессию",{timeout:15_000});
 await expect(page.locator("[data-profiles]")).toBeHidden();
 await expect(page.locator("[data-notifications]")).toBeHidden();
});

test("RC1 malformed account response never exposes raw JSON",async({page})=>{
 await page.route("http://127.0.0.1:8000/api/v1/me",route=>route.fulfill({status:200,body:"{broken",contentType:"application/json"}));
 await page.goto("/uk/account/");
 await expect(page.locator("[data-session-region]")).not.toHaveAttribute("aria-busy","true");
 await expect(page.locator("[data-profiles]")).toBeHidden();
 await expect(page.locator("main")).not.toContainText("{broken");
});

test("RC1 reminder failed-save state preserves form and retries (mock error matrix)",async({page})=>{
 const settings={time_zone:"Europe/Kyiv",remind_24h:true,remind_1h:true,remind_15m:false,quiet_hours_enabled:false,quiet_hours_start:null,quiet_hours_end:null};let writes=0;
 await page.route("**/api/v1/**",async route=>{
  const path=new URL(route.request().url()).pathname;let status=200;let body:unknown=[];
  if(path==="/api/v1/me")body={subject:"rc1-error-state",email:"synthetic@invalid.example"};
  else if(path.includes("/profiles/")){status=404;body={error:{code:"profile_not_found"}};}
  else if(path==="/api/v1/reminder-settings/me"){
   if(route.request().method()==="PUT" && ++writes===1){status=503;body={error:{code:"unavailable",message:"raw internal details"}};}
   else body=settings;
  }else if(path==="/api/v1/notifications")body={items:[],limit:20,offset:0};else if(path.endsWith("/unread-count"))body={count:0};
  await route.fulfill({status,body:JSON.stringify(body),contentType:"application/json"});
 });
 await page.goto("/ru/account/");const form=page.locator("[data-reminder-form]");await expect(form).toBeVisible();
 await form.locator("[data-reminder-save]").click();await expect(form.locator("[data-reminder-error]")).toBeVisible();await expect(form).toHaveAttribute("aria-busy","false");
 await expect(form.locator("[data-reminder-zone]")).toHaveValue("Europe/Kyiv");await expect(page.locator("main")).not.toContainText("raw internal details");
 await form.locator("[data-reminder-save]").click();await expect(page.locator("[data-reminder-state]")).toContainText("Настройки напоминаний сохранены");expect(writes).toBe(2);
});


test("RC1 denied browser storage degrades without false saved completion",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>{for(const key of ["localStorage","sessionStorage"])Object.defineProperty(window,key,{get(){throw new Error("storage unavailable");},configurable:true});});
 await page.goto("/ru/topics/dc/mesh-current-method/");await page.getByLabel("Ваш ответ").fill("2.18");await page.getByRole("button",{name:"Проверить",exact:true}).click();
 await expect(page.locator("#practice-feedback")).toContainText("Не удалось сохранить");await expect(page.locator(".learning-storage-warning")).toBeVisible();
 await page.getByRole("button",{name:"Переключить тему"}).click();expect(errors).toEqual([]);
});
