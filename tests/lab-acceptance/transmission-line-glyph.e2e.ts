import { expect, test } from "@playwright/test";

for (const mode of ["transient", "steady"] as const) {
  test(`${mode} transmission line uses a solid straight segment at desktop and mobile widths`, async ({ page }) => {
    const steady = mode === "steady";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/ru/interactive/transmission-line${steady ? "-steady" : ""}/`);
    if (steady) await page.getByText("Схема опыта", { exact: true }).click();

    const segment = page.locator("[data-circuit-editor] .network-transmission-stroke").first();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(segment).toBeVisible();
      await expect(segment).toHaveAttribute("fill", "var(--ink)");
      await expect(segment).not.toHaveAttribute("rx", /.+/);
      await expect(segment.locator('xpath=../*[local-name()="path"]')).toHaveCount(1);
      const height = Number(await segment.getAttribute("height"));
      const length = Number(await segment.getAttribute("width"));
      expect(height).toBeGreaterThan(3.4);
      expect(height).toBeLessThan(length / 4);
    }
  });
}
