export type LoadKind = "open" | "short" | "r" | "l" | "c" | "rl" | "rc" | "rlc";
export type LoadTopology = "series" | "parallel";

/** Values crossing the Worker boundary use SI units. */
export type TransientConfig = {
  source: { voltageV: number; resistanceOhm: number; switchTimeS: number };
  line: { lengthM: number; velocityMS: number; impedanceOhm: number; cells: number; cfl: number };
  load: {
    kind: LoadKind; topology: LoadTopology; resistanceOhm: number;
    inductanceH: number; capacitanceF: number;
    initialVoltageV: number; initialCurrentA: number;
  };
};

export const OPEN_PRESET: TransientConfig = {
  source: { voltageV: 100, resistanceOhm: 0, switchTimeS: 0 },
  line: { lengthM: 1e6, velocityMS: 2e8, impedanceOhm: 50, cells: 1000, cfl: 0.9 },
  load: { kind: "open", topology: "series", resistanceOhm: 50, inductanceH: 0.02,
    capacitanceF: 1e-5, initialVoltageV: 0, initialCurrentA: 0 },
};

export const D = {
  time: 0, step: 1, dt: 2, dx: 3, cfl: 4, travel: 5,
  sourceVoltage: 6, sourceCurrent: 7, loadVoltage: 8, loadCurrent: 9,
  minVoltage: 10, maxVoltage: 11, minCurrent: 12, maxCurrent: 13,
  lineEnergy: 14, capacitorVoltage: 15, inductorCurrent: 16, deviceEnergy: 17,
} as const;

export type WorkerCommand =
  | { type: "configure"; config: TransientConfig; stopTimeS: number }
  | { type: "play"; speed: number; stopTimeS: number }
  | { type: "pause" | "reset" | "step" | "ack" }
  | { type: "seek"; targetS: number };

export type WorkerReply =
  | { type: "snapshot"; voltages: Float64Array; currents: Float64Array;
      diagnostics: Float64Array; running: boolean; copyMs: number; stepsPerSecond: number;
      postedAt: number }
  | { type: "error"; message: string }
  | { type: "busy"; busy: boolean };
