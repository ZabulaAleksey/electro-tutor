import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = `${prefix}/ru/interactive/rolling/`;
const result = "[data-rolling-analysis]";
const smooth = Array.from({ length: 97 }, (_, i) => {
  const u = i / 96;
  return [3 * u - 1.5, .36 * Math.sin(4 * Math.PI * u)];
});
const input = { trace: { kind: "stroke", points: smooth }, radius: 1, quality: "full" };

test.use({ viewport: { width: 1440, height: 960 }, launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } });

async function stats(page: Page) {
  return page.locator(result).evaluate(node => Object.fromEntries([
    "fit-error", "fit-length", "fit-arcs", "poses", "shape-volume", "worker-ms",
    "trace-error", "slip-error", "gap", "triangles",
  ].map(key => [key, Number(node.getAttribute("data-" + key))])));
}

test("EVAL-07 fits a smooth two-cycle stroke, certifies its inverse body and preserves original data", async ({ page }, info) => {
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("worker", worker => { if (/rolling\.worker[^/]*\.js/.test(worker.url())) workers.push(worker.url()); });
  await page.goto(route);
  await expect(page.locator('[data-rolling-lab][data-ready="true"]')).toBeVisible();
  await page.locator("[data-rolling-import]").setInputFiles({ name: "two-smooth-periods.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ kind: "electrotutor-rolling-lab", schemaVersion: 1, input, speed: 1, position: 0 })) });
  await expect(page.locator('[data-rolling-lab][data-source="stroke"]')).toBeVisible();
  await page.locator("[data-rolling-play]").click();
  await expect(page.locator(result)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-rolling-view]')).toHaveAttribute("data-renderer", "webgl");
  await expect(page.locator(result)).toHaveAttribute("data-trace-method", "cubic-biarc");
  expect(workers).toHaveLength(1);
  const report = await stats(page);
  expect(report["fit-error"]).toBeGreaterThan(0);
  expect(report["fit-error"]).toBeLessThanOrEqual(.03501);
  expect(report["fit-length"]).toBeGreaterThan(3);
  expect(report["fit-arcs"]).toBeGreaterThan(16);
  expect(report.poses).toBeGreaterThan(report["fit-arcs"]);
  expect(report.poses).toBeLessThanOrEqual(4096);
  expect(report["trace-error"]).toBeLessThan(.001);
  expect(report["slip-error"]).toBeLessThan(.001);
  expect(report.gap).toBeGreaterThanOrEqual(-1e-10);
  expect(report["shape-volume"]).toBeGreaterThan(3);
  expect(report["worker-ms"]).toBeGreaterThan(0);
  expect(report["worker-ms"]).toBeLessThan(1500);
  await expect(page.locator('[data-rolling-lab]')).not.toHaveAttribute("data-position", "0");
  const frameTiming = await page.evaluate(() => new Promise<number[]>(resolve => {
    const frames: number[] = [];
    function next(t: number) { frames.push(t); if (frames.length === 25) resolve(frames); else requestAnimationFrame(next); }
    requestAnimationFrame(next);
  }));
  await page.locator("[data-rolling-pause]").click();
  await page.screenshot({ path: info.outputPath("smooth-inverse-body.png"), fullPage: true, animations: "disabled" });
  const dl = page.waitForEvent("download");
  await page.locator("[data-rolling-export-json]").click();
  const file = info.outputPath("raw-roundtrip.json");
  await (await dl).saveAs(file);
  expect(JSON.parse(await readFile(file, "utf8")).input).toEqual(input);
  await page.locator("[data-rolling-stop]").click();
  await page.locator("[data-rolling-play]").click();
  await page.locator("[data-rolling-pause]").click();
  expect(workers).toHaveLength(1);
  await page.locator('[data-rolling-preset="arc"]').click();
  await page.locator("[data-rolling-play]").click();
  await expect(page.locator(result)).toBeVisible();
  const changed = await stats(page);
  expect(Math.abs(report["shape-volume"] - changed["shape-volume"])).toBeGreaterThan(.01);
  expect(workers).toHaveLength(2);
  expect(errors).toEqual([]);
  await info.attach("rolling-eval07-metrics", { contentType: "application/json", body: JSON.stringify({ report, arc: changed,
    visibleFps: (frameTiming.length - 1) * 1000 / (frameTiming.at(-1)! - frameTiming[0]) }, null, 2) });
});
