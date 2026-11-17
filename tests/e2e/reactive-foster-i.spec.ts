import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/";

test("realizes the accepted bridge as Foster I and recalculates after editing L3", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(route);
  const lab = page.locator("[data-lc-graph-ready=true]");
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

  await lab.getByLabel("Выбрать", { exact: true }).selectOption("L3");
  const nominal = lab.getByRole("spinbutton", { name: "Индуктивность, H", exact: true });
  await nominal.fill("0.02");
  await nominal.press("Enter");
  await lab.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect.poll(async () => Number(await series.getAttribute("data-foster-henry"))).toBeCloseTo(.0075, 10);
  await expect(foster.locator("[data-foster-at-cursor]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("shows the Ukrainian realization on a phone and explains an open port", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const lab = page.locator("[data-lc-graph-ready=true]");
  const foster = lab.locator("[data-foster-i]");
  await foster.getByText("Перша форма Фостера", { exact: true }).click();
  await expect(foster.getByRole("table", { name: "Номінали форми Фостера" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const choose = lab.getByLabel("Вибрати", { exact: true });
  await choose.selectOption("L1");
  await lab.getByRole("button", { name: "Видалити", exact: true }).click();
  await choose.selectOption("C2");
  await lab.getByRole("button", { name: "Видалити", exact: true }).click();
  await lab.getByRole("button", { name: "Розрахувати цю схему", exact: true }).click();
  await expect(foster.getByText("Для розімкненого або закороченого порту синтез не потрібен.")).toBeVisible();
  await expect(foster.locator("[data-foster-term]")).toHaveCount(0);
});
