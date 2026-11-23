import { expect, test } from "@playwright/test";
import { gotoLcBridge, loadDefaultBridge, removeBridgePart } from "./helpers/lc-bridge";


test("edits an LC bridge in the shared editor and recalculates its driving-point reactance", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await gotoLcBridge(page);
  await expect(page.getByRole("heading", { name: "LC-двухполюсник" })).toBeVisible();
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  const formula = lab.locator("[data-lc-formula]");
  await expect(formula).toContainText("(60q^5 + 580q^3 + 600q) / (11q^4 + 26q^2 + 10)");
  await expect(lab.locator("[data-lc-resonance=pole]")).toHaveCount(2);
  await expect(lab.locator("[data-lc-resonance=zero]")).toHaveCount(2);
  await lab.locator("[data-lc-resonance=pole]").first().click();
  await expect(lab.locator("[data-lc-cursor]")).toContainText("|X| → ∞");

  await lab.locator('[data-line-component="L3"]').click();
  const nominal = lab.locator("[data-lc-nominal]");
  await nominal.fill("20");
  await nominal.press("Enter");
  await expect(formula).toContainText("(120q^5 + 740q^3 + 700q) / (16q^4 + 33q^2 + 10)");

  await nominal.fill("20.00003");
  await nominal.press("Enter");
  await expect(lab.getByRole("alert")).toContainText("Допустимый номинал");
  await expect(formula).toContainText("740q^3");
  expect(errors).toEqual([]);
});

test("opens a disconnected port, then restores the LC bridge", async ({ page }) => {
  await gotoLcBridge(page);
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  await removeBridgePart(page, "L1");
  await removeBridgePart(page, "C2");
  await expect(lab.locator("[data-lc-experiment-result]")).toHaveAttribute("data-lc-experiment-result", "open");
  await expect(lab.locator("[data-lc-formula]")).toHaveText("Z(s) → ∞");
  await loadDefaultBridge(page);
  await expect(lab.locator("[data-lc-experiment-result]")).toHaveAttribute("data-lc-experiment-result", "finite");
});

test("keeps the Ukrainian graph and both external terminals usable at 390 px", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoLcBridge(page, "uk");
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  await expect(page.getByRole("heading", { name: "LC-двополюсник" })).toBeVisible();
  await expect(lab.locator('[data-lc-port-terminal="P1:a"]')).toBeVisible();
  await expect(lab.getByText("Вхідний імпеданс")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
