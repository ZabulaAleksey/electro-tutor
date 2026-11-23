import { appendSectionGeometry } from "../circuit/schematic-geometry";
import { parts } from "../circuit/drawing";
import { netlist, removeDevicePreservingNets, type CircuitComponent, type CircuitTopology } from "../circuit/topology";
import { parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import type { DistributedParameters, SteadyExperimentSettings } from "./experiment-solver";

export type SteadyExperiment = {
  circuit: TopologyLabDocument;
  settings: SteadyExperimentSettings;
};

const initialDistribution: DistributedParameters = { rOhmM: 0, lHenryM: 2.5e-7, gSiemensM: 0, cFaradM: 1e-10 };
const twoTerminals = (id: string) => [id + ":a", id + ":b"];

export function newSteadyExperiment(): SteadyExperiment {
  const circuit = parseTopologyLabDocument(JSON.stringify({
    kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology: {
      junctions: [],
      components: [
        { id: "E1", kind: "voltage", terminals: twoTerminals("E1"), parameters: { ...parts.voltage.parameters, voltageV: 50 } },
        { id: "TL1", kind: "line", terminals: twoTerminals("TL1"), parameters: { ...parts.line.parameters } },
        { id: "R1", kind: "r", terminals: twoTerminals("R1"), parameters: { ...parts.r.parameters, ohm: 50 } },
      ],
      wires: [
        { id: "W1", from: "E1:a", to: "TL1:a" },
        { id: "W2", from: "TL1:b", to: "R1:a" },
        { id: "W3", from: "R1:b", to: "E1:b" },
      ],
    },
    observedEndpoints: [], attachmentSides: [],
  }));
  return { circuit, settings: {
    frequencyHz: 1000, referenceEndpoint: "E1:b", sourcePhases: { E1: 0 }, lineParameters: { TL1: initialDistribution },
  } };
}

function identifiers(net: CircuitTopology) {
  return new Set([...net.junctions, ...net.wires.map(({ id }) => id), ...net.components.flatMap(({ id, terminals }) => [id, ...terminals])]);
}

function nextWireId(used: Set<string>) {
  let index = 1;
  while (used.has("W" + index)) index++;
  const id = "W" + index;
  used.add(id);
  return id;
}

export function updateSteadyCircuit(previous: SteadyExperiment, circuit: TopologyLabDocument): SteadyExperiment {
  if (circuit === previous.circuit) return previous;
  const oldSettings = previous.settings;
  const { components, junctions } = circuit.topology;
  const endpoints = new Set([...junctions, ...components.flatMap(part => part.terminals)]);
  const oldReference = oldSettings.referenceEndpoint;
  const oldReferenceNet = endpoints.has(oldReference) ? undefined : netlist(previous.circuit.topology).find(net => net.includes(oldReference));
  const referenceEndpoint = endpoints.has(oldReference) ? oldReference
    : oldReferenceNet?.find(endpoint => endpoints.has(endpoint)) ?? components.find(part => part.kind === "voltage" || part.kind === "current")?.terminals[1]
      ?? endpoints.values().next().value ?? "";
  return { circuit, settings: {
    frequencyHz: oldSettings.frequencyHz,
    referenceEndpoint,
    sourcePhases: Object.fromEntries(components.filter(({ kind }) => kind === "voltage" || kind === "current")
      .map(({ id }) => [id, oldSettings.sourcePhases[id] ?? 0])),
    lineParameters: Object.fromEntries(components.filter(({ kind }) => kind === "line")
      .map(({ id }) => [id, oldSettings.lineParameters[id] ?? initialDistribution])),
  } };
}

export function updateSteadyPart(previous: SteadyExperiment, id: string, parameter: string, value: number): SteadyExperiment {
  const topology = previous.circuit.topology;
  const part = topology.components.find(candidate => candidate.id === id);
  if (!part || part.parameters[parameter] === value) return previous;
  const circuit = parseTopologyLabDocument(JSON.stringify({
    ...previous.circuit,
    topology: { ...topology, components: topology.components.map(candidate =>
      candidate === part ? { ...part, parameters: { ...part.parameters, [parameter]: value } } : candidate) },
  }));
  return { ...previous, circuit };
}

export function appendSteadyLine(previous: SteadyExperiment, outlet: string): SteadyExperiment {
  const { circuit } = previous;
  const topology = circuit.topology;
  const lines = topology.components.filter(part => part.kind === "line");
  const anchor = lines.find(part => part.terminals.includes(outlet));
  if (!anchor) return previous;
  const used = identifiers(topology);
  let count = 1;
  while (["TL" + count, ...twoTerminals("TL" + count)].some(key => used.has(key))) count++;
  const nextId = "TL" + count;
  const terminals = twoTerminals(nextId);
  const part: CircuitComponent = { id: nextId, kind: "line", terminals, parameters: anchor.parameters };
  const wires = topology.wires.map(wire => ({
    ...wire,
    from: wire.from === outlet ? terminals[1] : wire.from,
    to: wire.to === outlet ? terminals[1] : wire.to,
  }));
  wires.push({ id: nextWireId(used), from: outlet, to: terminals[0] });
  const graph = { ...topology, components: [...topology.components, part], wires };
  const inlet = anchor.terminals.find(terminal => terminal !== outlet)!;
  const geometry = appendSectionGeometry(circuit.geometry, inlet, outlet, terminals, graph);
  const next = parseTopologyLabDocument(JSON.stringify({ ...circuit, topology: graph, geometry }));
  const updated = updateSteadyCircuit(previous, next);
  const distribution = previous.settings.lineParameters[anchor.id];
  return distribution ? { ...updated, settings: {
    ...updated.settings, lineParameters: { ...updated.settings.lineParameters, [nextId]: distribution },
  } } : updated;
}

export function removeSteadyPart(previous: SteadyExperiment, id: string): SteadyExperiment {
  const { circuit } = previous;
  const removed = circuit.topology.components.find(part => part.id === id);
  if (!removed) return previous;
  const topology = removeDevicePreservingNets(circuit.topology, id);
  const next = parseTopologyLabDocument(JSON.stringify({
    ...circuit, topology,
    observedEndpoints: circuit.observedEndpoints.filter(key => !removed.terminals.includes(key)),
    attachmentSides: circuit.attachmentSides.filter(hint => hint.componentId !== id),
  }));
  return updateSteadyCircuit(previous, next);
}
