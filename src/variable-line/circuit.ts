import { parts } from "../circuit/drawing";
import { parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import type { CircuitComponent, CircuitTopology, CircuitWire } from "../circuit/topology";
import { defaultVariableLineInput } from "./profiles";

const sourceId = "E1";
const lineId = "TL1";
const sourceResistanceId = "R1";
const loadResistanceId = "R2";
const fixed = new Set([sourceId, lineId, sourceResistanceId, loadResistanceId]);

function documentWithTopology(document: TopologyLabDocument, topology: CircuitTopology) {
  return parseTopologyLabDocument(JSON.stringify({ ...document, topology }));
}

export function newVariableLineCircuit(): TopologyLabDocument {
  const defaults = defaultVariableLineInput();
  const component = (id: string, kind: "r" | "voltage" | "line", parameters: CircuitComponent["parameters"]): CircuitComponent =>
    ({ id, kind, terminals: [id + ":a", id + ":b"], parameters });
  const resistor = (id: string, ohm: number) => component(id, "r", { ...parts.r.parameters, ohm, nextOhm: ohm });
  return parseTopologyLabDocument(JSON.stringify({
    kind: "electrotutor-topology-lab", schemaVersion: 1, observedEndpoints: ["TL1:a", "TL1:b"], attachmentSides: [],
    topology: {
      junctions: [],
      components: [component(sourceId, "voltage", { ...parts.voltage.parameters, voltageV: defaults.sourceVolts }),
        resistor(sourceResistanceId, defaults.sourceOhms),
        component(lineId, "line", { ...parts.line.parameters, lengthM: defaults.lengthMetres }),
        resistor(loadResistanceId, defaults.loadOhms)],
      wires: [
        { id: "W1", from: "E1:a", to: "R1:a" }, { id: "W2", from: "R1:b", to: "TL1:a" },
        { id: "W3", from: "TL1:b", to: "R2:a" }, { id: "W4", from: "R2:b", to: "E1:b" },
      ],
    },
  }));
}

function opposite(wire: CircuitWire, endpoint: string) {
  return wire.from === endpoint ? wire.to : wire.from;
}

function project(document: TopologyLabDocument) {
  const { components, junctions, wires } = document.topology;
  const source = components.find(part => part.id === sourceId);
  if (source?.kind !== "voltage" || junctions.length || wires.length !== components.length) throw Error("variable-circuit");

  const used = new Map<string, CircuitWire>();
  for (const wire of wires) {
    if (used.has(wire.from) || used.has(wire.to)) throw Error("variable-circuit");
    used.set(wire.from, wire);
    used.set(wire.to, wire);
  }
  const byEndpoint = new Map(components.flatMap(part => part.terminals.map(endpoint => [endpoint, part] as const)));
  const visited = new Set([sourceId]);
  const insertionWires: string[] = [];
  let endpoint = source.terminals[0];
  let lineFound = false;
  let sourceBoundaryFound = false;
  let loadBoundaryFound = false;
  let sourceOhms = 0;
  let loadOhms = 0;
  while (true) {
    const wire = used.get(endpoint);
    if (!wire) throw Error("variable-circuit");
    const entry = opposite(wire, endpoint);
    if (entry === source.terminals[1]) break;
    const part = byEndpoint.get(entry);
    if (!part || visited.has(part.id)) throw Error("variable-circuit");
    visited.add(part.id);
    insertionWires.push(wire.id);
    if (part.kind === "line" && part.id === lineId && entry === part.terminals[0]) {
      lineFound = true;
    } else if (part.kind === "r" && part.id !== lineId) {
      const value = Number(part.parameters.ohm);
      if (!Number.isFinite(value) || value <= 0) throw Error("variable-resistance");
      if (lineFound) {
        loadOhms += value;
        loadBoundaryFound ||= part.id === loadResistanceId;
      } else {
        sourceOhms += value;
        sourceBoundaryFound ||= part.id === sourceResistanceId;
      }
    } else throw Error("variable-circuit");
    endpoint = part.terminals[entry === part.terminals[0] ? 1 : 0];
  }
  if (!lineFound || !sourceBoundaryFound || !loadBoundaryFound || visited.size !== components.length) throw Error("variable-circuit");
  return { sourceOhms, loadOhms, insertionWires };
}

export function variableLineBoundaries(document: TopologyLabDocument) {
  const { sourceOhms, loadOhms } = project(document);
  return { sourceOhms, loadOhms };
}

export function variableLineSeriesWires(document: TopologyLabDocument): readonly string[] {
  return project(document).insertionWires;
}

function updatePart(document: TopologyLabDocument, id: string, kind: CircuitComponent["kind"], parameters: CircuitComponent["parameters"]) {
  const topology = document.topology;
  const current = topology.components.find(part => part.id === id);
  if (!current || current.kind !== kind) throw Error("variable-circuit");
  if (Object.entries(parameters).every(([key, value]) => current.parameters[key] === value)) return document;
  return documentWithTopology(document, { ...topology, components: topology.components.map(part => part === current
    ? { ...part, parameters: { ...part.parameters, ...parameters } } : part) });
}

export function setVariableLineResistance(document: TopologyLabDocument, id: string, ohms: number) {
  if (!Number.isFinite(ohms) || ohms <= 0 || ohms > 40_000) throw Error("variable-resistance");
  return updatePart(document, id, "r", { ohm: ohms, nextOhm: ohms });
}

export function setVariableLineSource(document: TopologyLabDocument, volts: number) {
  return updatePart(document, sourceId, "voltage", { voltageV: volts });
}

export function variableLineSourceVolts(document: TopologyLabDocument) {
  return Number(document.topology.components.find(part => part.id === sourceId)?.parameters.voltageV);
}

export function setVariableLineLength(document: TopologyLabDocument, lengthMetres: number) {
  return updatePart(document, lineId, "line", { lengthM: lengthMetres });
}

export function removeVariableLineResistor(document: TopologyLabDocument, id: string) {
  if (fixed.has(id)) return document;
  const topology = document.topology;
  const part = topology.components.find(candidate => candidate.id === id && candidate.kind === "r");
  if (!part) return document;
  const [a, b] = part.terminals;
  const incident = (endpoint: string) => topology.wires.find(wire => wire.from === endpoint || wire.to === endpoint);
  const first = incident(a);
  const second = incident(b);
  if (!first || !second || first === second) throw Error("variable-circuit");
  const joined = { id: first.id, from: opposite(first, a), to: opposite(second, b) };
  const next = documentWithTopology(document, {
    ...topology, components: topology.components.filter(candidate => candidate !== part),
    wires: [...topology.wires.filter(wire => wire !== first && wire !== second), joined],
  });
  project(next);
  return next;
}
