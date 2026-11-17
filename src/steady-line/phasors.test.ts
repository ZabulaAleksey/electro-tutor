import { expect, it } from "vitest";
import { calculateCascade, type CascadeElement } from "./cascade";
import { inspectLinePhasors, phasorPolar, solvePhasorCascade } from "./phasors";
import type { Complex } from "../models/circular-diagram";

const z = (re: number, im = 0): Complex => ({ re, im });
const line = (lengthM = 50): CascadeElement => ({ kind: "line", section: { rOhmM: 0, lHenryM: .25e-6, gSiemensM: 0, cFaradM: 100e-12, lengthM } });

it("splits a matched cascade into a forward wave with the expected current", () => {
  const cascade = calculateCascade([line()], 1e6, "matched");
  const solved = solvePhasorCascade(cascade, { voltage: z(100), impedanceOhm: z(50) });
  const sample = inspectLinePhasors(solved, 0);
  expect(sample.voltage.forward).toEqual(z(50));
  expect(sample.voltage.backward).toEqual(z(0));
  expect(sample.current.forward).toEqual(z(1));
  expect(sample.current.backward.re).toBeCloseTo(0);
  expect(sample.current.backward.im).toBeCloseTo(0);
  expect(sample.voltage.phaseDifferenceDeg).toBeNull();
});

it("reports the open-end standing-wave phase and rejects positions outside the line", () => {
  const solved = solvePhasorCascade(calculateCascade([line()], 1e6, "open"), { voltage: z(100), impedanceOhm: z(50) });
  const end = inspectLinePhasors(solved, 50);
  expect(end.voltage.total.re).toBeCloseTo(0);
  expect(end.voltage.total.im).toBeCloseTo(-100);
  expect(end.current.total.re).toBeCloseTo(0);
  expect(end.current.total.im).toBeCloseTo(0);
  expect(() => inspectLinePhasors(solved, -1)).toThrow("phasor-position-out-of-range");
  expect(() => inspectLinePhasors(solved, 51)).toThrow("phasor-position-out-of-range");
});

it("rejects a singular ideal source and exposes stable polar values", () => {
  const cascade = calculateCascade([line()], 1e6, "matched");
  expect(() => solvePhasorCascade(cascade, { voltage: z(100), impedanceOhm: z(-50) })).toThrow("phasor-singular-source");
  expect(phasorPolar(z(0))).toEqual({ magnitude: 0, phaseDeg: null });
  expect(phasorPolar(z(3, 4))).toEqual({ magnitude: 5, phaseDeg: Math.atan2(4, 3) * 180 / Math.PI });
});

it("solves the source voltage and selects downstream current at a shunt", () => {
  const cascade = calculateCascade(
    [line(), { kind: "shunt", admittanceSiemens: z(.02) }, line()],
    1e6,
    { impedanceOhm: z(100) },
  );
  const solved = solvePhasorCascade(cascade, { voltage: z(100), impedanceOhm: z(50) });
  expect(solved.input.voltage.re + 50 * solved.input.current.re).toBeCloseTo(100);
  expect(solved.input.voltage.im + 50 * solved.input.current.im).toBeCloseTo(0);

  const [before, after] = solved.lines;
  const sample = inspectLinePhasors(solved, 50);
  for (const axis of ["re", "im"] as const) {
    expect(before.right.voltage[axis]).toBeCloseTo(after.left.voltage[axis]);
    expect(before.right.current[axis] - after.left.current[axis]).toBeCloseTo(.02 * after.left.voltage[axis]);
    expect(sample.current.total[axis]).toBeCloseTo(after.left.current[axis]);
  }
});
