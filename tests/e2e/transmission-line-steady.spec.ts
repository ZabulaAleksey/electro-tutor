import { expect, test, type Locator } from "@playwright/test";

async function enter(field: Locator, value: number) {
  await field.fill(String(value));
  await field.press("Enter");
}

test("selects a real coordinate, updates both phasor diagrams, and recalculates the accepted editor graph", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto("/ru/interactive/transmission-line/");
  await page.evaluate(() => { Object.defineProperty(window, "transientDocumentProbe", { value: true }); });
  await page.getByRole("link", { name: "Синусоидальный режим", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.has(window, "transientDocumentProbe"))).toBe(false);
  const lab = page.locator("[data-steady-experiment-results]");
  await expect(lab).toBeVisible();
  // Recreate the original quarter-wave example with the new lab's circuit controls.
  const editor = page.locator("[data-line-experiment-editor]");
  const select = (id: string) => editor.locator(`[data-line-component="${id}"]`).click();
  const parameter = (key: string) => editor.locator(`[data-steady-field="${key}"]`);
  await enter(page.locator('[data-steady-field="frequencyHz"]'), 100);
  await select("E1");
  await enter(parameter("voltageV"), 100);
  await editor.locator('[data-line-palette="r"]').click();
  await editor.locator('[data-line-series-slot="W1"]').click();
  await select("R2");
  await enter(parameter("ohm"), 50);
  await select("R1");
  await enter(parameter("ohm"), 100);
  const voltage = lab.getByRole("img", { name: "U(x)", exact: true });
  const current = lab.getByRole("img", { name: "I(x)", exact: true });
  const voltageVectors = lab.locator('[data-steady-phasors="voltage"]');
  const currentVectors = lab.locator('[data-steady-phasors="current"]');
  const magnitude = (label: "forward" | "backward" | "total") => voltageVectors
    .locator('[data-wave-reading="' + label + '"]').getAttribute("data-wave-magnitude").then(Number);
  const forward = await magnitude("forward"), backward = await magnitude("backward"), initial = await magnitude("total");
  expect(forward).toBeCloseTo(50, 8);
  expect(backward).toBeCloseTo(50 / 3, 8);
  expect(initial).toBeCloseTo(100 / 3, 8);

  await page.evaluate(() => document.fonts.ready);
  await current.scrollIntoViewIfNeeded();
  const positionOnPlot = await current.evaluate(node => {
    const svg = node as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    const point = new DOMPoint(62 + .55 * 342, 100).matrixTransform(svg.getScreenCTM()!);
    return { x: point.x - bounds.left, y: point.y - bounds.top };
  });
  await current.click({ position: positionOnPlot });
  await expect.poll(async () => Number(await lab.getAttribute("data-coordinate"))).toBeGreaterThan(250000);
  const position = await lab.getAttribute("data-coordinate");
  expect(Number(position)).toBeLessThan(400000);
  await expect(voltage.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", position!);
  await expect(current.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", position!);
  await expect(voltageVectors.locator("[data-wave-vector]")).toHaveCount(3);
  await expect(currentVectors.locator("[data-wave-vector]")).toHaveCount(3);
  expect(await magnitude("forward")).toBeCloseTo(forward, 8);
  expect(await magnitude("backward")).toBeCloseTo(backward, 8);
  expect(await magnitude("total")).toBeGreaterThan(initial);

  await voltage.press("End");
  await expect(lab).toHaveAttribute("data-coordinate", "500000");
  expect(await magnitude("total")).toBeCloseTo(200 / 3, 8);
  await enter(parameter("ohm"), 50);
  expect(await magnitude("backward")).toBeCloseTo(0, 8);
  await expect(voltageVectors.locator('[data-wave-reading="backward"]')).toHaveAttribute("data-wave-phase", "");

  await voltage.press("Home");
  await enter(parameter("ohm"), 150);
  await expect.poll(() => magnitude("total")).toBeCloseTo(25, 8);

  await enter(parameter("ohm"), -1);
  await expect(editor.getByRole("alert")).toBeVisible();
  expect(await magnitude("total")).toBeCloseTo(25, 8);
  expect(errors).toEqual([]);
});

test("exposes the same laboratory in Ukrainian without horizontal overflow", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", error => errors.push(error));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk/interactive/transmission-line-steady/");
  const lab = page.locator("[data-steady-experiment-results]");
  await expect(lab).toBeVisible();
  await expect(page.getByRole("heading", { name: "Довга лінія в синусоїдному режимі", exact: true })).toBeVisible();
  await expect(lab.locator('[data-steady-phasors="voltage"]')).toBeVisible();
  await expect(lab.locator('[data-steady-phasors="current"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await lab.getByRole("img", { name: "I(x)", exact: true }).press("End");
  await expect(lab).toHaveAttribute("data-coordinate", "500000");
  expect(errors).toEqual([]);
});
