import { expect, test } from "@playwright/test";
for (const width of [390, 900, 1440]) test(`all MicroLabs bounds and readable scheme labels at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto("/ru/micro-labs/");
  await expect(page.locator(".micro-card[data-micro-model]")).toHaveCount(14);
  await expect(page.locator("[data-science-id]")).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  const findings = await page.locator(".micro-card .micro-circuit").evaluateAll(nodes => nodes.flatMap(node => {
    const svg = node as SVGSVGElement, view = svg.viewBox.baseVal, scale = svg.getBoundingClientRect().width / view.width;
    return [...svg.querySelectorAll("text")].flatMap(t => { const b = t.getBBox(), matrix = t.getCTM()!, root = svg.getCTM()!, transform = root.inverse().multiply(matrix), p = new DOMPoint(b.x, b.y).matrixTransform(transform), q = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(transform), px = parseFloat(getComputedStyle(t).fontSize) * scale; return p.x < -1 || p.y < -1 || q.x > view.width + 1 || q.y > view.height + 1 || px < 8 ? [{ id: svg.closest("[data-micro]")?.getAttribute("data-micro"), text: t.textContent, p: [p.x, p.y], q: [q.x, q.y], px }] : []; });
  }));
  expect(findings).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  for (const card of await page.locator(".micro-card[data-micro-model]").all()) { const bounds = await card.boundingBox(); expect(bounds!.width).toBeGreaterThan(240); }
});
test("reviewed visual goldens cover every electrical/science thumbnail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/ru/micro-labs/");
  await expect(page.locator(".micro-card[data-micro-model]")).toHaveCount(14); await page.evaluate(() => document.fonts.ready);
  for (const card of await page.locator(".micro-card[data-micro-model]").all()) { const id = await card.getAttribute("data-micro"); await expect.soft(card.locator(".micro-circuit")).toHaveScreenshot(`${id}.png`, { animations: "disabled" }); }
  for (const card of await page.locator("[data-science-id]").all()) { const id = await card.getAttribute("data-science-id"); await expect.soft(card.locator(".science-visual,.science-plot").first()).toHaveScreenshot(`science-${id}.png`, { animations: "disabled" }); }
});


for(const language of ["ru","uk"])test(`shared scene glyphs reach the current ${language} catalog and reference lesson`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000}); await page.goto(`/${language}/`);
    for(const kind of ["dc","ac","three","rc","diode","neutral","line"]){
      const svg=page.locator(`.lab-circuit[aria-label$=": ${kind}"]`).first();
      await svg.scrollIntoViewIfNeeded(); await expect(svg).toBeVisible();
      expect(await svg.locator("[data-symbol]").count()).toBeGreaterThan(0);
      const bounds=await svg.evaluate(node=>{const svg=node as SVGSVGElement,b=svg.getBBox(),v=svg.viewBox.baseVal;return b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1;});
      expect(bounds,`${kind} SVG geometry clipped`).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goto(`/${language}/topics/dc/mesh-current-method/`);
    await expect(page.locator('.circuit [data-symbol="resistor"]')).toHaveCount(3);
    await expect(page.locator('.circuit [data-symbol="reference-emf"]')).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
