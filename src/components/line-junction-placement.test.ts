import { expect, it } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { TopologySession, parseTopologyLabDocument } from "../circuit/topology-session";
import type { CircuitTopology } from "../circuit/topology";
import { layoutLineExperiment } from "./line-experiment-layout";
import { lineJunctionPlacements } from "./line-junction-placement";
import { geometryAfterInsertion } from "./line-slot-geometry";
import { directTargets } from "./line-slot-targets";

it("marks both departures of a shunt from the transient line rails", () => {
  const document = newLineExperiment().circuit;
  const layout = layoutLineExperiment(document);
  const target = directTargets(document, layout, [], "").find(({ slot }) =>
    slot.boundaries[0] === "K1:b" && slot.boundaries[1] === "C1:b");
  if (!target) throw new Error("Missing W2 rail target");
  const branch = { id: "R1", kind: "r", terminals: ["R1:a", "R1:b"], parameters: { ohm: 25 } };
  const session = new TopologySession(JSON.stringify(document));
  session.apply({ type: "insert", slot: target.slot, component: branch });
  const next = parseTopologyLabDocument(JSON.stringify({
    ...session.document,
    geometry: geometryAfterInsertion(layout, document.topology, session.document.topology, target.slot, branch, target),
  }));
  const branched = layoutLineExperiment(next);

  expect(lineJunctionPlacements(next.topology, branched)).toEqual([
    { id: "C1:b", x: 249, y: 254 },
    { id: "K1:b", x: 249, y: 106 },
  ]);
  expect(branched.endpoints.get("K1:b")).toEqual({ x: 228, y: 106 });
  expect(branched.endpoints.get("C1:b")).toEqual({ x: 442, y: 232 });
  expect(next.topology.wires).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: "K1:b", to: "R1:a" }),
    expect.objectContaining({ from: "R1:b", to: "C1:b" }),
  ]));
});

it("moves from a reversed co-traced route to the connected split, not to an unrelated crossing", () => {
  const topology: CircuitTopology = {
    components: [{ id: "R1", kind: "r", terminals: ["R1:a", "R1:b"], parameters: { ohm: 50 } }],
    junctions: ["A", "B", "C", "D"],
    wires: [
      { id: "W1", from: "R1:b", to: "A" },
      { id: "W2", from: "R1:b", to: "B" },
      { id: "W3", from: "C", to: "D" },
    ],
  };
  const origin = { x: 0, y: 5 };
  const crossingX = 20;
  const split = { x: 30, y: 5 };
  const a = { x: 40, y: 5 };
  const b = { x: 30, y: 15 };
  const c = { x: crossingX, y: 0 };
  const d = { x: crossingX, y: 10 };
  const layout = {
    endpoints: new Map([["R1:b", origin], ["A", a], ["B", b], ["C", c], ["D", d]]),
    wires: [
      { id: "W1", points: [a, origin] },
      { id: "W2", points: [origin, split, b] },
      { id: "W3", points: [c, d] },
    ],
  };

  expect(lineJunctionPlacements(topology, layout)).toEqual([{ id: "R1:b", ...split }]);
});
