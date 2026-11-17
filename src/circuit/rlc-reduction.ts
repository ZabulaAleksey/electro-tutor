import { netlist, type CircuitComponent, type CircuitTopology } from "./topology";

const properties = { r: "ohm", l: "henry", c: "farad" } as const;
type Kind = keyof typeof properties;
type Connection = "series" | "parallel";
type Polarity = 1 | -1;
type Member = { id: string; value: number; polarity: Polarity };
export type RlcEquivalent = {
  kind: Kind;
  connection: Connection;
  value: number;
  members: readonly [Member, Member];
};
type Conflict = { kind: "l" | "c"; connection: Connection; components: string[] };
export type RlcReduction =
  | { ok: true; topology: CircuitTopology; equivalents: ReadonlyMap<string, RlcEquivalent> }
  | { ok: false; conflict: Conflict };

type Branch = { component: CircuitComponent; nodes: number[] };
type Passive = Branch & { nodes: [number, number]; kind: Kind; value: number; initial: number; scheduled: boolean };
type Pair = { a: Passive; b: Passive; shared?: number };

function passive(branch: Branch): Passive | undefined {
  const { component, nodes } = branch;
  if (!Object.hasOwn(properties, component.kind)) return undefined;
  const kind = component.kind as Kind, value = component.parameters[properties[kind]];
  const initial = kind === "r" ? 0 : component.parameters.initial ?? 0;
  if (nodes.length !== 2 || typeof value !== "number" || !Number.isFinite(value) ||
      value < 0 || kind !== "r" && value === 0 || typeof initial !== "number" || !Number.isFinite(initial)) {
    throw Error("invalid-rlc-parameter:" + component.id);
  }
  const scheduled = Number(component.parameters.changeAtS ?? 0) > 0;
  return { ...branch, nodes: [nodes[0], nodes[1]], kind, value, initial, scheduled };
}

function* pairs(branches: Branch[]): Iterable<Pair> {
  const incidence = new Map<number, number>();
  for (const { nodes } of branches) {
    for (const node of nodes) incidence.set(node, (incidence.get(node) ?? 0) + 1);
  }
  const available = branches.flatMap(branch => {
    const item = passive(branch);
    return item && !item.scheduled && item.nodes[0] !== item.nodes[1] ? [item] : [];
  });
  const series: Pair[] = [];
  for (const [i, a] of available.entries()) {
    for (const b of available.slice(i + 1)) {
      if (a.kind !== b.kind) continue;
      if (a.nodes.every(node => b.nodes.includes(node))) {
        yield { a, b };
        continue;
      }
      const shared = a.nodes.find(node => b.nodes.includes(node) && incidence.get(node) === 2);
      if (shared !== undefined) series.push({ a, b, shared });
    }
  }
  yield* series;
}

function equalState(a: number, b: number) {
  return a === b || Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

function equivalent({ a, b, shared }: Pair): { nodes: number[]; initial: number; equation: RlcEquivalent } | { conflict: Omit<Conflict, "components"> } | null {
  const series = shared !== undefined;
  const connection: Connection = series ? "series" : "parallel";
  const kind = a.kind;
  const polarityA: Polarity = series && a.nodes[0] === shared ? -1 : 1;
  const polarityB: Polarity = (series ? b.nodes[0] === shared : b.nodes[0] === a.nodes[0]) ? 1 : -1;
  const nodes = [
    a.nodes[polarityA === 1 ? 0 : 1],
    series ? b.nodes[polarityB === 1 ? 1 : 0] : a.nodes[1],
  ];
  const min = Math.min(a.value, b.value), max = Math.max(a.value, b.value);
  const sum = series !== (kind === "c");
  const value = sum ? a.value + b.value : max === 0 ? 0 : min / (1 + min / max);
  const sa = polarityA * a.initial, sb = polarityB * b.initial;
  let initial = sa;
  if (kind !== "r") {
    if (sum && !equalState(sa, sb)) return { conflict: { kind, connection } };
    if (!sum) {
      // Compare oriented charges or flux linkages. A hidden internal state
      // with a different charge or flux cannot be carried by one equivalent.
      const qa = sa * (a.value / max), qb = sb * (b.value / max);
      if (qa === 0 && sa !== 0 || qb === 0 && sb !== 0 || !equalState(qa, qb)) return null;
      initial = sa + sb;
    }
  }
  if (!Number.isFinite(value) || !Number.isFinite(initial) || min > 0 && value === 0) {
    throw Error("invalid-rlc-equivalent:" + a.component.id + "," + b.component.id);
  }
  const equation: RlcEquivalent = {
    kind, connection, value, members: [
      { id: a.component.id, value: a.value, polarity: polarityA },
      { id: b.component.id, value: b.value, polarity: polarityB },
    ],
  };
  return { nodes, initial, equation };
}

/** Derive a smaller calculation topology while leaving the user's topology intact. */
export function reduceRlc(topology: CircuitTopology): RlcReduction {
  const originalNets = netlist(topology);
  const membership = new Map(originalNets.flatMap((net, index) => net.map(id => [id, index] as const)));
  let branches = topology.components.map(component => ({
    component, nodes: component.terminals.map(id => membership.get(id)!),
  }));
  const reserved = new Set([...membership.keys(), ...topology.components.map(part => part.id), ...topology.wires.map(wire => wire.id)]);
  let next = 1;
  function allocate(prefix: string) {
    let id: string;
    do { id = prefix + next++; } while ([id, id + ":a", id + ":b"].some(key => reserved.has(key)));
    reserved.add(id).add(id + ":a").add(id + ":b");
    return id;
  }
  const equivalents = new Map<string, RlcEquivalent>();
  const originals = (id: string): string[] => equivalents.get(id)?.members.flatMap(member => originals(member.id)) ?? [id];

  for (;;) {
    let changed = false;
    for (const pair of pairs(branches)) {
      const reduced = equivalent(pair);
      if (!reduced) continue;
      const aId = pair.a.component.id, bId = pair.b.component.id;
      if ("conflict" in reduced) {
        return { ok: false, conflict: { ...reduced.conflict, components: [...originals(aId), ...originals(bId)] } };
      }
      const { equation, nodes, initial } = reduced;
      const id = allocate("rlcEquivalent");
      const component = { id, kind: equation.kind, terminals: [id + ":a", id + ":b"],
        parameters: { [properties[equation.kind]]: equation.value, ...(equation.kind === "r" ? {} : { initial }) },
      };
      equivalents.set(id, equation);
      branches = branches.filter(branch => branch.component.id !== bId)
        .map(branch => branch.component.id === aId ? { component, nodes } : branch);
      changed = true;
      break;
    }
    if (!changed) break;
  }

  if (!equivalents.size) return { ok: true, topology, equivalents };
  const deviceTerminals = new Set(topology.components.flatMap(component => component.terminals));
  const junctions = originalNets.filter(net => net.every(id => !deviceTerminals.has(id))).map(net => net[0]);
  const firstInNet = new Map<number, string>();
  const wires: { id: string; from: string; to: string }[] = [];
  for (const { component, nodes } of branches) {
    for (const [i, terminal] of component.terminals.entries()) {
      const from = firstInNet.get(nodes[i]);
      if (from === undefined) firstInNet.set(nodes[i], terminal);
      else wires.push({ id: allocate("rlcConnection"), from, to: terminal });
    }
  }
  return { ok: true, topology: { junctions, components: branches.map(branch => branch.component), wires }, equivalents };
}
