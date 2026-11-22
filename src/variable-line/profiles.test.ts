import { expect, it } from "vitest";
import { defaultCoaxProfile, defaultIndependentProfile, defaultVariableLineInput, prepareVariableLine } from "./profiles";

it("prepares the zero-start E5 pulse and bounded transferable history", () => {
  const run = prepareVariableLine(defaultVariableLineInput());
  expect(run.transitSeconds).toBe(.005);
  expect(run.steps).toBe(1280);
  expect(run.frameCount).toBeLessThanOrEqual(241);
  expect(run.sourceVoltage(0)).toBe(0);
  expect(run.sourceVoltage(.25)).toBe(100);
  expect(run.sourceVoltage(.5)).toBe(0);
});

it("samples all four independent coefficients and preserves both geometry identities", () => {
  const independent = prepareVariableLine({ ...defaultVariableLineInput(), profile: defaultIndependentProfile() });
  const first = independent.sample(.25, 0);
  const later = independent.sample(.25, .25);
  for (const key of ["r", "l", "g", "c"] as const) expect(later[key]).not.toBe(first[key]);
  const geometry = defaultCoaxProfile();
  const coax = prepareVariableLine({ ...defaultVariableLineInput(), profile: geometry });
  for (const [x, t] of [[0, 0], [.25, .25], [.75, .75]]) {
    const { g, c, l } = coax.sample(x, t);
    expect(g / c).toBeCloseTo(geometry.dielectricLoss, 14);
    expect(l * c).toBeCloseTo(1, 14);
  }
  expect(coax.sample(.25, 0).c).not.toBe(coax.sample(.25, .25).c);
});

it("rejects profile extrema, superluminal bounds, subresolution and excess work before allocating history", () => {
  const input = defaultVariableLineInput();
  const independent = defaultIndependentProfile();
  expect(() => prepareVariableLine({ ...input, profile: { ...independent, l: { base: 1, spatial: .4, temporal: .3 } } }))
    .toThrow("profile-range");
  expect(() => prepareVariableLine({ ...input, velocityMetresPerSecond: 290_000_000, profile: independent }))
    .toThrow("profile-range");
  expect(() => prepareVariableLine({ ...input, profile: { ...defaultCoaxProfile(), dielectricLoss: 1.6 } }))
    .toThrow("profile-range");
  expect(() => prepareVariableLine({ ...input, cells: 32 })).toThrow("grid-resolution");
  expect(() => prepareVariableLine({ ...input, sourceOhms: 0 })).toThrow("boundary-range");
  expect(() => prepareVariableLine({ ...input, cells: 512, durationTransitTimes: 8, profile: independent }))
    .toThrow("step-budget");
});
