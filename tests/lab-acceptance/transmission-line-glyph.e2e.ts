import { expect, test } from "@playwright/test";

for (const mode of ["transient", "steady"] as const) {
  test(`${mode} transmission line uses a solid straight segment at desktop and mobile widths`, async ({ page }) => {
    const steady = mode === "steady";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ru/interactive/transmission-line${steady ? "-steady" : ""}/`);
    if (steady) await expect(page).toHaveURL(/transmission-line-steady\/experiment\/$/);

    const segment = page.locator(steady ? '[data-line-glyph="TL1"] .line-experiment-conductor' : "[data-circuit-editor] .network-transmission-stroke").first();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(segment).toBeVisible();
      if (steady) {
        await expect(segment).toHaveAttribute("d", "M-48 0H48M-48 148H48");
        const width = await segment.evaluate(element => parseFloat(getComputedStyle(element).strokeWidth));
        expect(width).toBeGreaterThan(3.4);
        expect(width).toBeLessThan(96 / 4);
        continue;
      } else {
        const stroke = segment.locator("path");
        await expect(stroke).toHaveCount(1);
        await expect(stroke).toHaveAttribute("d", /^M0 2\.5H[0-9.]+$/);
        await expect(stroke).toHaveAttribute("stroke-linecap", "round");
        await expect(stroke).toHaveAttribute("stroke-width", "5");
      }
      const height = Number(await segment.getAttribute("height"));
      const length = Number(await segment.getAttribute("width"));
      expect(height).toBeGreaterThan(3.4);
      expect(height).toBeLessThan(length / 4);
    }
  });
}
