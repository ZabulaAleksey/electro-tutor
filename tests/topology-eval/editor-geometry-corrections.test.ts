import { describe, expect, it } from "vitest";
import { parts } from "../../src/circuit/drawing";
import { newLcExperiment } from "../../src/circuit/lc-experiment";
import type { CircuitComponent, CircuitTopology } from "../../src/circuit/topology";
import type { TopologySlot } from "../../src/circuit/topology-slots";
import { parseTopologyLabDocument, TopologySession, type TopologyLabDocument } from "../../src/circuit/topology-session";
import type { Point } from "../../src/circuit/topology-layout";
import { layoutLineExperiment, type LineLayout } from "../../src/components/line-experiment-layout";
import { geometryAfterInsertion } from "../../src/components/line-slot-geometry";
import { directTargets } from "../../src/components/line-slot-targets";
import { newLineExperiment } from "../../src/transient/line-experiment";

type Editor = "LC" | "TL";
type Step = {
  part: CircuitComponent;
  kind: TopologySlot["kind"];
  id: string;
  boundaries: readonly [string, string];
  rail: boolean;
};
type Box = { left: number; right: number; top: number; bottom: number };
type Segment = { wire: string; net: string; from: Point; to: Point };
type Failure = { code: string; details?: unknown };

const profiles = {
  fast: { seeds: 20, length: 7, variation: 4, timeout: 30_000 },
  extended: { seeds: 1000, length: 7, variation: 5, timeout: 120_000 },
  stress: { seeds: 2000, length: 8, variation: 6, timeout: 240_000 },
} as const;
const profileName = process.env.ET_LABC_EVAL_PROFILE ?? "fast";
if (!Object.hasOwn(profiles, profileName)) throw Error("Unknown ET_LABC_EVAL_PROFILE: " + profileName);
const profile = profiles[profileName as keyof typeof profiles];

const samePoint = (a?: Point, b?: Point): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
const sameRoute = (a: readonly Point[], b: readonly Point[]) =>
  a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
const interval = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)] as const;
const compare = (a: string, b: string) => a < b ? -1 : a === b ? 0 : 1;

function deterministic(seed: number) {
  let state = seed;
  return (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * count);
  };
}

// Traverse only wires. Components, displayed traces and coincident positions
// contribute no electrical connection.
function referenceNets(topology: CircuitTopology) {
  const points = [...topology.junctions, ...topology.components.flatMap(part => part.terminals)].sort(compare);
  const adjacency = new Map(points.map(id => [id, [] as string[]]));
  for (const { from, to } of topology.wires) {
    adjacency.get(from)!.push(to);
    adjacency.get(to)!.push(from);
  }
  const nets = new Map<string, string>();
  for (const point of points) {
    if (nets.has(point)) continue;
    const pending = [point];
    nets.set(point, point);
    for (const endpoint of pending) {
      for (const other of adjacency.get(endpoint)!) {
        if (nets.has(other)) continue;
        pending.push(other);
        nets.set(other, point);
      }
    }
  }
  return nets;
}

function body(terminalPoints: readonly Point[]): Box {
  const [a, b, ret] = terminalPoints;
  const horizontal = a.y === b.y;
  const [x, endX] = interval(a.x, b.x);
  const [y, endY] = interval(a.y, b.y);
  if (ret) {
    const [otherStart, otherEnd] = horizontal ? interval(a.y, ret.y) : interval(a.x, ret.x);
    return horizontal
      ? { left: x + 6, right: endX - 6, top: otherStart, bottom: otherEnd }
      : { left: otherStart, right: otherEnd, top: y + 6, bottom: endY - 6 };
  }
  return horizontal
    ? { left: x + 8, right: endX - 8, top: a.y - 11, bottom: a.y + 11 }
    : { left: a.x - 11, right: a.x + 11, top: y + 8, bottom: endY - 8 };
}

