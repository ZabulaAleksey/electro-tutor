import { netlist, type CircuitTopology } from "./topology";

export type ParallelRegion = {
  id: string;
  boundaries: readonly [string, string];
  componentIds: readonly string[];
  wireIds: readonly string[];
  /** Revision guard for this ephemeral selection; never persisted. */
  readonly sourceKey: string;
};
type Edge = { id: string; a: number; b: number };

export function parallelTopologyKey(topology: CircuitTopology): string {
  return JSON.stringify(topology, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

function graph(topology: CircuitTopology) {
  const nets = netlist(topology);
  const membership = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const edges = topology.components.flatMap(component => component.terminals.length === 2
    ? [{ id: component.id, a: membership.get(component.terminals[0])!, b: membership.get(component.terminals[1])! }] : []);
  const adjacency = new Map<number, Edge[]>();
  for (const edge of edges) for (const node of new Set([edge.a, edge.b])) {
    const list = adjacency.get(node) ?? [];
    list.push(edge); adjacency.set(node, list);
  }
  return { nets, membership, edges, adjacency };
}

/** Highlight the wire subtree connecting selected terminals, not unrelated boundary branches. */
function regionWires(topology: CircuitTopology, membership: Map<string, number>, ids: Set<string>, boundaries: readonly [string, string]) {
  const selectedTerminals = topology.components.filter(part => ids.has(part.id)).flatMap(part => part.terminals);
  const wireAdjacency = new Map<string, { endpoint: string; id: string }[]>();
  for (const wire of topology.wires) for (const [from, to] of [[wire.from, wire.to], [wire.to, wire.from]]) {
    const list = wireAdjacency.get(from) ?? [];
    list.push({ endpoint: to, id: wire.id }); wireAdjacency.set(from, list);
  }
  const terminalsByNet = new Map<number, string[]>();
  for (const terminal of selectedTerminals) {
    const node = membership.get(terminal)!;
    const list = terminalsByNet.get(node) ?? [];
    list.push(terminal); terminalsByNet.set(node, list);
  }
  const selected = new Set<string>();
  for (const [node, terminals] of terminalsByNet) {
    const anchor = boundaries.find(endpoint => membership.get(endpoint) === node) ?? terminals[0];
    const parents = new Map<string, { endpoint: string; id: string }>();
    const seen = new Set([anchor]), queue = [anchor];
    for (let i = 0; i < queue.length; i++) for (const neighbor of wireAdjacency.get(queue[i]) ?? []) {
      if (seen.has(neighbor.endpoint)) continue;
      seen.add(neighbor.endpoint); parents.set(neighbor.endpoint, { endpoint: queue[i], id: neighbor.id });
      queue.push(neighbor.endpoint);
    }
    for (const terminal of terminals) {
      let current = terminal;
      while (current !== anchor) {
        const parent = parents.get(current);
        if (!parent) break;
        selected.add(parent.id); current = parent.endpoint;
      }
    }
  }
  return topology.wires.filter(wire => selected.has(wire.id)).map(wire => wire.id);
}

export function resolveParallelRegions(topology: CircuitTopology, aEndpoint: string, bEndpoint: string): ParallelRegion[] {
  const { nets, membership, edges, adjacency } = graph(topology);
  const a = membership.get(aEndpoint), b = membership.get(bEndpoint);
  if (a === undefined || b === undefined || a === b) return [];
  const groups = edges.filter(edge => edge.a !== edge.b &&
    (edge.a === a && edge.b === b || edge.a === b && edge.b === a)).map(edge => [edge.id]);
  // Removing the two boundary nets gives closed internal components. Each is
  // visited once, including side taps, without enumerating simple paths.
  const seen = new Set([a, b]);
  for (let start = 0; start < nets.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start], incident = new Set<Edge>();
    let touchesA = false, touchesB = false;
    seen.add(start);
    for (let i = 0; i < queue.length; i++) for (const edge of adjacency.get(queue[i]) ?? []) {
      incident.add(edge);
      const next = edge.a === queue[i] ? edge.b : edge.a;
      if (next === a) touchesA = true;
      else if (next === b) touchesB = true;
      else if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    if (touchesA && touchesB) groups.push([...incident].map(edge => edge.id));
  }
  if (groups.length > 1) groups.push([...new Set(groups.flat())]);
  const sourceKey = parallelTopologyKey(topology);
  return groups.map((ids, index) => {
    const members = new Set(ids);
    const componentIds = topology.components.filter(part => members.has(part.id)).map(part => part.id);
    return { id: `parallel:${aEndpoint}:${bEndpoint}:${index}`, boundaries: [aEndpoint, bEndpoint] as const,
      componentIds, wireIds: regionWires(topology, membership, members, [aEndpoint, bEndpoint]), sourceKey };
  });
}

export function regionForComponent(topology: CircuitTopology, componentId: string): ParallelRegion | undefined {
  const component = topology.components.find(part => part.id === componentId);
  if (!component || component.terminals.length !== 2) return;
  const { membership } = graph(topology);
  if (membership.get(component.terminals[0]) === membership.get(component.terminals[1])) return;
  return { id: `parallel:part:${componentId}`, boundaries: [component.terminals[0], component.terminals[1]],
    componentIds: [componentId], wireIds: [], sourceKey: parallelTopologyKey(topology) };
}
