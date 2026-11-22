import { expect, test, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/transmission-line-variable/`;
const lab = '[data-variable-line-lab][data-ready="true"]';
const board = '[data-line-editor-variant="variable"]';
const result = "[data-variable-result]";
const peak = "[data-variable-peak]";

async function numberAttr(page: Page, locator: string, attribute: string) {
  const target = page.locator(locator);
  await expect(target).toHaveAttribute(attribute, /.+/);
  return Number(await target.getAttribute(attribute));
}

async function run(page: Page) {
  await page.locator("[data-variable-run]").click();
  await expect(page.locator('[data-variable-status="complete"]')).toBeVisible();
  await expect(page.locator(result)).toHaveAttribute("data-stale", "false");
}

async function fillNumber(page: Page, selector: string, value: string) {
  await page.locator(selector).fill(value);
  await page.locator(selector).press("Tab");
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true, animations: "disabled" });
}

test("catalogue C: matched and Heaviside pulses use the live Worker and four shared plots", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("worker", worker => workers.push(worker.url()));
  await page.goto(`${prefix}/ru/interactive/`);
  await page.getByRole("link", { name: "Длинная линия с переменными параметрами", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  await expect(page.locator(lab)).toBeVisible();
  await expect(page.locator(`${board} [data-line-glyph="E1"] [data-source-arrow]`)).toHaveCount(1);
  await expect(page.locator(`${board} [data-line-palette]`)).toHaveCount(1);
  const started = Date.now();
  await run(page);
  const elapsed = Date.now() - started;
  expect(workers.some(url => /variable-line\.worker/.test(url))).toBe(true);
  await expect(page.locator(result)).toHaveAttribute("data-steps", "1280");
  const matchedTransit = await numberAttr(page, peak, "data-transit-s");
  const matchedPeak = await numberAttr(page, peak, "data-peak-voltage-v");
  const matchedResidual = await numberAttr(page, result, "data-energy-residual");
  expect(Math.abs(matchedTransit - .005)).toBeLessThan(20e-6);
  expect(Math.abs(matchedPeak - 50)).toBeLessThan(.05);
  expect(matchedResidual).toBeLessThan(1e-10);
  for (const key of ["u-x", "i-x", "u-t", "i-t"]) {
    await expect(page.locator(`[data-variable-plot="${key}"] svg[role="img"]`)).toBeVisible();
  }
  await capture(page, testInfo, "line-c-matched-desktop");
  await page.locator("[data-variable-position]").press("Home");
  await expect(page.locator(result)).toHaveAttribute("data-position-m", "0");
  await page.locator("[data-variable-time]").press("Home");
  await expect(page.locator(result)).toHaveAttribute("data-time-s", "0");
  await expect(page.locator(result)).toHaveAttribute("data-u", "0");
  await expect(page.locator(result)).toHaveAttribute("data-i", "0");

  await page.locator("[data-variable-profile]").selectOption("heaviside");
  await expect(page.locator(result)).toHaveAttribute("data-stale", "true");
  await run(page);
  await expect(page.locator(result)).toHaveAttribute("data-profile-kind", "heaviside");
  const lossyPeak = await numberAttr(page, peak, "data-peak-voltage-v");
  expect(Math.abs(lossyPeak - 50 * Math.exp(-.2))).toBeLessThan(.05);
  expect(await numberAttr(page, "[data-variable-energy]", "data-loss-work-j")).toBeGreaterThan(0);
  expect(await numberAttr(page, "[data-variable-energy]", "data-modulation-work-j")).toBe(0);

  await page.locator(`${board} [data-line-component="R1"]`).press("Enter");
  const invalidResistance = page.locator(`${board} [data-variable-field="resistance"]`);
  await invalidResistance.fill("0");
  await invalidResistance.press("Enter");
  await expect(invalidResistance).toHaveValue("50");
  await expect(invalidResistance).toHaveAttribute("aria-invalid", "true");
  expect(await numberAttr(page, "[data-variable-source-ohms]", "data-ohms")).toBe(50);

  await page.locator(`${board} [data-line-palette="r"]`).press("Enter");
  await expect(page.locator(`${board} [data-line-series-slot="W1"]`)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(`${board} [data-line-series-slot="W2"]`)).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await numberAttr(page, "[data-variable-source-ohms]", "data-ohms")).toBe(75);
  expect(await numberAttr(page, "[data-variable-load-ohms]", "data-ohms")).toBe(50);
  await page.locator("[data-variable-profile]").selectOption("lossless");
  await run(page);
  const insertedPeak = await numberAttr(page, peak, "data-peak-voltage-v");
  expect(Math.abs(insertedPeak - 40)).toBeLessThan(.05);
  expect(errors).toEqual([]);
  await testInfo.attach("desktop-worker-readings", { contentType: "application/json", body: JSON.stringify({
    cells: 160, steps: 1280, desktopChromiumUiMilliseconds: elapsed, matchedTransit, matchedPeak, matchedResidual, lossyPeak, insertedPeak,
  }) });
});

test.describe("Ukrainian touch experiment", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("touch selects the load-side wire and coax modulation comes from the same result", async ({ page }, testInfo) => {
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Довга лінія зі змінними параметрами" })).toBeVisible();
    const editor = page.locator(board);
    await expect(editor.locator("select, [data-line-slot-mode]")).toHaveCount(0);
    await editor.locator('[data-line-palette="r"]').tap();
    const slots = editor.locator("[data-line-series-slot]");
    await expect(slots).toHaveCount(3);
    await expect(editor.locator('[data-line-series-slot="W4"]')).toHaveCount(0);
    const targets = await slots.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
    expect(targets.some((a, index) => targets.slice(index + 1).some(b =>
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .1 &&
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .1))).toBe(false);
    await capture(page, testInfo, "line-c-insertion-mobile");
    await editor.locator('[data-line-series-slot="W3"]').tap();
    await expect(editor.locator('[data-line-glyph="R3"]')).toBeVisible();
    expect(await numberAttr(page, "[data-variable-source-ohms]", "data-ohms")).toBe(50);
    expect(await numberAttr(page, "[data-variable-load-ohms]", "data-ohms")).toBe(75);
    await page.locator("[data-variable-profile]").selectOption("coax");
    await run(page);
    await expect(page.locator(result)).toHaveAttribute("data-profile-kind", "coax");
    const modulationWork = await numberAttr(page, "[data-variable-energy]", "data-modulation-work-j");
    const energyResidual = await numberAttr(page, result, "data-energy-residual");
    expect(Math.abs(modulationWork)).toBeGreaterThan(1e-5);
    expect(energyResidual).toBeLessThan(1e-10);
    const coefficient = (name: string) => numberAttr(page, `[data-variable-local-coefficients] [data-coefficient="${name}′"]`, "data-value");
    const [l, g, c] = await Promise.all([coefficient("L"), coefficient("G"), coefficient("C")]);
    expect(l * c * (2e8) ** 2).toBeCloseTo(1, 12);
    expect(g / c).toBeCloseTo(20, 12);
    await testInfo.attach("mobile-worker-readings", { contentType: "application/json", body: JSON.stringify({
      emulatedWidth: 390, sourceOhms: 50, loadOhms: 75, modulationWork, energyResidual, l, g, c,
    }) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await capture(page, testInfo, "line-c-coax-mobile");

    await editor.locator('[data-line-component="R3"]').tap();
    await editor.locator("[data-line-remove]").tap();
    await editor.locator("[data-line-confirm-remove]").tap();
    await expect(editor.locator('[data-line-glyph="R3"]')).toHaveCount(0);
    expect(await numberAttr(page, "[data-variable-load-ohms]", "data-ohms")).toBe(50);
    await expect(page.locator(result)).toHaveAttribute("data-stale", "true");
  });
});

test("an invalid grid, cancelled Worker and changed input preserve the last accepted result", async ({ page }, testInfo) => {
  await page.goto(route("ru"));
  await expect(page.locator(lab)).toBeVisible();
  await run(page);
  const accepted = await page.locator(result).getAttribute("data-request-id");
  const voltage = await numberAttr(page, peak, "data-peak-voltage-v");
  await fillNumber(page, "[data-variable-cells]", "32");
  await page.locator("[data-variable-run]").click();
  await expect(page.locator('[data-variable-error="grid-resolution"]')).toBeVisible();
  await expect(page.locator(result)).toHaveAttribute("data-request-id", accepted!);

  await fillNumber(page, "[data-variable-cells]", "512");
  await fillNumber(page, "[data-variable-duration]", "8");
  await page.locator("[data-variable-run]").click();
  await expect(page.locator('[data-variable-status="running"]')).toBeVisible();
  await expect.poll(async () => Number(await page.locator("[data-variable-progress]").getAttribute("value"))).toBeGreaterThan(0);
  const cancelStart = Date.now();
  await page.locator("[data-variable-cancel]").click();
  await expect(page.locator('[data-variable-status="cancelled"]')).toBeVisible();
  await testInfo.attach("desktop-cancel-timing", { contentType: "application/json", body: JSON.stringify({
    cells: 512, desktopChromiumUiMilliseconds: Date.now() - cancelStart,
  }) });
  await expect(page.locator(result)).toHaveAttribute("data-request-id", accepted!);
  expect(await numberAttr(page, peak, "data-peak-voltage-v")).toBe(voltage);

  await page.locator("[data-variable-run]").click();
  await expect(page.locator('[data-variable-status="running"]')).toBeVisible();
  await page.locator("[data-variable-profile]").selectOption("independent");
  await expect(page.locator(result)).toHaveAttribute("data-stale", "true");
  await expect(page.locator(result)).toHaveAttribute("data-request-id", accepted!);
  await fillNumber(page, "[data-variable-cells]", "160");
  await fillNumber(page, "[data-variable-duration]", "2");
  await run(page);
  await expect(page.locator(result)).toHaveAttribute("data-profile-kind", "independent");
  await expect(page.locator(result)).not.toHaveAttribute("data-request-id", accepted!);
  const independent = await page.locator(result).getAttribute("data-request-id");
  await fillNumber(page, '[data-variable-field="c-base"]', "0.25");
  await page.locator("[data-variable-run]").click();
  await expect(page.locator('[data-variable-error="profile-range"]')).toBeVisible();
  await expect(page.locator(result)).toHaveAttribute("data-request-id", independent!);
});
