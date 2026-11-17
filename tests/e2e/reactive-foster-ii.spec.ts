import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/";

test("shows both Foster realizations for the same accepted bridge", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(route);
  const lab = page.locator("[data-lc-graph-ready=true]");
  const i = lab.locator("[data-foster-i]");
  const ii = lab.locator("[data-foster-ii]");
  await i.getByText("Первая форма Фостера", { exact: true }).click();
  await ii.getByText("Вторая форма Фостера", { exact: true }).click();
  await expect(i.locator("[data-foster-term=parallel-lc]")).toHaveCount(2);
  await expect(ii.locator("[data-foster-term=series-lc]")).toHaveCount(2);
  await expect(ii.locator("[data-foster-formula]")).toContainText("Y(s) ≈");
  await expect(ii.getByRole("img", { name: "Схема двухполюсника" })).toBeVisible();
  const shunt = ii.locator("[data-foster-term=shunt-l] [data-foster-henry]");
  expect(Number(await shunt.getAttribute("data-foster-henry"))).toBeCloseTo(.06, 10);

  await lab.getByRole("img", { name: "X(ω)", exact: true }).press("Home");
  await expect(i.locator("[data-foster-at-cursor]")).toBeVisible();
  await expect(ii.locator("[data-foster-at-cursor]")).toBeVisible();
  expect(Number(await ii.locator("[data-foster-equivalence]").getAttribute("data-foster-equivalence"))).toBeLessThan(1e-9);

  await lab.getByLabel("Выбрать", { exact: true }).selectOption("L3");
  const nominal = lab.getByRole("spinbutton", { name: "Индуктивность, H", exact: true });
  await nominal.fill("0.02");
  await nominal.press("Enter");
  await lab.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect.poll(async () => Number(await shunt.getAttribute("data-foster-henry"))).toBeCloseTo(.07, 10);
  expect(errors).toEqual([]);
});

test("opens the Ukrainian admittance realization at 390 px without widening the document", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const panel = page.locator("[data-foster-ii]");
  await panel.getByText("Друга форма Фостера", { exact: true }).click();
  await expect(panel.getByRole("table", { name: "Номінали форми Фостера" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
