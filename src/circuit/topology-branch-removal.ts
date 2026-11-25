import { netlist, validateCircuit, type CircuitTopology, type CircuitWire } from "./topology";

type BranchArc = { id: string; to: number };
type ElectricalGraph = {
  nets: string[][];
  membership: Map<string, number>;
  incidence: number[];
  ports: Set<number>;
  observed: Set<number>;
  adjacent: BranchArc[][];
};

function electricalGraph(topology: CircuitTopology, observedEndpoints: readonly string[]): ElectricalGraph {
  const nets = netlist(topology);
  const membership = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const incidence = nets.map(() => 0);
  const adjacent: BranchArc[][] = nets.map(() => []);
  const ports = new Set<number>();
  const observed = new Set<number>();

  for (const endpoint of observedEndpoints) {
    const node = membership.get(endpoint);
    if (node === undefined) throw Error("unknown-observed-endpoint");
    observed.add(node);
  }

  for (const part of topology.components) {
    const terminals = part.terminals.map(endpoint => membership.get(endpoint)!);
    if (part.kind === "port") {
      terminals.forEach(node => ports.add(node));
      continue;
    }
    terminals.forEach(node => incidence[node]++);
    if (terminals.length !== 2 || terminals[0] === terminals[1]) continue;
    const [a, b] = terminals;
    adjacent[a].push({ id: part.id, to: b });
    adjacent[b].push({ id: part.id, to: a });
  }
  return { nets, membership, incidence, ports, observed, adjacent };
}

function isInterior(graph: ElectricalGraph, node: number): boolean {
  return graph.incidence[node] === 2 && !graph.ports.has(node) && !graph.observed.has(node);
}

function isBoundary(graph: ElectricalGraph, node: number): boolean {
  return graph.incidence[node] >= 3 || graph.ports.has(node) && graph.incidence[node] >= 2;
}

function followBranch(graph: ElectricalGraph, node: number, previous: string, visited: Set<string>): number | undefined {
  while (isInterior(graph, node)) {
    const choices = graph.adjacent[node].filter(arc => arc.id !== previous);
    if (choices.length !== 1 || visited.has(choices[0].id)) return;
    const next = choices[0];
    visited.add(next.id);
    previous = next.id;
    node = next.to;
  }
  return node;
}

function hasParallelBranch(graph: ElectricalGraph, from: number, to: number, selected: ReadonlySet<string>): boolean {
  return graph.adjacent[from].some(first => {
    if (selected.has(first.id)) return false;
    const visited = new Set([...selected, first.id]);
    return followBranch(graph, first.to, first.id, visited) === to;
  });
}

function identifyBranch(
  topology: CircuitTopology,
  graph: ElectricalGraph,
  componentId: string,
  observedEndpoints: readonly string[],
): ReadonlySet<string> | undefined {
  const selected = topology.components.find(part => part.id === componentId);
  if (!selected || selected.kind === "port" || selected.terminals.length !== 2) return;
  const [a, b] = selected.terminals.map(endpoint => graph.membership.get(endpoint)!);
  if (a === b) return;

  const branch = new Set([selected.id]);
  const from = followBranch(graph, a, selected.id, branch);
  const to = followBranch(graph, b, selected.id, branch);
  if (from === undefined || to === undefined || from === to || !isBoundary(graph, from) || !isBoundary(graph, to)) return;

  const observed = new Set(observedEndpoints);
  if (topology.components.some(part => branch.has(part.id) && part.terminals.some(endpoint => observed.has(endpoint)))) return;
  if (!hasParallelBranch(graph, from, to, branch)) return;
  return branch;
}

/** Identify a complete linear branch with another direct or linear path between the same boundaries. */
export function parallelBranchForComponent(
  topology: CircuitTopology,
  componentId: string,
  observedEndpoints: readonly string[] = [],
): readonly string[] | undefined {
  const graph = electricalGraph(topology, observedEndpoints);
  const branch = identifyBranch(topology, graph, componentId, observedEndpoints);
  return branch && [...branch].sort();
}

/** Remove the branch while preserving the original nets of all surviving terminals. */
export function removeParallelBranch(
  topology: CircuitTopology,
  componentId: string,
  observedEndpoints: readonly string[] = [],
  reservedWireIds: readonly string[] = [],
): CircuitTopology {
  const graph = electricalGraph(topology, observedEndpoints);
  const branch = identifyBranch(topology, graph, componentId, observedEndpoints);
  if (!branch) throw Error("ambiguous-parallel-branch");

  const components = topology.components.filter(part => !branch.has(part.id));
  const removed = new Set(topology.components.filter(part => branch.has(part.id)).flatMap(part => part.terminals));
  const survivingTerminals = new Set([...observedEndpoints, ...components.flatMap(part => part.terminals)]);
  const touchedNets = graph.nets.filter(net => net.some(endpoint => removed.has(endpoint)));
  for (const net of touchedNets) {
    if (net.every(endpoint => !survivingTerminals.has(endpoint))) net.forEach(endpoint => removed.add(endpoint));
  }
  const junctions = topology.junctions.filter(id => !removed.has(id));
  const wires = topology.wires.filter(wire => !removed.has(wire.from) && !removed.has(wire.to));
  const cut = { components, junctions, wires };
  const remaining = new Map(netlist(cut).flatMap(net => net.map(endpoint => [endpoint, net[0]] as const)));
  const used = new Set([
    ...reservedWireIds, ...topology.wires.map(wire => wire.id), ...junctions,
    ...components.flatMap(part => [part.id, ...part.terminals]),
  ]);

  let number = 1;
  const reconnections: CircuitWire[] = [];
  for (const net of touchedNets) {
    const remnants = [...new Set(net.flatMap(endpoint => remaining.get(endpoint) ?? []))];
    for (const endpoint of remnants.slice(1)) {
      while (used.has("W" + number)) number++;
      const id = "W" + number++;
      used.add(id);
      reconnections.push({ id, from: remnants[0], to: endpoint });
    }
  }

  const result = { ...cut, wires: [...wires, ...reconnections] };
  const issues = validateCircuit(result);
  if (issues.length) throw Error(issues.join(", "));
  return result;
}
