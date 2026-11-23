import { expect, test } from "@playwright/test";
import { gotoLcBridge, removeBridgePart } from "./helpers/lc-bridge";


test("realizes the accepted bridge as Foster I and recalculates after editing L3", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await gotoLcBridge(page);
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  const foster = lab.locator("[data-foster-i]");
  await foster.getByText("Первая форма Фостера", { exact: true }).click();
  await expect(foster.locator("[data-foster-term=parallel-lc]")).toHaveCount(2);
  await expect(foster.locator("[data-foster-formula]")).toContainText("q/(q² +");
  await expect(foster.getByRole("img", { name: "Схема двухполюсника" })).toBeVisible();
  const series = foster.locator("[data-foster-term=series-l] [data-foster-henry]");
  expect(Number(await series.getAttribute("data-foster-henry"))).toBeCloseTo(60 / 11000, 10);
  expect(Number(await foster.locator("[data-foster-equivalence]").getAttribute("data-foster-equivalence"))).toBeLessThan(1e-9);

  await lab.getByRole("img", { name: "X(ω)", exact: true }).press("Home");
  await expect(foster.locator("[data-foster-at-cursor]")).toContainText("Исходная схема");

  await lab.locator('[data-line-component="L3"]').click();
  const nominal = lab.locator("[data-lc-nominal]");
  await nominal.fill("20");
  await nominal.press("Enter");
  await expect.poll(async () => Number(await series.getAttribute("data-foster-henry"))).toBeCloseTo(.0075, 10);
  await expect(foster.locator("[data-foster-at-cursor]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("shows the Ukrainian realization on a phone and explains an open port", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoLcBridge(page, "uk");
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  const foster = lab.locator("[data-foster-i]");
  await foster.getByText("Перша форма Фостера", { exact: true }).click();
  await expect(foster.getByRole("table", { name: "Номінали форми Фостера" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await removeBridgePart(page, "L1");
  await removeBridgePart(page, "C2");
  await expect(foster.getByText("Для розімкненого або закороченого порту синтез не потрібен.")).toBeVisible();
  await expect(foster.locator("[data-foster-term]")).toHaveCount(0);
});
