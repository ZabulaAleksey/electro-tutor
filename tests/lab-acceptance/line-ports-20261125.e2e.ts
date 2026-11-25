import { expect, test, type Locator } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/transmission-line/experiment/`;
const board = "[data-line-experiment-editor]:not([inert])";
const archiveKey = "electrotutor:line-experiment:v1";

async function setRange(control: Locator, value: number) {
  await control.evaluate((node, next) => {
    const input = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("EVAL-04 attaches source and load to separate physical port pairs at desktop and phone widths", async ({ page }, info) => {
  await page.goto(route("uk"));
  const editor = page.locator(board);
  const line = editor.locator('[data-line-glyph="TL1"]');
  await expect(line).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(line.locator("[data-line-physical-terminal]")).toHaveCount(4);
    expect(await line.locator("[data-line-physical-terminal]").evaluateAll(nodes =>
      new Set(nodes.map(port => port.getAttribute("cx") + "," + port.getAttribute("cy"))).size)).toBe(4);
    await editor.screenshot({ path: info.outputPath(`physical-ports-${width}.png`), animations: "disabled" });
  }
  await editor.locator('[data-line-palette="l"]').click();
  await editor.locator('[data-line-series-slot="W2"]').click();
  await editor.locator('[data-line-component="L1"]').click();
  await editor.getByRole("dialog").press("Delete");
  const topology = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).circuit.topology, archiveKey);
  expect(topology.components.find((part: { id: string }) => part.id === "TL1").terminals)
    .toEqual(["TL1:a", "TL1:b", "TL1:return-in", "TL1:return-out"]);
  expect(topology.wires).toEqual(expect.arrayContaining([
    { id: "W2", from: "K1:b", to: "TL1:a" },
    { id: "W3", from: "TL1:b", to: "C1:a" },
    { id: "W4", from: "C1:b", to: "TL1:return-out" },
    { id: "W5", from: "E1:b", to: "TL1:return-in" },
  ]));
  expect(topology.wires).toHaveLength(5);
  await editor.locator("[data-line-wire-mode]").click();
  await editor.locator('[data-line-wire-control="W4"]').click();
  await editor.locator("[data-line-break-wire]").click();
  await expect(page.locator("[data-line-a-model-error]")).toHaveCount(0);
  await expect(page.locator('[data-line-termination="open"]')).toHaveAttribute("aria-pressed", "true");
  await editor.locator('[data-line-broken-wire="W4"]').click();
  await editor.locator("[data-line-restore-wire]").click();
  await expect(page.locator('[data-line-termination="open"]')).toHaveAttribute("aria-pressed", "false");
});

test("EVAL-04 matched, short and open terminations reach the real worker and have exact wave limits", async ({ page }, info) => {
  await page.goto(route("ru"));
  const editor = page.locator(board);
  const plot = page.locator("[data-line-a-results]");
  const source = editor.locator('[data-line-glyph="E1"]');
  const line = editor.locator('[data-line-glyph="TL1"]');
  await expect(line).toBeVisible();
  const sourcePosition = (await source.getAttribute("transform"))!;
  const linePosition = (await line.getAttribute("transform"))!;
  for (const [mode, gamma, voltage, current] of [
    ["matched", 0, 12, .24], ["short", -1, 0, .48], ["open", 1, 24, 0],
  ] as const) {
    await expect(page.locator(`[data-line-termination="${mode}"]`)).toBeVisible();
    await page.locator(`[data-line-termination="${mode}"]`).click();
    await expect(page.locator(`[data-line-termination="${mode}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(source).toHaveAttribute("transform", sourcePosition);
    await expect(line).toHaveAttribute("transform", linePosition);
    await editor.locator('[data-line-section="TL1"]').click();
    await expect(plot).toHaveAttribute("data-calculation-ready", "true");
    await setRange(plot.locator("[data-line-a-position]"), 1e6);
    await setRange(plot.locator("[data-line-a-time]"), .006);
    await expect(plot).toHaveAttribute("data-time-s", "0.006");
    await expect(plot).toHaveAttribute("data-position-m", "1000000");
    const incident = Number(await plot.getAttribute("data-wave-forward"));
    expect(incident).toBeCloseTo(12, 7);
    expect(Number(await plot.getAttribute("data-wave-backward")) / incident).toBeCloseTo(gamma, 7);
    expect(Number(await plot.getAttribute("data-u"))).toBeCloseTo(voltage, 7);
    expect(Number(await plot.getAttribute("data-i"))).toBeCloseTo(current, 7);
    await expect(plot.locator("[data-line-a-plot]")).toHaveCount(4);
    await plot.locator("[data-line-a-back]").click();
    await editor.locator('[data-line-palette="l"]').click();
    await expect(editor.locator('[data-line-series-slot="W2"]')).toBeVisible();
    await editor.locator('[data-line-palette="l"]').click();
    await editor.screenshot({ path: info.outputPath(`${mode}.png`), animations: "disabled" });
  }
  await page.locator("[data-line-a-undo]").click();
  await expect(page.locator('[data-line-termination="short"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-line-termination="matched"]').click();
  await expect(page.locator('[data-line-termination="matched"]')).toHaveAttribute("aria-pressed", "true");
  await expect(source).toHaveAttribute("transform", sourcePosition);
  await expect(line).toHaveAttribute("transform", linePosition);
});

