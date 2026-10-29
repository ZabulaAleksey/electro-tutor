import { expect, test } from "@playwright/test";

test("board previews then commits one stroke and keeps plain wheel scrolling", async ({ page }) => {
  await page.goto("/ru/board/");
  const board = page.locator(".board-canvas");
  await expect(page.locator("[data-board-ready]")).toHaveAttribute("data-board-ready","true");
  await board.scrollIntoViewIfNeeded();
  await expect(board).toBeVisible();
  const box = await board.boundingBox();
  if (!box) throw new Error("board bounds unavailable");
  await page.mouse.move(box.x + 80, box.y + 80); await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 100, { steps: 8 });
  await expect(board.locator(".board-preview")).toHaveAttribute("points", /,/);
  await page.mouse.up();
  await expect(board.locator("[data-board-stroke]")).toHaveCount(1);
  await expect(page.locator(".board-zoom output")).toHaveText("100%");
  await page.mouse.wheel(0, 240);
  await expect(page.locator(".board-zoom output")).toHaveText("100%");
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -240); await page.keyboard.up("Control");
  await expect(page.locator(".board-zoom output")).not.toHaveText("100%");
});

test("engineering calculator updates Ohm result", async ({ page }) => {
  await page.goto("/ru/engineering-board/");
  await expect(page.getByText("Последовательная цепь")).toBeVisible();
  await page.locator(".calculator-card").first().locator("input").first().fill("24");
  await expect(page.locator(".calculator-card").first().locator("dd").first()).toContainText("0,8");
});