function geometryFailure(editor: Editor, document: TopologyLabDocument, diagram: LineLayout): Failure | undefined {
  const { topology } = document;
  const nets = referenceNets(topology);
  const diagramWires = new Map(diagram.wires.map(wire => [wire.id, wire.points]));
  const bodies = new Map<string, Box>();
  for (const part of topology.components) {
    const terminals = part.terminals.map(id => diagram.endpoints.get(id));
    if (terminals.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      return { code: "missing-pin", details: part.id };
    }
    if (part.kind === "port") continue;
    const [a, b, ret] = terminals as readonly Point[];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 104 || a.x !== b.x && a.y !== b.y) {
      return { code: "symbol-orientation", details: { id: part.id, a, b } };
    }
    if (ret) {
      const [outside] = terminals.slice(3) as readonly Point[];
      const rectangle = a.y === b.y ? a.x === ret.x && b.x === outside.x && ret.y === outside.y && ret.y !== a.y
        : a.y === ret.y && b.y === outside.y && ret.x === outside.x && ret.x !== a.x;
      if (!rectangle || editor === "TL" && new Set(part.terminals.map(id => nets.get(id))).size !== 4) {
        return { code: "physical-port-pairs", details: { id: part.id, terminals } };
      }
    }
    const box = body(terminals as readonly Point[]);
    for (const [other, existing] of bodies) {
      if (box.left < existing.right && box.right > existing.left &&
        box.top < existing.bottom && box.bottom > existing.top) {
        return { code: "overlapping-symbols", details: { id: part.id, other, box, existing } };
      }
    }
    bodies.set(part.id, box);
  }

  const segments: Segment[] = [];
  for (const { id, from, to } of topology.wires) {
    const points = diagramWires.get(id);
    if (!points || !samePoint(points[0], diagram.endpoints.get(from)) || !samePoint(points.at(-1), diagram.endpoints.get(to))) {
      return { code: "wire-endpoints", details: { id, from, to, points } };
    }
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      if (a.x !== b.x && a.y !== b.y) return { code: "diagonal-wire", details: { id, a, b } };
      if (samePoint(a, b)) continue;
      const [left, right] = interval(a.x, b.x), [top, bottom] = interval(a.y, b.y);
      for (const [device, box] of bodies) {
        if (left < box.right && right > box.left && top < box.bottom && bottom > box.top) {
          return { code: "wire-through-symbol", details: { id, device, a, b, box } };
        }
      }
      segments.push({ wire: id, net: nets.get(from)!, from: a, to: b });
    }
  }

  for (const [index, { wire, net, from: a, to: b }] of segments.entries()) {
    for (let other = index + 1; other < segments.length; other++) {
      const { net: differentNet, from: c, to: d } = segments[other];
      if (net === differentNet) continue;
      const axis = a.x === b.x && b.x === c.x && c.x === d.x ? "y"
        : a.y === b.y && b.y === c.y && c.y === d.y ? "x" : undefined;
      if (!axis) continue;
      const [first, last] = interval(a[axis], b[axis]);
      const [start, end] = interval(c[axis], d[axis]);
      if (Math.max(first, start) < Math.min(last, end)) {
        return { code: "different-nets-share-trace", details: { wire, a, b, other: segments[other] } };
      }
    }
  }
}

function action(editor: Editor, session: TopologySession, diagram: LineLayout,
  step: number, random: (count: number) => number): Step {
  const all = session.listSlots();
  const series = all.filter(slot => slot.kind === "series");
  const parallel = all.filter(slot => slot.kind === "parallel" && slot.componentIds.length <= 4);
  const shunts = editor === "TL" ? directTargets(session.document, diagram, [], "") : [];
  const choice = step % 4;
  const rail = choice === 3 && shunts.length > 0;
  const slot = choice === 3 && editor === "LC" ? session.crossSlot("P1:a", "P1:b")
    : rail ? shunts[random(shunts.length)].slot
    : choice === 1 && parallel.length ? parallel[random(parallel.length)] : series[random(series.length)];
  const kinds = editor === "LC" ? ["l", "c"] as const : ["r", "l", "c", "switch"] as const;
  const kind = kinds[random(kinds.length)];
  const id = kind.toUpperCase() + "_eval_" + (step + 1);
  return { part: { id, kind, terminals: [id + ":a", id + ":b"], parameters: parts[kind].parameters },
    kind: slot.kind, id: slot.id, boundaries: slot.boundaries, rail };
}

