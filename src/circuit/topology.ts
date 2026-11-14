export type ElementId = string;
export type Parameter = number | string | boolean;
export type CircuitComponent = Readonly<{
  id: ElementId;
  kind: string;
  terminals: readonly ElementId[];
  parameters: Readonly<Record<string, Parameter>>;
}>;
export type CircuitWire = Readonly<{ id: ElementId; from: ElementId; to: ElementId }>;
export type CircuitTopology = Readonly<{
  components: readonly CircuitComponent[];
  junctions: readonly ElementId[];
  wires: readonly CircuitWire[];
}>;
type ValidationIssue = "invalid-topology" | "invalid-component" | "invalid-parameter" |
  "invalid-wire" | "invalid-id" | "duplicate-id" | "unknown-endpoint" | "self-wire" | "duplicate-wire";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is ElementId =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(value);
const edgeKey = (from: ElementId, to: ElementId) => [from, to].sort().join("\u0000");

export function validateCircuit(input: unknown): ValidationIssue[] {
  if (!isRecord(input) || !Array.isArray(input.components) ||
      !Array.isArray(input.junctions) || !Array.isArray(input.wires)) return ["invalid-topology"];
  const issues = new Set<ValidationIssue>();
  const ids = new Set<ElementId>();
  const endpoints = new Set<ElementId>();
  const edges = new Set<string>();
  function register(id: unknown, endpoint = false) {
    if (!validId(id)) {
      issues.add("invalid-id");
      return;
    }
    if (ids.has(id)) issues.add("duplicate-id");
    ids.add(id);
    if (endpoint) endpoints.add(id);
  }

  for (const item of input.components as unknown[]) {
    if (!isRecord(item) || !validId(item.kind) || !Array.isArray(item.terminals) || item.terminals.length === 0) {
      issues.add("invalid-component");
      continue;
    }
    register(item.id);
    for (const terminal of item.terminals as unknown[]) register(terminal, true);
    if (!isRecord(item.parameters) || Object.values(item.parameters).some(value =>
      typeof value !== "string" && typeof value !== "boolean" && !Number.isFinite(value))) {
      issues.add("invalid-parameter");
    }
  }
  for (const junction of input.junctions as unknown[]) register(junction, true);
  for (const wire of input.wires as unknown[]) {
    if (!isRecord(wire) || !validId(wire.from) || !validId(wire.to)) {
      issues.add("invalid-wire");
      continue;
    }
    register(wire.id);
    if (!endpoints.has(wire.from) || !endpoints.has(wire.to)) issues.add("unknown-endpoint");
    if (wire.from === wire.to) issues.add("self-wire");
    const key = edgeKey(wire.from, wire.to);
    if (edges.has(key)) issues.add("duplicate-wire");
    edges.add(key);
  }
  return [...issues];
}

function checked(circuit: CircuitTopology): CircuitTopology {
  const issues = validateCircuit(circuit);
  if (issues.length) throw new Error(issues.join(", "));
  return circuit;
}

export function emptyCircuit(): CircuitTopology {
  return { components: [], junctions: [], wires: [] };
}

export function addComponent(circuit: CircuitTopology, component: CircuitComponent): CircuitTopology {
  const next = checked({ ...circuit, components: [...circuit.components, component] });
  const ownedComponent = { ...component, terminals: [...component.terminals], parameters: { ...component.parameters } };
  return { ...next, components: [...circuit.components, ownedComponent] };
}

export function addJunction(circuit: CircuitTopology, id: ElementId): CircuitTopology {
  return checked({ ...circuit, junctions: [...circuit.junctions, id] });
}

export function connect(circuit: CircuitTopology, id: ElementId, from: ElementId, to: ElementId): CircuitTopology {
  return checked({ ...circuit, wires: [...circuit.wires, { id, from, to }] });
}

export function disconnect(circuit: CircuitTopology, id: ElementId): CircuitTopology {
  if (!circuit.wires.some(wire => wire.id === id)) return circuit;
  return { ...circuit, wires: circuit.wires.filter(wire => wire.id !== id) };
}

export function removeComponent(circuit: CircuitTopology, id: ElementId): CircuitTopology {
  const component = circuit.components.find(item => item.id === id);
  if (!component) return circuit;
  const terminals = new Set(component.terminals);
  return {
    ...circuit,
    components: circuit.components.filter(item => item.id !== id),
    wires: circuit.wires.filter(wire => !terminals.has(wire.from) && !terminals.has(wire.to)),
  };
}

/** The first endpoint in each sorted net gives a deterministic order for the netlist. */
export function netlist(circuit: CircuitTopology): ElementId[][] {
  checked(circuit);
  const endpoints = [...circuit.junctions, ...circuit.components.flatMap(item => item.terminals)].sort();
  const neighbors = new Map(endpoints.map(endpoint => [endpoint, [] as ElementId[]]));
  for (const wire of circuit.wires) {
    neighbors.get(wire.from)!.push(wire.to);
    neighbors.get(wire.to)!.push(wire.from);
  }
  const visited = new Set<ElementId>();
  const nets: ElementId[][] = [];
  for (const endpoint of endpoints) {
    if (visited.has(endpoint)) continue;
    const net = [endpoint];
    visited.add(endpoint);
    for (const member of net) {
      for (const neighbor of neighbors.get(member)!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        net.push(neighbor);
      }
    }
    nets.push(net.sort());
  }
  return nets;
}
