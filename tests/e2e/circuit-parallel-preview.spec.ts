import { expect, test } from "@playwright/test";

test("hover is temporary, click locks the selection and dropping on empty space clears it", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.goto("/ru/interactive/circuit-editor/");
  const editor = page.locator("[data-circuit-editor]").first();
  await expect(editor).toHaveAttribute("data-ready", "true");
  await editor.getByRole("button", { name: "Пример RLC", exact: true }).click();
  const board = editor.locator("[data-circuit-board]").first();
  const palette = editor.locator('[data-circuit-tool="r"]');
  const part = board.locator('[data-component-id="R1"]');
  await palette.click();
  await editor.locator("[data-parallel-toggle]").click();
  await part.hover();
  await expect(board.locator("[data-parallel-preview]")).toBeVisible();
  await board.hover({ position: { x: 15, y: 15 } });
  await expect(board.locator("[data-parallel-preview]")).toHaveCount(0);
  await part.click();
  await board.hover({ position: { x: 15, y: 15 } });
  await expect(board.locator("[data-parallel-preview]")).toBeVisible();
  const paths = await board.locator("[data-parallel-preview] polyline").evaluateAll(items => items.map(item => item.getAttribute("points")!));
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const points = path.split(" ").map(point => point.split(",").map(Number));
    for (let i = 1; i < points.length; i++) expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
  }
  await board.screenshot({ path: info.outputPath("parallel-preview-desktop.png") });
  await palette.dragTo(part);
  await expect(board.locator("[data-parallel-preview]")).toBeVisible();
  await palette.dragTo(board, { targetPosition: { x: 15, y: 15 } });
  await expect(board.locator("[data-parallel-preview]")).toHaveCount(0);
  await expect(editor.locator("[data-parallel-apply]")).toBeDisabled();
  await expect(board.locator("[data-component-id]")).toHaveCount(4);
});

test.describe("preview on a Ukrainian phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("keeps the highlighted section and routed preview readable", async ({ page }, info) => {
    await page.goto("/uk/interactive/circuit-editor/");
    const editor = page.locator("[data-circuit-editor]").first();
    await expect(editor).toHaveAttribute("data-ready", "true");
    await editor.getByRole("button", { name: "Приклад RLC", exact: true }).tap();
    await editor.locator('[data-circuit-tool="c"]').tap();
    await editor.locator("[data-parallel-toggle]").tap();
    const board = editor.locator("[data-circuit-board]").first();
    await board.locator('[data-component-id="L1"]').tap();
    await expect(board.locator("[data-parallel-preview]")).toBeVisible();
    await board.screenshot({ path: info.outputPath("parallel-preview-phone.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
