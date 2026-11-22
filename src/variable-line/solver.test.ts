import { describe, expect, it } from "vitest";
import { type VariableLineInput, type VariableLineResult } from "./contracts";
import { defaultCoaxProfile, prepareVariableLine } from "./profiles";
import { createVariableLineRun } from "./solver";

const matched: VariableLineInput = {
  lengthMetres: 1_000_000, velocityMetresPerSecond: 2e8, characteristicOhms: 50,
  sourceOhms: 50, loadOhms: 50, sourceVolts: 2, pulseWidthTransitTimes: 0.5,
  durationTransitTimes: 2, cells: 160, profile: { kind: "lossless" },
};

function receiverTrace(result: VariableLineResult) {
  return result.timeSeconds.map((_, index) => result.voltage[(index + 1) * (result.cells + 1) - 1]);
}

function peakAtReceiver(result: VariableLineResult) {
  const trace = receiverTrace(result);
  const maxIndex = trace.indexOf(Math.max(...trace));
  const previous = trace[maxIndex - 1];
  const center = trace[maxIndex];
  const next = trace[maxIndex + 1];
  const offset = 0.5 * (previous - next) / (previous - 2 * center + next);
  return {
    voltage: center + 0.25 * (next - previous) * offset,
    time: result.timeSeconds[maxIndex] + (result.timeSeconds[maxIndex + 1] - result.timeSeconds[maxIndex]) * offset,
  };
}

describe("variable line worker solver", () => {
  it.each(["lossless", "heaviside"] as const)("propagates a matched %s pulse at the analytical velocity and amplitude", kind => {
    const prepared = prepareVariableLine({ ...matched, profile: { kind } });
    const run = createVariableLineRun(prepared);
    expect(run.advance(32)).toBe(false);
    expect(run.completed).toBe(32);
    expect(run.advance(prepared.steps)).toBe(true);
    const { result } = run;
    expect(result.steps).toBe(1280);
    expect(result.timeSeconds.length).toBeLessThanOrEqual(241);
    expect(result.timeSeconds.at(-1)).toBeCloseTo(0.01, 12);
    expect(result.currentMetres[0]).toBe(0);
    expect(result.currentMetres.at(-1)).toBe(matched.lengthMetres);
    expect(result.voltage[0]).toBe(0);
    expect(result.current[0]).toBe(0);
    const peak = peakAtReceiver(result);
    expect(Math.abs(peak.time - 0.00625)).toBeLessThan(20e-6);
    expect(Math.abs(peak.voltage - (kind === "lossless" ? 1 : Math.exp(-0.2)))).toBeLessThan(0.005);
    for (let frame = 0; frame < result.timeSeconds.length; frame++) {
      const receiverVoltage = result.voltage[(frame + 1) * 161 - 1];
      const receiverCurrent = result.current[(frame + 1) * 162 - 1];
      expect(receiverCurrent).toBeCloseTo(receiverVoltage / matched.loadOhms, 13);
    }
    expect(result.energy.maxStepResidual).toBeLessThan(1e-10);
    expect(result.energy.maxLinearResidual).toBeLessThan(1e-10);
    expect(result.energy.modulationWork.at(-1)).toBe(0);
    expect(Math.abs(result.energy.residual.at(-1)!)).toBeLessThan(1e-13);
    if (kind === "lossless") expect(result.energy.lossWork.at(-1)).toBe(0);
    else expect(result.energy.lossWork.at(-1)).toBeGreaterThan(0);
  });

  it("rejects a midpoint step whose storage coefficient changes beyond the approved stability bound", () => {
    const prepared = prepareVariableLine(matched);
    const run = createVariableLineRun({
      ...prepared,
      input: { ...prepared.input, profile: { kind: "coax", spatial: 0, temporal: 0, conductorLoss: 0, dielectricLoss: 0 } },
      sample: (_, time) => ({ r: 0, l: 1, g: 0, c: time > 0 ? 1.5 : 1 }),
    });
    expect(() => run.advance(1)).toThrow("numerical-failure");
    expect(run.completed).toBe(0);
  });

  it("distinguishes dispersion from attenuation and accounts for the coax drive work", () => {
    function solve(profile: VariableLineInput["profile"]) {
      const prepared = prepareVariableLine({ ...matched, profile });
      const run = createVariableLineRun(prepared);
      run.advance(prepared.steps);
      return run.result;
    }
    function peakNormalized(result: VariableLineResult) {
      const trace = receiverTrace(result);
      const peak = Math.max(...trace);
      return trace.map(value => value / peak);
    }
    const baseline = peakNormalized(solve({ kind: "lossless" }));
    const notDistorted = peakNormalized(solve({ kind: "heaviside" }));
    const distorted = peakNormalized(solve({ kind: "dispersive" }));
    expect(Math.max(...notDistorted.map((value, i) => Math.abs(value - baseline[i])))).toBeLessThan(0.001);
    expect(Math.max(...distorted.map((value, i) => Math.abs(value - baseline[i])))).toBeGreaterThan(0.003);

    const geometry = solve(defaultCoaxProfile());
    expect(geometry.energy.modulationWork.at(-1)).toBeGreaterThan(1e-8);
    expect(geometry.energy.maxStepResidual).toBeLessThan(1e-10);
  });
});

