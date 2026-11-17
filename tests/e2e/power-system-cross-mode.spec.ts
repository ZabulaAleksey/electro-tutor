import { expect, test } from "@playwright/test";

test("isolates the four live laboratory modes while reusing the common circuit topology editor", async ({ page }) => {
  const initial = "/ru/interactive/";
  await page.goto(initial + "transmission-line/");
  let editor = page.locator("[data-circuit-editor]");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveAttribute("data-circuit-mode", "transient-line");
  expect(await editor.locator("[data-line-section]").count()).toBeGreaterThan(0);
  await expect(editor.locator('[data-circuit-tool="power-transformer"]')).toHaveCount(0);

  await page.getByRole("link", { name: "Синусоидальный режим", exact: true }).click();
  await expect(page.locator("[data-steady-line]")).toHaveAttribute("data-ready", "true");
  await page.getByText("Схема опыта", { exact: true }).click();
  editor = page.locator("[data-circuit-editor]");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveAttribute("data-circuit-mode", "steady-line");
  await expect(editor.locator('[data-circuit-tool="diode"]')).toHaveCount(0);
  await expect(page.getByRole("img", { name: "U(x)" })).toBeVisible();

  await page.goto(initial + "reactive-two-port-graph/");
  editor = page.locator("[data-circuit-editor]");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveAttribute("data-circuit-mode", "reactive-lc");
  await expect(editor.locator('[data-circuit-tool="l"]')).toBeVisible();
  await expect(editor.locator('[data-circuit-tool="r"]')).toHaveCount(0);
  await expect(page.locator("[data-lc-formula]")).toContainText("60q^5");

  await page.goto(initial + "power-system/");
  editor = page.locator("[data-circuit-editor]");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveAttribute("data-circuit-mode", "power-system");
  await expect(editor.locator("[data-circuit-tool]")).toHaveCount(0);
  await page.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  await page.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  await expect(editor.locator("[data-overlay-bus]")).toHaveCount(3);
  await expect(editor.locator("[data-line-section]")).toHaveCount(0);
});
