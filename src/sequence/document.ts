import type { Complex } from "../models/circular-diagram";
import { areas, phases, type Area, type Neutral, type Phase, type SequenceDocument, type SequenceEdit, type Triple } from "./contract";

export const sequenceArchiveBytes = 64_000;
export const sequenceEditLimit = 16;
const editId = /^[A-Za-z][A-Za-z0-9_-]{0,27}$/;

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid-sequence-archive");
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== keys.length || keys.some(key => !Object.hasOwn(entry, key))) {
    throw Error("invalid-sequence-archive");
  }
  return entry;
}

function real(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw Error("invalid-sequence-value");
  }
  return value;
}

function impedance(value: unknown): Complex {
  const { re, im } = object(value, ["re", "im"]);
  return { re: real(re, 0, 1e6), im: real(im, -1e6, 1e6) };
}

function impedances(value: unknown): Triple {
  if (!Array.isArray(value) || value.length !== 3) throw Error("invalid-sequence-value");
  return [impedance(value[0]), impedance(value[1]), impedance(value[2])];
}

function neutral(value: unknown): Neutral {
  const data = object(value, ["mode", "impedance"]);
  if (data.mode !== "grounded" && data.mode !== "isolated") throw Error("invalid-sequence-neutral");
  return { mode: data.mode, impedance: impedance(data.impedance) };
}

function selectedPhases(value: unknown): Phase[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > phases.length
    || value.some(item => !phases.includes(item as Phase)) || new Set(value).size !== value.length) {
    throw Error("invalid-sequence-phase");
  }
  return phases.filter(phase => value.includes(phase));
}

function edit(value: unknown): SequenceEdit {
  const common = ["id", "kind", "area", "at", "phases"];
  const kind = value && typeof value === "object" && "kind" in value ? value.kind : undefined;
  const extra = kind === "open" ? [] : kind === "series" ? ["impedance"] : ["impedance", "target"];
  const entry = object(value, [...common, ...extra]);
  const { id, area } = entry;
  if (typeof id !== "string" || !editId.test(id) || Object.hasOwn(Object.prototype, id) || !areas.includes(area as Area)) {
    throw Error("invalid-sequence-edit");
  }
  const site = { id, area: area as Area, at: real(entry.at, 0, 1), phases: selectedPhases(entry.phases) };
  if (kind === "open") return { ...site, kind };
  if (kind === "series") return { ...site, kind, impedance: impedance(entry.impedance) };
  if (kind !== "shunt" || (entry.target !== "ground" && !phases.includes(entry.target as Phase))
    || site.phases.includes(entry.target as Phase)) throw Error("invalid-sequence-fault");
  return { ...site, kind, impedance: impedance(entry.impedance), target: entry.target as Phase | "ground" };
}

export function validateSequenceDocument(value: unknown): SequenceDocument {
  const data = object(value, ["schema", "frequencyHz", "sourceVolts", "sections", "generatorNeutral", "loadNeutral", "edits"]);
  if (data.schema !== "electrotutor-three-phase-sequences-v1" || !Array.isArray(data.edits)) {
    throw Error("invalid-sequence-archive");
  }
  if (data.edits.length > sequenceEditLimit) throw Error("too-many-sequence-edits");
  const edits = data.edits.map(edit);
  if (new Set(edits.map(item => item.id)).size !== edits.length) throw Error("duplicate-sequence-edit");
  const sections = object(data.sections, areas);
  return {
    schema: data.schema, frequencyHz: real(data.frequencyHz, .001, 1e6), sourceVolts: real(data.sourceVolts, 0, 1e6),
    sections: { generator: impedances(sections.generator), line: impedances(sections.line), load: impedances(sections.load) },
    generatorNeutral: neutral(data.generatorNeutral), loadNeutral: neutral(data.loadNeutral), edits,
  };
}

export function readSequenceDocument(text: string): SequenceDocument {
  if (new TextEncoder().encode(text).length > sequenceArchiveBytes) throw Error("sequence-archive-limit");
  return validateSequenceDocument(JSON.parse(text));
}

export function nextSequenceEditId(document: SequenceDocument): string {
  const used = new Set(document.edits.map(item => item.id));
  let candidate = 1;
  while (used.has("E" + candidate)) candidate++;
  return "E" + candidate;
}
