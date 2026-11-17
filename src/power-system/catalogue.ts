import type { EquipmentReference, PowerLine, PowerTransformer } from "./network";
import { isFiniteNumber, isNonnegativeNumber, isPositiveInteger, isPositiveNumber, isPowerId, isRecord } from "./validation";

export type EquipmentProvenance =
  | Readonly<{ kind: "reference"; document: string; publisher: string; locator: string; url?: string }>
  | Readonly<{ kind: "custom"; note?: string }>;

type EquipmentIdentity = Readonly<{ id: string; revision: number; name: string; provenance: EquipmentProvenance }>;

export type LineShunt =
  | Readonly<{ kind: "capacitance"; faradPerKm: number }>
  | Readonly<{ kind: "susceptance"; siemensPerKm: number }>;

export type LineType = EquipmentIdentity & Readonly<{
  kind: "line";
  ratedFrequencyHz: number;
  ratedKv?: number;
  rOhmPerKm: number;
  xOhmPerKm: number;
  shunt: LineShunt;
  gSiemensPerKm?: number;
  maxCurrentA?: number;
  sectionMm2?: number;
}>;

export type TransformerResistance =
  | Readonly<{ kind: "load-loss"; kw: number }>
  | Readonly<{ kind: "resistance-percent"; percent: number }>;

export type TransformerTap = Readonly<{ min: number; max: number; neutral: number; percentPerStep: number }>;

export type TransformerType = EquipmentIdentity & Readonly<{
  kind: "transformer";
  ratedMva: number;
  highKv: number;
  lowKv: number;
  shortCircuitPct: number;
  resistance: TransformerResistance;
  noLoadLossKw: number;
  noLoadCurrentPct: number;
  vectorGroup?: string;
  phaseShiftDeg?: number;
  tap?: TransformerTap;
}>;

export type EquipmentType = LineType | TransformerType;
export type EquipmentCatalogue = Readonly<{ schemaVersion: 1; types: readonly EquipmentType[] }>;

function text(raw: unknown, max: number, error: string): string {
  if (typeof raw !== "string" || !raw.trim() || raw.length > max) throw Error(error);
  return raw;
}

function optional<T>(value: unknown, guard: (value: unknown) => value is T, error: string): T | undefined {
  if (value === undefined) return undefined;
  if (!guard(value)) throw Error(error);
  return value;
}

function webUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = text(value, 2048, "power-invalid-provenance");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw Error("power-invalid-provenance"); }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) throw Error("power-invalid-provenance");
  return raw;
}

function provenance(raw: unknown): EquipmentProvenance {
  const error = "power-invalid-provenance";
  if (!isRecord(raw)) throw Error(error);
  if (raw.kind === "custom") return { kind: "custom", ...(raw.note === undefined ? {} : { note: text(raw.note, 600, error) }) };
  if (raw.kind !== "reference") throw Error(error);
  const url = webUrl(raw.url);
  return { kind: "reference", document: text(raw.document, 300, error), publisher: text(raw.publisher, 200, error),
    locator: text(raw.locator, 200, error), ...(url === undefined ? {} : { url }) };
}

function shunt(raw: unknown, error: string): LineShunt {
  if (!isRecord(raw)) throw Error(error);
  if (raw.kind === "capacitance" && isNonnegativeNumber(raw.faradPerKm) && raw.siemensPerKm === undefined) {
    return { kind: raw.kind, faradPerKm: raw.faradPerKm };
  }
  if (raw.kind === "susceptance" && isNonnegativeNumber(raw.siemensPerKm) && raw.faradPerKm === undefined) {
    return { kind: raw.kind, siemensPerKm: raw.siemensPerKm };
  }
  throw Error(error);
}

function resistance(raw: unknown, error: string): TransformerResistance {
  if (!isRecord(raw)) throw Error(error);
  if (raw.kind === "load-loss" && isNonnegativeNumber(raw.kw) && raw.percent === undefined) return { kind: raw.kind, kw: raw.kw };
  if (raw.kind === "resistance-percent" && isNonnegativeNumber(raw.percent) && raw.kw === undefined) return { kind: raw.kind, percent: raw.percent };
  throw Error(error);
}

function readTap(raw: unknown, error: string): TransformerTap | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw Error(error);
  const { min, max, neutral, percentPerStep } = raw;
  const integer = (number: unknown): number is number => isFiniteNumber(number) && Number.isSafeInteger(number);
  if (!integer(min) || !integer(max) || !integer(neutral) || min > neutral || neutral > max || !isPositiveNumber(percentPerStep)) throw Error(error);
  return { min, max, neutral, percentPerStep };
}

