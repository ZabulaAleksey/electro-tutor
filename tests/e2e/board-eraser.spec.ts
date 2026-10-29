import { expect, test } from "@playwright/test";

test("partial eraser sweeps a stroke, previews before commit, and is one undo action", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("board-eraser-clean")) { localStorage.removeItem("electrotutor-board-v2"); sessionStorage.setItem("board-eraser-clean", "1"); } });
  await page.goto("/ru/board/");
  const board = page.locator("[data-board-dirty]");
  const svg = page.locator(".board-canvas");
  await expect(board).toHaveAttribute("data-board-ready", "true");
  await svg.scrollIntoViewIfNeeded();
  await board.getByRole("button", { name: "Увеличить" }).click();
  const box = (await svg.boundingBox())!;
  const start = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.55 };
  const end = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.55 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 1; index <= 24; index += 1) {
    await page.mouse.move(start.x + (end.x - start.x) * (index / 24), start.y);
  }
  await page.mouse.up();
  await expect(page.locator("[data-board-stroke]")).toHaveCount(1);
  const before = await page.locator("[data-board-stroke]").getAttribute("points");

  await board.getByRole("button", { name: "Ластик", exact: true }).click();
  await page.getByLabel("Размер ластика").fill("24");
  await page.mouse.move(box.x + box.width * 0.61, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
  await expect(page.locator(".board-eraser-preview")).toHaveAttribute("points", /.+/);
  await expect(page.locator("[data-board-stroke]")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator("[data-board-stroke]")).toHaveCount(2);
  await expect(page.locator("[data-board-stroke]").first()).not.toHaveAttribute("points", before!);
  const afterErase = await page.locator("[data-board-stroke]").evaluateAll((items) => items.map((item) => item.getAttribute("points")));
  await expect(page.getByLabel("Размер ластика")).toHaveValue("24");
  await expect(page.locator(".board-eraser-control output")).toHaveText("24");

  await board.getByRole("button", { name: /Отменить/ }).click();
  await expect(page.locator("[data-board-stroke]")).toHaveCount(1);
  await expect(page.locator("[data-board-stroke]")).toHaveAttribute("points", before!);
  await board.getByRole("button", { name: /Повторить/ }).click();
  await expect(page.locator("[data-board-stroke]")).toHaveCount(2);
  await board.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(board).toHaveAttribute("data-board-dirty", "false");
  await page.reload();
  await expect(board).toHaveAttribute("data-board-ready", "true");
  await expect(page.locator("[data-board-stroke]")).toHaveCount(2);
  await expect(page.locator("[data-board-stroke]").first()).toHaveAttribute("points", afterErase[0]!);
});

test("pointer cancellation discards only the eraser draft", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("board-eraser-clean")) { localStorage.removeItem("electrotutor-board-v2"); sessionStorage.setItem("board-eraser-clean", "1"); } });
  await page.goto("/ru/board/");
  const board = page.locator("[data-board-dirty]");
  const svg = page.locator(".board-canvas");
  await expect(board).toHaveAttribute("data-board-ready", "true");
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55);
  await page.mouse.up();
  const before = await page.locator("[data-board-stroke]").getAttribute("points");
  await board.getByRole("button", { name: "Ластик", exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.61, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
  await svg.dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
  await page.mouse.up();
  await expect(page.locator("[data-board-stroke]")).toHaveCount(1);
  await expect(page.locator("[data-board-stroke]")).toHaveAttribute("points", before!);
  await expect(page.locator(".board-eraser-preview")).toHaveAttribute("points", "");
});

test("touch and pen pointer streams commit through the same board path", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("board-eraser-clean")) { localStorage.removeItem("electrotutor-board-v2"); sessionStorage.setItem("board-eraser-clean", "1"); } });
  await page.goto("/ru/board/");
  const board = page.locator("[data-board-dirty]");
  const svg = page.locator(".board-canvas");
  await expect(board).toHaveAttribute("data-board-ready", "true");
  await svg.scrollIntoViewIfNeeded();
  await svg.evaluate((element) => {
    const canvas = element as SVGSVGElement;
    canvas.setPointerCapture = () => undefined;
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = () => undefined;
    const bounds = canvas.getBoundingClientRect();
    const emit = (type: string, pointerId: number, pointerType: "touch" | "pen", x: number) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType,
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: bounds.left + bounds.width * x,
      clientY: bounds.top + bounds.height * 0.55,
    }));
    emit("pointerdown", 11, "touch", 0.55);
    emit("pointermove", 11, "touch", 0.62);
    emit("pointermove", 11, "touch", 0.69);
    emit("pointerup", 11, "touch", 0.69);
    emit("pointerdown", 12, "pen", 0.55);
    emit("pointermove", 12, "pen", 0.62);
    emit("pointermove", 12, "pen", 0.69);
    emit("pointerup", 12, "pen", 0.69);
  });
  await expect(page.locator("[data-board-stroke]")).toHaveCount(2);
});

test("locks tool and board state controls while pen or eraser draft is active", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("electrotutor-board-v2"));
  await page.goto("/ru/board/");
  const board = page.locator("[data-board-dirty]");
  const svg = page.locator(".board-canvas");
  await expect(board).toHaveAttribute("data-board-ready", "true");
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  const eraserButton = board.getByRole("button", { name: "Ластик", exact: true });
  const penButton = board.getByRole("button", { name: /Перо/ });
  const saveButton = board.getByRole("button", { name: "Сохранить", exact: true });
  const zoomButton = board.getByRole("button", { name: "Увеличить" });

  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await expect(eraserButton).toBeDisabled();
  await expect(saveButton).toBeDisabled();
  await expect(zoomButton).toBeDisabled();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
  await page.mouse.up();
  await expect(eraserButton).toBeEnabled();

  await eraserButton.click();
  const radius = page.getByLabel("Размер ластика");
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55);
  await page.mouse.down();
  await expect(penButton).toBeDisabled();
  await expect(radius).toBeDisabled();
  await expect(saveButton).toBeDisabled();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.55);
  await page.mouse.up();
  await expect(penButton).toBeEnabled();
  await expect(radius).toBeEnabled();
});
