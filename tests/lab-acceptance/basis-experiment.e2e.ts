import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/fourier/bases/`;
const lab = '[data-basis-experiment][data-ready="true"]';
const result = "[data-basis-analysis]";

async function numberAttr(locator: Locator, attribute: string) {
  await expect(locator).toHaveAttribute(attribute, /.+/);
  return Number(await locator.getAttribute(attribute));
}

async function setCount(page: Page, count: number) {
  const control = page.locator("[data-basis-count]");
  const kind = await control.evaluate(element => element instanceof HTMLInputElement ? element.type : "select");
  if (kind === "select") await control.selectOption(String(count));
  else if (kind === "range") {
    await control.press("Home");
    for (let index = 1; index < count; index++) await control.press("ArrowRight");
  } else {
    await control.fill(String(count));
    await control.press("Tab");
  }
  await expect(control).toHaveValue(String(count));
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

async function applyExpression(page: Page, expression: string) {
  await page.locator("[data-basis-expression]").fill(expression);
  await page.locator("[data-basis-apply-expression]").click();
}

test("catalogue E: constant DFT, true rotating term and exact polynomial on the common grid", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await expect(page.locator(`a[href="${prefix}/ru/interactive/fourier/"]`)).toBeVisible();
  await page.getByRole("link", { name: "Базисные разложения сигнала и контура", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  await expect(page.locator(lab)).toBeVisible();

  await applyExpression(page, "2");
  await setCount(page, 1);
  const dc = page.locator('[data-basis-coefficient][data-frequency="0"]');
  expect(await numberAttr(dc, "data-re")).toBeCloseTo(2, 12);
  await expect(dc).toHaveAttribute("data-active", "true");
  const constantRms = await numberAttr(page.locator(result), "data-rms");
  expect(constantRms).toBeLessThan(1e-12);
  await expect(page.locator('[data-basis-comparison-row][data-count="1"]')).toHaveCount(8);

  await applyExpression(page, "sin(2*pi*x)");
  const epicycles = page.locator("[data-basis-epicycles]");
  await expect(epicycles).toBeVisible();
  const phase = page.locator("[data-basis-phase]");
  await phase.press("Home");
  const first = [await numberAttr(epicycles, "data-head-re"), await numberAttr(epicycles, "data-head-im")];
  await phase.press("ArrowRight");
  await expect.poll(async () => Math.hypot((await numberAttr(epicycles, "data-head-re")) - first[0],
    (await numberAttr(epicycles, "data-head-im")) - first[1])).toBeGreaterThan(1e-4);
  await capture(page, testInfo, "basis-e-signal-desktop");
  await page.locator("[data-basis-count]").press("End");
  await expect(page.locator(result)).toHaveAttribute("data-count", "64");
  await expect(page.locator('[data-basis-comparison-row][data-count="16"]')).toHaveCount(8);

  await page.locator("[data-basis-boundary]").selectOption("open");
  await applyExpression(page, "1-4*x+4*x^2");
  await page.locator("[data-basis-selector]").selectOption("chebyshev");
  await setCount(page, 3);
  const polynomial = await Promise.all([0, 1, 2].map(index => numberAttr(page.locator(`[data-basis-coefficient="${index}"]`), "data-re")));
  expect(polynomial[0]).toBeCloseTo(.5, 11);
  expect(polynomial[1]).toBeCloseTo(0, 11);
  expect(polynomial[2]).toBeCloseTo(.5, 11);
  const polynomialRms = await numberAttr(page.locator(result), "data-rms");
  expect(polynomialRms).toBeLessThan(1e-11);
  await expect(page.locator("[data-basis-contribution]")).toBeVisible();
  await expect(epicycles).toHaveCount(0);
  await applyExpression(page, "alert(1)");
  await expect(page.locator('[data-basis-error="invalid-expression"]')).toBeVisible();
  expect(await numberAttr(page.locator(result), "data-rms")).toBeLessThan(1e-11);
  expect(errors).toEqual([]);
  await testInfo.attach("desktop-reference", { contentType: "application/json", body: JSON.stringify({
    constant: { frequency: 0, value: 2, rms: constantRms }, chebyshev: { coefficients: polynomial, rms: polynomialRms },
  }) });
});

test.describe("Ukrainian touch experiment", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("draws a contour by touch, compares all bases and restores the exported experiment", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    await page.locator('[data-basis-source="contour"]').tap();
    const board = page.locator("[data-basis-draw]");
    await board.scrollIntoViewIfNeeded();
    const area = (await board.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const vertices = [[.25, .25], [.72, .23], [.80, .55], [.56, .76], [.22, .62]];
    for (const [index, [x, y]] of vertices.entries()) {
      await touch.send("Input.dispatchTouchEvent", {
        type: index === 0 ? "touchStart" : "touchMove",
        touchPoints: [{ x: area.x + area.width * x, y: area.y + area.height * y, id: 1 }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    expect(await numberAttr(board, "data-point-count")).toBeGreaterThanOrEqual(4);
    await page.locator("[data-basis-close]").check();
    await expect(page.locator(result)).toBeVisible();
    const methods = ["fourier", "haar", "walsh", "daubechies", "symlets", "coiflets", "chebyshev", "legendre"];
    const metrics: Record<string, number> = {};
    for (const basis of methods) {
      await page.locator("[data-basis-selector]").selectOption(basis);
      metrics[basis] = await numberAttr(page.locator(result), "data-rms");
      expect(Number.isFinite(metrics[basis])).toBe(true);
      await expect(page.locator("[data-basis-epicycles]")).toHaveCount(basis === "fourier" ? 1 : 0);
    }
    await expect(page.locator('[data-basis-comparison-row][data-count="8"]')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-basis-export]").click();
    const download = await downloadPromise;
    const path = testInfo.outputPath("basis-e-drawn-contour.json");
    await download.saveAs(path);
    const archive = JSON.parse(await readFile(path, "utf8"));
    expect(archive.source).toMatchObject({ kind: "contour", closed: true });
    expect(archive.source.points.length).toBeGreaterThanOrEqual(4);
    expect(archive.basis).toBe("legendre");
    expect(archive.result.coefficients.filter(({ active }: { active: boolean }) => active)).toHaveLength(8);

    await page.locator("[data-basis-clear]").click();
    await expect(board).toHaveAttribute("data-point-count", "0");
    await page.locator("[data-basis-undo]").click();
    await expect(board).toHaveAttribute("data-point-count", String(archive.source.points.length));
    await page.locator("[data-basis-clear]").click();
    const input = page.locator("[data-basis-import]");
    archive.result.rms = 123;
    await input.setInputFiles({ name: "edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archive)) });
    await expect(board).toHaveAttribute("data-point-count", String(archive.source.points.length));
    expect(await numberAttr(page.locator(result), "data-rms")).toBeCloseTo(metrics.legendre, 12);
    await capture(page, testInfo, "basis-e-contour-mobile");
    await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(page.locator('[data-basis-error="invalid-archive"]')).toBeVisible();
    await expect(board).toHaveAttribute("data-point-count", String(archive.source.points.length));
    expect(errors).toEqual([]);
    await testInfo.attach("mobile-comparison", { contentType: "application/json", body: JSON.stringify(metrics) });
  });
});

test("keeps contour curves in view and preserves a new stroke against a pending archive", async ({ page }, testInfo) => {
  await page.goto(route("ru"));
  await expect(page.locator(lab)).toBeVisible();
  const input = page.locator("[data-basis-import]");
  const shape = {
    kind: "electrotutor-basis-experiment", schemaVersion: 1, sampleCount: 64, basis: "legendre", count: 3, level: 3,
    source: { kind: "contour", closed: true, points: [{ re: -1, im: -1 }, { re: 1, im: -1 }, { re: 1, im: 1 }, { re: -1, im: 1 }] },
  };
  await input.setInputFiles({ name: "square.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(shape)) });
  const board = page.locator("[data-basis-draw]");
  await expect(board).toHaveAttribute("data-point-count", "4");
  await expect(board.locator(".basis-path-result")).toBeVisible();
  const fits = await board.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll<SVGGraphicsElement>(".basis-path-source, .basis-path-result, .basis-path-contribution"))
      .every(path => {
        const box = path.getBBox();
        const matrix = path.getScreenCTM()!;
        const topLeft = new DOMPoint(box.x, box.y).matrixTransform(matrix);
        const bottomRight = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
        return topLeft.x >= rect.left - .1 && topLeft.y >= rect.top - .1 &&
          bottomRight.x <= rect.right + .1 && bottomRight.y <= rect.bottom + .1;
      });
  });
  expect(fits).toBe(true);
  await capture(page, testInfo, "basis-e-polynomial-fit-desktop");

  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      const contents = await read.call(this);
      if (this.name === "delayed.json") {
        document.documentElement.dataset.testArchiveWaiting = "true";
        await new Promise<void>(resolve => window.addEventListener("basis-test-read", () => resolve(), { once: true }));
        window.setTimeout(() => { document.documentElement.dataset.testArchiveResolved = "true"; }, 0);
      }
      return contents;
    };
  });
  await input.setInputFiles({ name: "delayed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    ...shape, source: { kind: "signal", expression: "100", boundary: "open" },
  })) });
  await expect(page.locator("html")).toHaveAttribute("data-test-archive-waiting", "true");
  await board.scrollIntoViewIfNeeded();
  const area = (await board.boundingBox())!;
  await page.mouse.move(area.x + area.width * .4, area.y + area.height * .45);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * .6, area.y + area.height * .55, { steps: 8 });
  await page.evaluate(() => window.dispatchEvent(new Event("basis-test-read")));
  await expect(page.locator("html")).toHaveAttribute("data-test-archive-resolved", "true");
  await expect(page.locator('[data-basis-source="contour"]')).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(page.locator('[data-basis-source="contour"]')).toHaveAttribute("aria-pressed", "true");
  expect(await numberAttr(board, "data-point-count")).toBeGreaterThan(4);
  await expect(page.locator(result)).toBeVisible();
});
