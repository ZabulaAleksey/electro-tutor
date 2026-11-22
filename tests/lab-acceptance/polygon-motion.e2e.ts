import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/fourier/polygon-motion/`;
const lab = '[data-motion-lab][data-ready="true"]';
const result = "[data-motion-analysis]";
const drawing = "[data-motion-source-drawing] svg";

async function reading(target: Locator, key: string) {
  await expect(target).toHaveAttribute(key, /.+/);
  return Number(await target.getAttribute(key));
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Tab");
}

test("catalogue F: exact square and circle, actual contour phase and manually scaled contribution", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${prefix}/ru/interactive/`);
  await expect(page.locator(`a[href="${prefix}/ru/interactive/fourier/bases/"]`)).toBeVisible();
  await page.getByRole("link", { name: "Аппроксимация контура многоугольными движениями", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
  await expect(page.locator(lab)).toBeVisible();
  await page.locator("[data-motion-family]").selectOption("square");
  await expect(page.locator(result)).toHaveAttribute("data-components", "1");
  const squareRms = await reading(page.locator(result), "data-rms");
  expect(squareRms).toBeLessThan(1e-10);
  expect(await reading(page.locator(result), "data-max")).toBeLessThan(1e-10);

  const plot = page.locator("[data-motion-result-plot]");
  const phase = page.locator("[data-motion-phase]");
  await phase.press("Home");
  const start = { x: await reading(plot, "data-motion-head-re"), y: await reading(plot, "data-motion-head-im") };
  await phase.press("ArrowRight");
  const moved = { x: await reading(plot, "data-motion-head-re"), y: await reading(plot, "data-motion-head-im") };
  expect(Math.hypot(start.x - moved.x, start.y - moved.y)).toBeGreaterThan(.01);
  expect(Math.min(Math.abs(start.x - moved.x), Math.abs(start.y - moved.y))).toBeLessThan(1e-10);
  await capture(page, testInfo, "motion-f-square-desktop");

  await enter(page.locator("[data-motion-scale]"), "0.3");
  const editedRms = await reading(page.locator(result), "data-rms");
  expect(editedRms).toBeGreaterThan(.1);
  await page.locator("[data-motion-autofit]").click();
  expect(await reading(page.locator(result), "data-rms")).toBeLessThan(1e-10);
  await page.locator('[data-motion-preset="circle"]').click();
  await page.locator("[data-motion-family]").selectOption("circle");
  const circleRms = await reading(page.locator(result), "data-rms");
  expect(circleRms).toBeLessThan(1e-10);
  expect(errors).toEqual([]);
  await testInfo.attach("geometric-references", { contentType: "application/json", body: JSON.stringify({
    squareRms, circleRms, editedRms, firstEdgeStep: { start, moved },
  }) });
});

