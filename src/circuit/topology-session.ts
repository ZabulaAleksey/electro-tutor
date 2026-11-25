import { readExactLcNominal } from "../models/lc-nominal";
import { readSchematicGeometry, type SchematicGeometry } from "./schematic-geometry";
import { maxCircuitFileBytes } from "./document";
import { optionalPartParameters, parts, validPartParameter, type PartKind } from "./drawing";
import { moveSeriesEquivalent, reduceTopologyRlc } from "./topology-equivalence";
import { createCrossSlot, insertTopologyComponent, listTopologySlots, resolveTopologySlot, type TopologySide, type TopologySlot } from "./topology-slots";
import { removeDevicePreservingNets, validateCircuit, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";
import { removeParallelBranch } from "./topology-branch-removal";
import { breakTopologyWire, bypassSeriesDevice, clearTopologyDevices, restoreTopologyWire } from "./topology-operations";

export type TopologyLabDocument = Readonly<{
  kind: "electrotutor-topology-lab";
  schemaVersion: 1 | 2;
  brokenWires?: readonly CircuitWire[];
  topology: CircuitTopology;
  observedEndpoints: readonly string[];
  geometry?: SchematicGeometry;
  attachmentSides: readonly Readonly<{ componentId: string; side: TopologySide }>[];
}>;

export type TopologyCommand =
  | { type: "insert"; slot: TopologySlot; component: CircuitComponent }
  | { type: "move-series-equivalent"; slot: Extract<TopologySlot, { kind: "series" }>; componentId: string; extra: number }
  | { type: "remove"; componentId: string; mode: "device" | "branch" | "conductor"; protectedEndpoints?: readonly string[]; preserveObservations?: boolean; allowPortShort?: boolean }
  | { type: "break-wire" | "restore-wire"; wireId: string }
  | { type: "clear"; retainedIds: readonly string[] };

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
  const fourTerminalLine = part.kind === "line" && part.terminals.length === 4
    && ["a", "b", "return-in", "return-out"].every((role, index) => part.terminals[index] === part.id + ":" + role);
  if (!Object.hasOwn(parts, part.kind) || (part.terminals.length !== 2 && !fourTerminalLine)) {
    throw Error("unsupported-component");
  }
  const defaults = parts[part.kind as PartKind].parameters as Record<string, unknown>;
  readExactLcNominal(part);
  const entries = Object.entries(part.parameters).filter(([key]) => key !== "lcExact");
  if (Object.keys(defaults).some((key) => !optionalPartParameters.has(key) && !Object.hasOwn(part.parameters, key))
    || entries.some(([key, value]) => !Object.hasOwn(defaults, key) || typeof value !== typeof defaults[key]
      || (typeof value === "number" && !validPartParameter(key, value)))) {
    throw Error("invalid-parameter");
  }
}

function normalizedOpenWires(input: Record<string, unknown>, graph: CircuitTopology): CircuitWire[] {
  if (input.schemaVersion === 1) return [];
  const stored = input.brokenWires;
  if (!Array.isArray(stored) || !stored.length || stored.length + graph.wires.length > 800) {
    throw Error("invalid-broken-wires");
  }
  const opened = (stored as unknown[]).map(item => {
    if (!isRecord(item) || Object.keys(item).length !== 3
      || typeof item.id !== "string" || typeof item.from !== "string" || typeof item.to !== "string") {
      throw Error("invalid-broken-wire");
    }
    return { id: item.id, from: item.from, to: item.to };
  });
  if (validateCircuit({ ...graph, wires: [...graph.wires, ...opened] }).length) throw Error("invalid-broken-wire");
  return opened.sort(byId);
}

// Insertion into a live graph can allocate the numeric ID of a broken wire.
// Keep reserved IDs with their breaks until the original wire is restored or removed.
export function avoidReservedWireIds(document: TopologyLabDocument, graph: CircuitTopology): CircuitTopology {
  if (!document.brokenWires?.length) return graph;
  const reserved = new Set(document.brokenWires.map(wire => wire.id));
  if (!graph.wires.some(wire => reserved.has(wire.id))) return graph;
  const used = new Set([
    ...reserved, ...graph.wires.map(wire => wire.id), ...graph.junctions,
    ...graph.components.flatMap(part => [part.id, ...part.terminals]),
  ]);
  let number = 1;
  const wires = graph.wires.map(wire => {
    if (!reserved.has(wire.id)) return wire;
    while (used.has("W" + number)) number++;
    const id = "W" + number++;
    used.add(id);
    return { ...wire, id };
  });
  return { ...graph, wires };
}

