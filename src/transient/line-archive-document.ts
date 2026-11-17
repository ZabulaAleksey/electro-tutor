import { reduceRlc, type RlcEquivalent } from "../circuit/rlc-reduction";
import { emptyDrawing } from "../circuit/drawing";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "../circuit/document";
import { circuitToArchivedNetwork, isArchivedCircuit, networkToCircuit, preserveArchivedPositions } from "./circuit-archive";
import type { Layout } from "./NetworkEditor";
import { contactsOf, DEFAULT_NETWORK, hasLineLoss, inputContact, validateNetwork, type Network } from "./network";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { readDetached, type DetachedPart } from "./network-edit";
import { readInkDocument } from "./network-ink";

export const lineArchiveByteLimit = 320_000;
export const lineArchiveSize = (text: string) => new TextEncoder().encode(text).byteLength;
const versions = ["electrotutor-line-v2", "electrotutor-line-v3", "electrotutor-line-v4", "electrotutor-line-v5"];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
}

export function sameNetwork(a: Network, b: Network): boolean {
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}

export function readLayout(input: unknown): Layout {
  if (!object(input)) return {};
  const entries = Object.entries(input).filter((entry): entry is [string, number] => {
    const [id, value] = entry;
    return /^@?[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id) && typeof value === "number" &&
      Number.isFinite(value) && Math.abs(value) <= 1e6;
  });
  return Object.fromEntries(entries);
}

export function requiresV4(model: Network): boolean {
  return model.load.kind === "diode" ||
    contactsOf(model).some(link => link.resistanceOhm === undefined && !link.switch);
}

export function isLineArchiveGraph(text: string): boolean {
  return isArchivedCircuit(parseCircuit(text).drawing);
}

type LineCircuitAnalysis = {
  model: Network;
  equivalents: ReadonlyMap<string, RlcEquivalent>;
  resultPolarity: ReadonlyMap<string, 1 | -1>;
};

export function analyzeLineCircuit(text: string, acceptedModel?: Network): LineCircuitAnalysis {
  const { drawing } = parseCircuit(text);
  if (isArchivedCircuit(drawing)) {
    return { model: circuitToArchivedNetwork(drawing), equivalents: new Map(), resultPolarity: new Map() };
  }
  const matches = (model: Network) => acceptedModel && sameNetwork({ ...model, durationS: acceptedModel.durationS }, acceptedModel);
  const reduce = (): LineCircuitAnalysis => {
    const { topology } = drawing;
    const reduced = reduceRlc(topology);
    if (!reduced.ok) throw Error("inconsistent-initial-state:" + reduced.conflict.components.join(","));
    try {
      const { model, resultPolarity } = transmissionCircuitAdapter.convert(reduced.topology);
      return { model, resultPolarity, equivalents: reduced.equivalents };
    } catch (error) {
      // An equivalent can exceed the solver limits even when its members fit.
      if (!reduced.equivalents.size || !/component-out-of-range|invalid-component/.test(String(error))) throw error;
      const { model, resultPolarity } = transmissionCircuitAdapter.convert(topology);
      return { model, resultPolarity, equivalents: new Map() };
    }
  };
  if (!acceptedModel) return reduce();

  let current: LineCircuitAnalysis | undefined;
  let diagnostic: unknown;
  try {
    current = reduce();
    if (matches(current.model)) return current;
  } catch (error) {
    diagnostic = error;
  }
  // Retain a saved result from versions that had neither physical RLC
  // reduction nor L/C initial conditions in the free-graph adapter.
  const { topology } = drawing;
  try {
    const legacy = transmissionCircuitAdapter.convert({
      ...topology,
      components: topology.components.map(component => {
        if (component.kind !== "l" && component.kind !== "c" || !Object.hasOwn(component.parameters, "initial")) return component;
        const parameters = { ...component.parameters };
        delete parameters.initial;
        return { ...component, parameters };
      }),
    });
    if (matches(legacy.model)) return { model: legacy.model, resultPolarity: new Map(), equivalents: new Map() };
  } catch {
    // Only a graph that exactly reproduces the saved result is accepted.
  }
  if (current) return current;
  throw diagnostic;
}

export function decodeLineCircuit(text: string): Network {
  return analyzeLineCircuit(text).model;
}

export function matchesLineCircuit(text: string, model: Network): boolean {
  try {
    return sameNetwork({ ...analyzeLineCircuit(text, model).model, durationS: model.durationS }, model);
  } catch {
    return false;
  }
}

export function readLineArchive(text: string, draft = false) {
  if (lineArchiveSize(text) > lineArchiveByteLimit) throw Error("file-limit");
  const input: unknown = JSON.parse(text);
  if (!object(input)) throw Error("schema");
  const version = draft ? 5 : versions.indexOf(String(input.schema)) + 2;
  if (version < 2) throw Error("schema");
  const errors = validateNetwork(input.model);
  if (errors.length) throw Error(errors.join("; "));
  const archived = input.model as Network;
  if (version < 5 && (inputContact(archived) || archived.source.currentA !== undefined || hasLineLoss(archived) || contactsOf(archived).some(link => link.component)) ||
      version === 2 && contactsOf(archived).length || version < 4 && requiresV4(archived)) {
    throw Error("schema");
  }
  const empty = version === 5 && input.empty === true;
  const model = empty ? structuredClone(DEFAULT_NETWORK) : archived;
  const layout = readLayout(input.layout);
  const detached = version === 5 ? readDetached(input.detached) : [];
  const { ink, links: inkLinks } = version === 5 ? readInkDocument(input.ink, input.inkLinks, model, detached, empty)
    : { ink: [], links: [] };
  let existing: string | undefined;
  if (typeof input.circuit === "string") {
    if (!empty && matchesLineCircuit(input.circuit, model)) {
      existing = input.circuit;
    } else if (draft || input.schema === "electrotutor-line-v5") {
      try {
        parseCircuit(input.circuit);
        existing = input.circuit;
      } catch {
        // Older drafts may have optional editor data that cannot be read.
      }
    }
  }
  const circuit = existing ?? serializeLineCircuit(model, layout, detached, empty);
  // Confirm that geometry is usable before changing the editor or Worker.
  if (!existing) parseCircuit(circuit);
  return { model, layout, detached, ink, inkLinks, empty, circuit };
}


export function serializeLineCircuit(model: Network, layout: Layout, detached: DetachedPart[], empty: boolean, previous?: string): string {
  const drawing = empty ? emptyDrawing() : networkToCircuit(model, layout, detached);
  if (previous && !empty) {
    const prior = parseCircuit(previous);
    return serializeCircuit(preserveArchivedPositions(drawing, prior.drawing), prior.settings, prior.title);
  }
  return serializeCircuit(drawing, defaultCircuitSettings);
}
