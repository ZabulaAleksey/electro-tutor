import { describe, expect, it } from "vitest";
import { addComplex, complexMagnitude, multiplyComplex, subtractComplex, type Complex } from "./circular-diagram";
import {
  calculateDelta, calculateStar, LINE_PAIRS, PHASES, readThreePhaseDraft, polarToRectangular, rectangularToPolar, STAR_PRESETS,
  type StarParameters,
} from "./star-neutral";

it("solves balanced delta magnitudes and unbalanced current balance",()=>{
 const balanced=calculateDelta(STAR_PRESETS.balanced);
 if(!balanced.ok)throw Error("delta failed");
 expect(complexMagnitude(balanced.result.voltages.A)).toBeCloseTo(230*Math.sqrt(3),10);
 expect(complexMagnitude(balanced.result.currents.A)).toBeCloseTo(5*Math.sqrt(3),10);
 expect(complexMagnitude(balanced.result.lineCurrents!.A)).toBeCloseTo(15,10);
 const parameters={...STAR_PRESETS.unbalanced,source:{
  A:{magnitude:180,angle:5},B:{magnitude:210,angle:-100},C:{magnitude:250,angle:95}
 }};
 const unbalanced=calculateDelta(parameters);
 if(!unbalanced.ok)throw Error("unbalanced delta failed");
 const {lineCurrents,currents,voltages}=unbalanced.result;
 expect(voltages.A.re).toBeCloseTo(180*Math.cos(5*Math.PI/180)-210*Math.cos(-100*Math.PI/180),10);
 expect(lineCurrents!.A.re).toBeCloseTo(currents.A.re-currents.C.re,10);
 expect(lineCurrents!.A.im+lineCurrents!.B.im+lineCurrents!.C.im).toBeCloseTo(0,10);
 expect(lineCurrents!.A.re+lineCurrents!.B.re+lineCurrents!.C.re).toBeCloseTo(0,10);
 expect(readThreePhaseDraft({version:1,topology:"delta",parameters})?.parameters.source).toEqual(parameters.source);
 expect(readThreePhaseDraft({version:1,topology:"delta",parameters:{...parameters,source:{A:{magnitude:180,angle:181}}}})).toBeNull();
});

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

  it("retains the singular diagnostic for a legacy negative resistance", () => {
    const singular: StarParameters = {
      uPhase: 230, mode: "open", neutral: { re: 0, im: 0 },
      phases: { A: { re: 1, im: 0 }, B: { re: -2, im: 0 }, C: { re: -2, im: 0 } },
    };
    expect(calculateStar(singular)).toEqual({ ok: false, reason: "singular" });
    expect(calculateStar({ ...STAR_PRESETS.unbalanced, neutral: { re: 0, im: 0 } }).ok).toBe(true);
  });
});

const z = (re: number, im = 0): Complex => ({ re, im });
function expectComplex(actual: Complex, expected: Complex, tolerance?: number) {
  expectNear(actual.re, expected.re, tolerance);
  expectNear(actual.im, expected.im, tolerance);
}

it.each(PHASES)("solves short phase %s for open, resistive and complex neutral branches", short => {
  for (const input of [
    { ...STAR_PRESETS.open },
    { ...STAR_PRESETS.unbalanced, neutral: z(12) },
    { ...STAR_PRESETS.unbalanced },
  ]) {
    const phases = { ...input.phases, [short]: z(0) };
    const state = calculateStar({ ...input, phases });
    if (!state.ok) throw Error(state.reason);
    const { displacement, sources, voltages, currents, neutralCurrent } = state.result;
    expect(displacement).toEqual(sources[short]);
    expect(voltages[short]).toEqual(z(0));
    expectComplex(Object.values(currents).reduce(addComplex, z(0)), neutralCurrent);
    if (input.mode === "open") expect(neutralCurrent).toEqual(z(0));
    else expectComplex(multiplyComplex(input.neutral, neutralCurrent), displacement);
    for (const phase of PHASES) {
      expectComplex(multiplyComplex(phases[phase], currents[phase]), voltages[phase]);
      expectComplex(addComplex(voltages[phase], displacement), sources[phase]);
    }
    const line = LINE_PAIRS.map(([, from, to]) => {
      const voltage = subtractComplex(voltages[from], voltages[to]);
      expectComplex(voltage, subtractComplex(sources[from], sources[to]));
      return voltage;
    });
    expectComplex(line.reduce(addComplex, z(0)), z(0));
  }
});

it("reports incompatible ideal shorts while retaining quantities fixed by the ideal neutral", () => {
  const state = calculateStar({
    ...STAR_PRESETS.balanced, phases: { ...STAR_PRESETS.balanced.phases, A: z(0) },
  });
  if (state.ok) throw Error("contradictory ideal short");
  expect(state.reason).toBe("inconsistent");
  expect(state.partial?.displacement).toEqual(z(0));
  expect(state.partial?.voltages?.A).toBeUndefined();
  expect(state.partial?.currents?.A).toBeUndefined();
  expectComplex(state.partial!.currents!.B!, z(-2.5, -2.5 * Math.sqrt(3)));
  expect(state.partial?.neutralCurrent).toBeUndefined();
});

