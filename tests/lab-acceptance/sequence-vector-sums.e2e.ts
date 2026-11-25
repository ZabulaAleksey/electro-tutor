import { expect, test, type Locator } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const phaseNames = ["A", "B", "C"] as const;
const sequenceNames = [0, 1, 2] as const;
const operators = { A: ["", "", ""], B: ["", "a²", "a"], C: ["", "a", "a²"] };
const indices = ["₀", "₁", "₂"];
type Point = [number, number];

async function reading(lab: Locator, symbol: string): Promise<Point> {
  const row = lab.locator(`[data-seq-reading="${symbol}"]`);
  return [Number(await row.getAttribute("data-re")), Number(await row.getAttribute("data-im"))];
}

async function arrow(plot: Locator, symbol: string): Promise<[Point, Point]> {
  const line = plot.locator(`[data-seq-vector="${symbol}"] line`);
  await expect(line).toHaveCount(1);
  return line.evaluate(element => {
    const number = (attribute: string) => Number(element.getAttribute(attribute));
    return [[number("x1"), number("y1")], [number("x2"), number("y2")]];
  });
}

function add([x, y]: Point, [u, v]: Point): Point {
  return [x + u, y + v];
}

function rotate([re, im]: Point, operator: string): Point {
  if (!operator) return [re, im];
  const s = (operator === "a" ? 1 : -1) * Math.sqrt(3) / 2;
  return [-re / 2 - s * im, s * re - im / 2];
}

function expectPoint(actual: Point, expected: Point) {
  expect(actual[0]).toBeCloseTo(expected[0], 7);
  expect(actual[1]).toBeCloseTo(expected[1], 7);
}

test("reconstructs all phase sums for mixed voltage and current sequences on a common scale", async ({ page }) => {
  await page.goto(`${prefix}/ru/interactive/three-phase-sequences/`);
  const lab = page.locator('[data-seq-lab][data-ready="true"]');
  await lab.locator("[data-seq-area]").selectOption("line");
  await lab.locator("[data-seq-kind]").selectOption("series");
  await lab.locator("[data-seq-at]").fill("0.5");
  await lab.locator("[data-seq-edit-r]").fill("15");
  await lab.locator("[data-seq-add]").click();
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(1);
  const sections = lab.locator("[data-seq-section-select]");
  const downstream = await sections.getByRole("option", { name: /Линия.*0[,.]5.*1/ }).getAttribute("value");
  expect(downstream).toBeTruthy();
  await sections.selectOption(downstream!);

  for (const [quantity, symbol] of [["voltage", "U"], ["current", "I"]] as const) {
    const figure = lab.locator(`[data-seq-phasors="${quantity}"]`);
    const scale = Number(await figure.getAttribute("data-seq-scale"));
    expect(scale).toBeGreaterThan(0);
    const pixel = ([re, im]: Point): Point => [66 + 46 * re / scale, 62 - 46 * im / scale];
    const terms = await Promise.all(sequenceNames.map(index => reading(lab, symbol + index)));
    for (const term of terms) expect(Math.hypot(...term)).toBeGreaterThan(0);

    for (const phase of phaseNames) {
      await lab.locator(".seq-phase-choice").getByRole("button", { name: phase, exact: true }).click();
      const sumPlot = figure.locator(`[data-seq-sum="${phase}"]`);
      await expect(sumPlot.locator(".seq-vector-legend li")).toHaveText([
        ...sequenceNames.map(index => operators[phase][index] + symbol + indices[index]),
        symbol + phase,
      ]);
      await expect(figure).toHaveAttribute("data-seq-scale", String(scale));

      let point: Point = [0, 0];
      for (const index of sequenceNames) {
        const [from, to] = await arrow(sumPlot, `${symbol}${phase}${index}`);
        expectPoint(from, pixel(point));
        point = add(point, rotate(terms[index], operators[phase][index]));
        expectPoint(to, pixel(point));
      }
      const [from, to] = await arrow(sumPlot, symbol + phase + "-sum");
      expectPoint(from, pixel([0, 0]));
      expectPoint(to, pixel(point));
      expectPoint(to, pixel(await reading(lab, symbol + phase)));
    }
  }
});
