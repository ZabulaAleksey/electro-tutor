import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { netlist } from "../../src/circuit/topology";
import { readFile } from "node:fs/promises";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const line = prefix + "/ru/interactive/transmission-line/experiment/";
const lc = prefix + "/ru/interactive/reactive-two-port-graph/experiment/";
const key = "electrotutor:line-experiment:v1";
const board = "[data-line-experiment-editor]:not([inert])";
const wire = '[data-line-series-slot="W2"]';

async function capture(page: Page, info: TestInfo, ref: number) {
  await page.locator(board).screenshot({ path: info.outputPath("ref-" + String(ref).padStart(2, "0") + ".png"), animations: "disabled" });
}

test("references 01–08: EMF, contextual editing, rails, keyboard removal, fixed TL and restoration", async ({ page }, info) => {
  await page.goto(line);
  const editor = page.locator(board);
  await expect(editor.locator('[data-line-glyph="E1"] [data-symbol="ideal-emf"]')).toBeVisible();
  await capture(page, info, 1);
  await editor.locator('[data-line-component="TL1"]').click();
  const inspector = editor.getByRole("dialog", { name: "TL1" });
  await expect(inspector).toBeVisible();
  await expect(editor.locator('[data-line-glyph="E1"]')).toBeVisible();
  await capture(page, info, 2);
  const length = inspector.locator('[data-line-parameter="lengthM"]');
  await length.fill("100000000");
  await length.press("Enter");
  await expect(length).toHaveValue("1000");
  await expect(inspector.getByRole("alert")).toBeVisible();
  await length.fill("750");
  await inspector.locator('[data-line-parameter="lengthM"]').press("Enter");
  await inspector.press("Escape");
  const original = await editor.locator('[data-line-glyph="E1"]').getAttribute("transform");
  await editor.locator('[data-line-palette="r"]').click();
  await expect(editor.locator("[data-line-cross-endpoint]")).toHaveCount(0);
  await capture(page, info, 5);
  const shunt = editor.locator('[data-line-direct-slot^="cross:"]').first();
  await shunt.hover();
  await expect(editor.locator(".line-experiment-preview")).toHaveAttribute("points", /.+ .+/);
  await expect(editor.locator(".line-experiment-boundary").first()).toBeVisible();
  await capture(page, info, 6);
  await shunt.click();
  await expect(editor.locator('[data-line-glyph="R1"]')).toHaveAttribute("data-line-rotation", "90");
  await expect(editor.locator('[data-line-glyph="E1"]')).toHaveAttribute("transform", original!);
  await capture(page, info, 8);
  const append = editor.locator("[data-line-append]");
  const x = (await append.boundingBox())!.x;
  await editor.getByRole("button", { name: "Увеличить", exact: true }).click();
  expect((await append.boundingBox())!.x).toBe(x);
  await capture(page, info, 3);
  await page.reload();
  await expect(editor.locator('[data-line-glyph="R1"]')).toHaveAttribute("data-line-rotation", "90");
  await capture(page, info, 4);
  await editor.locator('[data-line-component="R1"]').click();
  await editor.getByRole("dialog").press("Delete");
  await expect(editor.locator('[data-line-glyph="R1"]')).toHaveCount(0);
  await editor.locator('[data-line-component="TL1"]').click();
  await expect(editor.locator('[data-line-parameter="lengthM"]')).toHaveValue("750");
  await capture(page, info, 7);
  await editor.locator("[data-line-remove]").click();
  await editor.locator("[data-line-confirm-remove]").click();
  await expect(editor.locator('[data-line-glyph="TL1"]')).toHaveCount(0);
});

