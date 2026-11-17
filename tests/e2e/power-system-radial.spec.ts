import { expect, test } from "@playwright/test";
import { testPowerCatalogue } from "../fixtures/power-catalogue";

test("calculates a two-line feeder and transformer from the physical study and updates after a load edit", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByRole("button", { name: "Рассчитать радиальную сеть" }).click();
  const result = lab.locator("[data-power-radial]");
  await expect(result.getByRole("status")).toContainText("L1");
  await lab.getByLabel("Импорт типов JSON").setInputFiles({
    name: "types.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(testPowerCatalogue)),
  });
  const equipment = lab.getByLabel("Оборудование", { exact: true });
  const type = lab.getByLabel("Тип оборудования", { exact: true });
  await type.selectOption("line-custom@1");
  await equipment.selectOption("L2");
  await type.selectOption("line-custom@1");
  await equipment.selectOption("T1");
  await type.selectOption("transformer-custom@1");
  const bus = result.locator('[data-radial-bus="B4"]');
  await expect(bus).toBeVisible();
  const firstU = Number(await bus.getAttribute("data-radial-voltage"));
  expect(firstU).toBeGreaterThan(8);
  expect(firstU).toBeLessThan(10);
  const losses = result.locator('[data-radial-branch="L1"]');
  expect(Number(await losses.getAttribute("data-radial-series-loss"))).toBeGreaterThan(0);
  expect(Number(await result.locator("[data-radial-balance]").getAttribute("data-radial-balance"))).toBeLessThan(1e-6);

  await lab.getByRole("spinbutton", { name: "P, MW", exact: true }).fill("10");
  await lab.getByRole("button", { name: "Применить нагрузку" }).click();
  await expect.poll(async () => Number(await bus.getAttribute("data-radial-voltage"))).toBeLessThan(firstU);
});
