import { expect, test } from "@playwright/test";

test("physically closes the normally open ring, updates the symbol and solves the changed graph", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  const study = lab.getByLabel("Учебная сеть", { exact: true });
  await study.selectOption("normally-open");
  const toggle = lab.getByRole("switch", { name: /Аппарат Q1/ });
  const glyph = lab.getByRole("button", { name: "Коммутационный аппарат Q1", exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(glyph).toHaveAttribute("data-closed", "false");
  await expect(lab.locator("[data-power-topology=radial]")).toBeVisible();
  await lab.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  await expect(lab.locator('[data-ac-branch="Q1"]')).toHaveCount(0);
  await toggle.check();
  await expect(glyph).toHaveAttribute("data-closed", "true");
  await expect(lab.locator("[data-power-topology=meshed]")).toBeVisible();
  await expect(lab.locator('[data-ac-branch="Q1"]')).toBeVisible();
  await expect(lab.locator('[data-ac-bus="B4"]')).toHaveAttribute("data-ac-voltage", "110");
  await toggle.uncheck();
  await expect(lab.locator("[data-power-topology=radial]")).toBeVisible();
  await expect(lab.locator('[data-ac-branch="Q1"]')).toHaveCount(0);

  await study.selectOption("ring");
  await lab.getByLabel("Условный разрез Q", { exact: true }).selectOption("B3");
  await expect(lab.locator('[data-power-calculation-cut="q:B3"]')).toBeVisible();
  await expect(lab.locator("[data-ring-branch]")).toHaveCount(3);
  await expect(lab.getByRole("switch")).toHaveCount(0);
});
