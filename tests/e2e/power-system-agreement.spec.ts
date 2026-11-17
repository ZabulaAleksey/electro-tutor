import { expect, test } from "@playwright/test";

test("checks the live ring against the independent nodal solution after changing the cut", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  await lab.getByRole("button", { name: "Сравнить с Ybus" }).click();
  const result = lab.locator("[data-ring-agreement]");
  await expect(result.locator("[data-ring-agreement-pass]")).toHaveAttribute("data-ring-agreement-pass", "true");
  const values = result.locator("[data-agreement-delta]");
  expect((await values.evaluateAll(rows => rows.map(row => Number(row.getAttribute("data-agreement-delta")))))
    .every(value => value < .001)).toBe(true);
  await lab.getByLabel("Условный разрез P", { exact: true }).selectOption("B3");
  await expect(result.locator("[data-ring-agreement-pass]")).toHaveAttribute("data-ring-agreement-pass", "true");
});