test("pointer drag and click commit identical topology and immediately persist structural edits", async ({ page }) => {
  await page.goto(line);
  const editor = page.locator(board);
  const item = editor.locator('[data-line-palette="l"]');
  await item.click();
  await editor.locator(wire).click();
  const clicked = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).circuit, key);
  await page.locator("[data-line-a-undo]").click();
  // Drag starts with the closed palette; insertion targets appear on dragstart.
  const start = (await item.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y - 10, { steps: 5 });
  await expect(editor.locator(wire)).toBeVisible();
  const drop = (await editor.locator(wire).boundingBox())!;
  await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 10 });
  await page.mouse.move(drop.x + drop.width / 2 + 1, drop.y + drop.height / 2);
  await page.mouse.up();
  await page.reload();
  await expect(editor.locator('[data-line-glyph="L1"]')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).circuit, key)).toEqual(clicked);
});

test("unknown archive survives opening, editing and reload until the explicit reset", async ({ page }) => {
  await page.goto(line);
  await page.evaluate(key => localStorage.setItem(key, '{"schemaVersion":99}'), key);
  await page.reload();
  const editor = page.locator(board);
  await expect(page.getByRole("alert").filter({ hasText: "Локальный архив" })).toBeVisible();
  await editor.locator('[data-line-palette="c"]').click();
  await editor.locator(wire).click();
  await expect(editor.locator('[data-line-glyph="C2"]')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{"schemaVersion":99}');
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Начальная схема" }).click();
  await expect(editor.locator('[data-line-glyph="C2"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).kind, key)).toBe("electrotutor-line-experiment");
});

test("reference 09: four series cuts, six parallel spans and distinct ends of the two adjacent pairs", async ({ page }, info) => {
  await page.goto(lc);
  const editor = page.locator(board);
  await expect(editor).toBeVisible();
  await page.locator("[data-lc-import]").setInputFiles({
    name: "chain.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1",
      circuit: { kind: "series", left: { kind: "l", value: 10 },
        right: { kind: "series", left: { kind: "c", value: 100 }, right: { kind: "l", value: 20 } } } })),
  });
  await editor.locator('[data-line-palette="c"]').click();
  await expect(editor.locator("[data-line-series-slot]")).toHaveCount(4);
  await expect(editor.locator("[data-line-direct-slot]")).toHaveCount(6);
  const pair = editor.locator("[data-line-direct-slot]");
  const right = pair.and(editor.getByRole("button", { name: "Подключить параллельно · C1 + L2", exact: true }));
  const left = pair.and(editor.getByRole("button", { name: "Подключить параллельно · C1 + L1", exact: true }));
  await left.focus();
  const boundary = () => editor.locator(".line-experiment-boundary").evaluateAll(ns => ns.map(n => Number(n.getAttribute("cx"))).sort((a,b) => a-b));
  const leftPins = await boundary();
  await right.focus();
  const rightPins = await boundary();
  expect(rightPins[0]).toBeGreaterThan(leftPins[0]);
  expect(rightPins[1]).toBeGreaterThan(leftPins[1]);
  await capture(page, info, 9);
  await right.press("Enter");
  const pending = page.waitForEvent("download");
  await page.locator("[data-lc-export]").click();
  const saved = await pending;
  const path = info.outputPath("two-part-shunt.json");
  await saved.saveAs(path);
  const graph = JSON.parse(await readFile(path, "utf8")).topology;
  expect(graph.wires).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: "C1:a", to: "C2:a" }), expect.objectContaining({ from: "C2:b", to: "L2:b" }),
  ]));
});

