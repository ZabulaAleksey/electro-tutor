import { describe, expect, it } from "vitest";
import type { Complex } from "../models/circular-diagram";
import { calculateLineSection, type ChainMatrix, type LineInputImpedance } from "./line";
import { calculateCascade, composeChainMatrices, seriesMatrix, shuntMatrix, type CascadeElement } from "./cascade";

const z = (re: number, im = 0): Complex => ({ re, im });
const identity = { A: z(1), B: z(0), C: z(0), D: z(1) };
const quarter: Extract<CascadeElement, { kind: "line" }> = {
  kind: "line",
  section: { rOhmM: 0, lHenryM: .25e-6, gSiemensM: 0, cFaradM: 100e-12, lengthM: 50 },
};
const fixture: CascadeElement[] = [
  quarter, { kind: "series", impedanceOhm: z(10) }, { kind: "shunt", admittanceSiemens: z(.02) }, quarter,
];

function close(actual: Complex, expected: Complex) {
  expect(actual.re).toBeCloseTo(expected.re, 11);
  expect(actual.im).toBeCloseTo(expected.im, 11);
}
function closeMatrix(actual: ChainMatrix, expected: ChainMatrix) {
  for (const field of ["A", "B", "C", "D"] as const) close(actual[field], expected[field]);
}
function impedance(result: LineInputImpedance) {
  if (result.kind !== "finite") throw Error("Expected finite impedance");
  return result.impedanceOhm;
}

describe("steady-state line cascade", () => {
  it("models series impedance and shunt admittance as reciprocal two-ports", () => {
    expect(seriesMatrix(z(10, 5))).toEqual({ A: z(1), B: z(10, 5), C: z(0), D: z(1) });
    expect(shuntMatrix(z(.02, .01))).toEqual({ A: z(1), B: z(0), C: z(.02, .01), D: z(1) });
    expect(composeChainMatrices([])).toEqual(identity);
  });

  it("keeps physical source-to-load order for non-commuting two-ports", () => {
    const series = seriesMatrix(z(10, 5));
    const shunt = shuntMatrix(z(.02, .01));
    const common = { B: z(10, 5), C: z(.02, .01) };
    closeMatrix(composeChainMatrices([series, shunt]), { ...common, A: z(1.15, .2), D: z(1) });
    closeMatrix(composeChainMatrices([shunt, series]), { ...common, A: z(1), D: z(1.15, .2) });
  });

  it("matches independent quarter-wave impedance transformations in a mixed cascade", () => {
    const { matrix, input, elements } = calculateCascade(fixture, 1e6, { impedanceOhm: z(100) });
    closeMatrix(matrix, { A: z(-1), B: z(-50), C: z(-.004), D: z(-1.2) });
    const afterRightLine = 2500 / 100;
    const afterShunt = 1 / (1 / afterRightLine + .02);
    const afterSeries = afterShunt + 10;
    close(impedance(input), z(2500 / afterSeries));
    expect(elements.map(item => item.kind)).toEqual(["line", "series", "shunt", "line"]);
  });

  it.each([["short", 50 / 1.2], ["open", 250], ["matched", 100 / 1.4]] as const)(
    "supports a %s termination at the end of a mixed cascade", (load, expected) => {
      close(impedance(calculateCascade(fixture, 1e6, load).input), z(expected));
    },
  );

  it("agrees with one whole lossy section when divided into two", () => {
    const full = { rOhmM: .02, lHenryM: .3e-6, gSiemensM: 2e-6, cFaradM: 90e-12, lengthM: 2200 };
    const part = (lengthM: number): CascadeElement => ({ kind: "line", section: { ...full, lengthM } });
    const { matrix, input } = calculateCascade([part(850), part(1350)], 50e3, { impedanceOhm: z(60, -20) });
    closeMatrix(matrix, calculateLineSection(full, 50e3).matrix);
    close(impedance(input), z(54.587038853811684, -8.194398007730925));
  });

  it("matches the last physical line even when an ideal series block follows it", () => {
    const second: CascadeElement = {
      kind: "line", section: { ...quarter.section, lengthM: 0, lHenryM: .5e-6, cFaradM: 50e-12 },
    };
    const result = calculateCascade([{ ...quarter, section: { ...quarter.section, lengthM: 0 } }, second,
      { kind: "series", impedanceOhm: z(5) }], 1e6, "matched");
    close(impedance(result.input), z(105));
  });

  it("rejects absent line sections, invalid lumped data and overflowing products", () => {
    expect(() => calculateCascade([{ kind: "series", impedanceOhm: z(50) }], 1e6, "short"))
      .toThrow("missing-line-section");
    expect(() => shuntMatrix(z(NaN))).toThrow("invalid-cascade-element");
    expect(() => seriesMatrix(z(Infinity))).toThrow("invalid-cascade-element");
    expect(() => composeChainMatrices([seriesMatrix(z(1e308)), seriesMatrix(z(1e308))]))
      .toThrow("line-numeric-range");
  });
});