const wave = 2 * Math.PI;
const voltageAt = (x: number, t: number) => 1 + 0.2 * Math.sin(wave * (x - 0.6 * t));
const currentAt = (x: number, t: number) => voltageAt(x, t) + 0.15 * Math.sin(Math.PI * x) * Math.cos(wave * t);

function coefficientsAt(x: number, t: number) {
  const c = 1 + 0.2 * x + 0.1 * Math.sin(wave * t);
  return { c, l: 1 / c, g: 0.1 * c, r: 0.1 + 0.02 * x + 0.01 * Math.sin(wave * t) };
}

function distributedSource(x: number, t: number, isVoltage: boolean) {
  const { r, l, g, c } = coefficientsAt(x, t);
  const cDerivative = 0.1 * wave * Math.cos(wave * t);
  const voltageX = 0.2 * wave * Math.cos(wave * (x - 0.6 * t));
  const voltageT = -0.6 * voltageX;
  if (isVoltage) {
    const currentX = voltageX + 0.15 * Math.PI * Math.cos(Math.PI * x) * Math.cos(wave * t);
    return c * voltageT + cDerivative * voltageAt(x, t) + currentX + g * voltageAt(x, t);
  }
  const currentT = voltageT - 0.15 * wave * Math.sin(Math.PI * x) * Math.sin(wave * t);
  return l * currentT - cDerivative / c ** 2 * currentAt(x, t) + voltageX + r * currentAt(x, t);
}

function relativeL2(actual: Float64Array, positions: Float64Array, time: number, isVoltage: boolean) {
  let squaredError = 0;
  let squaredReference = 0;
  for (let index = 0; index < actual.length; index++) {
    const x = positions[index] / matched.lengthMetres;
    const expected = isVoltage ? voltageAt(x, time) : currentAt(x, time) / matched.characteristicOhms;
    const weight = isVoltage && (index === 0 || index === actual.length - 1) ? 0.5 : 1;
    squaredError += weight * (actual[index] - expected) ** 2;
    squaredReference += weight * expected ** 2;
  }
  return Math.sqrt(squaredError / squaredReference);
}

it("converges to the independently manufactured coax fields and includes modulation in the balance", () => {
  const prepared = prepareVariableLine(matched);
  const errors: Array<{ voltage: number; current: number }> = [];
  for (const cells of [40, 80, 160]) {
    const time = 0.25;
    const run = createVariableLineRun({
      ...prepared,
      input: { ...prepared.input, cells },
      steps: cells, dt: time / cells, frameStride: 1, frameCount: cells + 1,
      sample: coefficientsAt, sourceVoltage: t => 2 * voltageAt(0, t),
    }, {
      initial: (x, isVoltage) => isVoltage ? voltageAt(x, 0) : currentAt(x, 0),
      source: distributedSource,
    });
    expect(run.advance(cells)).toBe(true);
    const { voltage, voltageMetres, current, currentMetres, energy } = run.result;
    errors.push({
      voltage: relativeL2(voltage.slice(-(cells + 1)), voltageMetres, time, true),
      current: relativeL2(current.slice(-(cells + 1), -1), currentMetres.slice(1, -1), time, false),
    });
    expect(energy.maxStepResidual).toBeLessThan(1e-10);
    expect(Math.abs(energy.modulationWork.at(-1)! / energy.stored[0])).toBeGreaterThan(0.002);
    expect(Math.abs(energy.residual.at(-1)!)).toBeLessThan(1e-13);
  }
  for (const field of ["voltage", "current"] as const) {
    expect(errors[2][field]).toBeLessThan(1e-4);
    expect(Math.log2(errors[0][field] / errors[1][field])).toBeGreaterThan(1.8);
    expect(Math.log2(errors[1][field] / errors[2][field])).toBeGreaterThan(1.8);
  }
});
