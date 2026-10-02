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
   await page.goto(route);await expect(page.locator("main h1"),route).toHaveCount(1);
   await expect(page.locator('nav a[href$="/account/"]')).toHaveCount(1);
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
 await page.route("http://127.0.0.1:8000/api/v1/me",async route=>{await new Promise(resolve=>setTimeout(resolve,12_000));await route.abort().catch(()=>{});});
 await page.goto("/ru/account/");
 await expect(page.locator("[data-session-status]")).toContainText("Не удалось проверить сессию",{timeout:15_000});
 await expect(page.locator("[data-profiles]")).toBeHidden();
 await expect(page.locator("[data-notifications]")).toBeHidden();
 await page.unrouteAll({behavior:"wait"});
 await page.route("http://127.0.0.1:8000/api/v1/me",route=>route.fulfill({status:200,body:"{broken",contentType:"application/json"}));
 await page.goto("/uk/account/");
 await expect(page.locator("[data-session-region]")).not.toHaveAttribute("aria-busy","true");
 await expect(page.locator("[data-profiles]")).toBeHidden();
 await expect(page.locator("main")).not.toContainText("{broken");
});
