import { expect, test } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { TopologySession, parseTopologyLabDocument } from "../circuit/topology-session";
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

test("a branch parallel to a load with a series return element keeps different nets on separate traces", () => {
  let document = newLineExperiment().circuit;
  function insert(component: CircuitComponent, isTarget: (slot: TopologySlot) => boolean) {
    const session = new TopologySession(JSON.stringify(document));
    const slot = session.listSlots().find(isTarget)!;
    const previous = layoutLineExperiment(document);
    session.apply({ type: "insert", slot, component });
    document = parseTopologyLabDocument(JSON.stringify({
      ...session.document,
      geometry: geometryAfterInsertion(previous, document.topology, session.document.topology, slot, component),
    }));
    return layoutLineExperiment(document);
  }

  const before = insert({ id: "L10", kind: "l", terminals: ["L10:a", "L10:b"], parameters: { ...parts.l.parameters } },
    slot => slot.kind === "series" && slot.wireId === "W4");
  const after = insert({ id: "C11", kind: "c", terminals: ["C11:a", "C11:b"], parameters: { ...parts.c.parameters } },
    slot => slot.kind === "parallel" && slot.side === "right" && slot.componentIds.join(",") === "C1,L10");

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
