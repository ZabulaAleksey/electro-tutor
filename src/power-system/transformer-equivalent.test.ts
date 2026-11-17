import { expect, it } from "vitest";
import { generateTransformerEquivalent } from "./transformer-equivalent";
import type { PowerTransformer } from "./network";
import type { TransformerType } from "./catalogue";

const transformer: PowerTransformer = { id: "T1", kind: "transformer", highBusId: "HV", lowBusId: "LV", parallelUnits: 2, inService: true, tapPosition: 1 };
const type: TransformerType = { id: "TX", revision: 1, kind: "transformer", name: "Test", provenance: { kind: "custom" }, ratedMva: 16, highKv: 110, lowKv: 10, shortCircuitPct: 10.5, resistance: { kind: "load-loss", kw: 80 }, noLoadLossKw: 20, noLoadCurrentPct: .7, phaseShiftDeg: -30, tap: { min: -4, max: 4, neutral: 0, percentPerStep: 2.5 } };

it("uses HV base and scales identical units in parallel", () => {
  const one = generateTransformerEquivalent({ ...transformer, parallelUnits: 1 }, type);
  const two = generateTransformerEquivalent(transformer, type);
  expect(one.zBaseOhm).toBeCloseTo(110 * 110 / 16);
  expect(two.seriesOhm.re).toBeCloseTo(one.seriesOhm.re / 2);
  expect(two.shuntSiemens.re).toBeCloseTo(one.shuntSiemens.re * 2);
  expect(two.shuntSiemens.im).toBeCloseTo(one.shuntSiemens.im * 2);
});

it("keeps signed phase shift and explicit HV-side tap ratio", () => {
  const result = generateTransformerEquivalent(transformer, type);
  expect(result.phaseShiftDeg).toBe(-30);
  expect(result.tapRatioHvSide).toBeCloseTo(11 * 1.025);
  expect(result.nominalLosses.ratedSeriesActiveKw).toBe(160);
  expect(result.nominalLosses.noLoadActiveKw).toBe(40);
});

it("uses passport HV and a nonzero neutral tap", () => {
  const neutralTap = { ...type, highKv: 220, tap: { min: -2, max: 4, neutral: 2, percentPerStep: 1.5 } };
  const result = generateTransformerEquivalent({ ...transformer, parallelUnits: 1, tapPosition: undefined }, neutralTap);
  expect(result.zBaseOhm).toBeCloseTo(220 * 220 / 16);
  expect(result.tapRatioHvSide).toBeCloseTo(22);
  expect(() => generateTransformerEquivalent({ ...transformer, tapPosition: 5 }, neutralTap)).toThrow("power-invalid-transformer-tap");
  expect(() => generateTransformerEquivalent({ ...transformer, tapPosition: 1 }, { ...type, tap: undefined })).toThrow("power-invalid-transformer-tap");
});

it("rejects impossible losses, resistance and numeric overflow", () => {
  expect(() => generateTransformerEquivalent(transformer, { ...type, noLoadLossKw: 200 })).toThrow("power-invalid-transformer-equivalent");
  expect(() => generateTransformerEquivalent(transformer, { ...type, shortCircuitPct: 1, resistance: { kind: "load-loss", kw: 1000 } })).toThrow("power-invalid-transformer-equivalent");
  expect(() => generateTransformerEquivalent(transformer, { ...type, highKv: 1e308 })).toThrow(/range|invalid/);
});

it("matches an independent nameplate calculation in resistance-percent form", () => {
  const equivalent = generateTransformerEquivalent(transformer, { ...type, resistance: { kind: "resistance-percent", percent: .5 } });
  expect(equivalent.seriesOhm.re).toBeCloseTo(1.890625, 10);
  expect(equivalent.seriesOhm.im).toBeCloseTo(39.658084571433854, 10);
  expect(equivalent.shuntSiemens.re).toBeCloseTo(.000003305785123966942, 14);
  expect(equivalent.nominalLosses.noLoadReactiveKvar).toBeCloseTo(220.39963702329456, 10);
});