for (const variant of ["transmission-line", "transmission-line-steady"] as const) {
  test(variant + " keeps the branched circuit layout when appending a section", async ({ page }) => {
    await page.goto(prefix + "/ru/interactive/" + variant + "/experiment/");
    const editor = page.locator(board);
    const load = variant === "transmission-line" ? "C1" : "R1";
    await editor.locator('[data-line-palette="r"]').click();
    await editor.locator(`[data-line-parallel-part="${load}"]`).click();
    await editor.locator('[data-line-parallel-side="right"]').click();
    const stable = await editor.locator('[data-line-glyph="E1"]').getAttribute("transform");
    const tl = await editor.locator('[data-line-glyph="TL1"]').getAttribute("transform");
    await editor.locator("[data-line-append]").click();
    await expect(editor.locator('[data-line-glyph="TL2"]')).toBeVisible();
    await expect(editor.locator('[data-line-glyph="E1"]')).toHaveAttribute("transform", stable!);
    await expect(editor.locator('[data-line-glyph="TL1"]')).toHaveAttribute("transform", tl!);

    // Expand the numerical equivalent when steady-mode equal resistors fold for display.
    const equivalent = editor.getByRole("button", { name: /Rэкв/ });
    if (await equivalent.count()) await equivalent.click();
    await expect(editor.locator(`[data-line-glyph="${load}"]`)).toHaveAttribute("data-line-rotation", "90");
  });
}

test("an older tab cannot overwrite a draft saved by another tab", async ({ page, context }) => {
  await page.goto(line);
  const old = await context.newPage();
  await old.goto(line);
  await expect(old.locator(board)).toBeVisible();
  const editor = page.locator(board);
  await editor.locator('[data-line-palette="r"]').click();
  await editor.locator(wire).click();
  const raw = await page.evaluate(key => localStorage.getItem(key), key);
  expect(raw).toContain('"R1"');
  await old.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  expect(await old.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await old.locator(board).locator('[data-line-palette="l"]').click();
  await old.locator(board).locator(wire).click();
  await expect(old.getByRole("alert").filter({ hasText: "другой вкладке" })).toBeVisible();
  expect(await old.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await old.close();
});

test("selects four, five, six and seven-element parallel spans in the dense LC editor", async ({ page }, info) => {
  const ids = ["L1", "C1", "L2", "C2", "L3", "C3", "L4"];
  const parts = ids.map(id => ({
    id, terminals: [id + ":a", id + ":b"], kind: id[0].toLowerCase(),
    parameters: id.startsWith("L") ? { henry: .01, initial: 0 } : { farad: .0001, initial: 0 },
  }));
  const port = { id: "P1", kind: "port", terminals: ["P1:a", "P1:b"], parameters: {} };
  const wires = parts.map((part, i) => ({ id: "W" + i, from: i ? parts[i - 1].terminals[1] : "P1:a", to: part.terminals[0] }));
  wires.push({ id: "W7", from: "L4:b", to: "P1:b" });
  const archive = { kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology: { components: [port, ...parts], junctions: [], wires },
    observedEndpoints: port.terminals, attachmentSides: [] };
  await page.goto(lc);
  const editor = page.locator(board);
  await expect(editor).toBeVisible();
  await page.locator("[data-lc-import]").setInputFiles({
    name: "seven.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await expect(editor.locator('[data-line-glyph="L4"]')).toBeVisible();
  for (const length of [4, 5, 6, 7]) {
    await editor.locator('[data-line-palette="c"]').click();
    await editor.locator('[data-line-parallel-part="L1"]').click();
    await editor.locator(`[data-line-parallel-part="${ids[length - 1]}"]`).click();
    await expect(editor.locator("[data-line-highlighted]")).toHaveCount(length);
    await editor.locator('[data-line-parallel-side="right"]').click();
    const pending = page.waitForEvent("download");
    await page.locator("[data-lc-export]").click();
    const path = info.outputPath(`span-${length}.json`);
    await (await pending).saveAs(path);
    const topology = JSON.parse(await readFile(path, "utf8")).topology;
    const nets = netlist(topology);
    const first = nets.find(net => net.includes("L1:a"))!;
    const last = nets.find(net => net.includes(ids[length - 1] + ":b"))!;
    expect(first).not.toEqual(last);
    expect([...first, ...last]).toEqual(expect.arrayContaining(["C4:a", "C4:b"]));
    expect(first.filter(id => id === "C4:a" || id === "C4:b")).toHaveLength(1);
    await page.locator("[data-lc-undo]").click();
    await expect(editor.locator('[data-line-glyph="C4"]')).toHaveCount(0);
  }
});
