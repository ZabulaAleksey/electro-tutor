import {expect,test} from "@playwright/test";

test("panorama rotates every eight seconds, pauses on hover and restarts after manual navigation",async({page})=>{
 await page.emulateMedia({reducedMotion:"no-preference"});const start=new Date("2030-01-01T00:00:00Z");await page.clock.install({time:start});await page.clock.pauseAt(new Date(start.getTime()+1000));await page.goto("/ru/");
 const carousel=page.locator("[data-panorama-index]");await page.mouse.move(5,80);await expect(carousel).toHaveAttribute("data-autoplay","true");
 await page.clock.fastForward(7900);await expect(carousel).toHaveAttribute("data-panorama-index","0");await page.clock.fastForward(200);await expect(carousel).toHaveAttribute("data-panorama-index","1");
 await page.locator(".panorama-slides").hover();await expect(carousel).toHaveAttribute("data-autoplay","false");await page.clock.fastForward(20000);await expect(carousel).toHaveAttribute("data-panorama-index","1");
 await page.getByRole("button",{name:"Следующая панорама",exact:true}).click();await expect(carousel).toHaveAttribute("data-panorama-index","2");await page.mouse.click(5,80);await expect(carousel).toHaveAttribute("data-autoplay","true");
 await page.clock.fastForward(7900);await expect(carousel).toHaveAttribute("data-panorama-index","2");await page.clock.fastForward(200);await expect(carousel).toHaveAttribute("data-panorama-index","3");
 await page.getByRole("button",{name:"Пауза",exact:true}).click();await page.mouse.click(5,80);await page.clock.fastForward(20000);await expect(carousel).toHaveAttribute("data-panorama-index","3");
});

test("reduced motion disables automatic changes; every panorama points to an actual tool",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/uk/");const carousel=page.locator("[data-panorama-index]");await expect(carousel).toHaveAttribute("data-autoplay","false");
 const destinations=["/micro-labs/#micro=ohm-law","/micro-labs/#micro=capacitor-charge","/interactive/star-neutral/","/interactive/transmission-line/"];
 for(let k=0;k<4;k++){const active=page.locator('.panorama-slide[data-active="true"]');await expect(active.locator("img")).toBeVisible();await expect.poll(()=>active.locator("img").evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);await expect(active.locator("a")).toHaveAttribute("href","/uk"+destinations[k]);await expect(active.locator(".engineering-plot")).toBeVisible();await page.getByRole("button",{name:"Наступна панорама",exact:true}).click();}
 await expect(carousel).toHaveAttribute("data-panorama-index","0");expect(errors).toEqual([]);
});

test("touch swipe changes only the panorama and preserves vertical page scrolling",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/ru/");await expect(page.locator("[data-panorama-index]")).toHaveAttribute("data-autoplay","false");
 const session=await page.context().newCDPSession(page),area=(await page.locator(".panorama-slides").boundingBox())!,y=area.y+100;
 await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:area.x+280,y,id:1}]});await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:area.x+110,y:y+2,id:1}]});await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(page.locator("[data-panorama-index]")).toHaveAttribute("data-panorama-index","1");
 expect(await page.locator(".panorama-showroom").evaluate(e=>getComputedStyle(e).touchAction)).toBe("pan-y");
});

test("panorama and shared catalog fit all target widths in both locales/themes",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.emulateMedia({reducedMotion:"reduce"});
 for(const width of [360,390,768,1024,1440,1920]){await page.setViewportSize({width,height:900});await page.goto(width%3===0?"/ru/":"/uk/");await expect(page.locator('[data-panorama-index]')).toBeVisible();await expect.poll(()=>page.locator('.panorama-slide[data-active="true"] img').evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);for(const theme of ["light","dark"]){await page.evaluate(t=>{localStorage.setItem("potential-theme",t);document.documentElement.dataset.theme=t;},theme);const slide=page.locator('.panorama-slide[data-active="true"]');expect(await slide.locator("a").evaluate(e=>{const r=e.getBoundingClientRect();return r.width>40&&r.height>=40})).toBe(true);if(width===1440||width===390)await page.screenshot({path:info.outputPath(`panorama-${width}-${theme}.png`),fullPage:true});}}
 expect(errors).toEqual([]);
});

 test("previous panorama is preloaded before a reverse transition",async({page})=>{await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/ru/");const image=page.locator('.panorama-slide').last().locator('img');await expect(image).toHaveAttribute('loading','eager');await expect.poll(()=>image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);await page.getByRole('button',{name:'Предыдущая панорама',exact:true}).click();await expect(page.locator('[data-panorama-index]')).toHaveAttribute('data-panorama-index','3');await expect(image).toBeVisible();});
