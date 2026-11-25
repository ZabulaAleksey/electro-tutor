import { it } from "vitest";
import { parts } from "../../src/circuit/drawing";
import { newLcExperiment } from "../../src/circuit/lc-experiment";
import { TopologySession, type TopologyCommand, type TopologyLabDocument } from "../../src/circuit/topology-session";
import type { TopologySlot } from "../../src/circuit/topology-slots";
import type { CircuitComponent, CircuitTopology, CircuitWire } from "../../src/circuit/topology";
import { newLineExperiment } from "../../src/transient/line-experiment";

type Editor = "lc" | "line";
type SeriesSlot = Extract<TopologySlot, { kind: "series" }>;
type ParallelSlot = Extract<TopologySlot, { kind: "parallel" }>;
type Verification = (before: TopologyLabDocument, after: TopologyLabDocument) => void;
type Trace = { operation: string; command?: TopologyCommand };

const profiles = {
  fast: { count: 8, minimum: 12, variation: 9 },
  extended: { count: 1000, minimum: 16, variation: 18 },
  stress: { count: 2000, minimum: 36, variation: 25 },
} as const;
const profile = process.env.ET_LABC_EVAL_PROFILE ?? "fast";
if (!Object.hasOwn(profiles, profile)) throw Error("ET_LABC_EVAL_PROFILE must be fast, extended or stress.");
const workload = profiles[profile as keyof typeof profiles];
const replaySeed = process.env.ET_LABC_EVAL_SEED === undefined ? undefined : Number(process.env.ET_LABC_EVAL_SEED);
if (replaySeed !== undefined && (!Number.isInteger(replaySeed) || replaySeed < 1 || replaySeed > 0xffffffff)) {
  throw Error("ET_LABC_EVAL_SEED must be an integer between 1 and 4294967295.");
}

const lcPort = ["P1:a", "P1:b"] as const;
const linePorts = ["TL1:a", "TL1:b", "TL1:return-in", "TL1:return-out"] as const;
const frequencies = [127, 941, 2718] as const;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

function randomFrom(seed: number) {
  let state = Math.imul(seed, 0x9e3779b9);
  return (length: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.floor((state >>> 0) / 0x100000000 * length);
  };
}

const pair = (a: string, b: string) => a < b ? a + "|" + b : b + "|" + a;
const endpointIds = (graph: CircuitTopology) => [...graph.junctions, ...graph.components.flatMap(part => part.terminals)];
const edgePairs = (wires: readonly CircuitWire[]) => wires.map(wire => pair(wire.from, wire.to));
const sorted = (values: readonly string[]) => [...values].sort();
const same = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length && first.every((item, index) => item === second[index]);

/** Independent graph walk. Only declared wires join endpoints; pins on a part do not. */
function electricalNodes(graph: CircuitTopology) {
  const adjacent = new Map(endpointIds(graph).map(id => [id, [] as string[]]));
  for (const { from, to } of graph.wires) {
    adjacent.get(from)!.push(to);
    adjacent.get(to)!.push(from);
  }
  const nodes = new Map<string, number>();
  let count = 0;
  for (const endpoint of adjacent.keys()) {
    if (nodes.has(endpoint)) continue;
    const pending = [endpoint];
    nodes.set(endpoint, count);
    for (let index = 0; index < pending.length; index++) {
      for (const peer of adjacent.get(pending[index])!) {
        if (nodes.has(peer)) continue;
        nodes.set(peer, count);
        pending.push(peer);
      }
    }
    count++;
  }
  return nodes;
}

function partition(nodes: ReadonlyMap<string, number>, endpoints: readonly string[]) {
  const groups = new Map<number, string[]>();
  for (const id of endpoints) {
    const node = nodes.get(id)!;
    groups.set(node, [...groups.get(node) ?? [], id]);
  }
  return sorted([...groups.values()].map(group => sorted(group).join("|")));
}

