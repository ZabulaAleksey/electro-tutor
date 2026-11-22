import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (locale: "ru" | "uk") => `${prefix}/${locale}/interactive/rolling/`;
const lab = "[data-rolling-lab][data-ready=true]";
const analysis = "[data-rolling-analysis]";
const view = "[data-rolling-view]";
const play = "[data-rolling-play]";
const pause = "[data-rolling-pause]";
const stop = "[data-rolling-stop]";
const seek = "[data-rolling-time]";
const drawing = "[data-rolling-drawing]";
const workerScript = /\/rolling\.worker[^/]*\.js(?:\?|$)/;
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

async function numeric(element: Locator, attr: string) {
  await expect(element).toHaveAttribute(attr, /\d/);
  return Number(await element.getAttribute(attr));
}

async function seekAt(page: Page, fraction: number) {
  const slider = page.locator(seek);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * fraction, y: box.height / 2 } });
  await expect.poll(async () => Math.abs(await numeric(page.locator(lab), "data-position") - fraction)).toBeLessThan(.07);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: "disabled", scale: "css" });
}

function observe(page: Page) {
  const workers: string[] = [];
  const errors: string[] = [];
  page.on("worker", worker => { if (workerScript.test(worker.url())) workers.push(worker.url()); });
  page.on("pageerror", error => errors.push(error.message));
  return { workers, errors };
}

