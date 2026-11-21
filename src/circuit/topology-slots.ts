import { parallelTopologyKey } from "./parallel-regions";
import { addComponent, netlist, validateCircuit, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";

export type TopologySide = "left" | "right";

type Slot = Readonly<{
  id: string;
  sourceKey: string;
  boundaries: readonly [string, string];
}>;

export type TopologySlot =
  | (Slot & Readonly<{ kind: "series"; wireId: string }>)
  | (Slot & Readonly<{ kind: "parallel"; side: TopologySide; componentIds: readonly string[] }>)
  | (Slot & Readonly<{ kind: "cross" }>);

type Arc = {
  componentId: string;
  startEndpoint: string;
  endEndpoint: string;
  endNet: number;
  forward: boolean;
};

const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const sides = ["left", "right"] as const;

function topologyView(topology: CircuitTopology, observedEndpoints: readonly string[]) {
  const nets = netlist(topology);
  const membership = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const observed = [...new Set(observedEndpoints)].sort();
  const observedNets = new Set(observed.map((endpoint) => {
    const net = membership.get(endpoint);
    if (net === undefined) throw Error("unknown-observed-endpoint");
    return net;
  }));
  const components = [...topology.components].sort(byId);
  const wires = [...topology.wires].sort(byId);
  const sourceKey = JSON.stringify([
    parallelTopologyKey({ components, wires, junctions: [...topology.junctions].sort() }),
    observed,
  ]);
  return { membership, nets, observed, observedNets, components, wires, sourceKey };
}

type TopologyView = ReturnType<typeof topologyView>;

function* seriesSlots(view: TopologyView): Iterable<Extract<TopologySlot, { kind: "series" }>> {
  const anchors = new Set([...view.observed, ...view.components.flatMap(({ terminals }) => terminals)]);
  const anchorsByNet = view.nets.map(net => net.filter(endpoint => anchors.has(endpoint)));
  const adjacent = new Map<string, { endpoint: string; id: string }[]>();
  for (const { id, from, to } of view.wires) {
    for (const [a, b] of [[from, to], [to, from]]) {
      const neighbors = adjacent.get(a) ?? [];
      neighbors.push({ endpoint: b, id });
      adjacent.set(a, neighbors);
    }
  }

  const partitions = new Set<string>();
  for (const wire of view.wires) {
    const members = anchorsByNet[view.membership.get(wire.from)!];
    if (members.length < 2) continue;
    const connected = new Set([wire.from]);
    for (const endpoint of connected) {
      for (const next of adjacent.get(endpoint) ?? []) {
        if (next.id !== wire.id) connected.add(next.endpoint);
      }
    }
    if (connected.has(wire.to)) continue;
    const first = members.filter(endpoint => connected.has(endpoint));
    const second = members.filter(endpoint => !connected.has(endpoint));
    if (!first.length || !second.length) continue;

    // An unmarked intermediate junction does not make a second electrical cut.
    const key = JSON.stringify(first[0] < second[0] ? [first, second] : [second, first]);
    if (partitions.has(key)) continue;
    partitions.add(key);
    yield { id: `series:${wire.id}`, kind: "series", sourceKey: view.sourceKey,
      boundaries: [wire.from, wire.to], wireId: wire.id };
  }
}

function* parallelSlots(view: TopologyView): Iterable<Extract<TopologySlot, { kind: "parallel" }>> {
  const incidence = view.nets.map(() => 0);
  const adjacent: Arc[][] = view.nets.map(() => []);
  for (const component of view.components) {
    for (const endpoint of component.terminals) incidence[view.membership.get(endpoint)!]++;
    if (component.terminals.length !== 2) continue;
    const [first, second] = component.terminals;
    const firstNet = view.membership.get(first)!;
    const secondNet = view.membership.get(second)!;
    if (firstNet === secondNet) continue;
    adjacent[firstNet].push({ componentId: component.id, startEndpoint: first, endEndpoint: second, endNet: secondNet, forward: true });
    adjacent[secondNet].push({ componentId: component.id, startEndpoint: second, endEndpoint: first, endNet: firstNet, forward: false });
  }

  for (const [startNet, arcs] of adjacent.entries()) {
    for (const start of arcs) {
      const visited = new Set([startNet]);
      const members: string[] = [];
      let tail: Arc | undefined = start;
      while (tail && !visited.has(tail.endNet)) {
        visited.add(tail.endNet);
        members.push(tail.componentId);
        // One orientation per electrical path. A single part keeps its terminal order.
        const forward = members.length === 1 ? start.forward : start.componentId < tail.componentId;
        if (forward) {
          const componentIds = [...members];
          const boundaries = [start.startEndpoint, tail.endEndpoint] as const;
          const key = JSON.stringify(componentIds);
          for (const side of sides) {
            yield { id: `parallel:${key}:${side}`, kind: "parallel", sourceKey: view.sourceKey,
              boundaries, componentIds, side };
          }
        }
        const endNet: number = tail.endNet;
        if (incidence[endNet] !== 2 || view.observedNets.has(endNet)) break;
        const lastComponentId: string = tail.componentId;
        tail = adjacent[endNet].find(arc => arc.componentId !== lastComponentId);
      }
    }
  }
}

export function listTopologySlots(topology: CircuitTopology, observedEndpoints: readonly string[] = []): readonly TopologySlot[] {
  const view = topologyView(topology, observedEndpoints);
  return [...seriesSlots(view), ...parallelSlots(view)];
}

function crossSlot(view: TopologyView, from: string, to: string): Extract<TopologySlot, { kind: "cross" }> {
  const a = view.membership.get(from);
  const b = view.membership.get(to);
  if (a === undefined || b === undefined) throw Error("unknown-slot-endpoint");
  if (a === b) throw Error("same-net-slot");
  const boundaries = [from, to] as const;
  return { id: `cross:${JSON.stringify(boundaries)}`, kind: "cross", sourceKey: view.sourceKey, boundaries };
}

export function createCrossSlot(topology: CircuitTopology, from: string, to: string,
  observedEndpoints: readonly string[] = []): Extract<TopologySlot, { kind: "cross" }> {
  return crossSlot(topologyView(topology, observedEndpoints), from, to);
}

function currentSlot(view: TopologyView, slot: TopologySlot): TopologySlot {
  if (!slot || !Array.isArray(slot.boundaries) || slot.boundaries.length !== 2) throw Error("invalid-topology-slot");
  if (slot.sourceKey !== view.sourceKey) throw Error("stale-topology-slot");
  let match: TopologySlot | undefined;
  if (slot.kind === "cross") {
    match = crossSlot(view, slot.boundaries[0], slot.boundaries[1]);
  } else {
    const choices = slot.kind === "series" ? seriesSlots(view) : parallelSlots(view);
    for (const choice of choices) {
      if (choice.id !== slot.id) continue;
      match = choice;
      break;
    }
  }
  if (!match || match.id !== slot.id || match.kind !== slot.kind || match.boundaries[0] !== slot.boundaries[0] ||
      match.boundaries[1] !== slot.boundaries[1] ||
      (match.kind === "series" && slot.kind === "series" && match.wireId !== slot.wireId) ||
      (match.kind === "parallel" && slot.kind === "parallel" && (match.side !== slot.side ||
        match.componentIds.length !== slot.componentIds.length ||
        match.componentIds.some((id, index) => id !== slot.componentIds[index])))) throw Error("invalid-topology-slot");
  return match;
}

export function resolveTopologySlot(topology: CircuitTopology, slot: TopologySlot,
  observedEndpoints: readonly string[] = []): TopologySlot {
  return currentSlot(topologyView(topology, observedEndpoints), slot);
}

export function insertTopologyComponent(topology: CircuitTopology, slot: TopologySlot, component: CircuitComponent,
  observedEndpoints: readonly string[] = []): CircuitTopology {
  const match = resolveTopologySlot(topology, slot, observedEndpoints);
  if (component.terminals.length !== 2) throw Error("invalid-slot-component");
  const next = addComponent(topology, component);
  const reserved = new Set([...next.junctions, ...next.wires.map(({ id }) => id),
    ...next.components.flatMap(({ id, terminals }) => [id, ...terminals])]);
  let number = 1;
  function wire(from: string, to: string): CircuitWire {
    let id: string;
    do { id = `slotWire${number++}`; } while (reserved.has(id));
    reserved.add(id);
    return { id, from, to };
  }
  const [a, b] = match.boundaries;
  const [first, second] = component.terminals;
  const wires = match.kind === "series"
    ? [...next.wires.map(item => item.id === match.wireId ? { id: item.id, from: a, to: first } : item), wire(second, b)]
    : [...next.wires, wire(a, first), wire(second, b)];
  const result = { ...next, wires };
  const issues = validateCircuit(result);
  if (issues.length) throw Error(issues.join(", "));
  return result;
}