function resultParts(parts: readonly CircuitComponent[]) {
  return sorted(parts.map(part => JSON.stringify([part.id, part.kind, part.terminals,
    Object.entries(part.parameters).sort(([a], [b]) => a.localeCompare(b))])));
}

function checkWires(after: CircuitTopology, expected: readonly string[]) {
  check(same(sorted(edgePairs(after.wires)), sorted(expected)), "Unexpected conducting edges.");
}

function checkParts(after: CircuitTopology, expected: readonly CircuitComponent[]) {
  check(same(resultParts(after.components), resultParts(expected)), "Unexpected parts, parameters or terminal identities.");
}

function checkOpened(after: TopologyLabDocument, expected: readonly CircuitWire[]) {
  const triples = (wires: readonly CircuitWire[]) => sorted(wires.map(wire => JSON.stringify([wire.id, wire.from, wire.to])));
  check(same(triples(after.brokenWires ?? []), triples(expected)), "Unexpected reserved broken-wire identities.");
}

function checkDocument(editor: Editor, document: TopologyLabDocument) {
  const graph = document.topology;
  const endpoints = endpointIds(graph);
  const pointIds = new Set(endpoints);
  const allWires = [...graph.wires, ...document.brokenWires ?? []];
  const ids = [...endpoints, ...graph.components.map(part => part.id), ...allWires.map(wire => wire.id)];
  check(new Set(ids).size === ids.length, "Duplicate graph or reserved wire ID.");
  check(allWires.every(wire => wire.from !== wire.to && pointIds.has(wire.from) && pointIds.has(wire.to)),
    "Wire has an unknown endpoint or connects an endpoint to itself.");
  check(new Set(edgePairs(allWires)).size === allWires.length, "Duplicate physical wire.");
  check(document.schemaVersion === ((document.brokenWires?.length ?? 0) ? 2 : 1), "Wrong schema for open wires.");
  const protectedPins = editor === "lc" ? lcPort : linePorts;
  const protectedPart = graph.components.find(part => part.id === (editor === "lc" ? "P1" : "TL1"));
  check(protectedPart && same(protectedPart.terminals, protectedPins), "The measurement or line terminal identities changed.");
  const nodes = electricalNodes(graph);
  check(new Set(protectedPins.map(pin => nodes.get(pin))).size === protectedPins.length,
    "A physical input, output or return net became shorted.");
  if (editor === "lc") check(same(document.observedEndpoints, lcPort), "The measured external terminals changed.");
}

function ownSusceptance(part: CircuitComponent, omega: number) {
  return part.kind === "c" ? omega * Number(part.parameters.farad) : -1 / (omega * Number(part.parameters.henry));
}

