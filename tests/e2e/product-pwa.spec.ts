import { expect, test } from "@playwright/test";
test("RC1 manifest has installable raster icons and controlled public shell",async({page,context})=>{
 await page.goto("/ru/");
 await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller) await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener("controllerchange",()=>resolve(),{once:true}));});
 const manifest=await (await page.request.get("/manifest.webmanifest")).json();
 expect(manifest.display).toBe("standalone");
 for(const size of [192,512]){
  const icon=manifest.icons.find((i:{sizes:string,type:string})=>i.sizes===`${size}x${size}`&&i.type==="image/png");expect(icon).toBeTruthy();
  const dimensions=await page.evaluate(async src=>{const image=new Image();image.src=new URL(src,location.origin).href;await image.decode();return [image.naturalWidth,image.naturalHeight];},icon.src);
  expect(dimensions).toEqual([size,size]);
 }
 const cdp=await context.newCDPSession(page);await cdp.send("Page.enable");
 const result=await cdp.send("Page.getInstallabilityErrors");expect(result.installabilityErrors).toEqual([]);
});
test("RC1 visited lesson and primary line Worker run offline without private API caching",async({page,context})=>{
 test.setTimeout(90_000);
 await page.goto("/ru/interactive/transmission-line/");await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
 await page.goto("/ru/topics/dc/mesh-current-method/");await expect(page.locator("main h1")).toBeVisible();
 await context.setOffline(true);await page.reload({waitUntil:"domcontentloaded"});await expect(page.locator("main h1")).toBeVisible();
 await page.goto("/ru/interactive/transmission-line/");await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
 await page.getByRole("spinbutton",{name:"E, V",exact:true}).fill("120");await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");await page.getByRole("spinbutton",{name:"Rₛ, Ω",exact:true}).fill("50");await page.getByRole("group",{name:"Конструктор нагрузки",exact:true}).getByRole("button",{name:"+ R",exact:true}).click();await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");await page.getByRole("slider",{name:"Точка наблюдения x",exact:true}).press("End");await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("6");expect(Number(await page.locator("[data-network-lab]").getAttribute("data-probe-u"))).toBe(60);expect(Number(await page.locator("[data-network-lab]").getAttribute("data-probe-i"))).toBeCloseTo(1.2,12);
 const privateEntries=await page.evaluate(async()=>{const urls:string[]=[];for(const name of await caches.keys())for(const request of await (await caches.open(name)).keys())if(/\/(api|auth)\//.test(new URL(request.url).pathname))urls.push(request.url);return urls;});expect(privateEntries).toEqual([]);
 await context.setOffline(false);
});
