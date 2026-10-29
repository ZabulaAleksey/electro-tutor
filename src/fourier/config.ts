import type { BasisName } from "./bases";
import type { Complex } from "./math";

export const MAX_CONFIG_POINTS = 65536;
export const MAX_CONFIG_COORDINATE = 1e6;
export const MAX_CONFIG_FREQUENCY = 64;
export const MAX_CONFIG_AMPLITUDE = 10;
export const MAX_CONFIG_PHASE = Math.PI * 4;
export const MAX_CONFIG_HARMONICS = 128;

export type FourierConfig = {
  points: Complex[];
  playground?: { active: boolean; preset: "square" | "saw" | "triangle" | "beats"; amplitude: number; phase: number };
  closed: boolean;
  count: number;
  phase: number;
  speed: number;
  loop: boolean;
  basis: BasisName;
  order: "amplitude" | "frequency" | "interleaved";
  enabled: Record<number, boolean>;
  edited: Record<number, { amplitude: number; phase: number }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteBounded = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const validFrequencyKey = (key: string) => { const value = Number(key); return Number.isInteger(value) && value >= -MAX_CONFIG_FREQUENCY && value < MAX_CONFIG_FREQUENCY; };
const validEnabledMap = (value: unknown): value is Record<number, boolean> => isRecord(value) && Object.entries(value).every(([key, item]) => Number.isInteger(Number(key)) && Number(key) >= -MAX_CONFIG_FREQUENCY && Number(key) < MAX_CONFIG_HARMONICS && typeof item === "boolean");
const validEditedMap = (value: unknown): value is Record<number, { amplitude: number; phase: number }> => isRecord(value) && Object.entries(value).every(([key, item]) => validFrequencyKey(key) && isRecord(item) && finiteBounded(item.amplitude, 0, MAX_CONFIG_AMPLITUDE) && finiteBounded(item.phase, -MAX_CONFIG_PHASE, MAX_CONFIG_PHASE));

export function validateFourierConfig(value: unknown): value is FourierConfig {
  if (!isRecord(value) || !Array.isArray(value.points) || value.points.length > MAX_CONFIG_POINTS) return false;
  const allowedKeys = new Set(["points", "closed", "count", "phase", "speed", "loop", "basis", "order", "enabled", "edited", "playground"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (value.playground !== undefined && (!isRecord(value.playground) || typeof value.playground.active !== "boolean" || !["square","saw","triangle","beats"].includes(String(value.playground.preset)) || !finiteBounded(value.playground.amplitude, .2, 1.8) || !finiteBounded(value.playground.phase, -Math.PI, Math.PI))) return false;
  if (!value.points.every((point) => isRecord(point) && finiteBounded(point.re, -MAX_CONFIG_COORDINATE, MAX_CONFIG_COORDINATE) && finiteBounded(point.im, -MAX_CONFIG_COORDINATE, MAX_CONFIG_COORDINATE))) return false;
  return typeof value.closed === "boolean" && finiteBounded(value.count, 1, MAX_CONFIG_HARMONICS) && Number.isInteger(value.count)
    && finiteBounded(value.phase, 0, 1) && finiteBounded(value.speed, 0, .4) && typeof value.loop === "boolean"
    && (value.basis === "fourier" || value.basis === "haar" || value.basis === "dct" || value.basis === "walsh")
    && (value.order === "amplitude" || value.order === "frequency" || value.order === "interleaved")
    && validEnabledMap(value.enabled) && validEditedMap(value.edited);
}

export function fourierDocumentSignature(value: Pick<FourierConfig,"points"|"closed"|"enabled"|"edited"|"playground">) {
 return JSON.stringify({points:value.points,closed:value.closed,enabled:value.enabled,edited:value.edited,playground:value.playground?.active?value.playground:null});
}
