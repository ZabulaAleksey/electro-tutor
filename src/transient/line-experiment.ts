import { appendSectionGeometry } from "../circuit/schematic-geometry";
import { parts, type Point } from "../circuit/drawing";
import { parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import { netlist, removeDevicePreservingNets, type CircuitComponent, type CircuitTopology, type CircuitWire } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { lineArchiveByteLimit, lineArchiveSize } from "./line-archive-document";
import { DEFAULT_NETWORK, MAX_SECTIONS, inputContact, loadLeaves, validateNetwork, type Load, type Network } from "./network";

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

const lineTerminals = (id: string, physical: boolean) => physical
  ? [id + ":a", id + ":b", id + ":return-in", id + ":return-out"]
  : [id + ":a", id + ":b"];

export function newLineExperiment(): LineExperiment {
  const topology: CircuitTopology = {
    junctions: [],
    components: [
      { id: "E1", kind: "voltage", terminals: ["E1:a", "E1:b"], parameters: { ...parts.voltage.parameters } },
      { id: "K1", kind: "switch", terminals: ["K1:a", "K1:b"], parameters: { ...parts.switch.parameters, closed: false, closes: true } },
      { id: "TL1", kind: "line", terminals: lineTerminals("TL1", true), parameters: { ...parts.line.parameters, lengthM: 1e6 } },
      { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { ...parts.c.parameters } },
    ],
    wires: [
      { id: "W1", from: "E1:a", to: "K1:a" },
      { id: "W2", from: "K1:b", to: "TL1:a" },
      { id: "W3", from: "TL1:b", to: "C1:a" },
      { id: "W4", from: "C1:b", to: "TL1:return-out" },
      { id: "W5", from: "E1:b", to: "TL1:return-in" },
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
  if (projectClosedInput && (converted.foldedInputSwitchId ?? input?.id) === contact?.id) {
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

function finalLine(circuit: TopologyLabDocument, { model, resultPolarity }: ReturnType<typeof projectExperiment>) {
  const section = model.sections.at(-1)!;
  const part = circuit.topology.components.find(({ id }) => id === section.id)!;
  const reversed = resultPolarity.get(section.id) === -1;
  return {
    section, part,
    inlet: part.terminals[reversed ? 1 : 0],
    outlet: part.terminals[reversed ? 0 : 1],
    returnOutlet: part.terminals.length === 4 ? part.terminals[reversed ? 2 : 3] : undefined,
  };
}

function allocatedIds(circuit: TopologyLabDocument, additionalWires: readonly CircuitWire[] = []) {
  const graph = circuit.topology;
  const used = new Set([
    ...[...(circuit.brokenWires ?? []), ...additionalWires].map(wire => wire.id), ...graph.junctions,
    ...graph.wires.map(wire => wire.id), ...graph.components.flatMap(part => [part.id, ...part.terminals]),
  ]);
  return (prefix: string, terminals: (id: string) => readonly string[] = () => []) => {
    let index = 1;
    while ([prefix + index, ...terminals(prefix + index)].some(id => used.has(id))) index++;
    const id = prefix + index;
    for (const key of [id, ...terminals(id)]) used.add(key);
    return id;
  };
}

function lastPhysicalSection(circuit: TopologyLabDocument, sections: readonly CircuitComponent[]) {
  const { topology } = circuit;
  const sources = topology.components.filter(part => part.kind === "voltage" || part.kind === "current");
  if (sources.length !== 1) throw Error("ambiguous-line-append");
  const membership = new Map(netlist(topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  const remaining = new Set(sections);
  let reference = membership.get(sources[0].terminals[1]);
  const visited = new Set([reference]);
  let last: { part: CircuitComponent; inlet: string; outlet: string; returnOutlet: string } | undefined;
  while (remaining.size) {
    const choices = [...remaining].filter(part => part.terminals.slice(2).some(terminal => membership.get(terminal) === reference));
    if (choices.length !== 1) throw Error("ambiguous-line-append");
    const part = choices[0];
    const reversed = membership.get(part.terminals[3]) === reference;
    const returnOutlet = part.terminals[reversed ? 2 : 3];
    reference = membership.get(returnOutlet);
    if (visited.has(reference)) throw Error("ambiguous-line-append");
    visited.add(reference);
    remaining.delete(part);
    last = { part, inlet: part.terminals[reversed ? 1 : 0], outlet: part.terminals[reversed ? 0 : 1], returnOutlet };
  }
  if (!last) throw Error("ambiguous-line-append");
  return last;
}

export function appendExperimentSection(circuit: TopologyLabDocument, durationS = DEFAULT_NETWORK.durationS): TopologyLabDocument {
  const sections = circuit.topology.components.filter(part => part.kind === "line");
  if (sections.length >= MAX_SECTIONS) throw Error("line-section-limit");
  // Physical return pairs order an editable cascade even if, for example, the
  // source has a valid impedance chain outside the transient solver's scope.
  const physical = sections.length > 0 && sections.every(part => part.terminals.length === 4);
  const { part, inlet, outlet, returnOutlet } = physical ? lastPhysicalSection(circuit, sections)
    : finalLine(circuit, projectExperiment(circuit, durationS));
  const allocate = allocatedIds(circuit);
  const terminals = (id: string) => lineTerminals(id, returnOutlet !== undefined);
  const id = allocate("TL", terminals);
  const appended: CircuitComponent = { id, kind: "line", terminals: terminals(id), parameters: part.parameters };
  const replacement = new Map([[outlet, appended.terminals[1]]]);
  if (returnOutlet !== undefined) replacement.set(returnOutlet, appended.terminals[3]);
  const rewire = (wire: CircuitWire): CircuitWire => ({
    ...wire,
    from: replacement.get(wire.from) ?? wire.from,
    to: replacement.get(wire.to) ?? wire.to,
  });
  const topology = circuit.topology;
  const wires = topology.wires.map(rewire);
  const opened = circuit.brokenWires?.map(rewire);
  wires.push({ id: allocate("W"), from: outlet, to: appended.terminals[0] });
  if (returnOutlet !== undefined) {
    wires.push({ id: allocate("W"), from: returnOutlet, to: appended.terminals[2] });
  }
  const next = { ...topology, components: [...topology.components, appended], wires };
  const drawing = { ...next, wires: [...wires, ...(opened ?? [])] };
  const geometry = appendSectionGeometry(circuit.geometry, inlet, outlet, appended.terminals, drawing, returnOutlet);
  return parseTopologyLabDocument(JSON.stringify({ ...circuit, topology: next, brokenWires: opened, geometry }));
}

export type LineExperimentTermination = "matched" | "short" | "open";

function terminalDeviceIds(circuit: TopologyLabDocument, model: Network, outlet: string, returnOutlet?: string) {
  const loadIds = new Set(loadLeaves(model.load).map(part => part.id));
  if (returnOutlet === undefined) return loadIds;
  const topology = circuit.topology;
  // The model omits a load that is open at one lead. Include the attached
  // devices from its explicit port pair, also following an archived break.
  const nets = netlist({ ...topology, wires: [...topology.wires, ...(circuit.brokenWires ?? [])] });
  const membership = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
  const stationDeviceIds = new Set([...(model.branches ?? []), ...(model.series ?? [])].map(part => part.id));
  const stations = (part: CircuitComponent) => part.kind === "line" || part.kind === "current" || part.kind === "voltage";
  const upstream = new Set(topology.components.filter(stations).flatMap(part => part.terminals)
    .filter(terminal => terminal !== outlet && terminal !== returnOutlet).map(terminal => membership.get(terminal)));
  const devices = topology.components.filter(part => !stations(part) && !stationDeviceIds.has(part.id));
  const reachable = new Set([membership.get(outlet), membership.get(returnOutlet)].filter(net => !upstream.has(net)));
  const visited = new Set<string>();
  for (const node of reachable) {
    for (const part of devices) {
      if (visited.has(part.id) || !part.terminals.some(terminal => membership.get(terminal) === node)) continue;
      visited.add(part.id);
      loadIds.add(part.id);
      for (const terminal of part.terminals) {
        const net = membership.get(terminal);
        if (!upstream.has(net)) reachable.add(net);
      }
    }
  }
  return loadIds;
}

const spansPair = (wire: CircuitWire, a: string, b: string) =>
  (wire.from === a && wire.to === b) || (wire.from === b && wire.to === a);

function removeTerminalBridge(topology: CircuitTopology, outlet: string, reference: string, protectedEndpoints: ReadonlySet<string>) {
  const adjacent = new Map<string, CircuitWire[]>();
  for (const wire of topology.wires) {
    for (const endpoint of [wire.from, wire.to]) {
      const connected = adjacent.get(endpoint);
      if (connected) connected.push(wire);
      else adjacent.set(endpoint, [wire]);
    }
  }
  const junctions = new Set(topology.junctions);
  function pathFrom(first: CircuitWire): Set<string> | undefined {
    const path = new Set<string>();
    let current = outlet;
    let wire = first;
    while (!path.has(wire.id)) {
      path.add(wire.id);
      current = wire.from === current ? wire.to : wire.from;
      if (current === reference) return path;
      const connected = adjacent.get(current);
      if (!junctions.has(current) || protectedEndpoints.has(current) || connected?.length !== 2) return;
      wire = connected[0].id === wire.id ? connected[1] : connected[0];
    }
  }

  // A device, observation or extra branch along a conductor belongs to the
  // working drawing. Remove a unique exclusive short path only.
  const paths = (adjacent.get(outlet) ?? []).flatMap(wire => {
    const path = pathFrom(wire);
    return path ? [path] : [];
  });
  if (paths.length !== 1) throw Error("ambiguous-line-termination-bridge");
  const next = { ...topology, wires: topology.wires.filter(wire => !paths[0].has(wire.id)) };
  if (netlist(next).some(net => net.includes(outlet) && net.includes(reference))) {
    throw Error("ambiguous-line-termination-bridge");
  }
  return next;
}

function terminationMatches(load: Load, termination: LineExperimentTermination, impedanceOhm: number, physical: boolean) {
  switch (termination) {
    case "open": return load.kind === "open";
    case "matched": return load.kind === "r" && load.value === impedanceOhm;
    case "short": return physical ? load.kind === "wire" : load.kind === "r" && load.value === 0;
  }
}

function resistorPinsAtOutput(inlet?: Point, outlet?: Point, returnOutlet?: Point): [Point, Point] | undefined {
  if (!inlet || !outlet || !returnOutlet) return;
  const axis = inlet.x === outlet.x ? "y" : "x";
  const cross = axis === "x" ? "y" : "x";
  const direction = Math.sign(outlet[axis] - inlet[axis]);
  const railGap = returnOutlet[cross] - outlet[cross];
  const halfSpan = 52;
  const distanceFromPort = 68;
  const position = outlet[axis] + direction * distanceFromPort;
  if (!direction || inlet[cross] !== outlet[cross] || returnOutlet[axis] !== outlet[axis]
    || Math.abs(railGap) < 2 * halfSpan || Math.abs(position) > 100_000) return;

  const center = outlet[cross] + railGap / 2;
  const span = Math.sign(railGap) * halfSpan;
  const anchor = { ...outlet, [axis]: position };
  return [{ ...anchor, [cross]: center - span }, { ...anchor, [cross]: center + span }];
}

export function setLineExperimentTermination(
  circuit: TopologyLabDocument,
  termination: LineExperimentTermination,
  durationS = DEFAULT_NETWORK.durationS,
): TopologyLabDocument {
  const projected = projectExperiment(circuit, durationS);
  const { model } = projected;
  const { section, inlet, outlet, returnOutlet } = finalLine(circuit, projected);
  const active = circuit.topology;
  const source = active.components.find(part => part.kind === "voltage" || part.kind === "current")!;
  const reference = returnOutlet ?? source.terminals[1];
  const loadIds = terminalDeviceIds(circuit, model, outlet, returnOutlet);
  const discardedTerminals = new Set(active.components.filter(part => loadIds.has(part.id)).flatMap(part => part.terminals));
  const physical = returnOutlet !== undefined;
  const retainedTerminalCount = termination === "matched" || (termination === "short" && !physical) ? 2 : 0;
  if (discardedTerminals.size === retainedTerminalCount && model.events.length === 0
    && terminationMatches(model.load, termination, section.impedanceOhm, physical)) return circuit;

  const originalOpened = circuit.brokenWires ?? [];
  const reserved = originalOpened.map(wire => wire.id);
  let topology = active;
  for (const id of loadIds) topology = removeDevicePreservingNets(topology, id, [], reserved);
  if (model.load.kind === "wire") {
    const protectedEndpoints = new Set([...circuit.observedEndpoints, ...originalOpened.flatMap(wire => [wire.from, wire.to])]);
    topology = removeTerminalBridge(topology, outlet, reference, protectedEndpoints);
  }
  const touchesDiscarded = (wire: CircuitWire) => discardedTerminals.has(wire.from) || discardedTerminals.has(wire.to);
  const archivedShort = originalOpened.find(wire => spansPair(wire, outlet, reference));
  let opened = originalOpened.filter(wire => !touchesDiscarded(wire) && wire !== archivedShort);
  // Remove junctions made orphaned by replacing the load, retaining other
  // existing junctions, including an intentional break on either line rail.
  const affectedJunctions = new Set(netlist(active)
    .filter(net => net.some(endpoint => discardedTerminals.has(endpoint)) || model.load.kind === "wire" && net.includes(outlet))
    .flat());
  const endpoints = new Set(topology.components.flatMap(part => part.terminals));
  const erasedJunctions = new Set(netlist({ ...topology, wires: [...topology.wires, ...opened] })
    .filter(net => !net.some(id => endpoints.has(id))).flat().filter(id => affectedJunctions.has(id)));
  const usable = (wire: CircuitWire) => !erasedJunctions.has(wire.from) && !erasedJunctions.has(wire.to);
  opened = opened.filter(usable);
  const wires = topology.wires.filter(usable);
  const allocate = allocatedIds(circuit, wires);
  const components = [...topology.components];
  let geometry = circuit.geometry;

  if (termination === "short" && returnOutlet !== undefined) {
    wires.push(archivedShort ?? { id: allocate("W"), from: outlet, to: reference });
  } else if (termination !== "open") {
    const resistorTerminals = (id: string) => [id + ":a", id + ":b"];
    const id = allocate("R", resistorTerminals);
    const terminals = resistorTerminals(id);
    const ohm = termination === "matched" ? section.impedanceOhm : 0;
    // A v1 two-terminal line retains an exact zero-ohm load in its old
    // shared-reference graph. The four-terminal document uses a wire instead.
    components.push({ id, kind: "r", terminals, parameters: { ...parts.r.parameters, ohm } });
    wires.push({ id: allocate("W"), from: outlet, to: terminals[0] }, { id: allocate("W"), from: terminals[1], to: reference });
    if (geometry) {
      const { pins } = geometry;
      const previous = active.components.find(part => part.id === model.load.id);
      const [first, second] = previous?.terminals.map(terminal => pins[terminal]) ?? [];
      const reversed = previous && projected.resultPolarity.get(previous.id) === -1;
      const placement = first && second ? reversed ? [second, first] : [first, second]
        : physical ? resistorPinsAtOutput(pins[inlet], pins[outlet], pins[reference]) : undefined;
      if (placement) {
        geometry = { ...geometry, pins: { ...pins, [terminals[0]]: placement[0], [terminals[1]]: placement[1] } };
      }
    }
  }
  const next = parseTopologyLabDocument(JSON.stringify({
    ...circuit, schemaVersion: opened.length ? 2 : 1, brokenWires: opened.length ? opened : undefined,
    topology: { components, wires, junctions: topology.junctions.filter(id => !erasedJunctions.has(id)) },
    observedEndpoints: circuit.observedEndpoints.filter(id => !discardedTerminals.has(id) && !erasedJunctions.has(id)),
    attachmentSides: circuit.attachmentSides.filter(hint => !loadIds.has(hint.componentId)),
    geometry,
  }));
  const updated = lineExperimentModel(next, durationS).load;
  if (!terminationMatches(updated, termination, section.impedanceOhm, physical)) {
    throw Error("incompatible-line-termination");
  }
  return next;
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
