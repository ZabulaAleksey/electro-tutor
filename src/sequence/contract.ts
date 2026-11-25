import type { Complex } from "../models/circular-diagram";

export const phases = ["A", "B", "C"] as const;
export const areas = ["generator", "line", "load"] as const;
export type Phase = typeof phases[number];
export type Area = typeof areas[number];
export type Triple = readonly [Complex, Complex, Complex];
export type Matrix3 = readonly [Triple, Triple, Triple];
export type Neutral = { mode: "grounded" | "isolated"; impedance: Complex };
export type SequenceEdit = { id: string; area: Area; at: number; phases: readonly Phase[] } & (
  | { kind: "series"; impedance: Complex }
  | { kind: "open" }
  | { kind: "shunt"; impedance: Complex; target: Phase | "ground" }
);
export type SequenceDocument = {
  schema: "electrotutor-three-phase-sequences-v1";
  frequencyHz: number;
  sourceVolts: number;
  sections: Record<Area, Triple>;
  generatorNeutral: Neutral;
  loadNeutral: Neutral;
  edits: readonly SequenceEdit[];
};
export type SectionReading = {
  id: string;
  area: Area;
  from: number;
  to: number;
  /** Voltage at the downstream end of the selected branch, referred to the indicated reference. */
  voltageABC: Triple;
  currentABC: Triple;
  voltage012: Triple;
  current012: Triple;
  reference: "ground" | "floating-reference" | "mixed-reference";
  phaseGrounded?: readonly [boolean, boolean, boolean];
  zeroPath: boolean;
};
export type SequenceCoupling = {
  id: string;
  area: Area;
  at: number;
  sequences: readonly (0 | 1 | 2)[];
  matrix?: Matrix3;
};
export type SequenceSolution = {
  ok: true;
  readings: readonly SectionReading[];
  couplings: readonly SequenceCoupling[];
  faultCurrents: Readonly<Record<string, Triple>>;
  maxResidual: number;
  gaugeFixed: boolean;
  neutralVoltages: { generator: Complex; load: Complex };
} | { ok: false; reason: "inconsistent" | "indeterminate" | "range" };

export const absolutePosition = (area: Area, at: number) => areas.indexOf(area) + at;
export const z = (re = 0, im = 0): Complex => ({ re, im });

export function newSequenceDocument(): SequenceDocument {
  return {
    schema: "electrotutor-three-phase-sequences-v1", frequencyHz: 50, sourceVolts: 230,
    sections: {
      generator: [z(.65, 1.2), z(.3, .8), z(.4, .9)],
      line: [z(1.5, 2.0), z(.8, 1.1), z(.8, 1.1)],
      load: [z(35, 8), z(35, 8), z(35, 8)],
    },
    generatorNeutral: { mode: "grounded", impedance: z() },
    loadNeutral: { mode: "grounded", impedance: z() },
    edits: [],
  };
}
