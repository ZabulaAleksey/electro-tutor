import { expect, test } from "@playwright/test";

const serialDocument = JSON.stringify({ schemaVersion: 2, topology: { junctions: [], components: [
  { id: "R1", kind: "r", terminals: ["R1:a", "R1:b"], parameters: { ohm: 100, changeAtS: 0, nextOhm: 100 } },
  { id: "L1", kind: "l", terminals: ["L1:a", "L1:b"], parameters: { henry: .01, initial: 0 } },
  { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { farad: .0001, initial: 0 } },
], wires: [{ id: "w1", from: "R1:b", to: "L1:a" }, { id: "w2", from: "L1:b", to: "C1:a" }] },
  geometry: { positions: { R1: { x: 120, y: 150, rotation: 0 }, L1: { x: 280, y: 150, rotation: 0 }, C1: { x: 440, y: 150, rotation: 0 } }, junctionPositions: {}, board: { width: 600, height: 360 } },
  metadata: { title: "Serial RLC" }, settings: { grid: 10, showGrid: false, zigzag: false, snap: true } });

test("palette drag commits the component drop target into the parallel preview", async ({ page }) => {
  await page.goto("/ru/interactive/circuit-editor/");
  const editor = page.locator("[data-circuit-editor]").first();
  await expect(editor).toHaveAttribute("data-ready", "true");
  await editor.locator('input[type="file"]').setInputFiles({ name: "serial.json", mimeType: "application/json", buffer: Buffer.from(serialDocument) });
  const board = editor.locator("[data-circuit-board]").first();
  const target = board.locator('[data-component-id="R1"]');

  await editor.locator('[data-circuit-tool="r"]').dragTo(target);

  await expect(editor.locator("[data-parallel-controls]")).toBeVisible();
  await expect(board.locator("[data-parallel-preview]")).toBeVisible();
  await expect(target).toHaveAttribute("data-parallel-region", "true");
});

test("drop coordinates retarget an SVG-root drop to the component under the pointer", async ({ page }) => {
  await page.goto("/ru/interactive/circuit-editor/");
  const editor = page.locator("[data-circuit-editor]").first();
  await expect(editor).toHaveAttribute("data-ready", "true");
  await editor.locator('input[type="file"]').setInputFiles({ name: "serial.json", mimeType: "application/json", buffer: Buffer.from(serialDocument) });
  const board = editor.locator("[data-circuit-board]").first();
  const target = board.locator('[data-component-id="R1"]');
  await editor.locator('[data-circuit-tool="r"]').click();
  await editor.locator("[data-parallel-toggle]").click();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.evaluate(({ x, y }) => {
    const svg = document.querySelector<SVGSVGElement>("[data-circuit-board]");
    if (!svg) throw new Error("circuit board not found");
    svg.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: new DataTransfer(),
    }));
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  await expect(board.locator("[data-parallel-preview]")).toBeVisible();
  await expect(target).toHaveAttribute("data-parallel-region", "true");
});
