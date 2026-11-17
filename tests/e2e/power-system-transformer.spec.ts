import { expect, test } from "@playwright/test";
import { testPowerCatalogue } from "../fixtures/power-catalogue";

test("calculates the HV-referred transformer and separate nominal losses as the tap and parallel count change", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Импорт типов JSON").setInputFiles({
    name: "types.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(testPowerCatalogue)),
  });
  await lab.getByLabel("Оборудование", { exact: true }).selectOption("T1");
  await lab.getByLabel("Тип оборудования", { exact: true }).selectOption("transformer-custom@1");
  await lab.getByText("Показать схему замещения", { exact: true }).click();
  const result = lab.locator("[data-transformer-equivalent]");
  await expect(result.getByRole("img", { name: "Схема замещения трансформатора" })).toBeVisible();
  await expect(result.locator("[data-transformer-no-load-kw]")).toHaveAttribute("data-transformer-no-load-kw", "20");
  const parallel = lab.getByRole("spinbutton", { name: "Параллельные трансформаторы", exact: true });
  await parallel.fill("2");
  await parallel.press("Enter");
  const tap = lab.getByRole("spinbutton", { name: "Позиция отпайки", exact: true });
  await tap.fill("-2");
  await tap.press("Enter");
  await expect(result.locator("[data-transformer-no-load-kw]")).toHaveAttribute("data-transformer-no-load-kw", "40");
  await expect(result.locator("[data-transformer-rated-series-kw]")).toHaveAttribute("data-transformer-rated-series-kw", "160");
  expect(Number(await result.locator("[data-transformer-equivalent-r]").getAttribute("data-transformer-equivalent-r"))).toBeCloseTo(1.890625, 9);
  expect(Number(await result.locator("[data-transformer-ratio]").getAttribute("data-transformer-ratio"))).toBeCloseTo(10.45, 10);
});
