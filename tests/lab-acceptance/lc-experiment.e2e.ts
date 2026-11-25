import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { reactiveLcMode } from "../../src/circuit/reactive-lc-mode";
import { analyzeLcExperiment, newLcExperiment, readLcExperiment } from "../../src/circuit/lc-experiment";
import { reactance, type Circuit } from "../../src/models/reactive-two-port";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/reactive-two-port-graph/experiment/`;
const editor = '[data-line-editor-variant="lc"]';
const lab = '[data-lc-experiment][data-ready="true"]';

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true, animations: "disabled" });
}

async function downloaded(page: Page, testInfo: TestInfo, name: string) {
  const wait = page.waitForEvent("download");
  await page.locator("[data-lc-export]").click();
  const download = await wait;
  const path = testInfo.outputPath(name + ".json");
  await download.saveAs(path);
  return { path, document: JSON.parse(await readFile(path, "utf8")) };
}

test("two parallel groups have unique targets and the entire LC circuit remains connectable", async ({ page }, testInfo) => {
  await page.goto(route("ru"));
  const board = page.locator(editor);
  const result = page.locator("[data-lc-experiment-result]");
  const frequencyPoints = [250, 600, 2200];
  const group = (coil: number, capacitor: number) => ({
    kind: "parallel", left: { kind: "l", value: coil }, right: { kind: "c", value: capacitor },
  });
  await page.locator("[data-lc-import]").setInputFiles({
    name: "two-parallel-groups.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1",
      circuit: { kind: "series", left: group(10, 100), right: group(20, 150) } })),
  });
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  await expect(board.locator('[data-line-glyph="C2"]')).toBeVisible();
  await capture(page, testInfo, "lc-two-parallel-groups-before");
  const originalGlyphs = () => board.locator('[data-line-glyph="L1"], [data-line-glyph="C1"], [data-line-glyph="L2"], [data-line-glyph="C2"]')
    .evaluateAll(nodes => nodes.map(node => [node.getAttribute("data-line-glyph"), node.getAttribute("transform")]));
  const portPositions = () => board.locator("[data-lc-port-terminal]")
    .evaluateAll(nodes => nodes.map(node => [node.getAttribute("cx"), node.getAttribute("cy")]));
  const positions = await originalGlyphs();
  const ports = await portPositions();
  const whole = board.locator("[data-lc-whole-parallel]");
  const targets = board.locator("[data-lc-parallel-pair]");
  await board.locator('[data-line-palette="c"]').click();
  await expect(targets).toHaveCount(3);
  const pairs = await targets.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-lc-parallel-pair")));
  expect(new Set(pairs).size).toBe(3);
  await expect(whole).toHaveCount(1);
  await whole.click();
  await expect(board.locator('[data-line-glyph="C3"]')).toBeVisible();
  expect(await originalGlyphs()).toEqual(positions);
  expect(await portPositions()).toEqual(ports);
  await capture(page, testInfo, "lc-external-parallel-after");

  const saved = await downloaded(page, testInfo, "lc-external-parallel");
  const graph = readLcExperiment(JSON.stringify(saved.document));
  const cap = graph.topology.components.find(part => part.id === "C3")!;
  const analysis = analyzeLcExperiment(graph);
  expect(analysis.kind).toBe("finite");
  if (analysis.kind !== "finite") throw Error("Expected finite impedance.");
  for (const omega of frequencyPoints) {
    const first = omega * 100e-6 - 1 / (omega * .01);
    const second = omega * 150e-6 - 1 / (omega * .02);
    const oldReactance = -1 / first - 1 / second;
    const expectedSusceptance = -1 / oldReactance + omega * Number(cap.parameters.farad);
    expect(-1 / reactance(analysis.impedance, omega)).toBeCloseTo(expectedSusceptance, 10);
  }
  await page.locator("[data-lc-undo]").click();
  await expect(board.locator('[data-line-glyph="C3"]')).toHaveCount(0);
  await page.locator("[data-lc-redo]").click();
  await expect(board.locator('[data-line-glyph="C3"]')).toBeVisible();
  await page.locator("[data-lc-import]").setInputFiles(saved.path);
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  expect(await portPositions()).toEqual(ports);

  await board.locator('[data-line-palette="l"]').click();
  await board.locator("[data-lc-parallel-pair]:not([data-lc-whole-parallel])").first().click();
  const transformations = page.locator("[data-lc-transformations]");
  await transformations.locator("summary").click();
  await transformations.locator("[data-lc-apply-local]").click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  const formula = result.locator("[data-lc-formula]");
  const beforeParallel = await formula.innerText();
  await board.locator('[data-line-palette="l"]').click();
  await expect(whole).toBeVisible();
  await whole.click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  await expect(formula).not.toHaveText(beforeParallel);
});

test("the LC solver node limit still permits edits and archive round trips", async ({ page }, testInfo) => {
  await page.goto(route("ru"));
  const board = page.locator(editor);
  const coil: Circuit = { kind: "l", value: 10 };
  let chain: Circuit = coil;
  for (let i = 1; i < 11; i++) chain = { kind: "series", left: chain, right: coil };
  await page.locator("[data-lc-import]").setInputFiles({
    name: "twelve-nodes.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(newLcExperiment(chain))),
  });
  await expect(board.getByText(/Lэкв/)).toBeVisible();
  const result = page.locator("[data-lc-experiment-result]");
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  await board.locator('[data-line-palette="c"]').click();
  await expect(board.locator('[data-line-glyph="L11"]')).toBeVisible();
  await board.locator("[data-line-series-slot]").first().press("Enter");
  await expect(result).toHaveAttribute("data-lc-experiment-result", "limit");
  await expect(result.getByRole("status")).toContainText("12 связанных узлов");
  await expect(result.locator("[data-lc-formula]")).toHaveCount(0);
  const saved = await downloaded(page, testInfo, "lc-over-solver-limit");
  await page.locator("[data-lc-undo]").click();
  await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
  await page.locator("[data-lc-import]").setInputFiles(saved.path);
  await expect(result).toHaveAttribute("data-lc-experiment-result", "limit");
  await board.locator('[data-line-palette="l"]').click();
  await board.locator("[data-lc-whole-parallel]").press("Enter");
  await expect(board.locator('[data-line-glyph="L12"]')).toBeVisible();
});

test("catalogue D: inspect starter LC, edit inductance, undo and reopen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await page.getByRole("link", { name: "LC-двухполюсник", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  await expect(page.locator(lab)).toBeVisible();
  const board = page.locator(editor);
  const result = page.locator("[data-lc-experiment-result]");
  const zero = result.locator('[data-lc-resonance="zero"]');
  await expect(board.locator("select")).toHaveCount(0);
  await expect(board.locator("[data-line-palette]")).toHaveCount(2);
  await expect(board.locator('[data-lc-port-terminal="P1:a"]')).toBeVisible();
  await expect(board.locator('[data-lc-port-terminal="P1:b"]')).toBeVisible();
  await expect(board.locator("[data-line-append], [data-line-component='P1']")).toHaveCount(0);

  const center = async (selector: string) => {
    const box = await board.locator(selector).boundingBox();
    if (!box) throw new Error(selector);
    return box.x + box.width / 2;
  };
  const positions = await Promise.all(['[data-lc-port-terminal="P1:a"]', '[data-line-glyph="L1"]',
    '[data-line-glyph="C1"]', '[data-lc-port-terminal="P1:b"]'].map(center));
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  expect(positions[2]).toBeLessThan(positions[3]);
  await expect(zero).toHaveCount(1);
  expect(Number(await zero.getAttribute("data-omega")) / (2 * Math.PI)).toBeCloseTo(159.154943, 5);
  await zero.click();
  await expect(result.locator("[data-lc-cursor]")).toContainText("X = 0 Ω");
  await expect(result).toContainText("ω → 0: |Z| → ∞ · ω → ∞: |Z| → ∞");
  const before = await downloaded(page, testInfo, "lc-series-before");
  const formula = await result.locator("[data-lc-formula]").textContent();
  await board.locator('[data-line-component="L1"]').press("Enter");
  await expect(board.locator("[data-lc-nominal]")).toHaveValue("10");
  await expect(board.locator("[data-lc-move-start]")).toHaveCount(0);
  await board.locator("[data-lc-nominal]").fill("20");
  await board.locator("[data-lc-nominal]").press("Enter");
  await expect(result.locator("[data-lc-formula]")).not.toHaveText(formula!);
  const editedFormula = await result.locator("[data-lc-formula]").innerText();
  const moved = await downloaded(page, testInfo, "lc-edited");
  expect(moved.document.topology.wires).toEqual(before.document.topology.wires);
  expect(moved.document.observedEndpoints).toEqual(before.document.observedEndpoints);
  await capture(page, testInfo, "lc-series-desktop");
  await page.locator("[data-lc-undo]").click();
  expect((await downloaded(page, testInfo, "lc-series-undo")).document).toEqual(before.document);
  await page.locator("[data-lc-import]").setInputFiles(moved.path);
  await expect(result.locator("[data-lc-formula]")).toHaveText(editedFormula);
  await expect(page.locator("[data-lc-redo]")).toBeDisabled();
  expect((await downloaded(page, testInfo, "lc-series-reopened")).document).toEqual(moved.document);
  expect(errors).toEqual([]);
});

test("folds two series inductors on screen while preserving the editable archive", async ({ page }, testInfo) => {
  await page.goto(route("ru"));
  const board = page.locator(editor);
  await board.locator('[data-line-palette="l"]').click();
  await board.locator('[data-line-series-slot="W1"]').click();
  const equivalent = board.getByRole("button", { name: /Lэкв/ });
  await expect(equivalent).toBeVisible();
  await expect(board.locator('[data-line-kind="l"]')).toHaveCount(1);
  const archive = await downloaded(page, testInfo, "series-originals");
  expect(archive.document.topology.components.map((part: { id: string }) => part.id)).toEqual(expect.arrayContaining(["L1", "L2", "C1", "P1"]));
  await equivalent.click();
  await expect(board.locator('[data-line-kind="l"]')).toHaveCount(2);
  await board.locator('[data-line-component="L2"]').click();
  await board.locator("[data-line-remove]").click();
  await board.locator("[data-line-confirm-remove]").click();
  await expect(board.locator('[data-line-glyph="L2"]')).toHaveCount(0);
  await page.locator("[data-lc-undo]").click();
  expect((await downloaded(page, testInfo, "restored-series")).document).toEqual(archive.document);

  await board.locator('[data-line-palette="c"]').click();
  await board.locator('[data-line-series-slot="W1"]').click();
  await expect(board.locator('[data-line-glyph="C2"]')).toBeVisible();
  await page.locator("[data-lc-undo]").click();
  await page.locator("[data-lc-undo]").click();
  await expect(board.locator('[data-line-glyph="L1"]')).toBeVisible();
  await expect(board.locator('[data-line-glyph="L2"]')).toHaveCount(0);
});

test.describe("Ukrainian touch layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("puts C across L on the drawing and splits the reactance curve at its pole", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    const board = page.locator(editor);
    const result = page.locator("[data-lc-experiment-result]");
    await page.locator("[data-lc-import]").setInputFiles({
      name: "single-inductor.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1", circuit: { kind: "l", value: 10 } })),
    });
    await expect(board.locator('[data-line-glyph="C1"]')).toHaveCount(0);
    await board.locator('[data-line-palette="c"]').tap();
    await expect(board.locator('[data-line-parallel-part="P1"]')).toHaveCount(0);
    await board.locator('[data-line-parallel-part="L1"]').tap();
    await board.locator('[data-line-parallel-side="right"]').tap();
    await expect(board.locator('[data-line-glyph="C1"]')).toBeVisible();
    const pole = result.locator('[data-lc-resonance="pole"]');
    await expect(pole).toHaveCount(1);
    expect(Number(await pole.getAttribute("data-omega")) / (2 * Math.PI)).toBeCloseTo(159.154943, 5);
    await pole.tap();
    await expect(result.locator("[data-lc-cursor]")).toContainText("|X| → ∞");
    await expect(result).toContainText("ω → 0: |Z| → 0 · ω → ∞: |Z| → 0");
    const plot = result.getByRole("img", { name: "X(ω)", exact: true });
    await expect(plot.locator("[data-plot-curve]")).toHaveCount(2);
    await expect(plot.locator("[data-plot-curve]").first()).toHaveAttribute("stroke", "var(--blue)");
    await expect(plot.locator("[data-plot-curve]").last()).toHaveAttribute("stroke", "var(--orange)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await capture(page, testInfo, "lc-parallel-mobile");
    await page.locator("[data-lc-undo]").tap();
    await board.locator('[data-line-component="L1"]').tap();
    await board.locator("[data-line-remove]").tap();
    await board.locator("[data-line-confirm-remove]").tap();
    await expect(result).toHaveAttribute("data-lc-experiment-result", "open");
    await board.locator('[data-line-palette="c"]').tap();
    await board.locator('[data-line-cross-endpoint="P1:a"]').tap();
    await board.locator('[data-line-cross-endpoint="P1:b"]').tap();
    await expect(result).toHaveAttribute("data-lc-experiment-result", "finite");
    await expect(result).toContainText("ω → 0: |Z| → ∞ · ω → ∞: |Z| → 0");
  });

  test("chooses the intended wire on an imported bridge with close parallel runs", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    await page.locator("[data-lc-import]").setInputFiles({
      name: "lc-bridge.json", mimeType: "application/json", buffer: Buffer.from(reactiveLcMode.createDefaultDocument()),
    });
    const board = page.locator(editor);
    await expect(board.locator('[data-line-glyph="L3"]')).toBeVisible();
    await board.locator('[data-line-palette="c"]').tap();
    const wires = board.locator("[data-line-series-slot]");
    await expect(wires).toHaveCount(12);
    const overlaps = await wires.evaluateAll(elements => {
      const boxes = elements.map(element => element.getBoundingClientRect());
      return boxes.some((a, index) => boxes.slice(index + 1).some(b =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > .1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .1));
    });
    expect(overlaps).toBe(false);
    await capture(page, testInfo, "lc-bridge-targets-mobile");
    await board.locator('[data-line-series-slot="W1"]').tap();
    const saved = (await downloaded(page, testInfo, "lc-bridge-edited")).document;
    expect(saved.topology.wires).toEqual(expect.arrayContaining([
      { id: "W1", from: "P1:a", to: "C3:a" },
      { id: "W12", from: "L3:b", to: "J4" },
      expect.objectContaining({ from: "C3:b", to: "J1" }),
    ]));
  });
});

test("imports a legacy LC tree, exposes all synthesis forms, and preserves it on invalid JSON", async ({ page }) => {
  await page.goto(route("ru"));
  await expect(page.locator(lab)).toBeVisible();
  const input = page.locator("[data-lc-import]");
  await input.setInputFiles({
    name: "legacy-lc.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1", circuit: {
      kind: "series", left: { kind: "l", value: 10 }, right: { kind: "c", value: 100 },
    } })),
  });
  const result = page.locator("[data-lc-experiment-result]");
  await expect(result.locator('[data-lc-resonance="zero"]')).toHaveCount(1);
  const before = await result.locator("[data-lc-formula]").textContent();
  for (const selector of ["[data-foster-i]", "[data-foster-ii]", "[data-cauer-i]", "[data-cauer-ii]", "[data-lc-simplification]"]) {
    await result.locator(`${selector} > summary`).click();
    await expect(result.locator(selector)).toHaveJSProperty("open", true);
  }
  await expect(result.locator("[data-foster-equivalence]")).toHaveCount(2);
  await expect(result.locator("[data-cauer-exact]")).toHaveCount(2);
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"kind":"invalid"}') });
  await expect(page.locator('[data-lc-notice="error"]')).toContainText("Файл LC не открыт");
  await expect(result.locator("[data-lc-formula]")).toHaveText(before!);
});
