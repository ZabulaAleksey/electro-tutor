import { expect, test } from "@playwright/test";
const path = "/ru/topics/dc/mesh-current-method/examples/";

test("RUN3C real textbook→examples→textbook journey preserves the reading contract", async ({ page }) => {
  await page.goto("/ru/topics/dc/mesh-current-method/");
  await page.getByRole("link", { name: "Перейти к подробным примерам решений →", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.locator(".mesh-worked-example")).toHaveCount(4);
  await page.locator(".textbook-toc a[href='#example-4']").click();
  await expect(page).toHaveURL(/#example-4$/);
  await expect(page.locator("#example-4")).toContainText("он поглощает мощность");
  await page.reload(); await expect(page).toHaveURL(/#example-4$/);
  await page.getByRole("link", { name: "Вернуться к подробному учебнику", exact: true }).click();
  await expect(page.locator(".lesson-section h2")).toHaveCount(11);
});

test("RUN3C examples remain complete without JS and never advertise a missing UK translation", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto(path);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator(".mesh-worked-example")).toHaveCount(4);
    await expect(page.locator("svg.mesh-example-scheme")).toHaveCount(4);
    await expect(page.locator(".katex-error")).toHaveCount(0);
    await expect(page.locator("#example-4")).toContainText("20/3");
    await expect(page.locator("link[hreflang='uk'],a[data-language-link]")).toHaveCount(0);
    await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", new RegExp(`${path}$`));
    await page.locator(".textbook-toc a[href='#example-3']").click();
    await expect(page).toHaveURL(/#example-3$/);
    await expect(page.locator("#example-3 h2")).toBeInViewport();
  } finally { await context.close(); }
});

for (const width of [320, 375, 390, 768, 1280, 1920]) for (const theme of ["light", "dark"] as const) {
  test(`RUN3C examples ${width}px ${theme}: physical schemes and complete math`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.route("https://fonts.googleapis.com/**", route => route.abort());
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(path); await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const layout = await page.evaluate(() => ({
      overflow: [...document.querySelectorAll<HTMLElement>(".formula-block")].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.textContent),
      document: document.documentElement.scrollWidth,
      transformed: [...document.querySelectorAll(".formula")].filter(e => getComputedStyle(e).textTransform !== "none").length,
    }));
    expect(layout.document).toBeLessThanOrEqual(width); expect(layout.overflow).toEqual([]); expect(layout.transformed).toBe(0);
    for (const svg of await page.locator("svg.mesh-example-scheme").all()) {
      const geometry = await svg.evaluate(node => {
        const el = node as SVGSVGElement; const scale = el.getScreenCTM()!.a; const texts = [...el.querySelectorAll("text")];
        const b = texts.map(t => ({ label: t.textContent, box: t.getBBox(), font: parseFloat(getComputedStyle(t).fontSize) * scale }));
        const overlap: string[] = [];
        for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
          const a = b[i].box, c = b[j].box;
          if (Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x) > 1 && Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y) > 1) overlap.push(`${b[i].label}/${b[j].label}`);
        }
        const view = el.viewBox.baseVal;
        return { minFont: Math.min(...b.map(t => t.font)), overlap,
          outside: b.filter(({ box: a }) => a.x < 0 || a.y < 0 || a.x + a.width > view.width || a.y + a.height > view.height).map(t => t.label) };
      });
      expect(geometry.minFont).toBeGreaterThanOrEqual(12); expect(geometry.overlap).toEqual([]); expect(geometry.outside).toEqual([]);
    }
    const ids = await page.locator("svg.mesh-example-scheme marker").evaluateAll(nodes => nodes.map(e => e.id)); expect(new Set(ids).size).toBe(ids.length);
    const style = await page.addStyleTag({ content: "html{scroll-behavior:auto!important;overflow-anchor:none!important}.astro-header,.journey-rail{visibility:hidden!important}" });
    try {
      for (const n of [1, 2, 3, 4]) {
        const section = page.locator(`#example-${n}`);
        for (const [part, region] of [["scheme", section.locator("figure")], ["equations", section.locator(".formula-block").nth(n === 1 ? 3 : n === 2 ? 1 : 2)], ["balance", section.locator(".formula-block").last()]] as const) {
          const png = await region.screenshot({ animations: "disabled" });
          await testInfo.attach(`${part}${n}-${width}-${theme}`, { body: png, contentType: "image/png" });
          if (process.platform === "win32") await expect(region).toHaveScreenshot(`${part}${n}-${width}-${theme}.png`, { animations: "disabled" });
        }
      }
    } finally { await style.evaluate(e => e.parentNode?.removeChild(e)); }
    expect(errors).toEqual([]);
  });
}