test("seeded star and versioned archive preserve manual coefficients; safe local SVG accepts one contour", async ({ page }, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(route("ru"));
  await expect(page.locator(lab)).toBeVisible();
  await page.locator('[data-motion-preset="star"]').click();
  const count = page.locator("[data-motion-count]");
  await count.press("Home");
  const single = await reading(page.locator(result), "data-rms");
  await count.press("End");
  await expect(page.locator(result)).toHaveAttribute("data-components", "12");
  const many = await reading(page.locator(result), "data-rms");
  expect(many).toBeLessThan(single);
  await capture(page, testInfo, "motion-f-star-desktop");

  await page.locator("[data-motion-component]").selectOption("3");
  await enter(page.locator("[data-motion-angle]"), "47");
  await enter(page.locator("[data-motion-shift]"), "9");
  await count.press("Home");
  await count.press("ArrowRight");
  await count.press("ArrowRight");
  await expect(page.locator(result)).toHaveAttribute("data-components", "3");
  await count.press("ArrowRight");
  await page.locator("[data-motion-component]").selectOption("3");
  await expect(page.locator("[data-motion-angle]")).toHaveValue("47");
  await expect(page.locator("[data-motion-shift]")).toHaveValue("9");
  await count.press("End");
  await page.locator("[data-motion-component]").selectOption("0");
  await enter(page.locator("[data-motion-angle]"), "25");
  await enter(page.locator("[data-motion-shift]"), "19");
  const adjusted = await reading(page.locator(result), "data-rms");
  expect(adjusted).not.toBe(many);
  const saving = page.waitForEvent("download");
  await page.locator("[data-motion-export]").click();
  const file = await saving;
  const path = testInfo.outputPath("motion-f-star.json");
  await file.saveAs(path);
  const archive = JSON.parse(await readFile(path, "utf8"));
  expect(archive.components[0]).toMatchObject({ angleDegrees: 25, phaseIndex: 19 });
  expect(archive.components[3]).toMatchObject({ angleDegrees: 47, phaseIndex: 9 });
  expect(archive.options.count).toBe(12);

  const svg = page.locator("[data-motion-svg-import]");
  const setSvg = (value: string) => svg.setInputFiles({ name: "outline.svg", mimeType: "image/svg+xml", buffer: Buffer.from(value) });
  await setSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><path d="M10 20h80v80h-80z"/></g></svg>');
  await expect(page.locator(drawing)).toHaveAttribute("data-point-count", "4");
  expect(await reading(page.locator(result), "data-rms")).toBeLessThan(1e-10);
  await setSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 50A40 40 0 0190 50A40 40 0 0110 50Z"/></svg>');
  await expect(page.locator(drawing)).toHaveAttribute("data-point-count", "1024");
  const circularSvgError = await reading(page.locator(result), "data-rms");
  expect(circularSvgError).toBeLessThan(.001);
  await setSvg('<svg xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="40" rx="30" ry="21"/></svg>');
  await expect.poll(() => reading(page.locator(result), "data-rms")).toBeGreaterThan(circularSvgError + .001);
  const ellipseError = await reading(page.locator(result), "data-rms");
  expect(Number.isFinite(ellipseError)).toBe(true);
  for (const unsafe of [
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 0 4 4Z"/><image href="/motion-probe.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 0 4 4Z M2 0L3 0 4 4Z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L8 0 4 4"/></svg>',
  ]) {
    await setSvg(unsafe);
    await expect(page.locator('[data-motion-error="unsupported-svg"]')).toBeVisible();
    expect(await reading(page.locator(result), "data-rms")).toBe(ellipseError);
  }
  await setSvg(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M10 20 ${"C10 30 20 40 10 20 ".repeat(64)}Z"/></svg>`);
  await expect(page.locator('[data-motion-error="svg-complexity"]')).toBeVisible();
  expect(await reading(page.locator(result), "data-rms")).toBe(ellipseError);
  expect(requests.some(url => url.endsWith("/motion-probe.png"))).toBe(false);

  const svgPath = (data: string) => `<svg xmlns="http://www.w3.org/2000/svg"><path d="${data}"/></svg>`;
  await setSvg(svgPath(`M0 0 ${"C1000000 1000000 -1000000 1000000 0 0 ".repeat(62)}Z`));
  await expect.poll(() => reading(page.locator(result), "data-rms")).not.toBe(ellipseError);
  const manyCurvesError = await reading(page.locator(result), "data-rms");
  expect(Number.isFinite(manyCurvesError)).toBe(true);
  await setSvg(svgPath("M10 20 c0 -10 10 -10 10 0 s10 10 10 0 q0 10 -10 10 t-10 -10 z"));
  await expect.poll(() => reading(page.locator(result), "data-rms")).not.toBe(manyCurvesError);
  const smoothError = await reading(page.locator(result), "data-rms");
  await page.locator('[data-motion-preset="square"]').click();
  await expect(page.locator(drawing)).toHaveAttribute("data-point-count", "4");
  await setSvg(svgPath("M10 20 C10 10 20 10 20 20 C20 30 30 30 30 20 Q30 30 20 30 Q10 30 10 20 Z"));
  await expect(page.locator(drawing)).toHaveAttribute("data-point-count", "1024");
  expect(await reading(page.locator(result), "data-rms")).toBeCloseTo(smoothError, 12);

  archive.result = { rms: 765, max: 765 };
  const json = page.locator("[data-motion-json-import]");
  await json.setInputFiles({ name: "star-edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archive)) });
  await expect(page.locator(drawing)).toHaveAttribute("data-point-count", "10");
  expect(await reading(page.locator(result), "data-rms")).toBeCloseTo(adjusted, 12);
  await json.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.locator('[data-motion-error="invalid-archive"]')).toBeVisible();
  expect(await reading(page.locator(result), "data-rms")).toBeCloseTo(adjusted, 12);
  expect(errors).toEqual([]);
  await testInfo.attach("star-errors", {
    contentType: "application/json",
    body: JSON.stringify({ single, many, adjusted, circularSvgError, ellipseError, manyCurvesError, smoothError }),
  });
});

test.describe("Ukrainian mobile experiment", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("real touch replaces the contour and the animated sum follows the same fit", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Апроксимація контуру багатокутними рухами" })).toBeVisible();
    const board = page.locator(drawing);
    await board.scrollIntoViewIfNeeded();
    const area = (await board.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const points = [[.28, .26], [.72, .22], [.76, .52], [.62, .69], [.33, .74], [.24, .51]];
    for (const [index, [x, y]] of points.entries()) {
      await touch.send("Input.dispatchTouchEvent", {
        type: index === 0 ? "touchStart" : "touchMove",
        touchPoints: [{ x: area.x + area.width * x, y: area.y + area.height * y, id: 1 }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    await expect.poll(() => reading(board, "data-point-count")).toBeGreaterThan(4);
    const rms = await reading(page.locator(result), "data-rms");
    expect(Number.isFinite(rms)).toBe(true);
    await page.locator("[data-motion-play]").click();
    const plot = page.locator("[data-motion-result-plot]");
    await expect.poll(() => reading(plot, "data-motion-time")).toBeGreaterThan(.01);
    await page.locator("[data-motion-play]").click();
    expect(await reading(page.locator(result), "data-rms")).toBe(rms);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(errors).toEqual([]);
    await capture(page, testInfo, "motion-f-drawn-mobile");
  });
});
