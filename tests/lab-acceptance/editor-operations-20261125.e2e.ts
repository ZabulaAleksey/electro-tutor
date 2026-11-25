import { expect, test } from "@playwright/test";

const editorSelector = "[data-line-experiment-editor]:not([inert])";
const lineArchiveKey = "electrotutor:line-experiment:v1";

test("EVAL-03 A: sequence, explicit open and restore survive reloading; clear is undoable", async ({ page }, info) => {
  await page.goto("/ru/interactive/transmission-line/experiment/");
  const editor = page.locator(editorSelector);
  const line = editor.locator('[data-line-glyph="TL1"]');
  await expect(line).toBeVisible();
  const initial = await line.getAttribute("transform");
  await editor.locator('[data-line-palette="l"]').click();
  await editor.locator('[data-line-series-slot="W2"]').click();
  await editor.locator('[data-line-component="L1"]').click();
  await editor.getByRole("dialog").press("Delete");
  await expect(editor.locator('[data-line-glyph="L1"]')).toHaveCount(0);
  const activeWires = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).circuit.topology.wires, lineArchiveKey);
  const connection = { id: "W2", from: "K1:b", to: "TL1:a" };
  expect(await activeWires()).toEqual(expect.arrayContaining([expect.objectContaining(connection)]));
  await expect(line).toHaveAttribute("transform", initial!);
  await editor.screenshot({ path: info.outputPath("bypass.png"), animations: "disabled" });

  await editor.locator('[data-line-wire-mode]').click();
  await editor.locator('[data-line-wire-control="W2"]').click();
  await editor.locator("[data-line-break-wire]").click();
  expect(await activeWires()).not.toEqual(expect.arrayContaining([expect.objectContaining(connection)]));
  await page.reload();
  await editor.locator('[data-line-wire-mode]').click();
  await editor.locator('[data-line-broken-wire="W2"]').click();
  await editor.locator("[data-line-restore-wire]").click();
  expect(await activeWires()).toEqual(expect.arrayContaining([expect.objectContaining(connection)]));

  await editor.locator("[data-line-clear]").click();
  await editor.locator("[data-line-confirm-clear]").click();
  await expect(editor.locator("[data-line-glyph]")).toHaveCount(0);
  await page.locator("[data-line-a-undo]").click();
  await expect(line).toBeVisible();
});

test("EVAL-03 D: hidden series junctions and visible real branches", async ({ page }) => {
  await page.goto("/ru/interactive/reactive-two-port-graph/experiment/");
  const editor = page.locator(editorSelector);
  await expect(editor.locator('[data-line-glyph="L1"]')).toBeVisible();
  await expect(editor.locator(".line-experiment-dot")).toHaveCount(0);
  await editor.locator('[data-line-palette="c"]').click();
  await editor.locator('[data-line-parallel-part="L1"]').click();
  await editor.locator('[data-line-parallel-side="right"]').click();
  await expect(editor.locator('[data-line-glyph="C2"]')).toBeVisible();
  await expect(editor.locator(".line-experiment-dot").first()).toBeVisible();
});

test("EVAL-03 D: a deliberate port short is distinct from an open branch", async ({ page }) => {
  await page.goto("/ru/interactive/reactive-two-port-graph/experiment/");
  const editor = page.locator(editorSelector);
  const result = page.locator("[data-lc-experiment-result]");
  await expect(editor).toBeVisible();
  await page.locator("[data-lc-import]").setInputFiles({
    name: "sole-inductor.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schema: "electrotutor-reactive-two-port-v1", circuit: { kind: "l", value: 10 },
    })),
  });
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  await editor.locator('[data-line-component="L1"]').click();
  await editor.locator("[data-line-remove]").click();
  await editor.locator("[data-line-replace-conductor]").click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "short");
  await expect(editor.locator("[data-lc-port-terminal]")).toHaveCount(2);
  await expect(editor.locator("[data-line-empty]")).toHaveCount(0);
  await editor.locator("[data-line-clear]").click();
  await expect(editor.locator("[data-line-confirm-clear]")).toBeFocused();
  await editor.locator("[data-line-confirm-clear]").press("Escape");
  await expect(editor.locator("[data-line-clear]")).toBeFocused();
  await editor.locator("[data-line-clear]").click();
  await editor.locator("[data-line-confirm-clear]").click();
  await expect(editor.locator("[data-line-empty]")).toBeVisible();
  await page.locator("[data-lc-undo]").click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "short");
  await page.locator("[data-lc-undo]").click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
});


test("EVAL-03 A: editing around an open return preserves its routed bends", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/experiment/");
  const editor = page.locator(editorSelector);
  const wire = editor.locator('[data-line-wire="W4"]');
  await expect(wire).toBeAttached();
  const points = (value: string) => value.split(" ").map(point => point.split(",").map(Number));
  const original = points((await wire.getAttribute("points"))!);
  await editor.locator("[data-line-wire-mode]").click();
  await editor.locator('[data-line-wire-control="W4"]').click();
  await expect(editor.locator("[data-line-wire-insert]")).toBeFocused();
  await editor.locator("[data-line-break-wire]").click();
  await expect(editor.locator("[data-line-wire-mode]")).toBeFocused();
  await editor.locator('[data-line-wire-control="W1"]').click();
  await editor.locator("[data-line-wire-insert]").click();
  await editor.locator('[data-line-palette="r"]').click();
  await expect(editor.locator('[data-line-glyph="R1"]')).toBeVisible();
  await editor.locator('[data-line-broken-wire="W4"]').click();
  await editor.locator("[data-line-restore-wire]").click();
  await expect(wire).toBeAttached();
  const restored = points((await wire.getAttribute("points"))!);
  expect(restored.map(point => point[1])).toEqual(original.map(point => point[1]));
});

