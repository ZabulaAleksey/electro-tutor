import { expect, test } from "@playwright/test";

test("extends a wire from a node and branches again from the new endpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.goto("/ru/interactive/circuit-editor/");
  const editor = page.locator("[data-circuit-editor]");
  const board = editor.locator("[data-circuit-board]");
  const nets = editor.locator("[data-circuit-nets]");
  await expect(editor).toHaveAttribute("data-ready", "true");

  const screen = (x: number, y: number) => board.evaluate((svg, point) => {
    const { x, y } = new DOMPoint(...point).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return { x, y };
  }, [x, y] as const);
  const first = await screen(110, 120);
  await editor.getByRole("button", { name: "Узел", exact: true }).click();
  await page.mouse.click(first.x, first.y);
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1"]]');
  await editor.getByRole("button", { name: "Провод", exact: true }).click();

  const dragFrom = async (id: string, x: number, y: number) => {
    const node = board.locator(`[data-circuit-terminal="${id}"]`);
    const box = (await node.boundingBox())!;
    const end = await screen(x, y);
    expect(await board.evaluate((svg, point) => svg.contains(document.elementFromPoint(point.x, point.y)), end)).toBe(true);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await page.mouse.up();
  };

  await dragFrom("J1", 330, 120);
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1","J2"]]');
  await dragFrom("J2", 330, 260);
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1","J2","J3"]]');
  await dragFrom("J2", 440, 120);
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1","J2","J3","J4"]]');
  await expect(board.locator("[data-circuit-wire]")).toHaveCount(3);

  await editor.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1","J2","J3"]]');
  await expect(board.locator("[data-circuit-wire]")).toHaveCount(2);
});

test("places a shunt component between two explicitly targeted junctions", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.goto("/ru/interactive/circuit-editor/");
  const editor = page.locator("[data-circuit-editor]");
  const board = editor.locator("[data-circuit-board]");
  const nets = editor.locator("[data-circuit-nets]");
  await expect(editor).toHaveAttribute("data-ready", "true");

  for (const x of [100, 440]) {
    await editor.getByRole("button", { name: "Узел", exact: true }).click();
    const point = await board.evaluate((svg, x) => {
      const point = new DOMPoint(x, 160).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return { x: point.x, y: point.y };
    }, x);
    await page.mouse.click(point.x, point.y);
  }
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1"],["J2"]]');
  await editor.getByRole("button", { name: "Резистор", exact: true }).click();
  const from = (await board.locator('[data-circuit-terminal="J1"]').boundingBox())!;
  const to = (await board.locator('[data-circuit-terminal="J2"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1","R1:a"],["J2","R1:b"]]');
  await expect(board.locator("[data-circuit-wire]")).toHaveCount(2);

  await editor.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(nets).toHaveAttribute("data-circuit-nets", '[["J1"],["J2"]]');
  await expect(board.locator("[data-component-id]")).toHaveCount(0);
});
