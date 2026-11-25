import { appendSectionGeometry } from "../circuit/schematic-geometry";
import { parts } from "../circuit/drawing";
import { parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import { netlist, removeDevicePreservingNets, type CircuitComponent, type CircuitTopology } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { lineArchiveByteLimit, lineArchiveSize } from "./line-archive-document";
import { DEFAULT_NETWORK, MAX_SECTIONS, inputContact, validateNetwork, type Network } from "./network";

export type LineObservation = { xM: number; timeS: number };
export type LineExperiment = {
  kind: "electrotutor-line-experiment";
  schemaVersion: 1;
  circuit: TopologyLabDocument;
  durationS: number;
  selectedSection: string | null;
  observations: Record<string, LineObservation>;
};

const durationValid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 1e-9 && value <= 10;

export function newLineExperiment(): LineExperiment {
  const topology: CircuitTopology = {
    junctions: [],
    components: [
      { id: "E1", kind: "voltage", terminals: ["E1:a", "E1:b"], parameters: { ...parts.voltage.parameters } },
      { id: "K1", kind: "switch", terminals: ["K1:a", "K1:b"], parameters: { ...parts.switch.parameters, closed: false, closes: true } },
      { id: "TL1", kind: "line", terminals: ["TL1:a", "TL1:b"], parameters: { ...parts.line.parameters, lengthM: 1e6 } },
      { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { ...parts.c.parameters } },
    ],
    wires: [
      { id: "W1", from: "E1:a", to: "K1:a" },
      { id: "W2", from: "K1:b", to: "TL1:a" },
      { id: "W3", from: "TL1:b", to: "C1:a" },
      { id: "W4", from: "C1:b", to: "E1:b" },
    ],
  };
  return {
    kind: "electrotutor-line-experiment",
    schemaVersion: 1,
    circuit: parseTopologyLabDocument(JSON.stringify({
      kind: "electrotutor-topology-lab", schemaVersion: 1, topology, observedEndpoints: [], attachmentSides: [],
    })),
    durationS: DEFAULT_NETWORK.durationS,
    selectedSection: null,
    observations: {},
  };
}

function projectExperiment(circuit: TopologyLabDocument, durationS: number) {
  const topology = circuit.topology;
  const source = topology.components.find(part => part.kind === "current" || part.kind === "voltage");
  const sourceNet = source && netlist(topology).find(net => net.includes(source.terminals[0]));
  const contacts = topology.components.filter(part => part !== source && part.terminals.some(id => sourceNet?.includes(id)));
  const contact = contacts.length === 1 && contacts[0].kind === "switch" ? contacts[0] : undefined;
  const closes = contact?.parameters.closed === false && contact.parameters.closes === true;
  const closeS = typeof contact?.parameters.atS === "number" ? contact.parameters.atS : 0;
  // Before turn-on, a zero ideal current source is an open circuit as seen at
  // the line port. Closing its isolated contact in the solver projection and
  // delaying the current preserves that boundary without a reactive live event.
  // With initially unenergized storage and just one source, delaying an EMF
  // step until the contact closes also gives an identically zero prehistory.
  const coldVoltage = source?.kind === "voltage" && topology.components.every(part =>
    !(part.kind === "l" || part.kind === "c") || !part.parameters.initial);
  const projectClosedInput = closes && (closeS === 0 || source?.kind === "current" || coldVoltage);
  const projected = projectClosedInput ? {
    ...topology,
    components: topology.components.map(part => part === contact
      ? { ...part, parameters: { ...part.parameters, closed: true, atS: 0 } } : part),
  } : topology;
  const converted = transmissionCircuitAdapter.convert(projected);
  const model = { ...converted.model, durationS, source: { ...converted.model.source } };
  const input = inputContact(model);
  if (projectClosedInput && input?.id === contact?.id) {
    model.source.onS = Math.max(model.source.onS, closeS);
  } else if (input?.switch?.closed === false && input.switch.atS === undefined && model.source.currentA) {
    throw Error("inconsistent-ideal-current-source-and-open-switch");
  }
  const errors = validateNetwork(model);
  if (errors.length) throw Error(errors.join("; "));
  return { ...converted, model };
}

export function lineExperimentModel(circuit: TopologyLabDocument, durationS: number): Network {
  return projectExperiment(circuit, durationS).model;
}

export function appendExperimentSection(circuit: TopologyLabDocument, durationS = DEFAULT_NETWORK.durationS): TopologyLabDocument {
  const { model, resultPolarity } = projectExperiment(circuit, durationS);
  if (model.sections.length >= MAX_SECTIONS) throw Error("line-section-limit");
  const last = model.sections.at(-1)!;
  const topology = circuit.topology;
  const lastPart = topology.components.find(({ id }) => id === last.id)!;
  const outlet = lastPart.terminals[resultPolarity.get(last.id) === -1 ? 0 : 1];
  const used = new Set([
    ...(circuit.brokenWires ?? []).map(wire => wire.id),
    ...topology.junctions,
    ...topology.wires.map(({ id }) => id),
    ...topology.components.flatMap(({ id, terminals }) => [id, ...terminals]),
  ]);
  let index = 1;
  while (["TL" + index, "TL" + index + ":a", "TL" + index + ":b"].some(id => used.has(id))) index++;
  const id = "TL" + index;
  let wireIndex = 1;
  while (used.has("W" + wireIndex)) wireIndex++;
  const part: CircuitComponent = { id, kind: "line", terminals: [id + ":a", id + ":b"], parameters: lastPart.parameters };
  const wires = topology.wires.map(wire => ({
    ...wire,
    from: wire.from === outlet ? part.terminals[1] : wire.from,
    to: wire.to === outlet ? part.terminals[1] : wire.to,
  }));
  wires.push({ id: "W" + wireIndex, from: outlet, to: part.terminals[0] });
  const next = { ...topology, components: [...topology.components, part], wires };
  const inlet = lastPart.terminals.find(terminal => terminal !== outlet)!;
  const geometry = appendSectionGeometry(circuit.geometry, inlet, outlet, part.terminals, next);
  return parseTopologyLabDocument(JSON.stringify({ ...circuit, topology: next, geometry }));
}

export function removeExperimentPart(circuit: TopologyLabDocument, id: string): TopologyLabDocument {
  const removed = circuit.topology.components.find(part => part.id === id);
  if (!removed) return circuit;
  return parseTopologyLabDocument(JSON.stringify({
    ...circuit,
    topology: removeDevicePreservingNets(circuit.topology, id),
    observedEndpoints: circuit.observedEndpoints.filter(endpoint => !removed.terminals.includes(endpoint)),
    attachmentSides: circuit.attachmentSides.filter(hint => hint.componentId !== id),
  }));
}

export function observationAt(experiment: LineExperiment, id: string): LineObservation {
  const section = experiment.circuit.topology.components.find(part => part.id === id && part.kind === "line");
  const lengthM = Number(section?.parameters.lengthM ?? 0);
  const saved = Object.hasOwn(experiment.observations, id) ? experiment.observations[id] : undefined;
  return {
    xM: Math.min(lengthM, saved?.xM ?? lengthM / 4),
    timeS: Math.min(experiment.durationS, saved?.timeS ?? 0),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readLineExperiment(text: string): LineExperiment {
  if (lineArchiveSize(text) > lineArchiveByteLimit) throw Error("line-experiment-file-limit");
  const entry: unknown = JSON.parse(text);
  if (!isRecord(entry) || entry.kind !== "electrotutor-line-experiment" || entry.schemaVersion !== 1 ||
      !durationValid(entry.durationS) || !isRecord(entry.observations)) throw Error("line-experiment-version");
  const circuit = parseTopologyLabDocument(JSON.stringify(entry.circuit));
  const sections = new Map(circuit.topology.components.filter(part => part.kind === "line")
    .map(part => [part.id, Number(part.parameters.lengthM)]));
  if (entry.selectedSection !== null &&
      (typeof entry.selectedSection !== "string" || !sections.has(entry.selectedSection))) {
    throw Error("line-experiment-section");
  }
  const durationS = entry.durationS;
  const observations = Object.fromEntries(Object.entries(entry.observations).map(([id, value]) => {
    const length = sections.get(id);
    if (length === undefined || !isRecord(value)
        || typeof value.xM !== "number" || typeof value.timeS !== "number"
        || !Number.isFinite(value.xM) || !Number.isFinite(value.timeS)
        || value.xM < 0 || value.xM > length || value.timeS < 0 || value.timeS > durationS) {
      throw Error("line-experiment-observation");
    }
    return [id, { xM: value.xM, timeS: value.timeS }];
  }));
  return { kind: entry.kind, schemaVersion: 1, circuit, durationS, selectedSection: entry.selectedSection, observations };
}