test("EVAL-03 D: removes a full two-device parallel branch and resumes editing", async ({ page }, info) => {
  await page.goto("/uk/interactive/reactive-two-port-graph/experiment/");
  const editor = page.locator(editorSelector);
  await expect(editor).toBeVisible();
  await page.locator("[data-lc-import]").setInputFiles({
    name: "parallel-lc.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1", circuit: {
      kind: "parallel",
      left: { kind: "series", left: { kind: "l", value: 10 }, right: { kind: "c", value: 100 } },
      right: { kind: "l", value: 20 },
    } })),
  });
  await expect(editor.locator('[data-line-glyph="C1"]')).toBeVisible();
  await editor.screenshot({ path: info.outputPath("parallel.png"), animations: "disabled" });
  await editor.locator('[data-line-component="C1"]').click();
  await editor.locator("[data-line-remove]").click();
  const branch = editor.locator("[data-line-remove-branch]");
  await expect(branch).toContainText("C1 + L1");
  await branch.click();
  await expect(editor.locator('[data-line-glyph="C1"], [data-line-glyph="L1"]')).toHaveCount(0);
  await expect(editor.locator('[data-line-glyph="L2"]')).toBeVisible();
  await editor.screenshot({ path: info.outputPath("branch-removed.png"), animations: "disabled" });
  await editor.locator('[data-line-palette="c"]').click();
  await editor.locator('[data-line-parallel-part="L2"]').click();
  await editor.locator('[data-line-parallel-side="right"]').click();
  await expect(editor.locator('[data-line-glyph="C1"]')).toBeVisible();
});

test("EVAL-03 A: removal preserves an intentional cut and explicit bypass restores its exact edge", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/experiment/");
  const editor = page.locator(editorSelector);
  const wire = { id: "W2", from: "K1:b", to: "TL1:a" };
  const readCircuit = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).circuit, lineArchiveKey);
  await editor.locator("[data-line-wire-mode]").click();
  await editor.locator('[data-line-wire-control="W2"]').click();
  await editor.locator("[data-line-break-wire]").click();

  await editor.locator('[data-line-palette="l"]').click();
  await editor.getByRole("button", { name: "Выбрать два узла" }).click();
  await editor.locator('[data-line-cross-endpoint="K1:b"]').click();
  await editor.locator('[data-line-cross-endpoint="TL1:a"]').click();
  await editor.locator('[data-line-component="L1"]').click();
  await editor.getByRole("dialog").press("Delete");
  await expect(editor.locator('[data-line-glyph="L1"]')).toHaveCount(0);
  const opened = await readCircuit();
  expect(opened.brokenWires).toEqual([wire]);
  expect(opened.topology.wires).not.toContainEqual(wire);

  await page.locator("[data-line-a-undo]").click();
  await editor.locator('[data-line-component="L1"]').click();
  await editor.locator("[data-line-remove]").click();
  await editor.locator("[data-line-replace-conductor]").click();
  await expect(editor.locator('[data-line-glyph="L1"]')).toHaveCount(0);
  const restored = await readCircuit();
  expect(restored.topology.wires).toContainEqual(wire);
  expect(restored.brokenWires).toBeUndefined();
});

test("EVAL-03 A: a former parallel part bypasses after it becomes the sole series link", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/experiment/");
  const editor = page.locator(editorSelector);
  await editor.locator('[data-line-palette="l"]').click();
  await editor.locator('[data-line-series-slot="W3"]').click();
  await editor.locator('[data-line-palette="r"]').click();
  await editor.locator('[data-line-parallel-part="L1"]').click();
  await editor.locator('[data-line-parallel-side="right"]').click();
  await editor.locator('[data-line-component="L1"]').click();
  await editor.getByRole("dialog").press("Delete");
  await expect(editor.locator('[data-line-glyph="L1"]')).toHaveCount(0);

  await editor.locator('[data-line-component="R1"]').click();
  await editor.getByRole("dialog").press("Delete");
  await expect(editor.locator('[data-line-glyph="R1"]')).toHaveCount(0);
  const attached = await page.evaluate(key => {
    const { wires } = JSON.parse(localStorage.getItem(key)!).circuit.topology;
    return wires.some(({ from, to }: { from: string; to: string }) =>
      (from === "TL1:b" && to === "C1:a") || (from === "C1:a" && to === "TL1:b"));
  }, lineArchiveKey);
  expect(attached).toBe(true);
  await expect(page.locator('[data-line-termination="open"]')).toHaveAttribute("aria-pressed", "false");
});