function validatedDocument(input: unknown): TopologyLabDocument {
  if (!isRecord(input) || input.kind !== "electrotutor-topology-lab" || (input.schemaVersion !== 1 && input.schemaVersion !== 2)) {
    throw Error("unsupported-version");
  }
  const { topology, observedEndpoints, attachmentSides } = input;
  const fields = ["kind", "schemaVersion", "topology", "observedEndpoints", "attachmentSides", "geometry"];
  if (input.schemaVersion === 2) fields.push("brokenWires");
  if (Object.keys(input).some(key => !fields.includes(key)) || !Array.isArray(observedEndpoints) || !Array.isArray(attachmentSides)
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
  const opened = normalizedOpenWires(input, graph);
  const drawingGraph = opened.length ? { ...graph, wires: [...graph.wires, ...opened] } : graph;
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
    schemaVersion: input.schemaVersion,
    topology: normalizedGraph,
    ...(opened.length ? { brokenWires: Object.freeze(opened.map(wire => Object.freeze(wire))) } : {}),
    observedEndpoints: Object.freeze([...observedEndpoints].sort(compare)),
    ...(input.geometry === undefined ? {} : { geometry: readSchematicGeometry(input.geometry, drawingGraph) }),
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
    let opened = this.#document.brokenWires ?? [];
    let geometry = this.#document.geometry;
    if (command.type === "insert") {
      next = avoidReservedWireIds(this.#document, insertTopologyComponent(topology, command.slot, command.component, observedEndpoints));
      if (command.slot.kind === "parallel") {
        sides = [...sides, { componentId: command.component.id, side: command.slot.side }];
      }
    } else if (command.type === "move-series-equivalent") {
      const target = resolveTopologySlot(topology, command.slot, observedEndpoints);
      if (target.kind !== "series") throw Error("invalid-series-slot");
      next = avoidReservedWireIds(this.#document, moveSeriesEquivalent(topology, command.componentId, target.wireId, command.extra, observedEndpoints));
      if (next.wires !== topology.wires) {
        sides = sides.filter(({ componentId }) => componentId !== command.componentId);
      }
    } else if (command.type === "remove") {
      const removed = topology.components.find(part => part.id === command.componentId);
      if (!removed) return;
      const observed = command.preserveObservations ? observedEndpoints : [];
      const reserved = opened.map(wire => wire.id);
      if (command.mode === "conductor") {
        next = bypassSeriesDevice(topology, command.componentId, command.protectedEndpoints ?? observedEndpoints, command.allowPortShort);
      } else if (command.mode === "branch") {
        next = removeParallelBranch(topology, command.componentId, observedEndpoints, reserved);
      } else {
        next = removeDevicePreservingNets(topology, command.componentId, observed, reserved);
      }
      const survivingIds = new Set(next.components.map(({ id }) => id));
      sides = sides.filter(({ componentId }) => survivingIds.has(componentId));
      // After a deletion compact the active chain without the cached gap left by the device.
      geometry = undefined;
    } else if (command.type === "break-wire") {
      const cut = breakTopologyWire(topology, command.wireId);
      next = cut.topology;
      opened = [...opened, cut.wire];
    } else if (command.type === "restore-wire") {
      const wire = opened.find(item => item.id === command.wireId);
      if (!wire) throw Error("unknown-broken-wire");
      next = restoreTopologyWire(topology, wire);
      opened = opened.filter(item => item.id !== wire.id);
    } else if (command.type === "clear") {
      next = clearTopologyDevices(topology, command.retainedIds);
      sides = [];
      opened = [];
      geometry = undefined;
    } else {
      throw Error("unsupported-topology-command");
    }

    const endpoints = new Set([...next.junctions, ...next.components.flatMap(part => part.terminals)]);
    opened = opened.filter(wire => endpoints.has(wire.from) && endpoints.has(wire.to));
    const updated = validatedDocument({
      kind: this.#document.kind,
      schemaVersion: opened.length ? 2 : 1,
      topology: next,
      observedEndpoints: observedEndpoints.filter(endpoint => endpoints.has(endpoint)),
      attachmentSides: sides,
      ...(geometry ? { geometry } : {}),
      ...(opened.length ? { brokenWires: opened } : {}),
    });
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
