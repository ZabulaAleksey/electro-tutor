import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { reactiveLcMode } from "../../src/circuit/reactive-lc-mode";

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

test("catalogue D: build series LC on the drawing, move L with the same impedance, undo and reopen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await expect(page.locator(`a[href="${prefix}/ru/interactive/reactive-two-port-graph/"]`)).toBeVisible();
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

  await board.locator('[data-line-palette="c"]').press("Enter");
  await board.locator('[data-line-slot-mode="series"]').press("Enter");
  await board.locator('[data-line-series-slot="W2"]').press("Enter");
  await expect(board.locator('[data-line-glyph="C1"]')).toBeVisible();
  await expect(zero).toHaveCount(1);
  expect(Number(await zero.getAttribute("data-omega")) / (2 * Math.PI)).toBeCloseTo(159.154943, 5);
  await zero.click();
  await expect(result.locator("[data-lc-cursor]")).toContainText("X = 0 Ω");
  await expect(result).toContainText("ω → 0: |Z| → ∞ · ω → ∞: |Z| → ∞");
  const before = await downloaded(page, testInfo, "lc-series-before");
  const formula = await result.locator("[data-lc-formula]").textContent();
  await board.locator('[data-line-component="L1"]').press("Enter");
  await expect(board.locator("[data-lc-nominal]")).toHaveValue("10");
  await board.locator("[data-lc-move-start]").press("Enter");
  const targets = board.locator("[data-lc-move-target]");
  await expect(targets).toHaveCount(1);
  await expect(targets.first()).toBeFocused();
  await targets.first().press("Enter");
  await expect(page.locator('[data-lc-notice="success"]')).toContainText("Z(s) совпадает");
  await expect(board.locator('[data-line-component="L1"]')).toBeFocused();
  await expect(result.locator("[data-lc-formula]")).toHaveText(formula!);
  await expect(result.locator("[data-lc-cursor]")).toContainText("X = 0 Ω");
  const moved = await downloaded(page, testInfo, "lc-series-moved");
  expect(before.document.topology.wires).not.toEqual(moved.document.topology.wires);
  expect(before.document.topology.components).toEqual(moved.document.topology.components);
  expect(before.document.observedEndpoints).toEqual(moved.document.observedEndpoints);
  await capture(page, testInfo, "lc-series-desktop");
  await page.locator("[data-lc-undo]").click();
  expect((await downloaded(page, testInfo, "lc-series-undo")).document).toEqual(before.document);
  await page.locator("[data-lc-import]").setInputFiles(moved.path);
  await expect(result.locator("[data-lc-formula]")).toHaveText(formula!);
  await expect(page.locator("[data-lc-redo]")).toBeDisabled();
  expect((await downloaded(page, testInfo, "lc-series-reopened")).document).toEqual(moved.document);
  expect(errors).toEqual([]);
});

test.describe("Ukrainian touch layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("puts C across L on the drawing and splits the reactance curve at its pole", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    const board = page.locator(editor);
    const result = page.locator("[data-lc-experiment-result]");
    await board.locator('[data-line-palette="c"]').tap();
    await board.locator('[data-line-slot-mode="parallel"]').tap();
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
    await board.locator('[data-line-slot-mode="cross"]').tap();
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
    await board.locator('[data-line-slot-mode="series"]').tap();
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
