import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/";

test("shows both exact Cauer ladders for one bridge", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(route);
  const lab = page.locator("[data-lc-graph-ready=true]");
  const first = lab.locator("[data-cauer-i]");
  const second = lab.locator("[data-cauer-ii]");
  await first.getByText("Первая форма Кауэра", { exact: true }).click();
  await second.getByText("Вторая форма Кауэра", { exact: true }).click();
  await expect(second.locator("[data-cauer-term=l][data-cauer-placement=shunt]")).toHaveCount(3);
  await expect(second.locator("[data-cauer-term=c][data-cauer-placement=series]")).toHaveCount(2);
  await expect(first.locator("[data-cauer-formula]")).toContainText("(60/11)q");
  await expect(second.locator("[data-cauer-formula]")).toContainText("(1/60)/q");
  await expect(second.locator("[data-cauer-exact]")).toBeVisible();
  const nominal = second.locator("[data-cauer-nominal]").first();
  expect(Number(await nominal.getAttribute("data-cauer-nominal"))).toBeCloseTo(.06, 10);

  await lab.getByRole("img", { name: "X(ω)", exact: true }).press("Home");
  await expect(first.locator("[data-cauer-at-cursor]")).toBeVisible();
  await expect(second.locator("[data-cauer-at-cursor]")).toBeVisible();

  await lab.getByLabel("Выбрать", { exact: true }).selectOption("L3");
  const value = lab.getByRole("spinbutton", { name: "Индуктивность, H", exact: true });
  await value.fill("0.02");
  await value.press("Enter");
  await lab.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect(second.locator("[data-cauer-formula]")).toContainText("(1/70)/q");
  expect(Number(await nominal.getAttribute("data-cauer-nominal"))).toBeCloseTo(.07, 10);
  expect(errors).toEqual([]);
});

test("shows Cauer II on a Ukrainian phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const panel = page.locator("[data-lc-graph-ready=true] [data-cauer-ii]");
  await panel.getByText("Друга форма Кауера", { exact: true }).click();
  await expect(panel.getByRole("table", { name: "Номінали форми Кауера" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
