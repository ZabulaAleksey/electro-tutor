import { describe, expect, it } from "vitest";
import { multiplyComplex, subtractComplex, type Complex } from "../models/circular-diagram";
import { calculateLineSection, inputImpedance, type LineInputImpedance } from "./line";

const ideal = { rOhmM: 0, lHenryM: .25e-6, gSiemensM: 0, cFaradM: 100e-12, lengthM: 50 };
const lossy = { rOhmM: .02, lHenryM: .3e-6, gSiemensM: 2e-6, cFaradM: 90e-12, lengthM: 2200 };
const one = { re: 1, im: 0 };
const zero = { re: 0, im: 0 };

function near(actual: Complex, re: number, im: number, tolerance = 1e-11) {
  expect(Math.abs(actual.re - re)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(re)));
  expect(Math.abs(actual.im - im)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(im)));
}

function finite(value: LineInputImpedance) {
  if (value.kind === "open") throw Error("Expected finite input impedance");
  return value.impedanceOhm;
}

describe("steady-state RLGC section", () => {
  it("uses the lossless wave speed and a positive real characteristic impedance", () => {
    const section = calculateLineSection(ideal, 1e6);
    near(section.seriesOhmM, 0, Math.PI / 2);
    near(section.shuntSiemensM, 0, Math.PI * .0002);
    near(section.gammaPerM, 0, Math.PI / 100);
    near(section.characteristicOhm, 50, 0);
    expect(section.gammaPerM.re).toBe(0);
    expect(section.characteristicOhm.im).toBe(0);
  });

  it("uses positive j terms and reciprocity at a quarter wavelength", () => {
    const { A, B, C, D } = calculateLineSection(ideal, 1e6).matrix;
    near(A, 0, 0);
    near(D, 0, 0);
    near(B, 0, 50);
    near(C, 0, 1 / 50);
    near(subtractComplex(multiplyComplex(A, D), multiplyComplex(B, C)), 1, 0);
  });

  it("returns the identity for a zero length and the negative identity for half a wavelength", () => {
    const identity = calculateLineSection({ ...lossy, lengthM: 0 }, 50e3).matrix;
    expect(identity).toEqual({ A: one, B: zero, C: zero, D: one });
    const { A, B, C, D } = calculateLineSection({ ...ideal, lengthM: 100 }, 1e6).matrix;
    near(A, -1, 0);
    near(D, -1, 0);
    near(B, 0, 0);
    near(C, 0, 0);
  });

  it("models Heaviside loading without changing the characteristic impedance", () => {
    const section = calculateLineSection({ ...ideal, rOhmM: .001, gSiemensM: 4e-7 }, 1e6);
    near(section.gammaPerM, .00002, Math.PI / 100);
    near(section.characteristicOhm, 50, 0);
    near(section.matrix.A, 0, Math.sinh(.001));
    near(section.matrix.B, 0, 50 * Math.cosh(.001));
    near(section.matrix.C, 0, Math.cosh(.001) / 50);
  });

  it("matches independent complex-number and reflection oracles in a lossy line", () => {
    // Python cmath with the RLGC propagation root and Γin formula gives these references.
    const section = calculateLineSection(lossy, 50e3);
    near(section.gammaPerM, .00023037570937635836, .0016364186981835628);
    near(section.characteristicOhm, 58.16180289352673, -4.033768012503728);
    near(section.matrix.A, -1.0143610442358024, -.23406460439388285);
    near(section.matrix.B, -29.599028285132302, -27.20923601363961);
    near(section.matrix.C, -.007519582789422178, -.009130364943686176);
    near(finite(inputImpedance(section, { impedanceOhm: { re: 60, im: -20 } })), 54.587038853811684, -8.194398007730925);
    near(subtractComplex(multiplyComplex(section.matrix.A, section.matrix.D), multiplyComplex(section.matrix.B, section.matrix.C)), 1, 0);
  });

  it("keeps a complex matched termination equal to the characteristic impedance", () => {
    const section = calculateLineSection(lossy, 50e3);
    expect(finite(inputImpedance(section, "matched"))).toEqual(section.characteristicOhm);
    const fromSameLoad = finite(inputImpedance(section, { impedanceOhm: section.characteristicOhm }));
    near(fromSameLoad, section.characteristicOhm.re, section.characteristicOhm.im);
  });

  it("transforms short and open into each other at a quarter wavelength", () => {
    const section = calculateLineSection(ideal, 1e6);
    expect(inputImpedance(section, "short")).toEqual({ kind: "open" });
    near(finite(inputImpedance(section, "open")), 0, 0);
    near(finite(inputImpedance(section, { impedanceOhm: { re: 100, im: 50 } })), 20, -10);
    const perturbed = calculateLineSection({ ...ideal, lengthM: 50 + 1e-7 }, 1e6);
    expect(Math.abs(finite(inputImpedance(perturbed, "short")).im)).toBeGreaterThan(1e8);
  });

  it("gives opposite reactive signs for open and short stubs shorter than a quarter wave", () => {
    const section = calculateLineSection({ ...ideal, lengthM: 25 }, 1e6);
    near(finite(inputImpedance(section, "short")), 0, 50);
    near(finite(inputImpedance(section, "open")), 0, -50);
    expect(inputImpedance(section, { impedanceOhm: { re: 0, im: 50 } })).toEqual({ kind: "open" });
    const close = finite(inputImpedance(section, { impedanceOhm: { re: 0, im: 50 + 2e-14 } }));
    expect(Math.abs(close.im)).toBeGreaterThan(1e15);
  });

  it.each([
    [{ ...ideal, lHenryM: 0 }, 1e6],
    [{ ...ideal, lengthM: -1 }, 1e6],
    [{ ...ideal, gSiemensM: -1 }, 1e6],
    [{ ...ideal, cFaradM: Infinity }, 1e6],
    [ideal, 0],
  ])("rejects invalid physical inputs", (section, frequency) => {
    expect(() => calculateLineSection(section, frequency)).toThrow("invalid-line-section");
  });

  it("retains a small series coefficient when the electrical phase underflows", () => {
    const section = calculateLineSection(
      { rOhmM: 0, lHenryM: 1, gSiemensM: 0, cFaradM: 1e-308, lengthM: 1e-180 }, 1 / (2 * Math.PI),
    );
    expect(section.matrix.B.re).toBe(0);
    expect(section.matrix.B.im / 1e-180).toBeCloseTo(1, 12);
    expect(section.matrix.C).toEqual(zero);
  });

  it("rejects unrepresentable matrices and non-finite loads", () => {
    expect(() => calculateLineSection({ ...lossy, lengthM: 1e100 }, 50e3)).toThrow("line-numeric-range");
    const section = calculateLineSection(ideal, 1e6);
    expect(() => inputImpedance(section, { impedanceOhm: { re: Infinity, im: 0 } })).toThrow("invalid-line-load");
  });
});
