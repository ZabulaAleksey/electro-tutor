import { describe, expect, it } from "vitest";
import { complexMagnitude } from "./circular-diagram";
import {
  calculateStar, polarToRectangular, rectangularToPolar, STAR_PRESETS,
  type StarParameters,
} from "./star-neutral";

const expectNear = (actual: number, expected: number, tolerance = 1e-8) =>
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);

describe("star with neutral", () => {
  it("keeps balanced ideal phase voltages and 120-degree currents", () => {
    const state = calculateStar(STAR_PRESETS.balanced);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expectNear(complexMagnitude(state.result.displacement), 0);
    for (const phase of ["A", "B", "C"] as const) {
      expectNear(complexMagnitude(state.result.voltages[phase]), 230);
      expectNear(complexMagnitude(state.result.currents[phase]), 5);
    }
    expectNear(rectangularToPolar(state.result.currents.B).angle, -120);
    expectNear(rectangularToPolar(state.result.currents.C).angle, 120);
  });

  it("keeps ideal neutral fixed under imbalance", () => {
    const state = calculateStar({ ...STAR_PRESETS.unbalanced, mode: "ideal" });
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.result.displacement).toEqual({ re: 0, im: 0 });
    expect(state.result.voltages).toEqual(state.result.sources);
    expect(complexMagnitude(state.result.currents.A)).not.toBeCloseTo(complexMagnitude(state.result.currents.B));
  });

  it("balances an open symmetric star", () => {
    const state = calculateStar({ ...STAR_PRESETS.balanced, mode: "open" });
    expect(state.ok).toBe(true);
    if (state.ok) expectNear(complexMagnitude(state.result.displacement), 0);
  });

  it("moves open neutral and obeys KCL", () => {
    const state = calculateStar(STAR_PRESETS.open);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(complexMagnitude(state.result.displacement)).toBeGreaterThan(1);
    expectNear(complexMagnitude(state.result.neutralCurrent), 0);
  });

  it("obeys neutral Ohm law and KCL for finite impedance", () => {
    const state = calculateStar(STAR_PRESETS.unbalanced);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const { displacement, neutralCurrent, currents } = state.result;
    const neutralByOhm = {
      re: (displacement.re * 12 + displacement.im * 4) / 160,
      im: (displacement.im * 12 - displacement.re * 4) / 160,
    };
    expectNear(neutralCurrent.re, neutralByOhm.re);
    expectNear(neutralCurrent.im, neutralByOhm.im);
    expectNear(currents.A.re + currents.B.re + currents.C.re, neutralCurrent.re);
    expectNear(currents.A.im + currents.B.im + currents.C.im, neutralCurrent.im);
  });

  it("round trips both impedance representations", () => {
    for (const z of [{ re: 25, im: -45 }, { re: -2.5, im: 7.2 }, { re: 0, im: 0 }]) {
      const polar = rectangularToPolar(z);
      const back = polarToRectangular(polar.magnitude, polar.angle);
      expectNear(back.re, z.re);
      expectNear(back.im, z.im);
    }
    for (const [magnitude, angle] of [[20, -75], [110, 135], [0, 0]]) {
      const back = rectangularToPolar(polarToRectangular(magnitude, angle));
      expectNear(back.magnitude, magnitude);
      if (magnitude !== 0) expectNear(back.angle, angle);
    }
  });

  it("rejects short phases and indeterminate open neutral without nonfinite results", () => {
    expect(calculateStar({ ...STAR_PRESETS.open, phases: {
      ...STAR_PRESETS.open.phases, A: { re: 0, im: 0 },
    } })).toEqual({ ok: false, reason: "phase-short" });
    const singular: StarParameters = {
      uPhase: 230, mode: "open", neutral: { re: 0, im: 0 },
      phases: { A: { re: 1, im: 0 }, B: { re: -2, im: 0 }, C: { re: -2, im: 0 } },
    };
    expect(calculateStar(singular)).toEqual({ ok: false, reason: "singular" });
    expect(calculateStar({ ...STAR_PRESETS.unbalanced, neutral: { re: 0, im: 0 } }).ok).toBe(true);
  });
});
