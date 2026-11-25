import { expect, test, type Page } from "@playwright/test";
import { microLabs } from "../../src/showcase/micro-catalog";

for (const width of [390, 900, 1440]) {
  test("all MicroLabs bounds and readable scheme labels at " + width + "px", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/ru/micro-labs/");
    await expect(page.locator('[data-lab-card][href*="/interactive/experiments/micro/"]')).toHaveCount(14);
    await expect(page.locator('[data-lab-card][href*="/interactive/experiments/science/"]')).toHaveCount(12);
    for (const { id } of microLabs) {
      await test.step(id, async () => {
        await page.goto("/ru/interactive/experiments/micro/" + id + "/");
        const card = page.locator('[data-micro="' + id + '"]');
        await expect(card.locator(".micro-circuit")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const findings = await card.locator(".micro-circuit").evaluate(node => {
          const svg = node as SVGSVGElement;
          const view = svg.viewBox.baseVal;
          const scale = svg.getBoundingClientRect().width / view.width;
          return [...svg.querySelectorAll("text")].flatMap(label => {
            const box = label.getBBox();
            const transform = svg.getCTM()!.inverse().multiply(label.getCTM()!);
            const start = new DOMPoint(box.x, box.y).matrixTransform(transform);
            const end = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform);
            const fontSize = parseFloat(getComputedStyle(label).fontSize) * scale;
            const clipped = start.x < -1 || start.y < -1 || end.x > view.width + 1 || end.y > view.height + 1;
            return clipped || fontSize < 8 ? [{ text: label.textContent, start, end, fontSize }] : [];
          });
        });
        expect(findings).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.evaluate(() => document.documentElement.dataset.theme = "dark");
        const bounds = await card.boundingBox();
        expect(bounds!.width).toBeGreaterThan(240);
      });
    }
  });
}

// Compare the existing models in the gallery layout in which the reference
// images were approved. Dedicated routes and new card layout have their own
// browser assertions. This fixture mounts the real built application islands.
async function renderOriginalGallery(page: Page) {
  await page.goto("/ru/micro-labs/");
  await page.evaluate(async () => {
    const views = await Promise.all([
      { path: "/ru/interactive/experiments/micro/ohm-law/", props: { language: "ru", focusSelected: true } },
      { path: "/ru/interactive/experiments/science/pendulum/", props: { language: "ru" } },
    ].map(async ({ path, props }) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error("Experiment route unavailable: " + path);
      const html = new DOMParser().parseFromString(await response.text(), "text/html");
      const island = html.querySelector("astro-island[component-url][renderer-url]");
      const componentUrl = island?.getAttribute("component-url");
      const rendererUrl = island?.getAttribute("renderer-url");
      const componentExport = island?.getAttribute("component-export");
      if (!componentUrl || !rendererUrl || !componentExport) throw new Error("Experiment island missing: " + path);
      const [components, renderer] = await Promise.all([import(componentUrl), import(rendererUrl)]);
      return { component: components[componentExport], render: renderer.default, props };
    }));
    const main = document.querySelector("main");
    if (!main) throw new Error("Gallery main region missing");
    main.innerHTML = [
      '<section class="section container micro-labs-page">',
      '<p class="eyebrow">Инженерная визуализация</p>',
      '<h1>MicroLabs</h1>',
      '<p class="page-lead">Меняйте параметры и сразу проверяйте формулу, единицы и график.</p>',
      '<div ssr style="display: contents" data-gallery-reference-mount></div>',
      '<h2>Математика и естественные науки</h2>',
      '<div ssr style="display: contents" data-gallery-reference-mount></div>',
      '</section>',
    ].join("");
    const mounts = main.querySelectorAll("[data-gallery-reference-mount]");
    views.forEach(({ component, render, props }, index) =>
      render(mounts[index])(component, props, {}, { client: "only" }),
    );
  });
}

test("reviewed visual goldens cover every electrical/science thumbnail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await renderOriginalGallery(page);
  const microCards = page.locator(".micro-card[data-micro-model]");
  const scienceCards = page.locator("[data-science-id]");
  await expect(microCards).toHaveCount(14);
  await expect(scienceCards).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  for (const card of await microCards.all()) {
    const id = await card.getAttribute("data-micro");
    await expect.soft(card.locator(".micro-circuit")).toHaveScreenshot(id + ".png", { animations: "disabled" });
  }
  for (const card of await scienceCards.all()) {
    const id = await card.getAttribute("data-science-id");
    await expect.soft(card.locator(".science-visual,.science-plot").first()).toHaveScreenshot("science-" + id + ".png", { animations: "disabled" });
  }
});


for(const language of ["ru","uk"])test(`shared scene glyphs reach the current ${language} catalog and reference lesson`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000}); await page.goto(`/${language}/`);
    for(const [kind,id] of [["dc","dc-series"],["ac","ac-rlc"],["three","balanced-star"],["rc","rc-charge"],["diode","diode-load-line"],["neutral","floating-neutral"],["line","line-reflection"]]){
      await page.evaluate(id=>{location.hash=`story=${id}`},id);await expect(page.locator(`[data-scene="${id}"]`)).toBeVisible();
      if(kind==="line")await page.goto(`/${language}/micro-labs/#micro=line-load-reflection`);
      const svg=page.locator(kind === "line" ? '[data-micro="line-load-reflection"] .micro-circuit' : `.lab-circuit[aria-label$=": ${kind}"]`).first();
      await svg.scrollIntoViewIfNeeded(); await expect(svg).toBeVisible();
      expect(await svg.locator("[data-symbol]").count(),kind).toBeGreaterThan(0);
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
