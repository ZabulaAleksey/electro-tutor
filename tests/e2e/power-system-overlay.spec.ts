import { expect, test } from "@playwright/test";

test("displays signed power arrows and measurement layers on the same solved network", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  await lab.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  await expect(lab.locator("[data-overlay-bus]")).toHaveCount(3);
  const line = lab.locator('[data-overlay-branch="L2"]');
  await expect(line.locator('[data-overlay-arrow="active"]')).toHaveAttribute("data-overlay-direction", "B3:B2");
  await expect(line.locator('[data-overlay-arrow="reactive"]')).toHaveCount(0);
  const controls = lab.locator("[data-power-overlay-controls]");
  await controls.getByRole("checkbox", { name: "Q", exact: true }).check();
  await expect(line.locator('[data-overlay-arrow="reactive"]')).toHaveAttribute("data-overlay-direction", "B2:B3");
  await controls.getByRole("checkbox", { name: "Напряжения" }).uncheck();
  await expect(lab.locator("[data-overlay-bus]")).toHaveCount(0);
  await lab.getByRole("button", { name: "Линия L2", exact: true }).focus();
  await lab.getByRole("button", { name: "Линия L2", exact: true }).press("Enter");
  await expect(controls.locator('[data-power-selected-reading="L2"]')).toContainText("MVAr");
});

test("assembles a sourced custom network through the shared diagram", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByRole("button", { name: "Создать свою сеть" }).click();
  await lab.getByText("Собрать схему", { exact: true }).click();
  const author = lab.locator("[data-power-author]");
  await author.getByRole("button", { name: "Добавить на схему" }).click();
  await author.getByLabel("Добавляемый элемент").selectOption("source");
  await author.getByRole("button", { name: "Добавить на схему" }).click();
  await expect(lab.locator("[data-circuit-editor]")).toHaveCount(1);
  await expect(lab.getByRole("button", { name: "Питающий источник S1", exact: true })).toBeVisible();
  await lab.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  await expect(lab.locator('[data-ac-bus="B1"]')).toHaveAttribute("data-ac-voltage", "110");
});
