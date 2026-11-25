import {
  connect, disconnect, netlist, removeComponent, validateCircuit,
  type CircuitTopology, type CircuitWire,
} from "./topology";

function validate(topology: CircuitTopology) {
  const issues = validateCircuit(topology);
  if (issues.length) throw Error(issues.join(", "));
}

function opposite(wire: CircuitWire, endpoint: string) {
  return wire.from === endpoint ? wire.to : wire.from;
}

export function planSeriesBypass(
  topology: CircuitTopology,
  componentId: string,
  protectedEndpoints: readonly string[] = [],
  allowPortShort = false,
) {
  const nets = netlist(topology);
  const component = topology.components.find(part => part.id === componentId);
  if (!component) throw Error("unknown-component");
  if (component.terminals.length !== 2 || component.kind === "port") throw Error("unsafe-series-bypass");

  const [first, second] = component.terminals;
  const firstNet = nets.find(net => net.includes(first))!;
  const secondNet = nets.find(net => net.includes(second))!;
  const protectedIds = new Set(protectedEndpoints);
  if (firstNet === secondNet || firstNet.some(id => protectedIds.has(id)) || secondNet.some(id => protectedIds.has(id))) {
    throw Error("unsafe-series-bypass");
  }

  // Check incidence in the electrical nets as well as at the two physical
  // terminals. A single wire may lead to a junction with other devices.
  const owners = new Map(topology.components.flatMap(part => part.terminals.map(id => [id, part.id] as const)));
  const firstOwners = firstNet.flatMap(id => owners.has(id) ? [owners.get(id)!] : []);
  const secondOwners = secondNet.flatMap(id => owners.has(id) ? [owners.get(id)!] : []);
  const firstNeighbor = firstOwners.find(id => id !== componentId);
  const secondNeighbor = secondOwners.find(id => id !== componentId);
  const sameDevice = firstNeighbor === secondNeighbor;
  const portShort = allowPortShort && sameDevice && topology.components.some(part => part.id === firstNeighbor && part.kind === "port");
  if (firstOwners.length !== 2 || secondOwners.length !== 2
    || firstNeighbor === undefined || secondNeighbor === undefined || (sameDevice && !portShort)) {
    throw Error("unsafe-series-bypass");
  }

  const incoming = topology.wires.filter(wire => wire.from === first || wire.to === first);
  const outgoing = topology.wires.filter(wire => wire.from === second || wire.to === second);
  if (incoming.length !== 1 || outgoing.length !== 1) throw Error("unsafe-series-bypass");

  const [firstWire] = incoming;
  const [secondWire] = outgoing;
  const upstream = opposite(firstWire, first);
  const downstream = opposite(secondWire, second);
  const ends = firstWire.from === first ? [downstream, upstream] : [upstream, downstream];
  return { topology: removeComponent(topology, componentId), wire: { id: firstWire.id, from: ends[0], to: ends[1] } };
}

export function bypassSeriesDevice(
  topology: CircuitTopology,
  componentId: string,
  protectedEndpoints: readonly string[] = [],
  allowPortShort = false,
): CircuitTopology {
  const planned = planSeriesBypass(topology, componentId, protectedEndpoints, allowPortShort);
  return restoreTopologyWire(planned.topology, planned.wire);
}

export function matchingOpenWire(opened: readonly CircuitWire[], { from, to }: CircuitWire) {
  return opened.find(wire => wire.from === from && wire.to === to || wire.from === to && wire.to === from);
}

export function breakTopologyWire(topology: CircuitTopology, id: string): { topology: CircuitTopology; wire: CircuitWire } {
  validate(topology);
  const wire = topology.wires.find(candidate => candidate.id === id);
  if (!wire) throw Error("unknown-wire");
  return { topology: disconnect(topology, id), wire: { ...wire } };
}

export function restoreTopologyWire(topology: CircuitTopology, wire: CircuitWire): CircuitTopology {
  return connect(topology, wire.id, wire.from, wire.to);
}

export function clearTopologyDevices(topology: CircuitTopology, retainedIds: readonly string[] = []): CircuitTopology {
  validate(topology);
  const retained = new Set(retainedIds);
  const components = topology.components.filter(part => retained.has(part.id));
  if (components.length !== retained.size) throw Error("unknown-retained-component");
  if (components.length === topology.components.length && !topology.junctions.length && !topology.wires.length) return topology;
  return { components, junctions: [], wires: [] };
}
