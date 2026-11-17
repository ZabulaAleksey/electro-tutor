import { expect, test } from "@playwright/test";
import { testPowerCatalogue } from "../fixtures/power-catalogue";

test("generates the nominal pi equivalent from a live type, length, parallel count and override", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Импорт типов JSON").setInputFiles({
    name: "line-type.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(testPowerCatalogue)),
  });
  await lab.getByLabel("Тип оборудования", { exact: true }).selectOption("line-custom@1");
  const length = lab.getByRole("spinbutton", { name: "Длина, km", exact: true });
  const circuits = lab.getByRole("spinbutton", { name: "Параллельные цепи", exact: true });
  await length.fill("40"); await length.press("Enter");
  await circuits.fill("2"); await circuits.press("Enter");
  await lab.getByText("Показать схему замещения", { exact: true }).click();
  const panel = lab.locator("[data-line-equivalent]");
  await expect(panel.getByRole("img", { name: "П-схема линии" })).toBeVisible();
  const series = panel.locator("[data-line-pi-r]");
  expect(Number(await series.getAttribute("data-line-pi-r"))).toBeCloseTo(4.6, 10);
  expect(Number(await series.getAttribute("data-line-pi-x"))).toBeCloseTo(8.2, 10);
  expect(Number(await panel.locator("[data-line-pi-b]").getAttribute("data-line-pi-b"))).toBeCloseTo(2 * Math.PI * 50 * 11e-9 * 40, 14);

  await lab.getByText("Дополнительно", { exact: true }).click();
  await lab.getByRole("spinbutton", { name: "R, Ω/km", exact: true }).fill("0.5");
  await lab.getByRole("button", { name: "Применить параметры" }).click();
  await expect(series).toHaveAttribute("data-line-pi-r", "10");
  await lab.getByRole("button", { name: "Вернуть параметры типа" }).click();
  expect(Number(await series.getAttribute("data-line-pi-r"))).toBeCloseTo(4.6, 10);
});
