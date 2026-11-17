import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/";

test("edits an LC bridge in the shared editor and recalculates its driving-point reactance", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto("/ru/interactive/reactive-two-port/");
  await page.getByRole("link", { name: "Открыть редактор LC-графа" }).click();
  await expect(page.getByRole("heading", { name: "Реактивный LC-граф" })).toBeVisible();
  const lab = page.locator("[data-lc-graph-ready=true]");
  const formula = lab.locator("[data-lc-formula]");
  await expect(formula).toContainText("(60q^5 + 580q^3 + 600q) / (11q^4 + 26q^2 + 10)");
  await expect(lab.locator("[data-lc-resonance=pole]")).toHaveCount(2);
  await expect(lab.locator("[data-lc-resonance=zero]")).toHaveCount(2);
  await lab.locator("[data-lc-resonance=pole]").first().click();
  await expect(lab.locator("[data-lc-cursor]")).toContainText("|X| → ∞");

  await lab.getByLabel("Выбрать", { exact: true }).selectOption("L3");
  const nominal = lab.getByRole("spinbutton", { name: "Индуктивность, H", exact: true });
  const calculate = lab.getByRole("button", { name: "Рассчитать эту схему", exact: true });
  await nominal.fill("0.02");
  await nominal.press("Enter");
  await expect(formula).toContainText("580q^3");
  await calculate.click();
  await expect(formula).toContainText("(120q^5 + 740q^3 + 700q) / (16q^4 + 33q^2 + 10)");

  await nominal.fill("0.02000003");
  await nominal.press("Enter");
  await calculate.click();
  await expect(lab.locator("[data-lc-graph-error]")).toContainText("Проверьте номинал");
  await expect(formula).toContainText("740q^3");
  expect(errors).toEqual([]);
});

test("opens a disconnected port, then restores the LC bridge", async ({ page }) => {
  await page.goto(route);
  const lab = page.locator("[data-lc-graph-ready=true]");
  const choose = lab.getByLabel("Выбрать", { exact: true });
  await choose.selectOption("L1");
  await lab.getByRole("button", { name: "Удалить", exact: true }).click();
  await choose.selectOption("C2");
  await lab.getByRole("button", { name: "Удалить", exact: true }).click();
  const calculate = lab.getByRole("button", { name: "Рассчитать эту схему", exact: true });
  await calculate.click();
  await expect(lab.locator("[data-lc-graph-result]")).toHaveAttribute("data-lc-graph-result", "open");
  await expect(lab.locator("[data-lc-formula]")).toHaveText("Z(s) → ∞");
  await lab.getByRole("button", { name: "Асимметричный LC-мост", exact: true }).click();
  await calculate.click();
  await expect(lab.locator("[data-lc-graph-result]")).toHaveAttribute("data-lc-graph-result", "finite");
});

test("keeps the Ukrainian graph and both external terminals usable at 390 px", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const lab = page.locator("[data-lc-graph-ready=true]");
  await expect(page.getByRole("heading", { name: "Реактивний LC-граф" })).toBeVisible();
  await expect(lab.getByRole("button", { name: "P1", exact: true })).toBeVisible();
  await expect(lab.getByText("Вхідний імпеданс")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
