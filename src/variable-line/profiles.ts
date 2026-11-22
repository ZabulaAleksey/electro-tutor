import { VariableLineError, type CoefficientProfile, type LineCoefficients, type PreparedVariableLine,
  type VariableLineErrorCode, type VariableLineInput, type VariableLineProfile } from "./contracts";

const speedOfLight = 299_792_458;
const maxSteps = 16_384;
const maxFrames = 241;
const maxResultBytes = 4 * 1024 * 1024;
const angularFrequency = 2 * Math.PI;

type ProfileCertificate = {
  waveMin: number;
  waveMax: number;
  relativeStorageRate: number;
  variesInSpace: boolean;
  variesInTime: boolean;
  sample: (x: number, t: number) => LineCoefficients;
};

function record(value: unknown, code: VariableLineErrorCode): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VariableLineError(code);
  return value as Record<string, unknown>;
}

function numeric(value: unknown, low: number, high: number, code: VariableLineErrorCode) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new VariableLineError(code);
  }
  return value;
}

export function defaultIndependentProfile(): Extract<VariableLineProfile, { kind: "independent" }> {
  return {
    kind: "independent",
    r: { base: .25, spatial: .20, temporal: .12 },
    l: { base: 1, spatial: .12, temporal: .08 },
    g: { base: .12, spatial: -.18, temporal: .10 },
    c: { base: 1, spatial: -.16, temporal: .10 },
  };
}

export function defaultCoaxProfile(): Extract<VariableLineProfile, { kind: "coax" }> {
  return { kind: "coax", spatial: .16, temporal: .12, conductorLoss: .2, dielectricLoss: .1 };
}

export function defaultVariableLineInput(): VariableLineInput {
  return {
    lengthMetres: 1_000_000, velocityMetresPerSecond: 200_000_000, characteristicOhms: 50,
    sourceOhms: 50, loadOhms: 50, sourceVolts: 100, pulseWidthTransitTimes: .5,
    durationTransitTimes: 2, cells: 160, profile: { kind: "lossless" },
  };
}

function amplitude(value: unknown) {
  return numeric(value, -1, 1, "profile-range");
}

function coefficient(value: unknown, storage: boolean): CoefficientProfile {
  const entry = record(value, "profile-range");
  const base = numeric(entry.base, storage ? .5 : 0, 2, "profile-range");
  const spatial = amplitude(entry.spatial);
  const temporal = amplitude(entry.temporal);
  const extent = Math.abs(spatial) + Math.abs(temporal);
  numeric(base * (1 - extent), storage ? .5 : 0, 2, "profile-range");
  numeric(base * (1 + extent), storage ? .5 : 0, 2, "profile-range");
  return { base, spatial, temporal };
}

function parseProfile(value: unknown): VariableLineProfile {
  const input = record(value, "profile-range");
  switch (input.kind) {
    case "lossless": case "heaviside": case "dispersive": return { kind: input.kind };
    case "independent": return {
      kind: "independent", r: coefficient(input.r, false), l: coefficient(input.l, true),
      g: coefficient(input.g, false), c: coefficient(input.c, true),
    };
    case "coax": return {
      kind: "coax", spatial: amplitude(input.spatial), temporal: amplitude(input.temporal),
      conductorLoss: numeric(input.conductorLoss, 0, 2, "profile-range"),
      dielectricLoss: numeric(input.dielectricLoss, 0, 2, "profile-range"),
    };
    default: throw new VariableLineError("profile-range");
  }
}

function modulation(x: number, t: number) {
  return [Math.sin(angularFrequency * x), Math.sin(angularFrequency * t)] as const;
}

