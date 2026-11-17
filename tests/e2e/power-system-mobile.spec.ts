import { expect, test } from "@playwright/test";

test.describe("phone power layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test("keeps the one-line diagram inside its scroller and changes compact readings on a tap", async ({ page }) => {
    await page.goto("/uk/interactive/power-system/");
    const lab = page.locator("[data-power-ready=true]");
    await lab.getByLabel("Навчальна мережа", { exact: true }).selectOption("ring");
    await lab.getByRole("button", { name: "Розрахувати за Ybus" }).tap();
    const compact = lab.locator("[data-power-mobile-readout]");
    await expect(compact).toBeVisible();
    await expect(compact.locator("[data-power-mobile-bus]")).toHaveCount(3);
    const bounds = await lab.locator(".circuit-viewport").evaluate(element => ({
      viewport: element.clientWidth, diagram: element.scrollWidth,
      doc: document.documentElement.scrollWidth, width: window.innerWidth,
    }));
    expect(bounds.diagram).toBeGreaterThan(bounds.viewport);
    expect(bounds.doc).toBeLessThanOrEqual(bounds.width + 1);
    await lab.getByRole("button", { name: "Лінія L2", exact: true }).tap();
    await expect(compact.locator('[data-power-mobile-branch="L2"]')).toContainText("MVAr");
    await expect(lab.getByRole("combobox", { name: "Обладнання", exact: true })).toHaveValue("L2");
  });
});
