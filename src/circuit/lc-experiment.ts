import { isGroup, readCircuit, type Circuit } from "../models/reactive-two-port";
import { analyzeLcTopology, type LcPortAnalysis } from "../models/reactive-lc-graph";
import { maxCircuitFileBytes, parseCircuit } from "./document";
import { splitReactivePort } from "./reactive-lc-mode";
import { sameLcPortResponse } from "./reactive-lc-simplification";
import { parseTopologyLabDocument, TopologySession, type TopologyLabDocument } from "./topology-session";
import type { TopologySlot } from "./topology-slots";
import { netlist, removeComponent, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";

const treeArchiveFormat = "electrotutor-reactive-two-port-v1";
const treeArchiveByteLimit = 16_000;
const labArchiveKind = "electrotutor-topology-lab";
const port: CircuitComponent = { id: "P1", kind: "port", terminals: ["P1:a", "P1:b"], parameters: {} };
type SeriesSlot = Extract<TopologySlot, { kind: "series" }>;

function labDocument(topology: CircuitTopology): TopologyLabDocument {
  return parseTopologyLabDocument(JSON.stringify({
    kind: labArchiveKind, schemaVersion: 1, topology,
    observedEndpoints: splitReactivePort(topology).port, attachmentSides: [],
  }));
}

function topologyFromTree(circuit: Circuit): CircuitTopology {
  const components = [port];
  const junctions: string[] = [];
  const wires: CircuitWire[] = [];
  const counters = { l: 0, c: 0 };

  function place(node: Circuit, from: string, to: string) {
    if (isGroup(node)) {
      if (node.kind === "parallel") {
        place(node.left, from, to);
        place(node.right, from, to);
      } else {
        const middle = "J" + (junctions.length + 1);
        junctions.push(middle);
        place(node.left, from, middle);
        place(node.right, middle, to);
      }
      return;
    }
    const id = node.kind.toUpperCase() + ++counters[node.kind];
    const terminals = [id + ":a", id + ":b"];
    const parameters: CircuitComponent["parameters"] = node.kind === "l" ? { henry: node.value / 1000, initial: 0 }
      : { farad: node.value / 1_000_000, initial: 0 };
    components.push({ id, kind: node.kind, terminals, parameters });
    wires.push({ id: "W" + (wires.length + 1), from, to: terminals[0] });
    wires.push({ id: "W" + (wires.length + 1), from: terminals[1], to });
  }

  place(circuit, port.terminals[0], port.terminals[1]);
  return { components, junctions, wires };
}

export function newLcExperiment(circuit: Circuit = {
  kind: "series",
  left: { kind: "l", value: 10 },
  right: { kind: "c", value: 100 },
}): TopologyLabDocument {
  return labDocument(topologyFromTree(circuit));
}

export function analyzeLcExperiment(document: TopologyLabDocument): LcPortAnalysis {
  const { topology, port } = splitReactivePort(document.topology);
  return analyzeLcTopology(topology, port);
}

/** Legacy geometry is validated by its reader and then replaced by SVG auto-layout. */
export function readLcExperiment(text: string): TopologyLabDocument {
  const size = new TextEncoder().encode(text).length;
  if (size > maxCircuitFileBytes) throw Error("file-limit");
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object") throw Error("unsupported-version");
  let document: TopologyLabDocument;
  if ("kind" in raw && raw.kind === labArchiveKind) {
    document = parseTopologyLabDocument(text);
    const terminals = splitReactivePort(document.topology).port;
    if (terminals.some(terminal => !document.observedEndpoints.includes(terminal))) {
      document = parseTopologyLabDocument(JSON.stringify({
        ...document, observedEndpoints: [...new Set([...document.observedEndpoints, ...terminals])],
      }));
    }
  } else if ("schema" in raw && raw.schema === treeArchiveFormat) {
    if (size > treeArchiveByteLimit) throw Error("file-limit");
    const circuit = "circuit" in raw ? readCircuit(raw.circuit) : null;
    if (!circuit) throw Error("invalid-lc-value");
    document = labDocument(topologyFromTree(circuit));
  } else {
    document = labDocument(parseCircuit(text).drawing.topology);
  }
  analyzeLcExperiment(document);
  return document;
}

function prepareMove(document: TopologyLabDocument) {
  if (document.topology.components.some(part => (part.parameters.initial ?? 0) !== 0)) {
    throw Error("lc-move-initial-state");
  }
  const before = analyzeLcExperiment(document);
  if (before.kind !== "finite") throw Error("lc-move-equivalence");
  const session = new TopologySession(JSON.stringify(document));
  const slots = session.listSlots().filter((slot): slot is SeriesSlot => slot.kind === "series");
  return { before, session, slots };
}

function tryMove(session: TopologySession, before: LcPortAnalysis, componentId: string, slot: SeriesSlot) {
  session.apply({ type: "move-series-equivalent", slot, componentId, extra: 0 });
  if (!session.canUndo) throw Error("lc-move-noop");
  const next = session.document;
  if (!sameLcPortResponse(before, analyzeLcExperiment(next))) throw Error("lc-move-equivalence");
  return next;
}

export function moveLcExperiment(document: TopologyLabDocument, componentId: string, wireId: string): TopologyLabDocument {
  const { before, session, slots } = prepareMove(document);
  const slot = slots.find(target => target.wireId === wireId);
  if (!slot) throw Error("invalid-series-slot");
  return tryMove(session, before, componentId, slot);
}

export function lcMoveTargets(document: TopologyLabDocument, componentId: string): readonly string[] {
  if (!document.topology.components.some(part => part.id === componentId && part.kind === "l")) return [];
  try {
    const { before, session, slots } = prepareMove(document);
    return slots.flatMap(slot => {
      try {
        tryMove(session, before, componentId, slot);
        return [slot.wireId];
      } catch { return []; }
      finally { session.undo(); }
    });
  } catch { return []; }
}

export function removeLcPart(document: TopologyLabDocument, id: string): TopologyLabDocument {
  const removed = document.topology.components.find(part => part.id === id);
  if (!removed || removed.kind === "port") return document;
  const cut = removeComponent(document.topology, id);
  const junctions = [...cut.junctions, ...removed.terminals.filter(terminal => document.observedEndpoints.includes(terminal))];
  const partNet = new Map(netlist({ ...cut, junctions }).flatMap(net => net.map(endpoint => [endpoint, net[0]] as const)));
  const used = new Set([...partNet.keys(), ...cut.components.map(part => part.id), ...document.topology.wires.map(wire => wire.id)]);
  const wires = [...cut.wires];
  let index = 1;
  for (const originalNet of netlist(document.topology)) {
    if (!removed.terminals.some(endpoint => originalNet.includes(endpoint))) continue;
    const parts = [...new Set(originalNet.flatMap(endpoint => partNet.get(endpoint) ?? []))];
    for (const endpoint of parts.slice(1)) {
      while (used.has("W" + index)) index++;
      const wireId = "W" + index++;
      used.add(wireId);
      wires.push({ id: wireId, from: parts[0], to: endpoint });
    }
  }
  return parseTopologyLabDocument(JSON.stringify({
    ...document, topology: { ...cut, junctions, wires },
    attachmentSides: document.attachmentSides.filter(hint => hint.componentId !== id),
  }));
}
