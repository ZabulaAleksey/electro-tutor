import { expect, it } from "vitest";
import { demoDrawing } from "./drawing";
import { optimizeDrawing, routeDrawing, routingScore } from "./routing";
import { netlist } from "./topology";

it("scores the complete diagram and keeps the better routing without changing positions or connectivity", () => {
  const drawing = demoDrawing();
  const before = JSON.stringify(drawing);
  const initial = routeDrawing(drawing);
  expect(initial.unrouted).toEqual([]);
  const optimized = optimizeDrawing(drawing, initial);
  expect(optimized.unrouted).toEqual([]);
  const oldScore = routingScore(initial), newScore = routingScore(optimized);
  const first = newScore.findIndex((value, index) => value !== oldScore[index]);
  expect(first === -1 || newScore[first] < oldScore[first]).toBe(true);
  expect(JSON.stringify(drawing)).toBe(before);
  expect(netlist(drawing.topology)).toEqual(netlist(JSON.parse(before).topology));
  expect(optimizeDrawing(drawing, initial)).toEqual(optimized);
});

it("keeps unrelated lead geometry during an incremental edit", () => {
  const drawing = demoDrawing();
  const initial = routeDrawing(drawing);
  const next = { ...drawing, positions: {
    ...drawing.positions, C1: { ...drawing.positions.C1, y: drawing.positions.C1.y + 40 },
  } };
  const updated = routeDrawing(next, next.topology.wires, initial);
  expect(updated.unrouted).toEqual([]);
  expect(updated.paths.W2).toBe(initial.paths.W2);
  expect(updated.paths.W3.at(-1)).not.toEqual(initial.paths.W3.at(-1));
});