test.describe("Chromium with WebGL", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("catalogue G calculates in a real Worker, renders the body, caches playback and exports a replayable experiment", async ({ page }, info) => {
    const { workers, errors } = observe(page);
    await page.goto(`${prefix}/ru/interactive/`);
    await page.getByRole("link", { name: "Качение тела по заданному следу", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(route("ru") + "$"));
    await expect(page.locator(lab)).toBeVisible();
    await expect(page.locator(analysis)).toHaveCount(0);
    await page.locator(play).click();
    const metrics = page.locator(analysis);
    await expect(metrics).toBeVisible();
    expect(workers).toHaveLength(1);
    expect(await numeric(metrics, "data-trace-error")).toBeLessThan(1e-3);
    expect(await numeric(metrics, "data-slip-error")).toBeLessThan(1e-3);
    expect(await numeric(metrics, "data-gap")).toBeGreaterThanOrEqual(-1e-10);
    const triangles = await numeric(metrics, "data-triangles");
    expect(triangles).toBeGreaterThan(24);
    expect(triangles).toBeLessThanOrEqual(1332);
    await expect(page.locator(view)).toHaveAttribute("data-renderer", "webgl");
    await expect.poll(() => numeric(page.locator(lab), "data-position")).toBeGreaterThan(.04);
    await page.locator(pause).click();
    const canvas = page.locator("[data-rolling-canvas]");
    const before = await canvas.screenshot();
    await page.locator("[data-rolling-zoom-in]").click();
    await expect.poll(() => numeric(page.locator(view), "data-camera-zoom")).toBeGreaterThan(1);
    expect(await canvas.screenshot()).not.toEqual(before);
    await page.locator("[data-rolling-camera-reset]").click();
    await page.locator(stop).click();
    await expect(page.locator(lab)).toHaveAttribute("data-position", "0");
    await page.locator(seek).press("End");
    await expect(page.locator(lab)).toHaveAttribute("data-position", "1");
    expect(workers).toHaveLength(1);
    await page.locator(seek).press("Home");
    await page.locator(seek).press("ArrowRight");
    await expect.poll(() => numeric(page.locator(lab), "data-position")).toBeGreaterThan(0);
    await seekAt(page, .45);
    await capture(page, info, "rolling-g-desktop.png");

    const meshDownload = page.waitForEvent("download");
    await page.locator("[data-rolling-export-obj]").click();
    const meshPath = info.outputPath("rolling-g.obj");
    await (await meshDownload).saveAs(meshPath);
    const obj = await readFile(meshPath, "utf8");
    expect(obj.match(/^f \d+ \d+ \d+$/gm)).toHaveLength(triangles);
    expect(obj.match(/^v .+$/gm)?.length).toBeGreaterThan(12);
    const archiveDownload = page.waitForEvent("download");
    await page.locator("[data-rolling-export-json]").click();
    const archivePath = info.outputPath("rolling-g.json");
    await (await archiveDownload).saveAs(archivePath);
    const archive = JSON.parse(await readFile(archivePath, "utf8"));
    expect(archive).toMatchObject({
      kind: "electrotutor-rolling-lab", schemaVersion: 1, input: { trace: { kind: "preset", preset: "arc" } },
    });
    expect(archive.position).toBeGreaterThan(0);
    await page.locator('[data-rolling-preset="s-bend"]').click();
    await expect(metrics).toHaveCount(0);
    const importer = page.locator("[data-rolling-import]");
    await importer.setInputFiles(archivePath);
    await expect(page.locator('[data-rolling-preset="arc"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator(play).click();
    await expect(metrics).toBeVisible();
    expect(workers).toHaveLength(2);
    await page.locator(pause).click();
    await importer.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(page.locator('[data-rolling-error="INVALID_ARCHIVE"]')).toBeVisible();
    await expect(metrics).toBeVisible();
    const contextLoss = await canvas.evaluateHandle(element =>
      (element as HTMLCanvasElement).getContext("webgl")?.getExtension("WEBGL_lose_context") ?? null);
    await contextLoss.evaluate(extension => { if (!extension) throw Error("Missing WEBGL_lose_context"); extension.loseContext(); });
    await expect(page.locator(view)).toHaveAttribute("data-renderer", "2d");
    await expect(page.locator("[data-rolling-fallback]")).toBeVisible();
    await contextLoss.evaluate(extension => extension?.restoreContext());
    await expect(page.locator(view)).toHaveAttribute("data-renderer", "webgl");
    await contextLoss.dispose();
    expect(errors).toEqual([]);
    await info.attach("rolling-metrics", { contentType: "application/json", body: JSON.stringify({
      triangles, slip: await numeric(metrics, "data-slip-error"), trace: await numeric(metrics, "data-trace-error"),
      gap: await numeric(metrics, "data-gap"), workerRuns: workers.length,
    }) });
  });
});

test("cancels a pending Worker and applies only the newest trace", async ({ page }) => {
  const { workers } = observe(page);
  await page.addInitScript(() => {
    let held = false;
    Worker.prototype.addEventListener = new Proxy(Worker.prototype.addEventListener, {
      apply(target, thread, args) {
        const [type, listener, ...options] = args;
        if (type !== "message" || typeof listener !== "function") return Reflect.apply(target, thread, args);
        return Reflect.apply(target, thread, [type, (event: MessageEvent) => {
          if (!held && event.data?.type === "result" && event.data.run?.mesh) {
            held = true;
            window.addEventListener("release-rolling-test-result", () => {
              listener.call(thread, event);
              document.documentElement.dataset.rollingTestDelivery = "released";
            }, { once: true });
            document.documentElement.dataset.rollingTestDelivery = "held";
            return;
          }
          listener.call(thread, event);
        }, ...options]);
      },
    });
  });
  await page.goto(route("ru"));
  await expect(page.locator(lab)).toBeVisible();
  await page.locator(play).click();
  await expect(page.locator("html")).toHaveAttribute("data-rolling-test-delivery", "held");
  await expect(page.locator("[data-rolling-progress] progress")).toHaveAttribute("value", "0.85");
  await page.locator("[data-rolling-cancel]").click();
  await expect(page.locator("[data-rolling-progress]")).toHaveCount(0);
  await expect(page.locator(analysis)).toHaveCount(0);
  await page.locator('[data-rolling-preset="s-bend"]').click();
  await page.locator(play).click();
  const metrics = page.locator(analysis);
  await expect(metrics).toHaveAttribute("data-trace", "s-bend");
  const before = await numeric(metrics, "data-trace-error");
  expect(before).not.toBeCloseTo(3.99819705042113e-5, 7);
  await page.evaluate(() => window.dispatchEvent(new Event("release-rolling-test-result")));
  await expect(page.locator("html")).toHaveAttribute("data-rolling-test-delivery", "released");
  await expect(metrics).toHaveAttribute("data-trace-error", String(before));
  expect(workers).toHaveLength(2);
});

test.describe("mobile without WebGL", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a native touch stroke gets a fresh compact solve and a moving 2D contact", async ({ page }, info) => {
    const { workers, errors } = observe(page);
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
        apply(target, receiver, args) {
          return String(args[0]).includes("webgl") ? null : Reflect.apply(target, receiver, args);
        },
      });
    });
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    const board = page.locator(drawing);
    await board.scrollIntoViewIfNeeded();
    const box = (await board.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const stroke = [[.25, .68], [.36, .65], [.46, .59], [.55, .52], [.63, .47], [.72, .45]];
    for (const [i, [x, y]] of stroke.entries()) {
      await touch.send("Input.dispatchTouchEvent", {
        type: i === 0 ? "touchStart" : "touchMove",
        touchPoints: [{ x: box.x + box.width * x, y: box.y + box.height * y, id: 1 }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    await expect(page.locator(lab)).toHaveAttribute("data-source", "stroke");
    await expect(page.locator("[data-rolling-quality]")).toHaveValue("compact");
    await page.locator(play).click();
    const metrics = page.locator(analysis);
    await expect(metrics).toHaveAttribute("data-trace", "stroke");
    expect(workers).toHaveLength(1);
    expect(await numeric(metrics, "data-triangles")).toBeLessThanOrEqual(372);
    await expect(page.locator(view)).toHaveAttribute("data-renderer", "2d");
    const contact = page.locator("[data-rolling-contact-index]");
    const before = await numeric(contact, "data-rolling-contact-index");
    await expect.poll(() => numeric(page.locator(lab), "data-position")).toBeGreaterThan(.03);
    await page.locator(pause).click();
    await page.locator(seek).press("End");
    await expect(page.locator(lab)).toHaveAttribute("data-position", "1");
    expect(await numeric(contact, "data-rolling-contact-index")).toBeGreaterThan(before);
    await expect(page.locator("[data-rolling-export-obj]")).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    expect(errors).toEqual([]);
    await capture(page, info, "rolling-g-mobile.png");
  });
});

test.describe("mobile WebGL budget", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test("the compact canvas respects the pixel cap and zooms with a native pinch", async ({ page }, info) => {
    await page.goto(route("uk"));
    await expect(page.locator(lab)).toBeVisible();
    await page.locator(play).click();
    await expect(page.locator(analysis)).toBeVisible();
    await expect(page.locator(view)).toHaveAttribute("data-renderer", "webgl");
    await page.locator(pause).click();
    await seekAt(page, .32);
    const canvas = page.locator("[data-rolling-canvas]");
    await canvas.scrollIntoViewIfNeeded();
    const geometry = await canvas.evaluate(element => {
      const node = element as HTMLCanvasElement;
      return { width: node.width, height: node.height, cssWidth: node.clientWidth, dpr: devicePixelRatio };
    });
    expect(geometry.dpr).toBe(3);
    expect(geometry.width).toBeLessThanOrEqual(900);
    expect(geometry.height).toBeLessThanOrEqual(900);
    expect(geometry.width / geometry.cssWidth).toBeLessThanOrEqual(1.26);
    const box = (await canvas.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const center = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    for (const [i, spread] of [32, 64].entries()) {
      await touch.send("Input.dispatchTouchEvent", {
        type: i ? "touchMove" : "touchStart",
        touchPoints: [{ x: center - spread, y, id: 1 }, { x: center + spread, y, id: 2 }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    await expect.poll(() => numeric(page.locator(view), "data-camera-zoom")).toBeGreaterThan(1.2);
    await page.locator("[data-rolling-camera-reset]").click();
    await capture(page, info, "rolling-g-webgl-mobile.png");
    await info.attach("rolling-mobile-budget", { contentType: "application/json", body: JSON.stringify(geometry) });
  });
});