it("returns only determined quantities where ideal short currents can vary", () => {
  const source = {
    A: { magnitude: 0, angle: 0 }, B: { magnitude: 12, angle: 0 }, C: { magnitude: 6, angle: -180 },
  };
  const state = calculateStar({
    ...STAR_PRESETS.unbalanced, source, neutral: z(0), phases: { A: z(0), B: z(6), C: z(3) },
  });
  if (state.ok) throw Error("ideal neutral and short admit independent currents");
  expect(state.reason).toBe("indeterminate");
  expect(state.partial?.displacement).toEqual(z(0));
  expect(state.partial?.voltages?.A).toEqual(z(0));
  expect(state.partial?.currents?.A).toBeUndefined();
  expectComplex(state.partial!.currents!.B!, z(2));
  expect(state.partial?.neutralCurrent).toBeUndefined();
});

it("distinguishes equivalent and conflicting potential constraints from two short phases", () => {
  const source = {
    A: { magnitude: 4, angle: 180 }, B: { magnitude: 4, angle: -180 }, C: { magnitude: 12, angle: 0 },
  };
  const parameters = { ...STAR_PRESETS.unbalanced, source, neutral: z(2, 1), phases: { A: z(0), B: z(0), C: z(8) } };
  const state = calculateStar(parameters);
  if (state.ok) throw Error("individual short currents do not follow from KCL");
  expect(state.reason).toBe("indeterminate");
  expect(state.partial?.displacement).toEqual(z(-4));
  expect(state.partial?.sources.A).toEqual(state.partial?.sources.B);
  expect(state.partial?.voltages?.A).toEqual(z(0));
  expect(state.partial?.voltages?.B).toEqual(z(0));
  expectComplex(state.partial!.currents!.C!, z(2));
  expectComplex(state.partial!.neutralCurrent!, z(-1.6, 0.8));
  const conflict = calculateStar({
    ...parameters, mode: "open",
    source: { ...source, B: { ...source.B, magnitude: 4 + 1e-13 } },
  });
  if (conflict.ok) throw Error("incompatible voltage constraints");
  expect(conflict.reason).toBe("inconsistent");
  expect(conflict.partial?.displacement).toBeUndefined();
  expect(conflict.partial?.neutralCurrent).toEqual(z(0));
});

it("represents exact axis phasors without rounding small non-axis angles", () => {
  const source = {
    A: { magnitude: 2, angle: 90 }, B: { magnitude: 2, angle: -90 }, C: { magnitude: 2, angle: 1e-15 },
  };
  const state = calculateStar({ ...STAR_PRESETS.balanced, source });
  if (!state.ok) throw Error(state.reason);
  expect(state.result.sources.A).toEqual(z(0, 2));
  expect(state.result.sources.B).toEqual(z(0, -2));
  expect(state.result.sources.C.im).toBeGreaterThan(0);
});

it("classifies physical lossless resonance and a numerically ill-conditioned near-resonance", () => {
  const parameters = { ...STAR_PRESETS.open, phases: { A: z(0, 1), B: z(0, 1), C: z(0, -0.5) } };
  expect(calculateStar(parameters)).toMatchObject({ ok: false, reason: "inconsistent" });
  expect(calculateStar({ ...parameters, uPhase: 0 })).toMatchObject({ ok: false, reason: "indeterminate" });
  expect(calculateStar({
    ...parameters, phases: { ...parameters.phases, C: z(0, -0.5 - 1e-13) },
  })).toMatchObject({ ok: false, reason: "unstable" });
});

it("solves small nonzero impedances including the subnormal limit without replacing them by shorts", () => {
  const source = {
    A: { magnitude: 1, angle: 0 }, B: { magnitude: 0, angle: 0 }, C: { magnitude: 0, angle: 0 },
  };
  const state = calculateStar({ ...STAR_PRESETS.open, source, phases: { A: z(1e-8), B: z(20), C: z(40) } });
  if (!state.ok) throw Error(state.reason);
  const expectedPotential = 1 / (1 + 1e-8 * 0.075);
  expectComplex(state.result.displacement, z(expectedPotential), 1e-15);
  expectComplex(state.result.currents.A, z(expectedPotential * 0.075), 1e-15);
  expect(state.result.voltages.A.re).toBeGreaterThan(0);
  const small = calculateStar({
    ...STAR_PRESETS.open, source: { ...source, B: source.A },
    phases: { A: z(Number.MIN_VALUE), B: z(Number.MIN_VALUE), C: z(20) },
  });
  if (!small.ok) throw Error(small.reason);
  expectComplex(small.result.currents.A, z(0.025));
  expectComplex(small.result.currents.B, z(0.025));
  expectComplex(small.result.currents.C, z(-0.05));
  expect(calculateStar({
    ...STAR_PRESETS.balanced, phases: { ...STAR_PRESETS.balanced.phases, A: z(Number.MIN_VALUE) },
  })).toMatchObject({ ok: false, reason: "unstable" });
});
it("remains finite for a nearly ideal neutral and represents the disconnected branch exactly", () => {
  const tiny = calculateStar({ ...STAR_PRESETS.unbalanced, neutral: { re: 1e-220, im: -1e-220 } });
  expect(tiny.ok).toBe(true);
  if (!tiny.ok) return;
  expect(complexMagnitude(tiny.result.displacement)).toBeLessThan(1e-210);
  const open = calculateStar({ ...STAR_PRESETS.unbalanced, mode: "open" });
  expect(open.ok).toBe(true);
  if (!open.ok) return;
  expect(open.result.neutralCurrent).toEqual({ re: 0, im: 0 });
  const phases = Object.values(open.result.currents);
  expectNear(phases.reduce((sum, i) => sum + i.re, 0), 0);
  expectNear(phases.reduce((sum, i) => sum + i.im, 0), 0);
});
