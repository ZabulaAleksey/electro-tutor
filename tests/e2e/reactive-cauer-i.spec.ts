import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/";

test("shows the exact Cauer I ladder and rebuilds it after a bridge edit", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(route);
  const lab = page.locator("[data-lc-graph-ready=true]");
  const cauer = lab.locator("[data-cauer-i]");
  await cauer.getByText("Первая форма Кауэра", { exact: true }).click();
  await expect(cauer.locator("[data-cauer-term=l]")).toHaveCount(3);
  await expect(cauer.locator("[data-cauer-term=c]")).toHaveCount(2);
  await expect(cauer.locator("[data-cauer-formula]")).toContainText("(60/11)q");
  await expect(cauer.locator("[data-cauer-exact]")).toBeVisible();
  const nominal = cauer.locator("[data-cauer-nominal]").first();
  expect(Number(await nominal.getAttribute("data-cauer-nominal"))).toBeCloseTo(60 / 11000, 10);

  await lab.getByRole("img", { name: "X(ω)", exact: true }).press("Home");
  await expect(cauer.locator("[data-cauer-at-cursor]")).toBeVisible();

  await lab.getByLabel("Выбрать", { exact: true }).selectOption("L3");
  const value = lab.getByRole("spinbutton", { name: "Индуктивность, H", exact: true });
  await value.fill("0.02");
  await value.press("Enter");
  await lab.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect(cauer.locator("[data-cauer-formula]")).toContainText("(15/2)q");
  expect(Number(await nominal.getAttribute("data-cauer-nominal"))).toBeCloseTo(.0075, 10);
  expect(errors).toEqual([]);
});

test("keeps the Ukrainian Cauer I ladder usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const cauer = page.locator("[data-cauer-i]");
  await cauer.getByText("Перша форма Кауера", { exact: true }).click();
  await expect(cauer.getByRole("table", { name: "Номінали форми Кауера" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
