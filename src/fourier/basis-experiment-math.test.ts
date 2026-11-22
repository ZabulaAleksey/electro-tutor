import { describe, expect, it } from "vitest";
import { experimentBasisIds, type ExperimentBasisId } from "./basis-experiment-contract";
import { analyzeBasis } from "./basis-experiment-math";
import { epicycleChain, type Complex } from "./math";

function real(values: number[]) {
  return values.map(re => ({re, im: 0}));
}

function energy(values: readonly Complex[]) {
  return values.reduce((sum, value) => sum + value.re ** 2 + value.im ** 2, 0);
}

const circle = [{re: 1, im: 0}, {re: 0, im: 1}, {re: -1, im: 0}, {re: 0, im: -1}];

describe("independently indexed discrete coefficients", () => {
  it("returns DC for a constant and positive harmonic 1 for a counterclockwise unit circle", () => {
    const settings = {basis: "fourier", boundary: "periodic", count: 1, level: 2} as const;
    const constant = analyzeBasis(real([3, 3, 3, 3]), settings);
    expect(constant.terms[0]).toMatchObject({frequency: 0, active: true, re: 3, im: 0});
    expect(constant.max).toBe(0);

    const harmonic = analyzeBasis(circle, settings);
    const coefficient = harmonic.terms[0];
    expect(coefficient).toMatchObject({frequency: 1, active: true});
    expect(coefficient.re).toBeCloseTo(1, 13);
    expect(coefficient.im).toBeCloseTo(0, 13);
    expect(harmonic.max).toBeLessThan(1e-13);
    const tip = epicycleChain([{...coefficient, k: 1, phase: Math.atan2(coefficient.im, coefficient.re)}], 0.25).at(-1)!.end;
    expect(tip.re).toBeCloseTo(harmonic.reconstruction[1].re, 13);
    expect(tip.im).toBeCloseTo(harmonic.reconstruction[1].im, 13);
  });

  it("keeps the signed Nyquist bin", () => {
    const result = analyzeBasis(real([1, -1, 1, -1]), {basis: "fourier", boundary: "periodic", count: 1, level: 2});
    expect(result.terms[0]).toMatchObject({frequency: -2, active: true});
    expect(result.terms[0].re).toBeCloseTo(1, 13);
    expect(result.max).toBeLessThan(1e-13);
  });

  it("uses the coarse-to-fine Haar sign and natural Walsh index", () => {
    const haar = analyzeBasis(real([1, 1, -1, -1]), {basis: "haar", boundary: "periodic", count: 1, level: 2});
    expect(haar.terms[0].label).toBe("D2:0");
    expect(haar.terms[0].re).toBeCloseTo(2, 13);
    expect(haar.max).toBeLessThan(1e-13);

    const walsh = analyzeBasis(real([1, -1, -1, 1]), {basis: "walsh", boundary: "open", count: 1, level: 2});
    expect(walsh.terms[0]).toMatchObject({label: "W3", active: true, re: 2, im: 0});
    expect(walsh.max).toBe(0);
  });

  // Source taps at the documented zero-phase anchor. The impulse also hits the
  // last wrapped pair (tap 2), which distinguishes periodization from padding.
  it.each([
    ["daubechies", 0.4829629131445341, -0.1294095225512604, 0.2241438680420134],
    ["symlets", 0.0322231006040427, -0.07576571478927333, -0.09921954357684722],
    ["coiflets", -0.07273261951252646, -0.01565572813579199, 0.8525720202116004],
  ] as const)("matches the %s impulse taps including its modular wrap", (basis, a0, d0, wrap) => {
    const result = analyzeBasis(real([1, ...Array<number>(15).fill(0)]), {basis, boundary: "open", count: 16, level: 1});
    expect(result.terms.find(term => term.label === "A1:0")?.re).toBeCloseTo(a0, 13);
    expect(result.terms.find(term => term.label === "D1:0")?.re).toBeCloseTo(d0, 13);
    expect(result.terms.find(term => term.label === "A1:7")?.re).toBeCloseTo(wrap, 13);
  });
});

const discrete = experimentBasisIds.filter(id => id !== "chebyshev" && id !== "legendre");
const independentSamples = Array.from({length: 32}, (_, index) => ({
  re: Math.sin(index * 0.37) + 2 * Math.cos(index * 0.73), im: Math.sin(index * 1.17) - index / 24,
}));

