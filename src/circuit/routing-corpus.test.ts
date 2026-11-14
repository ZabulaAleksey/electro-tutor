import { expect, it } from "vitest";
import { demoDrawing, emptyDrawing, junctionAt, lineDemoDrawing, wireDrawing } from "./drawing";
import { optimizeDrawing, routeDrawing, routingScore } from "./routing";

it("checks optimizer quality on series RLC, a loaded line, parallel branches and forced crossings", () => {
  const junctions = (points: [number, number][]) => points.reduce(
    (draft, [x, y]) => junctionAt(draft, { x, y }), emptyDrawing(),
  );
  const crossings = wireDrawing(wireDrawing(junctions([[80, 140], [460, 140], [270, 70], [270, 230]]),
    "J1", "J2"), "J3", "J4");
  const branches = [["J1", "J2"], ["J1", "J3"], ["J2", "J4"], ["J3", "J4"]].reduce(
    (draft, [from, to]) => wireDrawing(draft, from, to), junctions([[100, 150], [270, 65], [270, 235], [440, 150]]),
  );
  for (const drawing of [demoDrawing(), lineDemoDrawing(), branches, crossings]) {
    const initial = routeDrawing(drawing);
    const optimized = optimizeDrawing(drawing, initial);
    expect(optimized.unrouted).toEqual([]);
    const before = routingScore(initial), after = routingScore(optimized);
    const first = after.findIndex((value, index) => value !== before[index]);
    expect(first === -1 || after[first] < before[first]).toBe(true);
  }
  expect(routingScore(routeDrawing(crossings))[1]).toBe(1);
});
