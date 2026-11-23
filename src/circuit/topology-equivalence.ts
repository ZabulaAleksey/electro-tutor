import { reduceRlc, type RlcReduction } from "./rlc-reduction";
import { netlist, validateCircuit, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";

const nominal = { r: "ohm", l: "henry", c: "farad" } as const;
const allowedParameters = {
  r: new Set(["ohm", "changeAtS", "nextOhm"]),
  l: new Set(["henry", "initial"]),
  c: new Set(["farad", "initial"]),
};

type Terminal = { component: CircuitComponent; index: number };
type OrientedPart = { component: CircuitComponent; polarity: 1 | -1 };

function staticPassive(component: CircuitComponent): boolean {
  const { kind, parameters, terminals } = component;
  if (kind !== "r" && kind !== "l" && kind !== "c" || terminals.length !== 2) return false;
  if (Object.keys(parameters).some(key => !allowedParameters[kind].has(key))) return false;
  const value = parameters[nominal[kind]];
  if (typeof value !== "number" || !Number.isFinite(value) || (kind === "r" ? value < 0 : value <= 0)) return false;
  if (kind === "r") {
    return (parameters.changeAtS === undefined || parameters.changeAtS === 0)
      && (parameters.nextOhm === undefined || typeof parameters.nextOhm === "number" && parameters.nextOhm > 0);
  }
  return parameters.initial === undefined || typeof parameters.initial === "number" && Number.isFinite(parameters.initial);
}

/** An extended inductor could refer to an otherwise ordinary-looking inductor by ID. */
function supportedInductors(topology: CircuitTopology): boolean {
  return !topology.components.some(component => component.kind === "l"
    && Object.keys(component.parameters).some(key => !allowedParameters.l.has(key)));
}

export function reduceTopologyRlc(topology: CircuitTopology, observedEndpoints: readonly string[] = []): RlcReduction {
  const canReduceInductor = supportedInductors(topology);
  return reduceRlc(topology, {
    observedEndpoints,
    eligible: component => staticPassive(component) && (component.kind !== "l" || canReduceInductor),
  });
}

/** Return a safe visual projection while leaving the editable source document untouched. */
export function simplifyTopologyForView(topology: CircuitTopology, observedEndpoints: readonly string[] = []): CircuitTopology {
  // A port is a real branch of the graph. Its two named terminals remain
  // present after reduction, and its incidence prevents collapsing through it.
  const measurementTerminals = new Set(topology.components.filter(part => part.kind === "port")
    .flatMap(part => part.terminals));
  const result = reduceTopologyRlc(topology, observedEndpoints.filter(id => !measurementTerminals.has(id)));
  if (!result.ok) return topology;
  return result.topology;
}

function otherEnd(wire: CircuitWire, endpoint: string): string {
  return wire.from === endpoint ? wire.to : wire.from;
}

function wireIncidence(topology: CircuitTopology): Map<string, CircuitWire[]> {
  const edges = new Map<string, CircuitWire[]>();
  for (const wire of topology.wires) {
    for (const endpoint of [wire.from, wire.to]) {
      const touching = edges.get(endpoint) ?? [];
      touching.push(wire);
      edges.set(endpoint, touching);
    }
  }
  return edges;
}

function cutWire(edges: ReadonlyMap<string, readonly CircuitWire[]>, wire: CircuitWire, incoming: string): Set<string> {
  const visited = new Set([incoming]);
  for (const endpoint of visited) {
    for (const nextWire of edges.get(endpoint) ?? []) {
      if (nextWire.id !== wire.id) visited.add(otherEnd(nextWire, endpoint));
    }
  }
  return visited;
}

function compatibleCurrents(path: readonly OrientedPart[], extra: number) {
  const currents = path.filter(({ component }) => component.kind === "l").map(({ component, polarity }) =>
    polarity * Number(component.parameters.initial ?? 0));
  if (path[0].component.kind === "l" && extra > 0 && currents[0] !== 0) return false;
  return currents.every(current => current === currents[0] ||
    Math.abs(current - currents[0]) <= 64 * Number.EPSILON * Math.max(Math.abs(current), Math.abs(currents[0])));
}

/** Move the same component through a provable static series path, then optionally add its nominal. */
export function moveSeriesEquivalent(
  topology: CircuitTopology,
  componentId: string,
  targetWireId: string,
  extra: number,
  observedEndpoints: readonly string[] = [],
): CircuitTopology {
  const nets = netlist(topology);
  const source = topology.components.find(component => component.id === componentId);
  if (!source || source.kind !== "r" && source.kind !== "l") throw Error("unsupported-series-component");
  if (!Number.isFinite(extra) || extra < 0) throw Error("invalid-series-increment");
  const target = topology.wires.find(wire => wire.id === targetWireId);
  if (!target) throw Error("unknown-series-wire");

  const nodes = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const observed = new Set(observedEndpoints);
  if (observedEndpoints.some(endpoint => !nodes.has(endpoint))) throw Error("unknown-observed-endpoint");
  const observedNodes = new Set(observedEndpoints.map(endpoint => nodes.get(endpoint)));
  const [a, b] = source.terminals;
  if (!staticPassive(source) || source.terminals.some(endpoint => observed.has(endpoint)) || nodes.get(a) === nodes.get(b)) {
    throw Error("unsafe-series-move");
  }

  const wiresByEndpoint = wireIncidence(topology);
  const sourceWires = [wiresByEndpoint.get(a), wiresByEndpoint.get(b)];
  if (sourceWires.some(wires => wires?.length !== 1)) throw Error("unsafe-series-move");
  const [sourceA, sourceB] = sourceWires.map(wires => wires![0]);

  const terminals = new Set<string>();
  const incidence = new Map<number, Terminal[]>();
  for (const component of topology.components) {
    for (const [index, endpoint] of component.terminals.entries()) {
      terminals.add(endpoint);
      const node = nodes.get(endpoint)!;
      const attached = incidence.get(node) ?? [];
      attached.push({ component, index });
      incidence.set(node, attached);
    }
  }

  const targetNode = nodes.get(target.from);
  function trace(start: string, exitIndex: number) {
    const path: OrientedPart[] = [{ component: source!, polarity: exitIndex === 1 ? 1 : -1 }];
    const visited = new Set([componentId]);
    let incoming = start;
    let crossesObservation = false;
    while (nodes.get(incoming) !== targetNode) {
      const node = nodes.get(incoming)!;
      crossesObservation ||= observedNodes.has(node);
      const connected = incidence.get(node) ?? [];
      if (connected.length !== 2) return undefined;
      const next = connected.find(({ component, index }) => component.terminals[index] !== incoming)!;
      const { component, index } = next;
      if (!staticPassive(component) || visited.has(component.id)) return undefined;
      visited.add(component.id);
      path.push({ component, polarity: index === 0 ? 1 : -1 });
      incoming = component.terminals[1 - index];
    }
    return { incoming, exitIndex, path, crossesObservation };
  }

  const directions = source.terminals.flatMap((endpoint, index) => {
    const direction = trace(endpoint, index);
    return direction ? [direction] : [];
  });
  if (directions.length !== 1) throw Error("unsafe-series-move");
  const [{ incoming, exitIndex, path, crossesObservation }] = directions;
  const near = cutWire(wiresByEndpoint, target, incoming);
  const nearFrom = near.has(target.from);
  const nearTo = near.has(target.to);
  if (crossesObservation || nearFrom === nearTo || [...near].some(id => observed.has(id) || id !== incoming && terminals.has(id))
      || path.some(({ component }) => component.kind === "l") && !supportedInductors(topology)
      || !compatibleCurrents(path, extra)) {
    throw Error("unsafe-series-move");
  }

  const property = nominal[source.kind];
  const oldValue = Number(source.parameters[property]);
  const value = oldValue + extra;
  if (!Number.isFinite(value) || extra > 0 && value === oldValue) throw Error("invalid-series-increment");
  const components = extra === 0 ? topology.components : topology.components.map(component =>
    component.id === componentId ? { ...component, parameters: { ...component.parameters, [property]: value } } : component);
  if (target.id === sourceA.id || target.id === sourceB.id) {
    return extra === 0 ? topology : { ...topology, components };
  }

  const nearEnd = nearFrom ? target.from : target.to;
  const farEnd = otherEnd(target, nearEnd);
  const replacements = new Map<string, CircuitWire>([
    [sourceA.id, { id: sourceA.id, from: otherEnd(sourceA, a), to: otherEnd(sourceB, b) }],
    [sourceB.id, { id: sourceB.id, from: nearEnd, to: source.terminals[1 - exitIndex] }],
    [target.id, { id: target.id, from: source.terminals[exitIndex], to: farEnd }],
  ]);
  const moved = { ...topology, components, wires: topology.wires.map(wire => replacements.get(wire.id) ?? wire) };
  if (validateCircuit(moved).length) throw Error("unsafe-series-move");
  return moved;
}
