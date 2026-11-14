import { expect, it } from "vitest";
import { demoDrawing, emptyDrawing, junctionAt, lineDemoDrawing, placeComponent, wireDrawing } from "./drawing";
import { optimizeDrawing, optimizeLayout, routeDrawing, routingScore } from "./routing";

it("checks optimizer quality on series RLC, a loaded line, parallel branches and forced crossings", () => {
  const junctions = (points: [number, number][]) => points.reduce(
    (draft, [x, y]) => junctionAt(draft, { x, y }), emptyDrawing(),
  );
  const crossings = wireDrawing(wireDrawing(junctions([[80, 140], [460, 140], [270, 70], [270, 230]]),
    "J1", "J2"), "J3", "J4");
  const branches = [["J1", "J2"], ["J1", "J3"], ["J2", "J4"], ["J3", "J4"]].reduce(
    (draft, [from, to]) => wireDrawing(draft, from, to), junctions([[100, 150], [270, 65], [270, 235], [440, 150]]),
  );
  let dense = emptyDrawing();
  for (const y of [80, 180, 280]) {
    for (const x of [80, 205, 330, 455]) dense = placeComponent(dense, "r", { x, y });
  }
  for (const offset of [0, 4, 8]) {
    for (let index = 1; index < 4; index++) dense = wireDrawing(dense, `R${offset + index}:b`, `R${offset + index + 1}:a`);
  }
  const bridge = wireDrawing(branches, "J2", "J3");
  const ring = [["J1", "J2"], ["J2", "J3"], ["J3", "J4"], ["J4", "J5"], ["J5", "J1"]].reduce(
    (draft, [from, to]) => wireDrawing(draft, from, to), junctions([[95, 120], [240, 70], [435, 130], [390, 245], [130, 255]]),
  );
  dense.positions.R1.pinned = true;
  dense.positions.R6.pinned = true;
  const fixtures = [demoDrawing(), lineDemoDrawing(), branches, crossings, bridge, ring, dense];
  for (const drawing of fixtures) {
    const initial = routeDrawing(drawing);
    const optimized = optimizeDrawing(drawing, initial);
    const measuredAt = performance.now();
    const arranged = optimizeLayout(drawing, initial, 10);
    const elapsedMs = performance.now() - measuredAt;
    if (process.env.CIRCUIT_BENCHMARK === "1") {
      console.info(JSON.stringify({ parts: drawing.topology.components.length, wires: drawing.topology.wires.length,
        initial: routingScore(initial), arranged: routingScore(arranged.routing), elapsedMs: Math.round(elapsedMs * 100) / 100 }));
    }
    expect(arranged.routing.unrouted).toEqual([]);
    expect(arranged.drawing.topology).toBe(drawing.topology);
    for (const [id, position] of Object.entries(drawing.positions)) {
      if (position.pinned) expect(arranged.drawing.positions[id]).toEqual(position);
    }
    expect(optimized.unrouted).toEqual([]);
    const before = routingScore(initial), after = routingScore(optimized);
    const first = after.findIndex((value, index) => value !== before[index]);
    expect(first === -1 || after[first] < before[first]).toBe(true);
  }
  expect(routingScore(routeDrawing(crossings))[1]).toBe(1);
});
