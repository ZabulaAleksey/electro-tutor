import { expect, test } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { newLcExperiment } from "../circuit/lc-experiment";
import { TopologySession, parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import { parts } from "../circuit/drawing";
import { netlist, type CircuitComponent } from "../circuit/topology";
import type { TopologySlot } from "../circuit/topology-slots";
import { layoutLineExperiment } from "./line-experiment-layout";
import { geometryAfterInsertion } from "./line-slot-geometry";

test("repeated series and parallel edits retain symbol length, connected endpoints and orthogonal wire paths", () => {
  let doc = newLineExperiment().circuit;
  for (let index = 0; index < 30; index++) {
    const session = new TopologySession(JSON.stringify(doc));
    const layout = layoutLineExperiment(doc);
    const slots = session.listSlots().filter(s => index % 3 === 0
      ? s.kind === "parallel" && s.componentIds.length === 1 && s.side === "right"
      : s.kind === "series");
    const slot = slots[(index * 17) % slots.length];
    const id = "R" + index;
    const part = { id, terminals: [id + ":a", id + ":b"], kind: "r", parameters: { ...parts.r.parameters } };
    session.apply({ type: "insert", slot, component: part });
    doc = parseTopologyLabDocument(JSON.stringify({ ...session.document,
      geometry: geometryAfterInsertion(layout, doc.topology, session.document.topology, slot, part) }));
    const updated = layoutLineExperiment(doc);
    for (const device of doc.topology.components) {
      const [a, b] = device.terminals.map(t => updated.endpoints.get(t)!);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(104);
    }
    for (const wire of doc.topology.wires) {
      const path = updated.wires.find(w => w.id === wire.id)!.points;
      expect(path[0]).toEqual(updated.endpoints.get(wire.from));
      expect(path.at(-1)).toEqual(updated.endpoints.get(wire.to));
      expect(path.slice(1).every((p, i) => p.x === path[i].x || p.y === path[i].y)).toBe(true);
    }
  }
});

function insert(document: TopologyLabDocument, component: CircuitComponent, isTarget: (slot: TopologySlot) => boolean,
  proposed?: Parameters<typeof geometryAfterInsertion>[5], cross?: readonly [string, string]) {
  const session = new TopologySession(JSON.stringify(document));
  const slot = cross ? session.crossSlot(...cross) : session.listSlots().find(isTarget)!;
  const previous = layoutLineExperiment(document);
  session.apply({ type: "insert", slot, component });
  return parseTopologyLabDocument(JSON.stringify({
    ...session.document,
    geometry: geometryAfterInsertion(previous, document.topology, session.document.topology, slot, component, proposed),
  }));
}

test("a branch parallel to a load with a series return element keeps different nets on separate traces", () => {
  const series = insert(newLineExperiment().circuit,
    { id: "L10", kind: "l", terminals: ["L10:a", "L10:b"], parameters: { ...parts.l.parameters } },
    slot => slot.kind === "series" && slot.wireId === "W4");
  const document = insert(series,
    { id: "C11", kind: "c", terminals: ["C11:a", "C11:b"], parameters: { ...parts.c.parameters } },
    slot => slot.kind === "parallel" && slot.side === "right" && slot.componentIds.join(",") === "C1,L10");
  const before = layoutLineExperiment(series), after = layoutLineExperiment(document);

  for (const [id, pin] of before.endpoints) expect(after.endpoints.get(id)).toEqual(pin);
  for (const wire of before.wires) expect(after.wires.find(w => w.id === wire.id)).toEqual(wire);
  const membership = new Map(netlist(document.topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  expect(new Set(["TL1:a", "TL1:b", "TL1:return-in", "TL1:return-out"].map(id => membership.get(id))).size).toBe(4);
  const horizontal = after.wires.flatMap(wire => {
    const { from } = document.topology.wires.find(w => w.id === wire.id)!;
    return wire.points.slice(1).flatMap((end, index) => {
      const start = wire.points[index];
      return start.y === end.y && start.x !== end.x
        ? [{ net: membership.get(from), y: start.y, min: Math.min(start.x, end.x), max: Math.max(start.x, end.x) }]
        : [];
    });
  });
  expect(horizontal.some((first, index) => horizontal.slice(index + 1).some(second =>
    first.net !== second.net && first.y === second.y &&
    Math.max(first.min, second.min) < Math.min(first.max, second.max)))).toBe(false);
});

const lcExamples = [
  ["parallel:[\"C1\"]:left", "port", "series:slotWire4"],
  ["parallel:[\"C1\",\"L1\"]:left", "parallel:[\"C1\"]:left", "series:slotWire1"],
  ["parallel:[\"C1\",\"L1\"]:left", "parallel:[\"C1\"]:left", "series:slotWire4"],
] as const;

for (const edits of lcExamples) {
  test("LC fixed pins and orthogonal routes after " + edits.join(" → "), () => {
    let document = newLcExperiment();
    for (const [index, id] of edits.entries()) {
      const partId = "C" + (10 + index);
      const part = { id: partId, terminals: [partId + ":a", partId + ":b"], kind: "c", parameters: { ...parts.c.parameters } };
      const cross = id === "port" ? ["P1:a", "P1:b"] as const : undefined;
      const target = (slot: TopologySlot) => slot.id === id;
      const before = layoutLineExperiment(document);
      const changed = insert(document, part, target, undefined, cross);
      const after = layoutLineExperiment(changed);
      if (!id.startsWith("series:")) {
        for (const [endpoint, location] of before.endpoints) expect(after.endpoints.get(endpoint)).toEqual(location);
        for (const wire of before.wires) expect(after.wires.find(({ id }) => id === wire.id)).toEqual(wire);
        const preview = { point: { x: 1500, y: 20 }, vertical: true };
        expect(insert(document, part, target, preview, cross).geometry).toEqual(changed.geometry);
      }
      const membership = new Map(netlist(changed.topology).flatMap((net, index) => net.map(id => [id, index] as const)));
      const segments = after.wires.flatMap(wire => {
        const { from } = changed.topology.wires.find(({ id }) => id === wire.id)!;
        return wire.points.slice(1).map((b, index) => ({ net: membership.get(from), a: wire.points[index], b }));
      });
      for (const [i, { net, a, b }] of segments.entries()) {
        expect(a.x === b.x || a.y === b.y).toBe(true);
        for (const { net: otherNet, a: c, b: d } of segments.slice(i + 1)) {
          if (net === otherNet) continue;
          if (a.y === b.y && b.y === c.y && c.y === d.y) {
            expect(Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))).toBeGreaterThanOrEqual(Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)));
          }
          if (a.x === b.x && b.x === c.x && c.x === d.x) {
            expect(Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))).toBeGreaterThanOrEqual(Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)));
          }
        }
      }
      for (const component of changed.topology.components.filter(({ kind }) => kind !== "port")) {
        const [leftPin, rightPin] = component.terminals.map(end => after.endpoints.get(end)!);
        const horizontal = leftPin.y === rightPin.y;
        const x = Math.min(leftPin.x, rightPin.x), y = Math.min(leftPin.y, rightPin.y);
        const [left, right] = horizontal ? [x + 7, x + 97] : [x - 10, x + 10];
        const [top, bottom] = horizontal ? [y - 10, y + 10] : [y + 7, y + 97];
        expect(segments.some(({ a, b }) => Math.min(a.x, b.x) < right && Math.max(a.x, b.x) > left &&
          Math.min(a.y, b.y) < bottom && Math.max(a.y, b.y) > top)).toBe(false);
      }
      document = changed;
    }
  });
}

