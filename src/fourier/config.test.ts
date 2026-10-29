import { describe, expect, it } from "vitest";
import { MAX_CONFIG_HARMONICS, validateFourierConfig, type FourierConfig } from "./config";

const valid: FourierConfig = {
  points: [{ re: 0, im: 0 }, { re: 1, im: 1 }], closed: true, count: 16, phase: .25, speed: .08, loop: true,
  basis: "fourier", order: "amplitude", enabled: { "1": true, "-1": false }, edited: { "1": { amplitude: .5, phase: Math.PI } },
};

describe("Fourier config validation", () => {
  it("accepts a complete finite roundtrip payload", () => { expect(validateFourierConfig(structuredClone(valid))).toBe(true); });
  it("rejects oversized coordinates before state application", () => { expect(validateFourierConfig({ ...valid, points: [{ re: 1e7, im: 0 }] })).toBe(false); });
  it("rejects non-finite coordinates and malformed enabled maps", () => {
    expect(validateFourierConfig({ ...valid, points: [{ re: Number.NaN, im: 0 }] })).toBe(false);
    expect(validateFourierConfig({ ...valid, enabled: { "NaN": true } })).toBe(false);
    expect(validateFourierConfig({ ...valid, enabled: { "1": "yes" } })).toBe(false);
  });
  it("rejects invalid edited amplitude and phase maps", () => {
    expect(validateFourierConfig({ ...valid, edited: { "1": { amplitude: Number.NaN, phase: 0 } } })).toBe(false);
    expect(validateFourierConfig({ ...valid, edited: { "1": { amplitude: 11, phase: 0 } } })).toBe(false);
    expect(validateFourierConfig({ ...valid, edited: { "1": { amplitude: 1, phase: 20 } } })).toBe(false);
  });
  it("rejects unknown root fields instead of partially applying them", () => { expect(validateFourierConfig({ ...valid, unsafe: "ignored?" })).toBe(false); });
  it("allows the full sampled harmonic table but rejects values beyond it", () => {
    expect(validateFourierConfig({ ...valid, count: MAX_CONFIG_HARMONICS })).toBe(true);
    expect(validateFourierConfig({ ...valid, count: MAX_CONFIG_HARMONICS + 1 })).toBe(false);
  });
});

it("roundtrips enabled high-index basis functions", () => { expect(validateFourierConfig({ ...valid, basis: "walsh", enabled: { "127": false } })).toBe(true); expect(validateFourierConfig({ ...valid, enabled: { "128": true } })).toBe(false); });