/** Unit voltage on a, zero on b. A real nodal solve suffices for ideal LC admittances. */
function portSusceptance(graph: CircuitTopology, omega: number): number | undefined {
  const nodes = electricalNodes(graph);
  const input = nodes.get(lcPort[0])!, ground = nodes.get(lcPort[1])!;
  const branches = graph.components.filter(part => part.kind !== "port").map(part => ({
    a: nodes.get(part.terminals[0])!, b: nodes.get(part.terminals[1])!, weight: ownSusceptance(part, omega),
  }));
  const reachable = new Set([input, ground]);
  for (const id of reachable) {
    for (const { a, b } of branches) {
      if (a === id) reachable.add(b);
      if (b === id) reachable.add(a);
    }
  }
  const unknown = [...reachable].filter(node => node !== input && node !== ground);
  const index = new Map(unknown.map((node, position) => [node, position]));
  const matrix = unknown.map(() => Array<number>(unknown.length + 1).fill(0));
  for (const { a, b, weight } of branches) {
    if (a === b) continue;
    for (const [from, to] of [[a, b], [b, a]]) {
      const row = index.get(from);
      if (row === undefined) continue;
      const column = index.get(to);
      matrix[row][row] += weight;
      if (column !== undefined) matrix[row][column] -= weight;
      if (to === input) matrix[row][unknown.length] += weight;
    }
  }
  for (let column = 0; column < unknown.length; column++) {
    let pivot = column;
    for (let row = column + 1; row < unknown.length; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    const divisor = matrix[pivot][column];
    if (Math.abs(divisor) <= 1e-12 * Math.max(...matrix[pivot].slice(0, -1).map(Math.abs))) return;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    for (let item = column; item <= unknown.length; item++) matrix[column][item] /= divisor;
    for (const [row, values] of matrix.entries()) {
      if (row === column) continue;
      const ratio = values[column];
      for (let item = column; item <= unknown.length; item++) values[item] -= ratio * matrix[column][item];
    }
  }
  let current = 0;
  for (const { a, b, weight } of branches) {
    if (a !== input && b !== input) continue;
    const peer = a === input ? b : a;
    const voltage = peer === input ? 1 : peer === ground ? 0 : matrix[index.get(peer)!][unknown.length];
    current += weight * (1 - voltage);
  }
  return current;
}

function checkLcAdmittance(before: CircuitTopology, after: CircuitTopology, added?: CircuitComponent) {
  let compared = 0;
  for (const omega of frequencies) {
    const original = portSusceptance(before, omega), changed = portSusceptance(after, omega);
    if (original === undefined || changed === undefined) continue;
    const offset = added ? ownSusceptance(added, omega) : 0;
    const expected = original + offset;
    check(Math.abs(changed - expected) < 1e-9 * Math.max(1e-6, Math.abs(original), Math.abs(offset)),
      `LC port susceptance failed at ω=${omega}: expected ${expected}, measured ${changed}.`);
    compared++;
  }
  check(compared >= 2, "Fewer than two non-pole LC frequency checks.");
  return compared;
}

function initialDocument(editor: Editor) {
  return editor === "line" ? newLineExperiment().circuit : newLcExperiment({
    kind: "series", left: { kind: "l", value: 10 }, right: {
      kind: "series", left: { kind: "c", value: 100 }, right: { kind: "l", value: 20 },
    },
  });
}

function attachedWires(graph: CircuitTopology, endpoint: string) {
  return graph.wires.filter(wire => wire.from === endpoint || wire.to === endpoint);
}

function peer(wire: CircuitWire, endpoint: string) {
  return wire.from === endpoint ? wire.to : wire.from;
}

type Bypass = { from: string; to: string };

function removableSeries(graph: CircuitTopology, component: CircuitComponent): Bypass | undefined {
  const [left, right] = component.terminals;
  const first = attachedWires(graph, left), second = attachedWires(graph, right);
  if (first.length !== 1 || second.length !== 1) return;
  const nodes = electricalNodes(graph);
  const a = nodes.get(left)!, b = nodes.get(right)!;
  if (a === b) return;
  const members = (node: number) => graph.components.flatMap(part =>
    part.terminals.filter(pin => nodes.get(pin) === node).map(() => part.id));
  const leftMembers = members(a), rightMembers = members(b);
  if (leftMembers.length !== 2 || rightMembers.length !== 2
    || leftMembers.find(id => id !== component.id) === rightMembers.find(id => id !== component.id)) return;
  return { from: peer(first[0], left), to: peer(second[0], right) };
}

function verifyRemoval(before: TopologyLabDocument, after: TopologyLabDocument, component: CircuitComponent, bypass?: Bypass) {
  const graph = before.topology;
  const kept = graph.components.filter(part => part.id !== component.id);
  checkParts(after.topology, kept);
  const opened = (before.brokenWires ?? []).filter(wire => !component.terminals.includes(wire.from)
    && !component.terminals.includes(wire.to));
  const keptWires = graph.wires.filter(wire => !component.terminals.includes(wire.from) && !component.terminals.includes(wire.to));
  if (bypass) {
    const bridge = pair(bypass.from, bypass.to);
    checkWires(after.topology, [...edgePairs(keptWires), bridge]);
    checkOpened(after, opened.filter(wire => pair(wire.from, wire.to) !== bridge));
    return;
  }
  const surviving = endpointIds(after.topology);
  const edges = new Set(edgePairs(after.topology.wires));
  check(keptWires.every(wire => edges.has(pair(wire.from, wire.to))), "Device removal deleted an unrelated wire.");
  check(same(partition(electricalNodes(graph), surviving), partition(electricalNodes(after.topology), surviving)),
    "Deleting a device merged or cut one of the surviving nets.");
  checkOpened(after, opened);
}

function sequence(editor: Editor, seed: number, coverage: Map<string, number>) {
  const initial = initialDocument(editor);
  let session = new TopologySession(JSON.stringify(initial));
  const trace: Trace[] = [];
  let past: TopologyLabDocument[] = [];
  let future: TopologyLabDocument[] = [];
  let componentIndex = 0, comparisons = 0;
  const random = randomFrom(seed);
  const choose = <T,>(values: readonly T[]) => values[random(values.length)];

  function record(operation: string, action: () => void, command?: TopologyCommand) {
    const before = session.document;
    trace.push({ operation, ...(command ? { command } : {}) });
    try {
      action();
      checkDocument(editor, session.document);
      check(session.canUndo === Boolean(past.length) && session.canRedo === Boolean(future.length), "History availability changed.");
      coverage.set(operation, (coverage.get(operation) ?? 0) + 1);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      const context = { editor, profile, seed, operation: trace.length, reason, initial, before, after: session.document,
        minimalPrefix: trace, failingAction: trace.at(-1) };
      const compactReport = JSON.stringify(context, (key, value) => key === "sourceKey" ? undefined : value, 2);
      throw new Error(`ET-LABC-07 counterexample. Replay with ET_LABC_EVAL_PROFILE=${profile} ET_LABC_EVAL_SEED=${seed}.\n${compactReport}`, { cause });
    }
  }

  function edit(operation: string, command: TopologyCommand, verify: Verification) {
    record(operation, () => {
      const before = session.document;
      session.apply(command);
      check(session.document !== before, "A valid command did not commit.");
      check(same(before.topology.junctions, session.document.topology.junctions), "Existing junction identities changed.");
      if (profile === "fast") {
        const replay = new TopologySession(JSON.stringify(before));
        replay.apply(command);
        check(replay.export() === session.export(), "Replaying a command produced a different archive.");
      }
      verify(before, session.document);
      past = [...past.slice(-63), before];
      future = [];
    }, command);
  }

  function history(operation: "undo" | "redo") {
    record(operation, () => {
      const before = session.document;
      const previous = operation === "undo" ? past.pop() : future.pop();
      check(session[operation]() === Boolean(previous), "Wrong history result.");
      if (!previous) return;
      (operation === "undo" ? future : past).push(before);
      check(JSON.stringify(session.document) === JSON.stringify(previous), "History changed an archived state.");
    });
  }

  function archive() {
    record("archive", () => {
      const saved = session.export();
      session = new TopologySession(saved);
      check(session.export() === saved, "An exported document did not reopen exactly.");
      past = [];
      future = [];
    });
  }

  function rejected(command: TopologyCommand) {
    record("rejected", () => {
      const before = session.document;
      // A repeated invalid action must leave the same snapshot and history.
      for (let attempt = 0; attempt < 2; attempt++) {
        let failed = false;
        try { session.apply(command); } catch { failed = true; }
        check(failed && session.document === before, "An invalid action committed or changed the snapshot.");
      }
    }, command);
  }

  function insert(slot: TopologySlot, kind: "l" | "c" | "r" | "switch", whole = false) {
    const id = (slot.kind === "series" ? "s" : "p") + ++componentIndex;
    const component = { id, kind, terminals: [id + ":a", id + ":b"], parameters: parts[kind].parameters };
    const op = slot.kind === "series" ? "series" : whole ? "external-parallel" : "parallel";
    edit(op, { type: "insert", slot, component }, (before, after) => {
      const graph = before.topology;
      const [from, to] = slot.boundaries;
      const nodes = electricalNodes(graph);
      check(nodes.get(from) !== undefined && nodes.get(to) !== undefined, "Insertion referenced a missing endpoint.");
      check((nodes.get(from) === nodes.get(to)) === (slot.kind === "series"), "Insertion target had the wrong electrical net relationship.");
      const unaffected = graph.wires.filter(wire => slot.kind !== "series" || wire.id !== slot.wireId);
      checkWires(after.topology, [...edgePairs(unaffected), pair(from, component.terminals[0]), pair(to, component.terminals[1])]);
      checkParts(after.topology, [...graph.components, component]);
      checkOpened(after, before.brokenWires ?? []);
      if (whole) comparisons += checkLcAdmittance(graph, after.topology, component);
    });
    return component;
  }

  function remove(component: CircuitComponent, bypass?: Bypass) {
    edit(bypass ? "bypass" : "remove", { type: "remove", componentId: component.id,
      mode: bypass ? "conductor" : "device", protectedEndpoints: [] },
    (before, after) => verifyRemoval(before, after, component, bypass));
  }

  function breakOrRestore(wire: CircuitWire, restoring: boolean) {
    const type = restoring ? "restore-wire" : "break-wire";
    edit(type, { type, wireId: wire.id }, (before, after) => {
      const open = before.brokenWires ?? [];
      const active = before.topology.wires;
      checkWires(after.topology, edgePairs(restoring ? [...active, wire] : active.filter(item => item.id !== wire.id)));
      checkOpened(after, restoring ? open.filter(item => item.id !== wire.id) : [...open, wire]);
      checkParts(after.topology, before.topology.components);
    });
  }

  function seriesSlot(wireId: string) {
    const slot = session.listSlots().find((candidate): candidate is SeriesSlot =>
      candidate.kind === "series" && candidate.wireId === wireId);
    check(slot, "Missing expected wire insertion target: " + wireId);
    return slot;
  }

  function move(source: CircuitComponent, target: SeriesSlot, near: string, exit: number) {
    edit("equivalent-move", { type: "move-series-equivalent", componentId: source.id, slot: target, extra: 0 }, (before, after) => {
      const graph = before.topology;
      const [srcA, srcB] = source.terminals;
      const [oldA] = attachedWires(graph, srcA), [oldB] = attachedWires(graph, srcB);
      const [from, to] = target.boundaries;
      const far = from === near ? to : from;
      const unaffected = graph.wires.filter(wire => ![oldA.id, oldB.id, target.wireId].includes(wire.id));
      checkWires(after.topology, [...edgePairs(unaffected), pair(peer(oldA, srcA), peer(oldB, srcB)),
        pair(near, source.terminals[1 - exit]), pair(far, source.terminals[exit])]);
      checkParts(after.topology, graph.components);
      checkOpened(after, before.brokenWires ?? []);
      if (editor === "lc") comparisons += checkLcAdmittance(graph, after.topology);
    });
  }

  if (editor === "lc") {
    const source = session.document.topology.components.find(part => part.id === "L1")!;
    move(source, seriesSlot("W4"), "C1:b", 1);
    if (profile === "stress") move(source, seriesSlot("W1"), "J1", 0);
    insert(session.crossSlot(...lcPort), seed % 2 ? "l" : "c", true);
  } else {
    const first = insert(seriesSlot("W2"), "r");
    const firstLead = attachedWires(session.document.topology, first.terminals[1])[0];
    const second = insert(seriesSlot(firstLead.id), "r");
    const secondLead = attachedWires(session.document.topology, second.terminals[1])[0];
    move(first, seriesSlot(secondLead.id), second.terminals[1], 1);
    const output = insert(seriesSlot("W3"), "switch");
    const bypass = removableSeries(session.document.topology, output);
    check(bypass, "Expected a removable switch after the line.");
    remove(output, bypass);
    insert(session.crossSlot(linePorts[1], linePorts[3]), "c");
    const rail = session.document.topology.wires.find(wire => wire.id === "W5")!;
    breakOrRestore(rail, false);
    breakOrRestore(rail, true);
  }
  history("undo");
  history("redo");
  archive();
  rejected({ type: "restore-wire", wireId: "missing-wire" });

  const steps = workload.minimum + random(workload.variation);
  for (let step = 0; step < steps; step++) {
    const { topology: graph, brokenWires } = session.document;
    const generated = graph.components.filter(part => /^[sp]\d+$/.test(part.id));
    const atLimit = generated.length >= 12;
    const action = random(10);
    if (action === 0) { history("undo"); continue; }
    if (action === 1) { history("redo"); continue; }
    if (action === 2) { archive(); continue; }
    if (action === 3 && graph.wires.length) { breakOrRestore(choose(graph.wires), false); continue; }
    if (action === 4 && brokenWires?.length) { breakOrRestore(choose(brokenWires), true); continue; }
    if ((action === 5 || atLimit) && generated.length) {
      const component = choose(generated);
      remove(component, action === 5 && component.id.startsWith("s") ? removableSeries(graph, component) : undefined);
      continue;
    }
    if (action === 6 && editor === "lc") {
      insert(session.crossSlot(...lcPort), random(2) ? "l" : "c", true);
      continue;
    }
    if (action === 7) {
      const spans = session.listSlots().filter((slot): slot is ParallelSlot =>
        slot.kind === "parallel" && slot.side === "right" && !slot.componentIds.includes("P1"));
      if (spans.length && random(2)) {
        insert(choose(spans), random(2) ? "l" : "c");
        continue;
      }
      const nodes = electricalNodes(graph);
      const from = choose(endpointIds(graph));
      const to = choose(endpointIds(graph).filter(id => nodes.get(id) !== nodes.get(from)));
      insert(session.crossSlot(from, to), random(2) ? "l" : "c");
      continue;
    }
    if (action === 8) {
      const choices = session.listSlots().filter((slot): slot is SeriesSlot => slot.kind === "series");
      if (choices.length) { insert(choose(choices), editor === "line" && random(2) ? "r" : "l"); continue; }
    }
    rejected({ type: "break-wire", wireId: "missing-wire" });
  }
  archive();
  return { operations: trace.length, comparisons };
}

for (const editor of ["lc", "line"] as const) {
  it(`ET-LABC-07 ${editor}: ${replaySeed === undefined ? workload.count : 1} ${profile} stateful sequences`, () => {
    const stats = { operations: 0, comparisons: 0 };
    const coverage = new Map<string, number>();
    const seeds = replaySeed === undefined ? Array.from({ length: workload.count }, (_, index) => index + 1) : [replaySeed];
    for (const seed of seeds) {
      const sample = sequence(editor, seed, coverage);
      stats.operations += sample.operations;
      stats.comparisons += sample.comparisons;
    }
    if (replaySeed === undefined) {
      const required = ["series", "parallel", "remove", "break-wire", "restore-wire", "undo", "redo", "archive", "rejected", "equivalent-move",
        editor === "lc" ? "external-parallel" : "bypass"];
      check(required.every(action => coverage.has(action)), `Missing generated action: ${required.filter(action => !coverage.has(action))}`);
    }
    console.info(`ET-LABC-07 ${editor} ${profile}: ${seeds.length} sequences, ${stats.operations} operations, ${stats.comparisons} LC frequency comparisons.`);
  }, profile === "stress" ? 240_000 : 120_000);
}
