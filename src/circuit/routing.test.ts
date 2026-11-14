import { expect, it } from "vitest";
import { canPlace, emptyDrawing, placeComponent, type Drawing } from "./drawing";
import { connect, netlist } from "./topology";
import { routeDrawing } from "./routing";

function sample(): Drawing {
  return placeComponent(placeComponent(placeComponent(emptyDrawing(), "r", { x: 80, y: 120 }),
    "c", { x: 440, y: 120 }), "l", { x: 260, y: 120 });
}

it("routes orthogonally around another symbol and keeps the explicit connection", () => {
  const drawing = sample();
  drawing.topology = connect(drawing.topology, "W1", "R1:b", "C1:a");
  const result = routeDrawing(drawing);
  expect(result.unrouted).toEqual([]);
  const points = result.paths.W1;
  expect(points[0]).toEqual({ x: 109, y: 120 });
  expect(points.at(-1)).toEqual({ x: 413, y: 120 });
  expect(points.some(point => Math.abs(point.y - 120) > 22)).toBe(true);
  for (let i = 1; i < points.length; i++) {
    expect((points[i].x === points[i - 1].x) !== (points[i].y === points[i - 1].y)).toBe(true);
  }
  expect(netlist(drawing.topology)).toContainEqual(["C1:a", "R1:b"]);
});

it("preserves the netlist through 100 deterministic geometry edits", () => {
  const drawing = sample();
  drawing.topology = connect(drawing.topology, "W1", "R1:b", "C1:a");
  const before = netlist(drawing.topology);
  let seed = 86;
  for (let i = 0; i < 100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    drawing.positions.L1 = { x: 190 + seed % 110, y: 60 + (seed >>> 16) % 215, rotation: i % 4 * 90 };
    expect(canPlace(drawing, drawing.positions.L1, "L1")).toBe(true);
    expect(routeDrawing(drawing).unrouted).toEqual([]);
    expect(netlist(drawing.topology)).toEqual(before);
  }
});