function certificate(profile: VariableLineProfile): ProfileCertificate {
  if (profile.kind === "independent") {
    const { r, l, g, c } = profile;
    const extent = ({ spatial, temporal }: CoefficientProfile) => Math.abs(spatial) + Math.abs(temporal);
    const min = (p: CoefficientProfile) => p.base * (1 - extent(p));
    const max = (p: CoefficientProfile) => p.base * (1 + extent(p));
    const rate = (p: CoefficientProfile) => angularFrequency * p.base * Math.abs(p.temporal) / min(p);
    return {
      waveMin: 1 / Math.sqrt(max(l) * max(c)), waveMax: 1 / Math.sqrt(min(l) * min(c)),
      relativeStorageRate: Math.max(rate(l), rate(c)),
      variesInSpace: [r, l, g, c].some(p => p.base * p.spatial !== 0),
      variesInTime: [r, l, g, c].some(p => p.base * p.temporal !== 0),
      sample(x, t) {
        const [sx, st] = modulation(x, t);
        const evaluate = (p: CoefficientProfile) => p.base * (1 + p.spatial * sx + p.temporal * st);
        return { r: evaluate(r), l: evaluate(l), g: evaluate(g), c: evaluate(c) };
      },
    };
  }
  if (profile.kind === "coax") {
    const { spatial, temporal, conductorLoss, dielectricLoss } = profile;
    const extent = Math.abs(spatial) + Math.abs(temporal);
    const min = numeric(1 - extent, .5, 1, "profile-range");
    const max = 1 + extent;
    numeric(dielectricLoss / min, 0, 2, "profile-range");
    const maxRate = angularFrequency * Math.abs(temporal);
    return {
      waveMin: 1, waveMax: 1,
      relativeStorageRate: Math.max(maxRate / min, maxRate * max / (min * min)),
      variesInSpace: spatial !== 0, variesInTime: temporal !== 0,
      sample(x, t) {
        const [sx, st] = modulation(x, t);
        const geometry = 1 + spatial * sx + temporal * st;
        return { r: conductorLoss, l: geometry, g: dielectricLoss / geometry, c: 1 / geometry };
      },
    };
  }
  const r = profile.kind === "lossless" ? 0 : profile.kind === "heaviside" ? .2 : .7;
  const g = profile.kind === "dispersive" ? .12 : r;
  const constant = { r, l: 1, g, c: 1 };
  return { waveMin: 1, waveMax: 1, relativeStorageRate: 0,
    variesInSpace: false, variesInTime: false, sample: () => constant };
}

export function prepareVariableLine(value: unknown): PreparedVariableLine {
  const entry = record(value, "invalid-input");
  const characteristicOhms = numeric(entry.characteristicOhms, 1, 10_000, "invalid-input");
  const boundary = (value: unknown) => numeric(value, .25 * characteristicOhms, 4 * characteristicOhms, "boundary-range");
  const input: VariableLineInput = {
    lengthMetres: numeric(entry.lengthMetres, 1, 10_000_000, "invalid-input"),
    velocityMetresPerSecond: numeric(entry.velocityMetresPerSecond, 1e6, speedOfLight, "invalid-input"),
    characteristicOhms, sourceOhms: boundary(entry.sourceOhms), loadOhms: boundary(entry.loadOhms),
    sourceVolts: numeric(entry.sourceVolts, -1000, 1000, "invalid-input"),
    pulseWidthTransitTimes: numeric(entry.pulseWidthTransitTimes, .125, 4, "invalid-input"),
    durationTransitTimes: numeric(entry.durationTransitTimes, .125, 8, "invalid-input"),
    cells: numeric(entry.cells, 16, 512, "grid-resolution"), profile: parseProfile(entry.profile),
  };
  const { cells, profile, velocityMetresPerSecond, pulseWidthTransitTimes, durationTransitTimes } = input;
  const certified = certificate(profile);
  if (certified.waveMax * velocityMetresPerSecond > speedOfLight) throw new VariableLineError("profile-range");
  const h = 1 / cells;
  const riseTime = pulseWidthTransitTimes / 2;
  const spatialScale = Math.min(certified.waveMin * riseTime, certified.variesInSpace ? 1 : Infinity);
  if (!Number.isInteger(cells) || h > spatialScale / 16) throw new VariableLineError("grid-resolution");
  const temporalScale = Math.min(riseTime, certified.variesInTime ? .25 : Infinity);
  const stepLimit = Math.min(.25 * h / certified.waveMax, temporalScale / 16, .1 / certified.relativeStorageRate);
  const steps = Math.ceil(durationTransitTimes / stepLimit);
  if (steps > maxSteps) throw new VariableLineError("step-budget");
  const frameStride = Math.ceil(steps / (maxFrames - 1));
  const frameCount = Math.ceil(steps / frameStride) + 1;
  const resultBytes = Float64Array.BYTES_PER_ELEMENT * ((2 * cells + 3) * (frameCount + 1) + 7 * frameCount);
  if (resultBytes > maxResultBytes) throw new VariableLineError("result-budget");
  return {
    input, transitSeconds: input.lengthMetres / velocityMetresPerSecond, dt: durationTransitTimes / steps,
    steps, frameStride, frameCount, sample: certified.sample,
    sourceVoltage: t => t > 0 && t < pulseWidthTransitTimes
      ? input.sourceVolts * Math.sin(Math.PI * t / pulseWidthTransitTimes) ** 4 : 0,
  };
}
