import { describe, expect, it } from "vitest";
import { bernoulli, beats, complexVector, derivative, idealGas, integral, massSpring, models, pendulum, pipeLoss, projectile, scienceCatalog, snell, standingWave } from "./models";

describe("science analytical models", () => {
  it("publishes twelve declared models with parameters and assumptions", () => {
    expect(scienceCatalog).toHaveLength(12);
    expect(new Set(scienceCatalog.map((item) => item.id)).size).toBe(12);
    for (const item of scienceCatalog) {
      expect(item.assumptions.ru.length).toBeGreaterThan(5);
      expect(item.parameters.length).toBeGreaterThanOrEqual(1);
      expect(models[item.id]).toBeTypeOf("function");
    }
  });

  it("checks derivative and integral exact values", () => {
    expect(derivative(0).values.slope).toBe(0);
    expect(derivative(-1.5).values.value).toBeCloseTo(2.25);
    expect(integral(3).values.integral).toBeCloseTo(9);
    expect(integral(0.5).values.integral).toBeCloseTo(1 / 24);
  });

  it("keeps complex vector magnitude and phase tied to its endpoint", () => {
    const result = complexVector(3, 4);
    expect(result.values.magnitude).toBe(5);
    expect(result.values.angle).toBeCloseTo(53.1301, 3);
    expect(result.points.at(-1)).toEqual({ x: 3, y: 4 });
  });

  it("checks projectile, pendulum and spring invariants", () => {
    expect(projectile(20, 45).values.range).toBeCloseTo(40.7747, 3);
    expect(projectile(20, 45).values.height).toBeCloseTo(10.1937, 3);
    expect(pendulum(4).values.period).toBeCloseTo(4.012, 2);
    expect(massSpring(1, 100).values.period).toBeCloseTo(0.628319, 5);
    expect(massSpring(4, 100).values.period).toBeGreaterThan(massSpring(1, 100).values.period);
  });

  it("checks fluid continuity and pressure-loss scaling", () => {
    const bernoulliResult = bernoulli(0.001, 0.02);
    expect(bernoulliResult.values.outletVelocity).toBeGreaterThan(bernoulliResult.values.inletVelocity);
    expect(pipeLoss(40).values.pressureLoss).toBeCloseTo(2 * pipeLoss(20).values.pressureLoss);
    expect(pipeLoss(20, 0.04).values.pressureLoss).toBeGreaterThan(pipeLoss(20, 0.05).values.pressureLoss);
  });

  it("checks wave, gas and optics edge cases", () => {
    expect(standingWave(2).points[32].y).toBeCloseTo(0, 10);
    const beatResult = beats(440, 444);
    expect(beatResult.values.beatFrequency).toBe(4);
    expect(Math.max(...beatResult.points.map((point) => Math.abs(point.y)))).toBeLessThanOrEqual(2);
    expect(beatResult.carrierPoints).toHaveLength(513);
    expect(idealGas(600, 1).values.pressure).toBeCloseTo(4988.6776, 3);
    expect(snell(1, 1.5, 30).values.refractedAngle).toBeCloseTo(19.4712, 3);
    const tir = snell(1.5, 1, 60);
    expect(tir.values.totalInternalReflection).toBe(1);
    expect(Number.isNaN(tir.values.refractedAngle)).toBe(true);
    expect(tir.points.at(-1)?.y).toBeGreaterThan(0);
    expect(tir.points.at(-1)?.x).toBeCloseTo(Math.sin(Math.PI / 3), 10);
  });

  it("returns finite plotted samples throughout supported domains", () => {
    const cases: Array<[keyof typeof models, number[]]> = [
      ["derivative-tangent", [-2]], ["definite-integral", [4]], ["complex-vector", [-5, 5]], ["projectile", [40, 80]], ["pendulum", [3]], ["bernoulli", [0.003, 0.012]], ["pipe-loss", [50, 0.02, 0.008]], ["standing-wave", [5]], ["beats", [200, 800]], ["ideal-gas", [600, 0.2]], ["snell-refraction", [1.5, 1, 80]], ["mass-spring", [5, 300, 0.5]],
    ];
    for (const [id, args] of cases) {
      const result = models[id](...args);
      expect(result.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      if (id === "beats") expect(result.carrierPoints?.length ?? 0).toBeGreaterThan(500);
    }
  });
});