describe("reconstruction and Parseval on the common complex grid", () => {
  it.each(discrete)("has orthonormal %s columns under its stated normalization", basis => {
    const size = 8;
    const columns = Array.from({length: size}, (_, impulse) => {
      const samples = real(Array.from({length: size}, (_, index) => Number(index === impulse)));
      const {terms} = analyzeBasis(samples, {basis, boundary: "periodic", count: size, level: 3});
      return terms.sort((left, right) => left.index - right.index);
    });
    for (const [column, vector] of columns.entries()) {
      for (const [earlier, previous] of columns.slice(0, column + 1).entries()) {
        let re = 0;
        let im = 0;
        for (const [index, value] of vector.entries()) {
          re += value.re * previous[index].re + value.im * previous[index].im;
          im += value.im * previous[index].re - value.re * previous[index].im;
        }
        const scale = basis === "fourier" ? size : 1;
        expect(scale * re).toBeCloseTo(Number(earlier === column), 10);
        expect(scale * im).toBeCloseTo(0, 10);
      }
    }
  });

  it.each(discrete)("completes %s at fine and coarse wavelet levels", basis => {
    for (const level of [1, 3, 5]) {
      const result = analyzeBasis(independentSamples, {basis, level, count: 32, boundary: "open"});
      expect(result.terms).toHaveLength(32);
      expect(result.terms.every(term => term.active)).toBe(true);
      expect(result.max).toBeLessThan(1e-10);
      const coefficientEnergy = energy(result.terms) * (basis === "fourier" ? independentSamples.length : 1);
      expect(coefficientEnergy).toBeCloseTo(energy(independentSamples), 9);
    }
  });

  it.each(experimentBasisIds)("adds the selected %s contributions to the same partial sum", basis => {
    const result = analyzeBasis(independentSamples, {basis, level: 3, count: 5, boundary: "periodic"});
    const active = result.terms.filter(term => term.active);
    expect(active).toHaveLength(5);
    const pieces = active.map(term => result.contribution(term.index));
    for (const [index, value] of result.reconstruction.entries()) {
      expect(pieces.reduce((sum, piece) => sum + piece[index].re, 0)).toBeCloseTo(value.re, 11);
      expect(pieces.reduce((sum, piece) => sum + piece[index].im, 0)).toBeCloseTo(value.im, 11);
    }
    const errors = independentSamples.map((reference, index) => Math.hypot(reference.re - result.reconstruction[index].re,
      reference.im - result.reconstruction[index].im));
    expect(result.rms).toBeCloseTo(Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length), 13);
    expect(result.max).toBe(Math.max(...errors));
  });

  it("keeps a complex term by the joint amplitude of both coordinates", () => {
    const samples = [2.5, 0.5, 2.5, 0.5].map((re, index) => ({re, im: index % 2 ? -1.5 : 1.5}));
    const summary = analyzeBasis(samples, {basis: "walsh", level: 1, count: 1, boundary: "periodic"});
    expect(summary.terms[0]).toMatchObject({label: "W1", active: true, re: 2, im: 3});
    expect(summary.terms[1]).toMatchObject({label: "W0", active: false, re: 3, im: 0});
    expect(summary.rms).toBe(1.5);
  });
});

describe("orthogonal-polynomial weights and normalization", () => {
  it.each([
    ["chebyshev", "T", 0.5, 0.5], ["legendre", "P", 1 / 3, 2 / 3],
  ] as const)("recovers an independent quadratic in the normalized %s basis", (basis, label, a0, a2) => {
    for (const boundary of ["open", "periodic"] as const) {
      const samples = Array.from({length: 16}, (_, index) => {
        const x = 2 * index / (boundary === "open" ? 15 : 16) - 1;
        return {re: 3 * x ** 2 + 0.5 * x, im: -2 * x ** 2};
      });
      const result = analyzeBasis(samples, {basis, level: 1, count: 3, boundary});
      expect(result.max).toBeLessThan(1e-12);
      for (const [index, [re, im]] of [[3 * a0, -2 * a0], [0.5, 0], [3 * a2, -2 * a2]].entries()) {
        expect(result.terms[index].label).toBe(`${label}${index}`);
        expect(result.terms[index].re).toBeCloseTo(re, 12);
        expect(result.terms[index].im).toBeCloseTo(im, 12);
      }
    }
  });

  it("integrates the distinct finite endpoint cell weights", () => {
    const samples = real([1, 0, 0, 1]);
    const fit = (basis: ExperimentBasisId) => analyzeBasis(samples, {basis, level: 1, count: 1, boundary: "open"});
    expect(fit("legendre").terms[0].re).toBeCloseTo(1 / 3, 13);
    expect(fit("chebyshev").terms[0].re).toBeCloseTo(1 - 2 * Math.asin(2 / 3) / Math.PI, 13);
  });

  it("caps dense polynomial fitting and bounds invalid transform inputs", () => {
    const base = {basis: "legendre", level: 1, count: 32, boundary: "periodic"} as const;
    expect(analyzeBasis(independentSamples, base).terms).toHaveLength(16);
    expect(() => analyzeBasis(independentSamples, {...base, basis: "coiflets", level: 6})).toThrow("basis-level");
    expect(() => analyzeBasis(real([1, 0, 0]), base)).toThrow("basis-samples");
    expect(() => analyzeBasis(real([1, 0, 0, 0]), {...base, count: Infinity})).toThrow("basis-count");
  });
});
