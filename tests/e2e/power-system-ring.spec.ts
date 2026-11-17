import { expect, test } from "@playwright/test";

test("opens the physical ring, compares both preliminary methods and sets independent study cuts", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const workspace = page.locator("[data-power-ready=true]");
  await workspace.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  const ring = workspace.locator("[data-power-ring]");
  await expect(ring.locator("[data-ring-split-p]")).toHaveAttribute("data-ring-split-p", "B2");
  await expect(ring.locator("[data-ring-split-q]")).toHaveAttribute("data-ring-split-q", "B3");
  const line = ring.locator('[data-ring-branch="L2"]');
  await expect(line).toHaveAttribute("data-ring-p", "-0.5");
  await expect(line.getByText("0,5 · B3 → B2", { exact: true })).toBeVisible();
  await ring.getByLabel("Метод предварительного расчёта", { exact: true }).selectOption("impedances");
  expect(Number(await line.getAttribute("data-ring-p"))).toBeCloseTo(-.5, 10);
  await ring.getByLabel("Условный разрез P", { exact: true }).selectOption("B2");
  await ring.getByLabel("Условный разрез Q", { exact: true }).selectOption("B3");
  await expect(ring.locator("[data-ring-branch]")).toHaveCount(3);
  await expect(ring.locator("[data-ring-split-q]")).toHaveText(/Q · B3/);
  await expect(workspace.locator('[data-power-bus="B3"]')).toBeVisible();
});
