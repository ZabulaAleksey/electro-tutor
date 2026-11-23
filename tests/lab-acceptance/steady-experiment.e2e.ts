import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/transmission-line-steady/experiment/`;
const editor = "[data-line-experiment-editor]";
const results = "[data-steady-experiment-results]";

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

async function reading(panel: Locator, name: string, expected: number, digits = 6) {
  await expect.poll(async () => {
    const value = await panel.getAttribute(`data-${name}`);
    return value === null || value === "" ? NaN : Number(value);
  }).toBeCloseTo(expected, digits);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  // Mobile scroll anchoring may shift by one pixel as the last result renders.
  // Position the screenshot after that layout and keep the exact top-edge check.
  await expect.poll(() => page.evaluate(async () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    await new Promise(requestAnimationFrame);
    return window.scrollY;
  })).toBe(0);
  await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true, animations: "disabled" });
}

test("catalogue B: matched RMS, common coordinate, and independent RLGC losses", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await page.getByRole("link", { name: "Длинная линия в синусоидальном режиме", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  const board = page.locator(editor);
  await expect(board).toHaveAttribute("data-line-editor-variant", "steady");
  await expect(board.locator("select")).toHaveCount(0);
  await expect(board.locator("[data-line-palette]")).toHaveCount(5);
  await expect(board.locator("[data-line-palette='switch-open'], [data-line-palette='switch-closed']")).toHaveCount(0);
  await expect(board.locator("[data-line-reference]")).toHaveAttribute("data-line-reference", "E1:b");
  await expect(board.locator('[data-line-glyph="E1"] [data-source-arrow]')).toHaveCount(1);
  const panel = page.locator(results);
  await expect(panel.locator("[data-steady-plot]")).toHaveCount(5);
  await expect(panel.locator("[data-steady-phasors]")).toHaveCount(2);
  await reading(panel, "voltage-rms", 50);
  await reading(panel, "current-rms", 1);
  await reading(panel, "impedance-magnitude", 50);
  await reading(panel, "impedance-phase-deg", 0);
  await reading(panel, "power-w", 50);
  await reading(panel, "backward-voltage-rms", 0);
  await screenshot(page, testInfo, "line-b-matched-desktop");

  await enter(panel.locator("[data-steady-position]"), "123456");
  await expect(panel.locator('[data-steady-plot][data-coordinate="123456"]')).toHaveCount(5);
  await expect(panel.locator('[data-steady-phasors][data-coordinate="123456"]')).toHaveCount(2);
  await expect(panel.locator('[data-cursor-x="123456"]')).toHaveCount(5);
  await panel.getByRole("img", { name: "I(x)", exact: true }).press("End");
  await expect(panel.locator('[data-steady-plot][data-coordinate="500000"]')).toHaveCount(5);
  await expect(panel.locator('[data-steady-phasors][data-coordinate="500000"]')).toHaveCount(2);

  await enter(page.locator('[data-steady-field="frequencyHz"]'), "1200");
  await expect(page.locator("[data-steady-experiment]")).toHaveAttribute("data-frequency-hz", "1200");
  await board.locator('[data-line-section="TL1"]').press("Enter");
  await expect(board.locator('[data-line-selected-part="TL1"]')).toBeVisible();
  for (const key of ["lengthM", "rOhmM", "lHenryM", "gSiemensM", "cFaradM"]) {
    await expect(board.locator(`[data-steady-field="${key}"]`)).toBeVisible();
  }
  await enter(board.locator('[data-steady-field="rOhmM"]'), ".0001");
  await expect(board.locator('[data-steady-field="gSiemensM"]')).toHaveValue("0");
  await expect.poll(async () => Number(await panel.getAttribute("data-backward-voltage-rms"))).toBeGreaterThan(.01);
  await enter(board.locator('[data-steady-field="gSiemensM"]'), ".00000004");
  await expect(board.locator('[data-steady-field="rOhmM"]')).toHaveValue("0.0001");
  await enter(panel.locator("[data-steady-position]"), "500000");
  await reading(panel, "voltage-rms", 50 * Math.exp(-1));
  await reading(panel, "current-rms", Math.exp(-1));
  await reading(panel, "power-w", 50 * Math.exp(-2));
  await reading(panel, "backward-voltage-rms", 0);
  await screenshot(page, testInfo, "line-b-lossy-desktop");
  expect(errors).toEqual([]);
});

test("the current source can drive the same line with an entered RMS phase", async ({ page }) => {
  await page.goto(route("ru"));
  const board = page.locator(editor);
  await board.locator('[data-line-palette="current"]').click();
  await board.locator('[data-line-parallel-part="E1"]').click();
  await board.locator('[data-line-parallel-side="right"]').click();
  await expect(board.locator('[data-line-glyph="J1"] [data-source-arrow]')).toHaveCount(2);

  await board.locator('[data-line-component="E1"]').click();
  await board.locator("[data-line-remove]").click();
  await board.locator("[data-line-confirm-remove]").click();
  await board.locator('[data-line-component="J1"]').click();
  await enter(board.locator('[data-steady-field="currentA"]'), "1");
  await enter(board.locator('[data-steady-field="phaseDeg"]'), "30");
  const panel = page.locator(results);
  await reading(panel, "voltage-rms", 50);
  await reading(panel, "current-rms", 1);
  await reading(panel, "power-w", 50);
  await reading(panel.locator('[data-steady-phasors="current"] [data-wave-reading="total"]'), "wave-phase", 30);

  const append = board.locator("[data-line-append]");
  await expect(append).toHaveAttribute("data-line-append-endpoint", "TL1:b");
  await append.click();
  await expect(append).toHaveAttribute("data-line-append-endpoint", "TL2:b");
  await append.click();
  await expect(append).toHaveAttribute("data-line-append-endpoint", "TL3:b");
  await board.locator('[data-line-section="TL3"]').click();
  await enter(board.locator('[data-steady-field="lengthM"]'), "400000");
  await expect(panel).toHaveAttribute("data-section-id", "TL3");
  await reading(panel, "power-w", 50);
  await board.locator('[data-line-section="TL2"]').click();
  await expect(board.locator('[data-steady-field="lengthM"]')).toHaveValue("500000");
});

test.describe("Ukrainian touch layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("inserts a load on the drawing and reports an open-end impedance pole", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    const board = page.locator(editor);
    const panel = page.locator(results);
    await expect(board.locator("select")).toHaveCount(0);
    expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(390);
    await board.locator('[data-line-palette="r"]').tap();
    await board.locator('[data-line-parallel-part="R1"]').tap();
    await board.locator('[data-line-parallel-side="right"]').tap();
    await expect(board.locator('[data-line-glyph="R2"]')).toBeVisible();
    await reading(panel, "current-rms", 1.5);
    await page.locator("[data-steady-undo]").tap();
    await reading(panel, "current-rms", 1);
    await board.locator('[data-line-component="R1"]').tap();
    await board.locator("[data-line-remove]").tap();
    await board.locator("[data-line-confirm-remove]").tap();
    await enter(panel.locator("[data-steady-position]"), "21700");
    await reading(panel, "power-w", 0);
    await enter(panel.locator("[data-steady-position]"), "500000");
    await reading(panel, "current-rms", 0);
    await expect(panel).toHaveAttribute("data-impedance-magnitude", "");
    await expect(panel.locator("[data-steady-impedance-gap]")).toBeVisible();
    await expect(panel.locator("[data-steady-plot]")).toHaveCount(5);
    expect(await page.locator("html").evaluate(node => node.scrollWidth)).toBe(390);
    await screenshot(page, testInfo, "line-b-open-mobile");
  });
});
