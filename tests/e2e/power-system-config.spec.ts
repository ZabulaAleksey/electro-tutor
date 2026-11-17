import { expect, test } from "@playwright/test";
import { testPowerCatalogue } from "../fixtures/power-catalogue";

const route = "/ru/interactive/power-system/";

test("selects pinned types and applies and resets one line override on the actual schematic", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(route);
  const lab = page.locator("[data-power-ready=true]");
  await expect(lab.locator("[data-circuit-editor][data-inspect-only]")).toBeVisible();
  await lab.getByLabel("Импорт типов JSON").setInputFiles({
    name: "types.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(testPowerCatalogue)),
  });
  const type = lab.getByLabel("Тип оборудования", { exact: true });
  await type.selectOption("line-custom@1");
  await expect(lab.locator("[data-power-type-revision]")).toHaveAttribute("data-power-type-revision", "1");
  const length = lab.getByRole("spinbutton", { name: "Длина, km", exact: true });
  await length.fill("24");
  await length.press("Enter");
  await expect(length).toHaveValue("24");
  const resistance = lab.getByRole("spinbutton", { name: "R, Ω/km", exact: true });
  await expect(resistance).toBeHidden();
  await lab.getByText("Дополнительно", { exact: true }).click();
  await expect(resistance).toHaveValue("0.23");
  await resistance.fill("0.51");
  await lab.getByRole("button", { name: "Применить параметры" }).click();
  await expect(lab.locator("[data-power-override]")).toHaveAttribute("data-power-override", "true");

  await lab.getByRole("button", { name: "Линия L2", exact: true }).click();
  await expect(lab).toHaveAttribute("data-power-device", "L2");
  await type.selectOption("line-custom@1");
  await lab.getByText("Дополнительно", { exact: true }).click();
  await expect(resistance).toHaveValue("0.23");

  await lab.getByLabel("Оборудование", { exact: true }).selectOption("L1");
  await expect(length).toHaveValue("24");
  await lab.getByText("Дополнительно", { exact: true }).click();
  await expect(resistance).toHaveValue("0.51");
  await lab.getByRole("button", { name: "Вернуть параметры типа" }).click();
  await expect(resistance).toHaveValue("0.23");
  expect(errors).toEqual([]);
});

test("configures a transformer using basic units and its declared tap range", async ({ page }) => {
  await page.goto(route);
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Импорт типов JSON").setInputFiles({
    name: "types.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(testPowerCatalogue)),
  });
  await lab.getByLabel("Оборудование", { exact: true }).selectOption("T1");
  await lab.getByLabel("Тип оборудования", { exact: true }).selectOption("transformer-custom@1");
  const tap = lab.getByRole("spinbutton", { name: "Позиция отпайки", exact: true });
  await expect(tap).toHaveAttribute("min", "-4");
  await expect(tap).toHaveAttribute("max", "4");
  await tap.fill("-2");
  await tap.press("Enter");
  await expect(tap).toHaveValue("-2");
  await expect(lab.getByRole("spinbutton", { name: "uk, %", exact: true })).toBeHidden();
});

test("sets a standard bus voltage and an independent custom source voltage on a Ukrainian phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route.replace("/ru/", "/uk/"));
  const lab = page.locator("[data-power-ready=true]");
  await expect(page.getByRole("heading", { name: "Електричні системи й мережі", exact: true })).toBeVisible();
  const targets = lab.getByLabel("Вузол або джерело", { exact: true });
  const levels = lab.getByLabel("Рівень напруги", { exact: true });
  await levels.selectOption("220");
  await expect(lab.locator('[data-power-bus="B1"]')).toHaveAttribute("data-nominal-kv", "220");
  await targets.selectOption("source:S1");
  await levels.selectOption("custom");
  const custom = lab.getByRole("spinbutton", { name: "Напруга, kV", exact: true });
  await custom.fill("116.5");
  await custom.press("Enter");
  await expect(lab.locator("[data-power-voltage]")).toHaveAttribute("data-power-voltage", "116.5");
  await expect(lab.locator('[data-power-bus="B1"]')).toHaveAttribute("data-nominal-kv", "220");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