function readType(raw: unknown): EquipmentType {
  if (!isRecord(raw) || !isPowerId(raw.id) || !isPositiveInteger(raw.revision)) throw Error("power-invalid-equipment-type");
  const error = "power-invalid-equipment-type:" + raw.id;
  const identity: EquipmentIdentity = { id: raw.id, revision: raw.revision, name: text(raw.name, 120, error), provenance: provenance(raw.provenance) };
  if (raw.kind === "line") {
    if (!isPositiveNumber(raw.ratedFrequencyHz) || !isNonnegativeNumber(raw.rOhmPerKm) || !isNonnegativeNumber(raw.xOhmPerKm)) throw Error(error);
    const ratedKv = optional(raw.ratedKv, isPositiveNumber, error);
    const gSiemensPerKm = optional(raw.gSiemensPerKm, isNonnegativeNumber, error);
    const maxCurrentA = optional(raw.maxCurrentA, isPositiveNumber, error);
    const sectionMm2 = optional(raw.sectionMm2, isPositiveNumber, error);
    return { ...identity, kind: raw.kind, ratedFrequencyHz: raw.ratedFrequencyHz, rOhmPerKm: raw.rOhmPerKm,
      xOhmPerKm: raw.xOhmPerKm, shunt: shunt(raw.shunt, error),
      ...(ratedKv === undefined ? {} : { ratedKv }), ...(gSiemensPerKm === undefined ? {} : { gSiemensPerKm }),
      ...(maxCurrentA === undefined ? {} : { maxCurrentA }), ...(sectionMm2 === undefined ? {} : { sectionMm2 }) };
  }
  if (raw.kind !== "transformer" || !isPositiveNumber(raw.ratedMva) || !isPositiveNumber(raw.highKv) ||
      !isPositiveNumber(raw.lowKv) || raw.highKv < raw.lowKv || !isPositiveNumber(raw.shortCircuitPct) ||
      !isNonnegativeNumber(raw.noLoadLossKw) || !isNonnegativeNumber(raw.noLoadCurrentPct)) throw Error(error);
  const windings = resistance(raw.resistance, error);
  if (windings.kind === "resistance-percent" && windings.percent > raw.shortCircuitPct) throw Error(error);
  const vectorGroup = raw.vectorGroup === undefined ? undefined : text(raw.vectorGroup, 20, error);
  const phaseShiftDeg = optional(raw.phaseShiftDeg, isFiniteNumber, error);
  const tap = readTap(raw.tap, error);
  return { ...identity, kind: raw.kind, ratedMva: raw.ratedMva, highKv: raw.highKv, lowKv: raw.lowKv,
    shortCircuitPct: raw.shortCircuitPct, resistance: windings, noLoadLossKw: raw.noLoadLossKw, noLoadCurrentPct: raw.noLoadCurrentPct,
    ...(vectorGroup === undefined ? {} : { vectorGroup }), ...(phaseShiftDeg === undefined ? {} : { phaseShiftDeg }),
    ...(tap === undefined ? {} : { tap }) };
}

export function readEquipmentCatalogue(raw: unknown): EquipmentCatalogue {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.types)) throw Error("power-invalid-catalogue");
  const kinds = new Map<string, EquipmentType["kind"]>();
  const revisions = new Set<string>();
  const types = Array.from(raw.types, (record: unknown) => {
    const type = readType(record);
    const key = type.id + ":" + type.revision;
    if (revisions.has(key)) throw Error("power-duplicate-equipment-revision:" + key);
    const kind = kinds.get(type.id);
    if (kind !== undefined && kind !== type.kind) throw Error("power-conflicting-equipment-kind:" + type.id);
    kinds.set(type.id, type.kind);
    revisions.add(key);
    return type;
  });
  return { schemaVersion: 1, types };
}

export function resolveEquipmentType(catalogue: EquipmentCatalogue, reference: EquipmentReference): EquipmentType | undefined {
  if (reference.typeId === undefined) return undefined;
  if (reference.typeRevision !== undefined) {
    return catalogue.types.find(type => type.id === reference.typeId && type.revision === reference.typeRevision);
  }
  return catalogue.types.reduce<EquipmentType | undefined>((latest, type) =>
    type.id === reference.typeId && (!latest || type.revision > latest.revision) ? type : latest, undefined);
}

export function pinEquipmentType(device: PowerLine | PowerTransformer, type: EquipmentType): PowerLine | PowerTransformer {
  if (device.kind !== type.kind) throw Error("power-equipment-type-mismatch:" + device.id);
  return { ...device, typeId: type.id, typeRevision: type.revision };
}
