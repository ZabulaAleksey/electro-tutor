export type CoefficientProfile = { base: number; spatial: number; temporal: number };

export type VariableLineProfile =
  | { kind: "lossless" | "heaviside" | "dispersive" }
  | { kind: "independent"; r: CoefficientProfile; l: CoefficientProfile; g: CoefficientProfile; c: CoefficientProfile }
  | { kind: "coax"; spatial: number; temporal: number; conductorLoss: number; dielectricLoss: number };

export type VariableLineInput = {
  lengthMetres: number;
  velocityMetresPerSecond: number;
  characteristicOhms: number;
  sourceOhms: number;
  loadOhms: number;
  sourceVolts: number;
  pulseWidthTransitTimes: number;
  durationTransitTimes: number;
  cells: number;
  profile: VariableLineProfile;
};

export type LineCoefficients = { r: number; l: number; g: number; c: number };

export type PreparedVariableLine = {
  input: VariableLineInput;
  transitSeconds: number;
  dt: number;
  steps: number;
  frameStride: number;
  frameCount: number;
  sample: (position: number, time: number) => LineCoefficients;
  sourceVoltage: (time: number) => number;
};

export type VariableLineErrorCode = "invalid-input" | "profile-range" | "boundary-range" | "grid-resolution"
  | "step-budget" | "result-budget" | "numerical-failure" | "energy-balance" | "worker-unavailable";

export class VariableLineError extends Error {
  constructor(readonly code: VariableLineErrorCode) {
    super(code);
  }
}

export type VariableLineResult = {
  cells: number;
  steps: number;
  transitSeconds: number;
  dtSeconds: number;
  timeSeconds: Float64Array;
  voltageMetres: Float64Array;
  currentMetres: Float64Array;
  /** Flattened, frame-major. Current includes both physical boundary ports. */
  voltage: Float64Array;
  current: Float64Array;
  energy: {
    stored: Float64Array;
    inputWork: Float64Array;
    outputWork: Float64Array;
    lossWork: Float64Array;
    modulationWork: Float64Array;
    residual: Float64Array;
    maxStepResidual: number;
    maxLinearResidual: number;
  };
};

export type VariableLineRequest =
  | { type: "run"; requestId: number; input: VariableLineInput }
  | { type: "cancel"; requestId: number };

export type VariableLineReply =
  | { type: "progress"; requestId: number; completed: number; total: number }
  | { type: "result"; requestId: number; result: VariableLineResult }
  | { type: "error"; requestId: number; code: VariableLineErrorCode }
  | { type: "cancelled"; requestId: number };
