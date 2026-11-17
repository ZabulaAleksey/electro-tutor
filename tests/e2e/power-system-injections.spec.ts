import { expect, test } from "@playwright/test";

test("normalizes signed load inputs and an independent source phasor in the live study", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByRole("spinbutton", { name: "P, MW", exact: true }).fill("10");
  await lab.getByLabel("Способ задания нагрузки", { exact: true }).selectOption("power-factor");
  await lab.getByRole("spinbutton", { name: "cos φ", exact: true }).fill("0.8");
  await expect(lab.locator("[data-power-load-preview-q]")).toContainText("7,5 MVAr");
  await lab.getByRole("button", { name: "Применить нагрузку" }).click();
  expect(Number(await lab.locator("[data-power-load-q]").getAttribute("data-power-load-q"))).toBeCloseTo(7.5, 12);
  await lab.getByLabel("Характер нагрузки", { exact: true }).selectOption("capacitive");
  await lab.getByRole("button", { name: "Применить нагрузку" }).click();
  expect(Number(await lab.locator("[data-power-load-q]").getAttribute("data-power-load-q"))).toBeCloseTo(-7.5, 12);
  await lab.getByLabel("Способ задания нагрузки", { exact: true }).selectOption("pq");
  await lab.getByRole("spinbutton", { name: "Q, MVAr", exact: true }).fill("-7.5");
  await lab.getByRole("button", { name: "Применить нагрузку" }).click();
  await expect(lab.locator("[data-power-load-q]")).toHaveAttribute("data-power-load-q", "-7.5");

  await lab.getByLabel("Узел или источник", { exact: true }).selectOption("source:S1");
  await lab.getByLabel("Уровень напряжения", { exact: true }).selectOption("220");
  const angle = lab.getByRole("spinbutton", { name: "Угол источника, °", exact: true });
  await angle.fill("-390");
  await angle.press("Enter");
  await expect(lab.locator("[data-power-voltage]")).toHaveAttribute("data-power-voltage", "220");
  await expect(lab.locator("[data-power-source-angle]")).toHaveAttribute("data-power-source-angle", "-30");
});
