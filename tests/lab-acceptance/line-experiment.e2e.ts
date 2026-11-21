import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/transmission-line/experiment/`;
const results = "[data-line-a-results]";
const editor = "[data-line-experiment-editor]";

async function rangeValue(element: Locator, value: number) {
  await element.evaluate((node, next) => {
    const input = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("Lab A from catalogue: delayed current, cascade, selected section, playback, SVG and archive", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await expect(page.locator(`a[href="${prefix}/ru/interactive/transmission-line-steady/"]`).first()).toBeVisible();
  await page.getByRole("link", { name: "Переходные процессы в длинных линиях", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  await expect(page.locator('a[href*="transmission-line-steady"]')).toHaveCount(0);
  const board = page.locator(editor);
  await expect(board.locator("select")).toHaveCount(0);
  await expect(board.locator("[data-line-palette]")).toHaveCount(7);
  const source = board.locator('[data-line-glyph="J1"]');
  await expect(source).toHaveAttribute("data-line-rotation", "90");
  await expect(source.locator("[data-source-arrow]")).toHaveCount(2);
  await expect(board.locator("[data-line-component]")).toHaveCount(4);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: testInfo.outputPath("line-a-editor-desktop.png"), fullPage: true, animations: "disabled" });
  await board.locator('[data-line-component="K1"]').click();
  const switchTime = board.locator("[data-line-switch-time]");
  await expect(switchTime).toHaveValue("0");
  await switchTime.fill("0.002");
  await switchTime.press("Enter");
  await board.locator("[data-line-append]").click();
  await expect(board.locator('[data-line-section="TL2"]')).toBeVisible();
  await board.locator('[data-line-section="TL2"]').click();
  const plot = page.locator(results);
  await expect(plot).toHaveAttribute("data-section-id", "TL2");
  await expect(plot).toHaveAttribute("data-calculation-ready", "true");
  await expect(plot.locator("[data-line-a-plot]")).toHaveCount(4);
  await expect(plot.locator("[data-line-a-wave]")).toBeVisible();
  await rangeValue(plot.locator("[data-line-a-time]"), .007);
  await expect(plot).toHaveAttribute("data-time-s", "0.007");
  await expect(plot).toHaveAttribute("data-u", "0");
  await rangeValue(plot.locator("[data-line-a-time]"), .009);
  await expect(plot).toHaveAttribute("data-time-s", "0.009");
  expect(Number(await plot.getAttribute("data-u"))).toBeCloseTo(5, 3);
  expect(Number(await plot.getAttribute("data-i"))).toBeCloseTo(.1, 5);
  expect(Number(await plot.getAttribute("data-wave-backward"))).toBeCloseTo(0, 5);
  await page.screenshot({ path: testInfo.outputPath("line-a-results-desktop.png"), fullPage: true });

  await plot.locator("[data-line-a-play]").click();
  await expect.poll(async () => Number(await plot.getAttribute("data-time-s"))).toBeGreaterThan(.009);
  await plot.locator("[data-line-a-pause]").click();
  await expect(plot.locator("[data-line-a-play]")).toBeEnabled();
  await plot.locator("[data-line-a-stop]").click();
  await expect(plot).toHaveAttribute("data-time-s", "0");
  await rangeValue(plot.locator("[data-line-a-position]"), 120000);
  await rangeValue(plot.locator("[data-line-a-time]"), .009);

  const svgReceipt = page.waitForEvent("download");
  await plot.locator('[data-line-a-export-svg="u-x"]').click();
  const svg = await svgReceipt;
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);
  const svgPath = testInfo.outputPath("line-a-u-x.svg");
  await svg.saveAs(svgPath);
  expect(await readFile(svgPath, "utf8")).toMatch(/<svg[\s>]/);

  const archiveReceipt = page.waitForEvent("download");
  await page.locator("[data-line-a-download]").click();
  const archive = testInfo.outputPath("line-a.json");
  await (await archiveReceipt).saveAs(archive);
  const saved = JSON.parse(await readFile(archive, "utf8"));
  expect(saved).toMatchObject({
    kind: "electrotutor-line-experiment", selectedSection: "TL2", durationS: .02,
    observations: { TL2: { xM: 120000, timeS: .009 } },
  });
  expect(saved.circuit.topology.components.find((part: { id: string }) => part.id === "K1").parameters.atS).toBe(.002);
  await plot.locator("[data-line-a-back]").click();
  await expect(board.locator('[data-line-section="TL2"]')).toBeVisible();
  await page.reload();
  await expect(board.locator('[data-line-section="TL2"]')).toHaveCount(0);
  await page.locator("[data-line-a-import]").setInputFiles(archive);
  await board.locator('[data-line-section="TL2"]').click();
  await expect(plot).toHaveAttribute("data-calculation-ready", "true");
  await expect(plot).toHaveAttribute("data-position-m", "120000");
  await expect(plot).toHaveAttribute("data-time-s", "0.009");
  expect(failures).toEqual([]);
});

test("an invalid series edit can be undone and a late closure remains calculable", async ({ page }) => {
  await page.goto(route("ru"));
  const board = page.locator(editor);
  await board.locator('[data-line-palette="r"]').click();
  await board.locator('[data-line-slot-mode="series"]').click();
  await board.locator('[data-line-series-slot="W1"]').press("Enter");
  await expect(page.locator("[data-line-a-model-error]")).toBeVisible();
  await page.locator("[data-line-a-undo]").click();
  await expect(page.locator("[data-line-a-model-error]")).toHaveCount(0);
  await board.locator('[data-line-component="K1"]').click();
  const switchTime = board.locator("[data-line-switch-time]");
  await switchTime.fill("0.03");
  await switchTime.press("Enter");
  await board.locator('[data-line-section="TL1"]').click();
  const plot = page.locator(results);
  await expect(plot).toHaveAttribute("data-calculation-ready", "true");
  await expect(plot.locator("[data-line-a-duration]")).toHaveValue("0.05");
  await rangeValue(plot.locator("[data-line-a-time]"), .02);
  await expect(plot).toHaveAttribute("data-u", "0");
  await rangeValue(plot.locator("[data-line-a-time]"), .033);
  await expect.poll(async () => Number(await plot.getAttribute("data-u"))).toBeCloseTo(5, 3);
});

test.describe("Ukrainian touch layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("inserts from the drawing and removes only after confirmation", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    const board = page.locator(editor);
    await expect(board.locator("select")).toHaveCount(0);
    expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(390);
    await expect.poll(async () => {
      const label = await board.locator('[data-line-glyph="C1"] text').boundingBox();
      const viewport = await board.locator("[data-line-experiment-viewport]").boundingBox();
      return !!label && !!viewport && label.x + label.width <= viewport.x + viewport.width;
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("line-a-editor-mobile.png"), fullPage: true });
    await board.locator('[data-line-palette="r"]').tap();
    await board.locator('[data-line-slot-mode="parallel"]').tap();
    await board.locator('[data-line-parallel-part="C1"]').tap();
    await board.locator('[data-line-parallel-side="right"]').tap();
    await expect(board.locator('[data-line-glyph="R1"]')).toBeVisible();
    await expect(page.locator("[data-line-a-model-error]")).toHaveCount(0);
    await board.locator('[data-line-component="R1"]').tap();
    await board.locator("[data-line-remove]").tap();
    await expect(board.locator('[data-line-glyph="R1"]')).toBeVisible();
    await board.locator("[data-line-confirm-remove]").tap();
    await expect(board.locator('[data-line-glyph="R1"]')).toHaveCount(0);
    await board.locator('[data-line-section="TL1"]').tap();
    const plot = page.locator(results);
    await expect(plot).toHaveAttribute("data-calculation-ready", "true");
    await expect(plot.locator("[data-line-a-plot]")).toHaveCount(4);
    expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("line-a-results-mobile.png"), fullPage: true });
  });
});
