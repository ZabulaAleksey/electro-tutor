import { expect, it } from "vitest";
import { demoDrawing, insertInWire } from "./drawing";
import { routeDrawing } from "./routing";
import { netlist } from "./topology";

it("inserts a component into an existing conductor and keeps both original terminals", () => {
  const before = demoDrawing();
  const next = insertInWire(before, "W2", "diode", { x: 270, y: 90 }, 0);
  const nets = netlist(next.topology);
  expect(nets).toContainEqual(["D1:a", "R1:b"]);
  expect(nets).toContainEqual(["D1:b", "L1:a"]);
  expect(nets).not.toContainEqual(["L1:a", "R1:b"]);
  expect(before.topology.wires).toHaveLength(4);
  expect(next.topology.wires).toHaveLength(5);
  expect(routeDrawing(next).unrouted).toEqual([]);
});
