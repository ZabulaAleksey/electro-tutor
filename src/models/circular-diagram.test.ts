import { describe, expect, it } from "vitest";
import {
  buildCircularDiagramModel,
  complexFromPolar,
  currentAtResistance,
  resistanceFromPosition,
  type CircularDiagramParameters,
  type Complex,
} from "./circular-diagram";

const defaultParameters: CircularDiagramParameters = {
  i0Magnitude: 1.5,
  i0Angle: -18,
  ikMagnitude: 8,
  ikAngle: -55,
  outputImpedanceMagnitude: 4,
  outputImpedanceAngle: 35,
  loadAngle: 25,
  position: 43,
};

function expectComplexClose(actual: Complex | null, expected: Complex): void {
  expect(actual).not.toBeNull();
  expect(actual?.re).toBeCloseTo(expected.re, 10);
  expect(actual?.im).toBeCloseTo(expected.im, 10);
}

describe("currentAtResistance", () => {
  const i0 = complexFromPolar(1, 0);
  const ik = complexFromPolar(5, 0);
  const outputImpedance = complexFromPolar(2, 0);

  it("returns the short-circuit current at zero resistance", () => {
    expectComplexClose(currentAtResistance(i0, ik, outputImpedance, 0, 0), ik);
  });

  it("returns the idle current at infinite resistance", () => {
    expect(currentAtResistance(i0, ik, outputImpedance, 0, Infinity)).toBe(i0);
  });

  it("calculates an ordinary point on the locus", () => {
    expectComplexClose(
      currentAtResistance(i0, ik, outputImpedance, 0, 2),
      { re: 3, im: 0 },
    );
  });

  it("returns null at an exact singularity", () => {
    expect(currentAtResistance(i0, ik, outputImpedance, 180, 2)).toBeNull();
  });

  it("returns null close enough to a singularity", () => {
    expect(currentAtResistance(i0, ik, outputImpedance, 180, 2 + 1e-10)).toBeNull();
  });

  it("keeps equal currents unchanged", () => {
    const current = complexFromPolar(3, -25);
    expectComplexClose(
      currentAtResistance(current, current, outputImpedance, 15, 7),
      current,
    );
  });

  it("keeps zero currents finite", () => {
    const zero = { re: 0, im: 0 };
    expectComplexClose(currentAtResistance(zero, zero, outputImpedance, 0, 2), zero);
  });
});

describe("resistanceFromPosition", () => {
  it("maps the final and later positions to infinity", () => {
    expect(resistanceFromPosition(100, 4)).toBe(Infinity);
    expect(resistanceFromPosition(125, 4)).toBe(Infinity);
  });
});

describe("buildCircularDiagramModel", () => {
  it("builds finite plot geometry", () => {
    const model = buildCircularDiagramModel(defaultParameters);
    const point = model.xy({ re: 1, im: -1 });

    expect(Number.isFinite(model.extent)).toBe(true);
    expect(model.extent).toBeGreaterThan(0);
    expect(Number.isFinite(model.scale)).toBe(true);
    expect(model.scale).toBeGreaterThan(0);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(model.path).not.toContain("NaN");
    expect(model.path).not.toContain("Infinity");
  });

  it("keeps geometry finite when both currents are zero", () => {
    const model = buildCircularDiagramModel({
      ...defaultParameters,
      i0Magnitude: 0,
      ikMagnitude: 0,
    });

    expect(model.extent).toBe(1.18);
    expect(Number.isFinite(model.scale)).toBe(true);
    expectComplexClose(model.current, { re: 0, im: 0 });
  });

  it("keeps scale and projected vectors finite for huge finite currents", () => {
    const model = buildCircularDiagramModel({
      ...defaultParameters,
      i0Magnitude: 1e308,
      i0Angle: 0,
      ikMagnitude: 1e308,
      ikAngle: 0,
    });
    const idlePoint = model.xy(model.i0);
    const shortCircuitPoint = model.xy(model.ik);

    expect(Number.isFinite(model.extent)).toBe(true);
    expect(Number.isFinite(model.scale)).toBe(true);
    expect(model.scale).toBeGreaterThan(0);
    expect(Number.isFinite(idlePoint.x)).toBe(true);
    expect(Number.isFinite(idlePoint.y)).toBe(true);
    expect(Number.isFinite(shortCircuitPoint.x)).toBe(true);
    expect(Number.isFinite(shortCircuitPoint.y)).toBe(true);
  });

  it("keeps scale and projected vectors finite for very small finite currents", () => {
    const model = buildCircularDiagramModel({
      ...defaultParameters,
      i0Magnitude: 1e-300,
      i0Angle: -18,
      ikMagnitude: 1e-300,
      ikAngle: -55,
    });
    const currentPoint = model.current ? model.xy(model.current) : null;

    expect(Number.isFinite(model.extent)).toBe(true);
    expect(Number.isFinite(model.scale)).toBe(true);
    expect(model.scale).toBeGreaterThan(0);
    expect(currentPoint).not.toBeNull();
    expect(Number.isFinite(currentPoint?.x)).toBe(true);
    expect(Number.isFinite(currentPoint?.y)).toBe(true);
  });

  it("starts a new path segment after a singular discontinuity", () => {
    const model = buildCircularDiagramModel({
      ...defaultParameters,
      outputImpedanceMagnitude: 2,
      outputImpedanceAngle: 90,
      loadAngle: -90,
    });
    const moveCommands = model.path.match(/M/g) ?? [];

    expect(moveCommands.length).toBeGreaterThanOrEqual(2);
  });
});
