import { expect, test } from "@playwright/test";
for (const language of ["ru", "uk"]) test(`RC1 ${language} keyboard dialog, mobile navigation and reduced motion`, async ({page}) => {
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto(`/${language}/`);
 await page.keyboard.press("Tab");
 expect(await page.evaluate(()=>document.activeElement?.matches("a,button,input"))).toBe(true);
 expect(await page.evaluate(()=>getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
 await page.locator("#app-install").focus();await page.keyboard.press("Enter");
 await expect(page.locator("#install-dialog")).toBeVisible();
 await expect(page.locator("#install-dialog")).toHaveAttribute("aria-labelledby","install-dialog-title");
 expect(await page.evaluate(()=>document.querySelector("#install-dialog")?.contains(document.activeElement))).toBe(true);
 await page.keyboard.press("Escape");await expect(page.locator("#install-dialog")).not.toBeVisible();
 await expect(page.locator("#app-install")).toBeFocused();
 await page.setViewportSize({width:390,height:844});
 await page.locator("#mobile-menu-toggle").click();await expect(page.locator("#mobile-menu-toggle")).toHaveAttribute("aria-expanded","true");
 await page.locator('nav a[href$="/account/"]').click();await expect(page).toHaveURL(new RegExp(`/${language}/account/$`));
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

test("RC1 core text contrast in both themes (bounded computed palette)", async ({page}) => {
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/ru/");
 for(const theme of ["light","dark"]){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const ratios=await page.evaluate(()=>{
   const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d")!;
   const rgb=(value:string)=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});};
   const lum=(value:string)=>{const [r,g,b]=rgb(value);return .2126*r+.7152*g+.0722*b;};
   const background=(element:Element):string=>{const color=getComputedStyle(element).backgroundColor;if(color!=="rgba(0, 0, 0, 0)"&&color!=="transparent")return color;return element.parentElement?background(element.parentElement):"rgb(255, 255, 255)";};
   return Array.from(document.querySelectorAll("main h1,main .section-kicker,main .learning-summary p,main .learning-summary small,main .button.primary")).filter(e=>e.getClientRects().length).map(e=>{const style=getComputedStyle(e);const fg=lum(style.color),bg=lum(background(e));return {text:e.textContent?.trim(),ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),minimum:parseFloat(style.fontSize)>=24?3:4.5};});
  });
  expect(ratios.length).toBeGreaterThan(0);for(const value of ratios)expect(value.ratio,`${theme}: ${value.text}`).toBeGreaterThanOrEqual(value.minimum);
 }
});
