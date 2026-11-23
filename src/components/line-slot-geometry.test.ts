import { expect, test } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { TopologySession, parseTopologyLabDocument } from "../circuit/topology-session";
import { parts } from "../circuit/drawing";
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