function apply(before: TopologyLabDocument, previous: LineLayout, step: Step) {
  const session = new TopologySession(JSON.stringify(before));
  const match = (slot: TopologySlot) => slot.kind === step.kind
    && slot.boundaries.every((id, index) => id === step.boundaries[index]);
  const rail = step.rail
    ? directTargets(before, previous, [], "").find(target => match(target.slot)) : undefined;
  const slots = session.listSlots();
  const alternatives = slots.filter(match);
  const slot = rail?.slot ?? (step.kind === "cross" ? session.crossSlot(...step.boundaries)
    : alternatives.find(candidate => candidate.id === step.id) ?? (alternatives.length === 1 ? alternatives[0] : undefined));
  if (!slot) throw Error("target-unavailable");
  session.apply({ type: "insert", slot, component: step.part });
  return parseTopologyLabDocument(JSON.stringify({ ...session.document,
    geometry: geometryAfterInsertion(previous, before.topology, session.document.topology, slot, step.part, rail),
  }));
}

function evaluate(editor: Editor, before: TopologyLabDocument, step: Step) {
  let after: TopologyLabDocument | undefined;
  try {
    const previous = layoutLineExperiment(before);
    after = apply(before, previous, step);
    const current = layoutLineExperiment(after);
    const failure = geometryFailure(editor, after, current);
    if (failure) return { failure, after };
    if (step.kind !== "series") {
      for (const [id, point] of previous.endpoints) {
        if (!samePoint(point, current.endpoints.get(id))) {
          return { failure: { code: "parallel-moved-pin", details: { id, point, after: current.endpoints.get(id) } }, after };
        }
      }
      if (editor === "LC") {
        const routes = new Map(current.wires.map(wire => [wire.id, wire.points]));
        for (const { id, points } of previous.wires) {
          const route = routes.get(id);
          if (!route || !sameRoute(points, route)) {
            return { failure: { code: "parallel-changed-route", details: { id, points, route } }, after };
          }
        }
      }
    }
    return { after };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return { failure: { code }, after };
  }
}

function minimize(editor: Editor, initial: TopologyLabDocument, prefix: Step[], code: string) {
  function reproduces(steps: Step[]) {
    let document = initial;
    for (const step of steps) {
      const result = evaluate(editor, document, step);
      if (result.failure) return result.failure.code === code;
      if (code === "archive-order-changed-edit" && JSON.stringify(evaluate(editor, reverseCollections(document), step).after)
        !== JSON.stringify(result.after)) return true;
      document = result.after!;
    }
    return false;
  }
  let smallest = prefix;
  for (let index = 0; index < smallest.length - 1;) {
    const candidate = smallest.filter((_, i) => i !== index);
    if (reproduces(candidate)) {
      smallest = candidate;
      index = 0;
    } else index++;
  }
  return smallest;
}

function reverseCollections(document: TopologyLabDocument): TopologyLabDocument {
  const { topology } = document;
  return parseTopologyLabDocument(JSON.stringify({ ...document, topology: {
    wires: [...topology.wires].reverse(), components: [...topology.components].reverse(), junctions: [...topology.junctions].reverse(),
  }}));
}