test("EVAL-04 agrees with the distortionless-loss characteristic and round-trip delay", async ({ page }, info) => {
  await page.goto(route("ru"));
  const editor = page.locator(board);
  const plot = page.locator("[data-line-a-results]");
  await editor.locator('[data-line-component="TL1"]').click();
  const inspector = editor.getByRole("dialog", { name: "TL1" });
  const distributedResistance = 50 * Math.log(2) / 1e6;
  const resistance = inspector.locator('[data-line-parameter="resistanceOhmM"]');
  await resistance.fill(String(distributedResistance));
  await resistance.press("Enter");
  await inspector.press("Escape");
  await page.locator('[data-line-termination="open"]').click();
  await editor.locator('[data-line-section="TL1"]').click();
  await expect(plot).toHaveAttribute("data-calculation-ready", "true");
  await setRange(plot.locator("[data-line-a-position]"), 1e6);
  await expect(plot).toHaveAttribute("data-position-m", "1000000");
  await setRange(plot.locator("[data-line-a-time]"), .00499);
  await expect(plot).toHaveAttribute("data-time-s", "0.00499");
  expect(Number(await plot.getAttribute("data-u"))).toBe(0);
  await setRange(plot.locator("[data-line-a-time]"), .006);
  await expect(plot).toHaveAttribute("data-time-s", "0.006");
  expect(Number(await plot.getAttribute("data-wave-forward"))).toBeCloseTo(6, 8);
  expect(Number(await plot.getAttribute("data-wave-backward"))).toBeCloseTo(6, 8);
  expect(Number(await plot.getAttribute("data-u"))).toBeCloseTo(12, 8);
  expect(Number(await plot.getAttribute("data-i"))).toBeCloseTo(0, 8);
  await setRange(plot.locator("[data-line-a-position]"), 0);
  await setRange(plot.locator("[data-line-a-time]"), .00999);
  await expect(plot).toHaveAttribute("data-time-s", "0.00999");
  expect(Number(await plot.getAttribute("data-wave-backward"))).toBe(0);
  await setRange(plot.locator("[data-line-a-time]"), .011);
  await expect(plot).toHaveAttribute("data-time-s", "0.011");
  expect(Number(await plot.getAttribute("data-wave-backward"))).toBeCloseTo(3, 8);
  await info.attach("loss-diagrams", { body: await plot.screenshot({ animations: "disabled" }), contentType: "image/png" });
});
