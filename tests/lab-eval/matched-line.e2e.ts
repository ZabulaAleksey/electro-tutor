import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { loadCurrentA, loadVoltageV, matchedLine, matchedLineArchive, sampleOffsetMs, transitMs } from "./matched-line-reference";

const labels = {
  ru: {
    switchState: "Начальное состояние",
    exportCircuit: "Сохранить схему",
    probe: "Точка наблюдения x",
    time: "Физическое время t, ms",
    nextFront: "Следующий фронт",
  },
  uk: {
    switchState: "Початковий стан",
    exportCircuit: "Зберегти схему",
    probe: "Точка спостереження x",
    time: "Фізичний час t, ms",
    nextFront: "Наступний фронт",
  },
};

type Metric = {
  id: string;
  expected: number;
  actual: number;
  unit: "ms" | "V" | "A";
  tolerance: number;
};

async function readMeasurement(lab: Locator) {
  return lab.evaluate(element => {
    function read(name: string) {
      const value = element.getAttribute(name);
      if (value === null || value.trim() === "" || !Number.isFinite(Number(value))) {
        throw new Error(`Missing or invalid measurement ${name}`);
      }
      return Number(value);
    }
    return {
      timeMs: 1000 * read("data-current-time"),
      voltageV: read("data-probe-u"),
      currentA: read("data-probe-i"),
    };
  });
}

test("E5 matched line: Worker arrival and load response", async ({ browser, page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const locale = mobile ? "uk" : "ru";
  const text = labels[locale];
  const route = `/${locale}/interactive/transmission-line/`;
  const negative = process.env.LAB_EVAL_NEGATIVE === "1";
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.emulateMedia({ reducedMotion: "reduce" });
  const start = performance.now();
  await page.goto(route);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const ready = Math.round(performance.now() - start);

  const tools = lab.locator(".circuit-lab-tools");
  const toolsSummary = tools.locator("summary");
  if (mobile) await toolsSummary.tap();
  else await toolsSummary.click();
  const starterRevision = await lab.getAttribute("data-model-revision");
  await tools.locator('input[type="file"]').setInputFiles({
    name: "matched-line.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(matchedLineArchive)),
  });
  await expect(lab).not.toHaveAttribute("data-model-revision", starterRevision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");

  const canvas = lab.locator("[data-network-canvas]");
  await expect(canvas.locator("[data-line-section]")).toHaveCount(1);
  await expect(canvas.locator("[data-line-section]")).toHaveAttribute("data-line-section", "EVAL1");
  const key = canvas.getByRole("button", { name: /· Ключ$/i });
  if (mobile) await key.tap();
  else await key.press("Enter");
  const state = page.getByRole("combobox", { name: text.switchState, exact: true });
  await expect(state).toHaveValue("false");
  const initiallyClosed = (await state.inputValue()) === "true";
  const revision = await lab.getAttribute("data-model-revision");
  const change = performance.now();
  const [worker] = await Promise.all([
    page.waitForEvent("worker", {
      predicate: launched => /\/network\.worker-[^/]+\.js$/.test(new URL(launched.url()).pathname),
    }),
    state.selectOption("true"),
  ]);
  await expect(lab).not.toHaveAttribute("data-model-revision", revision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await expect(lab).toHaveAttribute("data-method", "exact-fronts");
  const recalculation = Math.round(performance.now() - change);
  const closeInspector = page.locator(".network-tray-close");
  if (mobile) await closeInspector.tap();
  else await closeInspector.click();

  const exportCircuit = tools.getByRole("button", { name: text.exportCircuit, exact: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    mobile ? exportCircuit.tap() : exportCircuit.click(),
  ]);
  const { model: acceptedModel } = JSON.parse(await readFile(await download.path(), "utf8")) as { model: unknown };
  const inputs = { model: acceptedModel, initiallyClosed };
  const expectedModel = {
    ...matchedLineArchive.model,
    series: matchedLineArchive.model.series.map(key => ({ ...key, switch: { closed: true } })),
  };
  expect(inputs, "[LAB_EVAL_INPUT_MISMATCH] Accepted circuit differs from the matched-line fixture").toEqual({
    model: expectedModel,
    initiallyClosed: false,
  });
  if (mobile) await toolsSummary.tap();
  else await toolsSummary.click();

  const probe = lab.getByRole("slider", { name: text.probe, exact: true });
  await probe.press("End");
  await expect(probe).toHaveValue(String(matchedLine.lengthM));
  const timing = lab.locator(".network-timing summary");
  if (mobile) await timing.tap();
  else await timing.click();
  const time = lab.getByRole("spinbutton", { name: text.time, exact: true });
  async function sampleAt(milliseconds: number) {
    await time.fill(milliseconds.toFixed(2));
    await expect.poll(async () => (await readMeasurement(lab)).timeMs).toBeCloseTo(milliseconds, 6);
    return readMeasurement(lab);
  }

  const before = await sampleAt(transitMs - sampleOffsetMs);
  const nextFront = lab.getByRole("button", { name: text.nextFront, exact: true });
  if (mobile) await nextFront.tap();
  else await nextFront.click();
  // Record the event selected by the application, without setting an expected time in the UI.
  const front = await readMeasurement(lab);
  const after = await sampleAt(transitMs + sampleOffsetMs);
  await expect(lab.locator(".network-plot-grid [data-engineering-plot]")).toHaveCount(4);

  const metrics: Metric[] = [
    { id: "transit", expected: transitMs, actual: front.timeMs, unit: "ms", tolerance: 0.001 },
    { id: "before-voltage", expected: 0, actual: before.voltageV, unit: "V", tolerance: 0.01 },
    { id: "before-current", expected: 0, actual: before.currentA, unit: "A", tolerance: 0.001 },
    { id: "after-voltage", expected: negative ? loadVoltageV + 10 : loadVoltageV, actual: after.voltageV, unit: "V", tolerance: 0.01 },
    { id: "after-current", expected: loadCurrentA, actual: after.currentA, unit: "A", tolerance: 0.001 },
  ];
  await testInfo.attach("lab-measurements", {
    body: JSON.stringify({
      schemaVersion: 1,
      evalId: "E5-matched-line",
      seed: matchedLine.seed,
      locale,
      viewport: page.viewportSize(),
      route,
      negative,
      inputs,
      browserVersion: browser.version(),
      timingsMs: { ready, recalculation },
      sampleTimesMs: { before: before.timeMs, front: front.timeMs, after: after.timeMs },
      worker: new URL(worker.url()).pathname,
      metrics,
    }),
    contentType: "application/json",
  });
  await lab.locator(".network-observation").scrollIntoViewIfNeeded();
  const screenshotPath = testInfo.outputPath("matched-line.png");
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach("matched-line", { path: screenshotPath, contentType: "image/png" });
  expect(pageErrors).toEqual([]);
  const mismatches = metrics.filter(metric => Math.abs(metric.actual - metric.expected) > metric.tolerance);
  expect(mismatches, "[LAB_EVAL_REFERENCE_MISMATCH] Matched-line measurements outside tolerance").toEqual([]);
});