describe("ET-LABC-07 · generated schematic geometry", () => {
  it("keeps unaffected pins and routes through removing, opening, restoring, history and JSON in both editors", () => {
    for (const editor of ["LC", "TL"] as const) {
      const initial = editor === "LC" ? newLcExperiment() : newLineExperiment().circuit;
      const original = new TopologySession(JSON.stringify(initial));
      const slot = original.listSlots().find(candidate => candidate.kind === "parallel" && candidate.side === "right" &&
        candidate.componentIds.length === 1 && candidate.componentIds[0] === "C1")!;
      const branch = { id: "L_test", kind: "l", terminals: ["L_test:a", "L_test:b"], parameters: parts.l.parameters };
      const seeded = evaluate(editor, initial, {
        part: branch, kind: slot.kind, id: slot.id, boundaries: slot.boundaries, rail: false,
      });
      expect(seeded.failure).toBeUndefined();
      const document = seeded.after!;
      const session = new TopologySession(JSON.stringify(document));
      const before = session.export();
      const bounds = layoutLineExperiment(document);

      function checkSurvivors() {
        const after = layoutLineExperiment(session.document);
        expect(geometryFailure(editor, session.document, after)).toBeUndefined();
        for (const [id, point] of after.endpoints) expect(point).toEqual(bounds.endpoints.get(id));
        for (const wire of after.wires) expect(wire).toEqual(bounds.wires.find(previous => previous.id === wire.id));
        expect(parseTopologyLabDocument(session.export())).toEqual(session.document);
      }

      session.apply({ type: "break-wire", wireId: "W1" });
      expect(session.document.geometry?.bends.W1).toEqual(document.geometry?.bends.W1);
      const broken = session.export();
      checkSurvivors();
      session.apply({ type: "restore-wire", wireId: "W1" });
      expect(session.export()).toBe(before);
      checkSurvivors();
      expect(session.undo()).toBe(true);
      expect(session.export()).toBe(broken);
      checkSurvivors();
      expect(session.redo()).toBe(true);
      expect(session.export()).toBe(before);

      session.apply({ type: "remove", componentId: branch.id, mode: "branch" });
      expect(session.document.topology.components.some(({ id }) => id === branch.id)).toBe(false);
      const removed = session.export();
      checkSurvivors();
      expect(session.undo()).toBe(true);
      expect(session.export()).toBe(before);
      checkSurvivors();
      expect(session.redo()).toBe(true);
      expect(session.export()).toBe(removed);
      checkSurvivors();
    }
  });

  for (const editor of ["LC", "TL"] as const) {
    it(editor + " " + profileName + " sequences preserve fixed pins and valid geometry", () => {
      const initial = editor === "LC" ? newLcExperiment() : newLineExperiment().circuit;
      const requestedSeed = process.env.ET_LABC_GEOMETRY_SEED;
      const seeds = requestedSeed ? [Number(requestedSeed)] : Array.from({ length: profile.seeds }, (_, index) => index + 1);
      if (seeds.some(seed => !Number.isSafeInteger(seed) || seed < 1)) throw Error("Invalid ET_LABC_GEOMETRY_SEED");
      for (const seed of seeds) {
        const random = deterministic(seed);
        const steps: Step[] = [];
        let document = initial;
        const length = profile.length + random(profile.variation);
        for (let index = 0; index < length; index++) {
          const before = document;
          const step = action(editor, new TopologySession(JSON.stringify(before)), layoutLineExperiment(before), index, random);
          steps.push(step);
          const result = evaluate(editor, before, step);
          let failure = result.failure;
          if (!failure && index % 4 === 0) {
            const reordered = evaluate(editor, reverseCollections(before), step);
            if (JSON.stringify(reordered.after) !== JSON.stringify(result.after)) {
              failure = { code: "archive-order-changed-edit", details: reordered };
            }
          }
          if (failure) {
            const operationPrefix = steps.map(({ id, kind, part }) => ({ id, kind, part: part.id }));
            throw Error(JSON.stringify({ editor, profileName, seed, step: index + 1, failure, operationPrefix,
              minimalReplay: minimize(editor, initial, steps, failure.code), initial, before, after: result.after ?? null }, null, 2));
          }
          document = result.after!;
        }
      }
    }, profile.timeout);
  }
});