test("a branch leaves the full four-terminal body clear when its preferred side is obstructed", () => {
  const inductor = insert(newLineExperiment().circuit,
    { id: "L10", kind: "l", terminals: ["L10:a", "L10:b"], parameters: { ...parts.l.parameters } },
    slot => slot.kind === "series" && slot.wireId === "W4");
  const series = insert(inductor,
    { id: "C11", kind: "c", terminals: ["C11:a", "C11:b"], parameters: { ...parts.c.parameters } },
    slot => slot.kind === "series" && slot.wireId === "W4");
  const document = insert(series,
    { id: "R12", kind: "r", terminals: ["R12:a", "R12:b"], parameters: { ...parts.r.parameters } },
    slot => slot.kind === "parallel" && slot.side === "left" && slot.componentIds.join(",") === "C1,C11,L10");
  const before = layoutLineExperiment(series), after = layoutLineExperiment(document);
  const [a, b, ret] = ["TL1:a", "TL1:b", "TL1:return-in"].map(id => after.endpoints.get(id)!);
  const branch = after.components.find(({ id }) => id === "R12")!;
  expect(branch.x < a.x || branch.x > b.x).toBe(true);
  expect(after.endpoints.get("TL1:return-out")).toEqual(before.endpoints.get("TL1:return-out"));
  for (const wire of after.wires.filter(wire => !before.wires.some(existing => existing.id === wire.id))) {
    expect(wire.points.slice(1).some((end, index) => {
      const start = wire.points[index];
      return Math.min(start.x, end.x) < b.x && Math.max(start.x, end.x) > a.x &&
        Math.min(start.y, end.y) < ret.y && Math.max(start.y, end.y) > a.y;
    })).toBe(false);
  }
});
