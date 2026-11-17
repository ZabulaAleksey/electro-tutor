import { expect, test } from "@playwright/test";

test("refines both sides of the study cut including branch losses and the final bus voltages", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  const ring = lab.locator("[data-power-ring]");
  await ring.getByRole("button", { name: "Уточнить режим кольца" }).click();
  const refined = ring.locator("[data-ring-refinement-result]");
  await expect(refined.locator("[data-ring-refinement-cut]")).toHaveAttribute("data-ring-refinement-cut", "B2");
  const bus = refined.locator('[data-ring-refined-bus="B3"]');
  const initial = Number(await bus.getAttribute("data-ring-refined-voltage"));
  expect(initial).toBeGreaterThan(109);
  expect(initial).toBeLessThan(110);
  expect(Number(await refined.getAttribute("data-ring-loss"))).toBeGreaterThan(0);
  expect(Number(await refined.getAttribute("data-ring-balance"))).toBeLessThan(1e-6);
  await ring.getByLabel("Условный разрез P", { exact: true }).selectOption("B3");
  await expect(refined.locator("[data-ring-refinement-cut]")).toHaveAttribute("data-ring-refinement-cut", "B3");
  expect(Number(await bus.getAttribute("data-ring-refined-voltage"))).toBeCloseTo(initial, 7);
  await expect(ring.locator("[data-ring-branch]")).toHaveCount(3);
});
