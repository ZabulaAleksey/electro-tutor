import { readSchematicGeometry, type SchematicGeometry } from "./schematic-geometry";
import { maxCircuitFileBytes } from "./document";
import { optionalPartParameters, parts, validPartParameter, type PartKind } from "./drawing";
import { moveSeriesEquivalent, reduceTopologyRlc } from "./topology-equivalence";
import { createCrossSlot, insertTopologyComponent, listTopologySlots, resolveTopologySlot, type TopologySide, type TopologySlot } from "./topology-slots";
import { validateCircuit, type CircuitComponent, type CircuitTopology } from "./topology";

export type TopologyLabDocument = Readonly<{
  kind: "electrotutor-topology-lab";
  schemaVersion: 1;
  topology: CircuitTopology;
  observedEndpoints: readonly string[];
  geometry?: SchematicGeometry;
  attachmentSides: readonly Readonly<{ componentId: string; side: TopologySide }>[];
}>;

export type TopologyCommand =
  | { type: "insert"; slot: TopologySlot; component: CircuitComponent }
  | { type: "move-series-equivalent"; slot: Extract<TopologySlot, { kind: "series" }>; componentId: string; extra: number };

const historyLimit = 64;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const byId = (a: { id: string }, b: { id: string }) => compare(a.id, b.id);

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function checkBytes(text: string) {
  if (new TextEncoder().encode(text).length > maxCircuitFileBytes) throw Error("file-limit");
}

function checkComponent(part: CircuitComponent) {
  if (!Object.hasOwn(parts, part.kind) || part.terminals.length !== 2) {
    throw Error("unsupported-component");
  }
  const defaults = parts[part.kind as PartKind].parameters as Record<string, unknown>;
  const entries = Object.entries(part.parameters);
  if (Object.keys(defaults).some((key) => !optionalPartParameters.has(key) && !Object.hasOwn(part.parameters, key))
    || entries.some(([key, value]) => !Object.hasOwn(defaults, key) || typeof value !== typeof defaults[key]
      || (typeof value === "number" && !validPartParameter(key, value)))) {
    throw Error("invalid-parameter");
  }
}

function validatedDocument(input: unknown): TopologyLabDocument {
  if (!isRecord(input) || input.kind !== "electrotutor-topology-lab" || input.schemaVersion !== 1) {
    throw Error("unsupported-version");
  }
  const { topology, observedEndpoints, attachmentSides } = input;
  if (Object.keys(input).length !== (Object.hasOwn(input, "geometry") ? 6 : 5) || !Array.isArray(observedEndpoints) || !Array.isArray(attachmentSides)
    || validateCircuit(topology).length) {
    throw Error("invalid-topology-document");
  }
  const graph = topology as CircuitTopology;
  if (graph.components.length > 200 || graph.junctions.length > 400 || graph.wires.length > 800) {
    throw Error("topology-limit");
  }
  if (Object.keys(graph).length !== 3 || graph.wires.some((wire) => Object.keys(wire).length !== 3)
    || graph.components.some((part) => Object.keys(part).length !== 4)) {
    throw Error("invalid-topology-document");
  }
  graph.components.forEach(checkComponent);
  const endpoints = new Set([...graph.junctions, ...graph.components.flatMap((part) => part.terminals)]);
  const componentIds = new Set(graph.components.map(({ id }) => id));
  if (!observedEndpoints.every((id: unknown): id is string => typeof id === "string" && endpoints.has(id))
    || new Set(observedEndpoints).size !== observedEndpoints.length) {
    throw Error("invalid-observations");
  }
  const sides = new Set<string>();
  const hints = (attachmentSides as unknown[]).map((entry) => {
    if (!isRecord(entry) || Object.keys(entry).length !== 2 || typeof entry.componentId !== "string"
      || !componentIds.has(entry.componentId) || sides.has(entry.componentId)
      || (entry.side !== "left" && entry.side !== "right")) {
      throw Error("invalid-attachment-side");
    }
    sides.add(entry.componentId);
    return Object.freeze({ componentId: entry.componentId, side: entry.side });
  });
  const normalizedGraph = Object.freeze({
    components: Object.freeze([...graph.components].sort(byId).map((part) => Object.freeze({
      id: part.id, kind: part.kind, terminals: Object.freeze([...part.terminals]),
      parameters: Object.freeze(Object.fromEntries(Object.entries(part.parameters).sort(([a], [b]) => compare(a, b)))),
    }))),
    junctions: Object.freeze([...graph.junctions].sort(compare)),
    wires: Object.freeze([...graph.wires].sort(byId).map(({ id, from, to }) => Object.freeze({ id, from, to }))),
  });
  const document: TopologyLabDocument = Object.freeze({
    kind: "electrotutor-topology-lab",
    schemaVersion: 1,
    topology: normalizedGraph,
    observedEndpoints: Object.freeze([...observedEndpoints].sort(compare)),
    ...(input.geometry === undefined ? {} : { geometry: readSchematicGeometry(input.geometry, graph) }),
    attachmentSides: Object.freeze(hints.sort((a, b) => compare(a.componentId, b.componentId))),
  });
  checkBytes(JSON.stringify(document, null, 2));
  return document;
}

export function parseTopologyLabDocument(text: string): TopologyLabDocument {
  checkBytes(text);
  return validatedDocument(JSON.parse(text));
}

export class TopologySession {
  #document: TopologyLabDocument;
  #past: TopologyLabDocument[] = [];
  #future: TopologyLabDocument[] = [];

  constructor(text: string) {
    this.#document = parseTopologyLabDocument(text);
  }

  get document() { return this.#document; }
  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }

  listSlots() {
    return listTopologySlots(this.#document.topology, this.#document.observedEndpoints);
  }

  crossSlot(from: string, to: string) {
    return createCrossSlot(this.#document.topology, from, to, this.#document.observedEndpoints);
  }

  reduction() {
    return reduceTopologyRlc(this.#document.topology, this.#document.observedEndpoints);
  }

  apply(command: TopologyCommand) {
    const { topology, observedEndpoints, attachmentSides } = this.#document;
    let next = topology;
    let sides = attachmentSides;
    if (command.type === "insert") {
      next = insertTopologyComponent(topology, command.slot, command.component, observedEndpoints);
      if (command.slot.kind === "parallel") {
        sides = [...sides, { componentId: command.component.id, side: command.slot.side }];
      }
    } else if (command.type === "move-series-equivalent") {
      const target = resolveTopologySlot(topology, command.slot, observedEndpoints);
      if (target.kind !== "series") throw Error("invalid-series-slot");
      next = moveSeriesEquivalent(topology, command.componentId, target.wireId, command.extra, observedEndpoints);
      if (next.wires !== topology.wires) {
        sides = sides.filter(({ componentId }) => componentId !== command.componentId);
      }
    } else {
      throw Error("unsupported-topology-command");
    }

    const updated = validatedDocument({ ...this.#document, topology: next, attachmentSides: sides });
    if (JSON.stringify(updated) === JSON.stringify(this.#document)) return;
    this.#past.push(this.#document);
    if (this.#past.length > historyLimit) this.#past.shift();
    this.#document = updated;
    this.#future = [];
  }

  undo() {
    const previous = this.#past.pop();
    if (!previous) return false;
    this.#future.push(this.#document);
    this.#document = previous;
    return true;
  }

  redo() {
    const next = this.#future.pop();
    if (!next) return false;
    this.#past.push(this.#document);
    this.#document = next;
    return true;
  }

  export() {
    return JSON.stringify(this.#document, null, 2);
  }
}
