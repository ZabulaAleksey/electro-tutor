import { exactLcParameters, type LcKind, type LcTicks } from "../models/lc-nominal";
import { gcd, multiply, type Fraction } from "../models/lc-polynomial";
import { analyzeLcTopology, lcNominalTicks, MAX_LC_GRAPH_COMPONENTS } from "../models/reactive-lc-graph";
import { netlist, validateCircuit, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";

const RULES = {
  "l-series": ["L = L1 + L2"],
  "l-parallel": ["L = L1·L2 / (L1 + L2)"],
  "c-series": ["C = C1·C2 / (C1 + C2)"],
  "c-parallel": ["C = C1 + C2"],
  "l-y-to-delta": ["X = L", "Xij = (Xa·Xb + Xb·Xc + Xc·Xa) / Xk"],
  "l-delta-to-y": ["X = L", "Xi = Xij·Xik / (Xab + Xac + Xbc)"],
  "c-y-to-delta": ["X = 1/C", "Xij = (Xa·Xb + Xb·Xc + Xc·Xa) / Xk", "Cij = 1/Xij"],
  "c-delta-to-y": ["X = 1/C", "Xi = Xij·Xik / (Xab + Xac + Xbc)", "Ci = 1/Xi"],
  "lc-capacitive-forward": ["Cp = Ca·Cb / (Ca + Cb)", "Cs = Cb² / (Ca + Cb)", "Ls = L·((Ca + Cb) / Cb)²"],
  "lc-capacitive-inverse": ["Cb = Cp + Cs", "Ca = Cp·(Cp + Cs) / Cs", "L = Ls·(Cs / (Cp + Cs))²"],
  "lc-inductive-forward": ["Lp = La·Lb / (La + Lb)", "Ls = Lb² / (La + Lb)", "Ceq = C·((La + Lb) / Lb)²"],
  "lc-inductive-inverse": ["Lb = Lp + Ls", "La = Lp·(Lp + Ls) / Ls", "C = Ceq·(Ls / (Lp + Ls))²"],
} as const;

export type LcRuleId = keyof typeof RULES;
const ruleOrder = new Map((Object.keys(RULES) as LcRuleId[]).map((id, index) => [id, index]));
export type LcTransformTerm = Readonly<{ id: string; kind: LcKind; ticks: LcTicks; role: string; endpoints: readonly [string, string] }>;
export type LcTransformStep = Readonly<{
  ruleId: LcRuleId;
  before: CircuitTopology;
  after: CircuitTopology;
  boundaryEndpoints: readonly string[];
  removed: readonly LcTransformTerm[];
  added: readonly LcTransformTerm[];
  formula: readonly string[];
  cost: { before: number; after: number };
  proofs: readonly { terminals: readonly [string, string]; before: Fraction; after: Fraction }[];
}>;
type TickReader = (part: CircuitComponent) => LcTicks;
export type LcTransformPlan = Readonly<{
  topology: CircuitTopology;
  values: ReadonlyMap<string, LcTicks>;
  steps: readonly LcTransformStep[];
  exhausted: boolean;
  explored: number;
}>;

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const nodePair = (a: number, b: number) => a < b ? a + ":" + b : b + ":" + a;
const newInterior = -1;
const isLc = (part: CircuitComponent) => part.kind === "l" || part.kind === "c";
const countLc = (topology: CircuitTopology) => topology.components.filter(isLc).length;

function rational(numerator: bigint, denominator: bigint): LcTicks {
  if (numerator <= 0n || denominator <= 0n) throw Error("invalid-lc-value");
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
const sum = (a: LcTicks, b: LcTicks) =>
  rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
const product = (a: LcTicks, b: LcTicks) =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator);
const reciprocal = (a: LcTicks) => ({ numerator: a.denominator, denominator: a.numerator });
const divide = (a: LcTicks, b: LcTicks) => product(a, reciprocal(b));
const square = (a: LcTicks) => product(a, a);

type ValueEdge = { kind: LcKind; ticks: LcTicks; nodes: readonly [number, number] };
type Edge = ValueEdge & { part: CircuitComponent };
type Input = { edge: Edge; role: string };
type Output = ValueEdge & { role: string };
type Candidate = {
  ruleId: LcRuleId;
  boundary: number[];
  interior: number[];
  inputs: Input[];
  outputs: Output[];
};

function valuesFor(topology: CircuitTopology, readTicks: TickReader): ReadonlyMap<string, LcTicks> {
  if (countLc(topology) > MAX_LC_GRAPH_COMPONENTS) throw Error("lc-graph-limit");
  return new Map(topology.components.filter(isLc).map(part => {
    const ticks = readTicks(part);
    return [part.id, rational(ticks.numerator, ticks.denominator)];
  }));
}

function mapGraph(topology: CircuitTopology, observedEndpoints: readonly string[], values: ReadonlyMap<string, LcTicks>) {
  const nets = netlist(topology);
  const membership = new Map(nets.flatMap((entry, node) => entry.map(endpoint => [endpoint, node] as const)));
  if (observedEndpoints.some(id => !membership.has(id))) throw Error("unknown-observed-endpoint");
  const observed = new Set([...observedEndpoints, ...topology.components.filter(part => part.kind === "port").flatMap(part => part.terminals)]);
  const protectedNodes = new Set([...observed].map(id => membership.get(id)!));
  const incidence = nets.map(() => 0);
  const active = nets.map<Edge[]>(() => []);
  const pairs = new Map<string, Edge[]>();
  const edges: Edge[] = [];
  for (const part of [...topology.components].sort((a, b) => compare(a.id, b.id))) {
    const nodes = part.terminals.map(id => membership.get(id)!);
    for (const node of nodes) incidence[node]++;
    if ((part.kind !== "l" && part.kind !== "c") || nodes.length !== 2
      || nodes[0] === nodes[1] || (part.parameters.initial ?? 0) !== 0
      || part.terminals.some(id => observed.has(id))
      || Object.keys(part.parameters).some(key => !["henry", "farad", "initial", "lcExact"].includes(key))) continue;
    const edge: Edge = { part, kind: part.kind, nodes: [nodes[0], nodes[1]], ticks: values.get(part.id)! };
    edges.push(edge);
    for (const node of nodes) active[node].push(edge);
    const key = nodePair(nodes[0], nodes[1]);
    const group = pairs.get(key) ?? [];
    group.push(edge);
    pairs.set(key, group);
  }

  return { nets, membership, incidence, active, pairs, edges, observed, protectedNodes };
}
type Graph = ReturnType<typeof mapGraph>;

function outside(edge: Edge, node: number) {
  return edge.nodes[0] === node ? edge.nodes[1] : edge.nodes[0];
}

function orderedNodes(nodes: number[]) {
  return [...new Set(nodes)].sort((a, b) => a - b);
}

function labelInputs(edges: Edge[], roles: string[]): Input[] {
  return edges.map((edge, index) => ({ edge, role: roles[index] }));
}

function output(role: string, kind: LcKind, ticks: LcTicks, a: number, b: number): Output {
  return { kind, ticks, nodes: [a, b], role };
}

function combinePair(edges: [Edge, Edge], boundary: number[], series: boolean, middle?: number): Candidate {
  const [first, second] = edges;
  const kind = first.kind;
  const name = kind.toUpperCase();
  const combined = series === (kind === "l") ? sum(first.ticks, second.ticks)
    : reciprocal(sum(reciprocal(first.ticks), reciprocal(second.ticks)));
  return {
    ruleId: series ? (kind === "l" ? "l-series" : "c-series") : (kind === "l" ? "l-parallel" : "c-parallel"),
    boundary, interior: middle === undefined ? [] : [middle],
    inputs: labelInputs(edges, [name + "1", name + "2"]),
    outputs: [output(name, kind, combined, boundary[0], boundary[1])],
  };
}

function directCandidates(graph: Graph): Candidate[] {
  const result: Candidate[] = [];
  for (const group of graph.pairs.values()) {
    for (let i = 0; i < group.length; i++) {
      for (const second of group.slice(i + 1)) {
        if (group[i].kind === second.kind)
          result.push(combinePair([group[i], second], orderedNodes([...group[i].nodes]), false));
      }
    }
  }
  for (const [middle, connected] of graph.active.entries()) {
    if (graph.protectedNodes.has(middle) || graph.incidence[middle] !== 2 || connected.length !== 2
      || connected[0].kind !== connected[1].kind) continue;
    const boundary = orderedNodes(connected.map(edge => outside(edge, middle)));
    if (boundary.length === 2) result.push(combinePair([connected[0], connected[1]], boundary, true, middle));
  }
  return result;
}

function starToDelta(arms: Edge[], middle: number): Candidate {
  const kind = arms[0].kind;
  const star = [...arms].sort((a, b) => outside(a, middle) - outside(b, middle));
  const [a, b, c] = star.map(edge => outside(edge, middle));
  const [x, y, z] = star.map(edge => kind === "c" ? reciprocal(edge.ticks) : edge.ticks);
  const pairSum = sum(sum(product(x, y), product(y, z)), product(z, x));
  const converted = (opposite: LcTicks) => kind === "l" ? divide(pairSum, opposite) : divide(opposite, pairSum);
  return {
    ruleId: kind === "l" ? "l-y-to-delta" : "c-y-to-delta",
    boundary: [a, b, c], interior: [middle], inputs: labelInputs(star, ["a", "b", "c"]),
    outputs: [output("ab", kind, converted(z), a, b), output("ac", kind, converted(y), a, c), output("bc", kind, converted(x), b, c)],
  };
}

function deltaToStar(ab: Edge, ac: Edge, bc: Edge, a: number, b: number, c: number): Candidate {
  const kind = ab.kind;
  const [x, y, z] = [ab, ac, bc].map(edge => kind === "c" ? reciprocal(edge.ticks) : edge.ticks);
  const total = sum(sum(x, y), z);
  const converted = (u: LcTicks, v: LcTicks) => kind === "l" ? divide(product(u, v), total) : divide(total, product(u, v));
  return {
    ruleId: kind === "l" ? "l-delta-to-y" : "c-delta-to-y",
    boundary: [a, b, c], interior: [], inputs: labelInputs([ab, ac, bc], ["ab", "ac", "bc"]),
    outputs: [output("a", kind, converted(x, y), a, newInterior), output("b", kind, converted(x, z), b, newInterior),
      output("c", kind, converted(y, z), c, newInterior)],
  };
}

function formValues(x: LcTicks, a: LcTicks, b: LcTicks) {
  const total = sum(a, b);
  return { p: divide(product(a, b), total), s: divide(square(b), total), xPrime: product(x, square(divide(total, b))) };
}

function inverseValues(xPrime: LcTicks, p: LcTicks, s: LcTicks) {
  const total = sum(p, s);
  return { b: total, a: divide(product(p, total), s), x: product(xPrime, square(divide(s, total))) };
}

function parallelThenSeries(l: Edge, c: Edge, extension: Edge, middle: number): Candidate {
  const a = outside(l, middle), b = outside(extension, middle);
  const region = { boundary: orderedNodes([a, b]), interior: [middle] };
  if (extension.kind === "c") {
    const { p, s, xPrime } = formValues(l.ticks, c.ticks, extension.ticks);
    return {
      ...region, ruleId: "lc-capacitive-forward", inputs: labelInputs([l, c, extension], ["L", "Ca", "Cb"]),
      outputs: [output("Cp", "c", p, a, b), output("Ls", "l", xPrime, a, newInterior), output("Cs", "c", s, newInterior, b)],
    };
  }
  const values = inverseValues(c.ticks, extension.ticks, l.ticks);
  return {
    ...region, ruleId: "lc-inductive-inverse", inputs: labelInputs([c, extension, l], ["Ceq", "Lp", "Ls"]),
    outputs: [output("Lb", "l", values.b, a, b), output("C", "c", values.x, a, newInterior), output("La", "l", values.a, newInterior, b)],
  };
}

function seriesThenParallel(l: Edge, c: Edge, shunt: Edge, middle: number): Candidate {
  const region = { boundary: orderedNodes([outside(l, middle), outside(c, middle)]), interior: [middle] };
  if (shunt.kind === "l") {
    const [a, b] = [outside(c, middle), outside(l, middle)];
    const { p, s, xPrime } = formValues(c.ticks, l.ticks, shunt.ticks);
    return {
      ...region, ruleId: "lc-inductive-forward", inputs: labelInputs([c, l, shunt], ["C", "La", "Lb"]),
      outputs: [output("Ceq", "c", xPrime, a, newInterior), output("Ls", "l", s, a, newInterior), output("Lp", "l", p, newInterior, b)],
    };
  }
  const [a, b] = [outside(l, middle), outside(c, middle)];
  const values = inverseValues(l.ticks, shunt.ticks, c.ticks);
  return {
    ...region, ruleId: "lc-capacitive-inverse", inputs: labelInputs([l, shunt, c], ["Ls", "Cp", "Cs"]),
    outputs: [output("L", "l", values.x, a, newInterior), output("Ca", "c", values.a, a, newInterior), output("Cb", "c", values.b, newInterior, b)],
  };
}

function alternativeCandidates(graph: Graph): Candidate[] {
  const result: Candidate[] = [];
  for (const [node, edges] of graph.active.entries()) {
    if (graph.protectedNodes.has(node) || graph.incidence[node] !== edges.length) continue;
    if (edges.length === 3) {
      const ends = edges.map(edge => outside(edge, node));
      if (new Set(ends).size === 3 && edges.every(edge => edge.kind === edges[0].kind)) {
        result.push(starToDelta(edges, node));
      }
      for (const [i, l] of edges.entries()) {
        if (l.kind !== "l") continue;
        const c = edges.find((edge, index) => edge.kind === "c" && ends[index] === ends[i]);
        if (!c) continue;
        const extension = edges.find(edge => edge !== l && edge !== c)!;
        if (outside(extension, node) !== ends[i]) result.push(parallelThenSeries(l, c, extension, node));
      }
    }
    if (edges.length === 2 && edges[0].kind !== edges[1].kind) {
      const l = edges.find(edge => edge.kind === "l")!, c = edges.find(edge => edge.kind === "c")!;
      const a = outside(l, node), b = outside(c, node);
      if (a !== b) for (const shunt of graph.pairs.get(nodePair(a, b)) ?? [])
        result.push(seriesThenParallel(l, c, shunt, node));
    }
  }

  for (const ab of graph.edges) {
    const [a, b] = orderedNodes([...ab.nodes]);
    for (const ac of graph.active[a]) {
      const c = outside(ac, a);
      if (c <= b || ac.kind !== ab.kind) continue;
      for (const bc of graph.pairs.get(nodePair(b, c)) ?? []) {
        if (bc.kind === ab.kind) result.push(deltaToStar(ab, ac, bc, a, b, c));
      }
    }
  }
  return result;
}


function orderCandidates(candidates: Candidate[]) {
  return candidates.sort((a, b) => ruleOrder.get(a.ruleId)! - ruleOrder.get(b.ruleId)!
    || compare(a.inputs.map(({ edge }) => edge.part.id).join("/"), b.inputs.map(({ edge }) => edge.part.id).join("/")));
}

function proofTopology(edges: ValueEdge[]) {
  const endpoint = (node: number) => "ProofNode" + node;
  const topology: CircuitTopology = {
    junctions: orderedNodes(edges.flatMap(edge => [...edge.nodes])).map(endpoint),
    components: edges.map((edge, i) => ({
      id: "ProofPart" + i, kind: edge.kind, terminals: ["ProofPart" + i + ":a", "ProofPart" + i + ":b"], parameters: {},
    })),
    wires: edges.flatMap((edge, i) => edge.nodes.map((node, j) =>
      ({ id: "ProofWire" + i + ":" + j, from: endpoint(node), to: "ProofPart" + i + (j === 0 ? ":a" : ":b") }))),
  };
  const values = new Map(topology.components.map((part, i) => [part.id, edges[i].ticks]));
  return {
    analyze(a: number, b: number) {
      const result = analyzeLcTopology(topology, [endpoint(a), endpoint(b)], part => values.get(part.id)!);
      if (result.kind !== "finite") throw Error("lc-rule-invalid-port");
      return result.impedance;
    },
  };
}

function verifyCandidate(candidate: Candidate, boundaryEndpoints: string[]): LcTransformStep["proofs"] {
  const before = proofTopology(candidate.inputs.map(({ edge }) => edge));
  const after = proofTopology(candidate.outputs);
  return candidate.boundary.flatMap((from, i) => candidate.boundary.slice(i + 1).map((to, j) => {
    const first = before.analyze(from, to), second = after.analyze(from, to);
    const forward = multiply(first.numerator, second.denominator), reverse = multiply(second.numerator, first.denominator);
    if (forward.length !== reverse.length || forward.some((term, index) => term !== reverse[index])) {
      throw Error("lc-rule-equivalence:" + candidate.ruleId);
    }
    return { terminals: [boundaryEndpoints[i], boundaryEndpoints[i + j + 1]] as const, before: first, after: second };
  }));
}

type State = Pick<LcTransformPlan, "topology" | "values" | "steps"> & { used: ReadonlySet<string> };

function initialState(topology: CircuitTopology, readTicks: TickReader, reservedIds: readonly string[] = []): State {
  return {
    topology, values: valuesFor(topology, readTicks), steps: [],
    used: new Set([...reservedIds, ...topology.junctions, ...topology.wires.map(wire => wire.id),
      ...topology.components.flatMap(part => [part.id, ...part.terminals])]),
  };
}

function allocator(used: Set<string>) {
  return (prefix: string, terminals = false) => {
    let i = 1;
    const ids = (n: number) => terminals ? [prefix + n, prefix + n + ":a", prefix + n + ":b"] : [prefix + n];
    while (ids(i).some(id => used.has(id))) i++;
    ids(i).forEach(id => used.add(id));
    return prefix + i;
  };
}

function patchCandidate(state: State, graph: Graph, candidate: Candidate): State | undefined {
  let parameters: CircuitComponent["parameters"][];
  try {
    parameters = candidate.outputs.map(edge => exactLcParameters(edge.kind, edge.ticks));
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-lc-exact-value") return;
    throw error;
  }

  const { topology } = state;
  const used = new Set(state.used);
  const allocate = allocator(used);
  const componentIds = new Set(candidate.inputs.map(({ edge }) => edge.part.id));
  const removedEndpoints = new Set(candidate.inputs.flatMap(({ edge }) => [...edge.part.terminals]));
  for (const node of candidate.interior) graph.nets[node].forEach(id => removedEndpoints.add(id));

  const junctions = topology.junctions.filter(id => !removedEndpoints.has(id));
  const priorJunctions = new Set(junctions);
  const anchors = new Map<number, string>();
  for (const node of candidate.boundary) {
    const survivors = graph.nets[node].filter(id => !removedEndpoints.has(id));
    // Prefer stable observed pins or symbolic junctions before other terminals.
    const representative = survivors.find(id => graph.observed.has(id)) ?? survivors.find(id => priorJunctions.has(id))
      ?? survivors[0] ?? graph.nets[node][0];
    if (!survivors.length) junctions.push(representative);
    anchors.set(node, representative);
  }
  if (candidate.outputs.some(edge => edge.nodes.includes(newInterior))) {
    const id = allocate("LcJ");
    junctions.push(id);
    anchors.set(newInterior, id);
  }

  const components = topology.components.filter(part => !componentIds.has(part.id));
  const wires = topology.wires.filter(wire => !removedEndpoints.has(wire.from) && !removedEndpoints.has(wire.to));
  const addWire = (from: string, to: string): CircuitWire => ({ id: allocate("LcW"), from, to });
  // Reconnect only surviving portions of the same original electrical net.
  const remaining = new Map(netlist({ components, junctions, wires })
    .flatMap(net => net.map(id => [id, net[0]] as const)));
  for (const node of candidate.boundary) {
    const anchor = anchors.get(node)!;
    const segments = new Set(graph.nets[node].map(id => remaining.get(id)).filter(id => id !== undefined));
    segments.delete(remaining.get(anchor)!);
    for (const representative of segments) wires.push(addWire(anchor, representative));
  }

  const values = new Map(state.values);
  for (const id of componentIds) values.delete(id);
  const added = candidate.outputs.map((edge, i): LcTransformTerm => {
    const id = allocate(edge.kind === "l" ? "Leq" : "Ceq", true);
    const terminals = [id + ":a", id + ":b"];
    const endpoints = [anchors.get(edge.nodes[0])!, anchors.get(edge.nodes[1])!] as const;
    components.push({ id, kind: edge.kind, terminals, parameters: parameters[i] });
    wires.push(addWire(endpoints[0], terminals[0]), addWire(endpoints[1], terminals[1]));
    values.set(id, edge.ticks);
    return { id, kind: edge.kind, ticks: edge.ticks, role: edge.role, endpoints };
  });

  const after = { components, junctions, wires };
  const issues = validateCircuit(after);
  if (issues.length) throw Error(issues.join(", "));
  const boundaryEndpoints = candidate.boundary.map(node => anchors.get(node)!);
  const step: LcTransformStep = {
    ruleId: candidate.ruleId, before: topology, after, boundaryEndpoints, added,
    removed: candidate.inputs.map(({ edge, role }) => ({
      id: edge.part.id, kind: edge.kind, ticks: edge.ticks, role,
      endpoints: edge.nodes.map(node => anchors.get(node) ?? graph.nets[node][0]) as [string, string],
    })),
    formula: RULES[candidate.ruleId], cost: { before: state.values.size, after: values.size },
    proofs: verifyCandidate(candidate, boundaryEndpoints),
  };
  return { topology: after, values, steps: [...state.steps, step], used };
}

function publicPlan(state: State, explored: number, exhausted: boolean): LcTransformPlan {
  return { topology: state.topology, values: state.values, steps: state.steps, explored, exhausted };
}

/** Apply one named rule, using the first stable eligible local pattern. */
export function applyLcRule(
  topology: CircuitTopology,
  ruleId: LcRuleId,
  observedEndpoints: readonly string[] = [],
  readTicks: TickReader = lcNominalTicks,
): LcTransformPlan | undefined {
  const state = initialState(topology, readTicks);
  const graph = mapGraph(topology, observedEndpoints, state.values);
  const patterns = [...directCandidates(graph), ...alternativeCandidates(graph)].filter(candidate => candidate.ruleId === ruleId);
  for (const candidate of orderCandidates(patterns)) {
    const applied = patchCandidate(state, graph, candidate);
    if (applied) return publicPlan(applied, 1, false);
  }
}

function labelColors(labels: string[]) {
  const order = new Map([...new Set(labels)].sort(compare).map((label, i) => [label, i]));
  return { colors: labels.map(label => order.get(label)!), distinct: order.size };
}

/** A graph-refinement signature, independent of generated part and wire IDs.
 * Equivalent color symmetries are deliberately pruned by this bounded heuristic. */
function signature(topology: CircuitTopology, values: ReadonlyMap<string, LcTicks>, observedEndpoints: readonly string[]) {
  const nets = netlist(topology);
  const membership = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
  const anchors = new Set(observedEndpoints);
  for (const part of topology.components) {
    if (!isLc(part)) part.terminals.forEach(id => anchors.add(id));
  }
  const labels = nets.map(net => JSON.stringify(net.filter(id => anchors.has(id))));
  const neighbors = nets.map<{ net: number; label: string }[]>(() => []);
  const edges = topology.components.flatMap(part => {
    const ticks = values.get(part.id);
    if (!ticks || part.terminals.length !== 2) return [];
    const [first, second] = part.terminals.map(id => membership.get(id)!);
    const tag = JSON.stringify([part.kind, ticks.numerator.toString(), ticks.denominator.toString(), part.parameters.initial ?? 0]);
    neighbors[first].push({ net: second, label: tag });
    neighbors[second].push({ net: first, label: tag });
    return [{ first, second, tag }];
  });

  let labelled = labelColors(labels);
  for (let i = 0; i < nets.length; i++) {
    const { colors, distinct } = labelled;
    const next = labelColors(labels.map((label, index) => JSON.stringify([label, colors[index],
      neighbors[index].map(edge => edge.label + "/" + colors[edge.net]).sort(compare)])));
    labelled = next;
    if (next.distinct === distinct) break;
  }
  const { colors } = labelled;
  return JSON.stringify([
    labels.map((label, index) => JSON.stringify([label, colors[index]])).sort(compare),
    edges.map(({ first, second, tag }) => tag + "/" + nodePair(colors[first], colors[second])).sort(compare),
  ]);
}

function normalizeDirect(initial: State, observed: readonly string[]) {
  let state = initial;
  for (;;) {
    const graph = mapGraph(state.topology, observed, state.values);
    const candidates = orderCandidates(directCandidates(graph));
    let next: State | undefined;
    for (const candidate of candidates) {
      next = patchCandidate(state, graph, candidate);
      if (next) break;
    }
    if (!next) return state;
    state = next;
  }
}

export type LcTransformLimits = Readonly<{ maxDepth?: number; maxCandidates?: number; reservedIds?: readonly string[] }>;

function budget(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw Error("invalid-lc-plan-budget");
  return value;
}

/** Start with exact cost-decreasing reductions. Then explore a bounded set of
 * size-preserving shapes that can unlock more local reductions. */
export function planLcTransforms(
  topology: CircuitTopology,
  observedEndpoints: readonly string[] = [],
  readTicks: TickReader = lcNominalTicks,
  limits: LcTransformLimits = {},
): LcTransformPlan {
  const maxDepth = budget(limits.maxDepth, 3, 12), maxCandidates = budget(limits.maxCandidates, 36, 256);
  const initial = normalizeDirect(initialState(topology, readTicks, limits.reservedIds), observedEndpoints);
  const initialSignature = signature(initial.topology, initial.values, observedEndpoints);
  const visited = new Map([[initialSignature, 0]]);
  const queue = [{ state: initial, depth: 0, signature: initialSignature, priority: -1 }];
  let best = initial;
  let explored = 0;
  let exhausted = false;

  while (queue.length) {
    const entry = queue.shift()!;
    const { state, depth } = entry;
    if (depth !== visited.get(entry.signature)) continue;
    const graph = mapGraph(state.topology, observedEndpoints, state.values);
    const candidates = orderCandidates(alternativeCandidates(graph));
    for (const candidate of candidates) {
      if (depth >= maxDepth || explored >= maxCandidates) {
        exhausted = true;
        break;
      }
      explored++;
      const applied = patchCandidate(state, graph, candidate);
      if (!applied) { exhausted = true; continue; }
      const next = normalizeDirect(applied, observedEndpoints);
      const key = signature(next.topology, next.values, observedEndpoints);
      const nextDepth = depth + 1;
      if ((visited.get(key) ?? Infinity) <= nextDepth) continue;
      visited.set(key, nextDepth);
      if (next.values.size < best.values.size || next.values.size === best.values.size && next.steps.length < best.steps.length) {
        best = next;
      }
      queue.push({ state: next, depth: nextDepth, signature: key, priority: ruleOrder.get(candidate.ruleId)! });
    }
    queue.sort((a, b) => a.state.values.size - b.state.values.size || a.priority - b.priority
      || compare(a.signature, b.signature) || a.depth - b.depth);
    if (explored >= maxCandidates && queue.length) { exhausted = true; break; }
  }
  return publicPlan(best, explored, exhausted);
}
