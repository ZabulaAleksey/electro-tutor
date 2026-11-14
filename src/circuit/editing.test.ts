import { expect, it } from "vitest";
import { demoDrawing, insertInWire, splitWireAt } from "./drawing";
import { routeDrawing } from "./routing";
import { disconnect, netlist, validateCircuit } from "./topology";

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

it("inserts an explicit junction in a wire without splitting its electrical net", () => {
  const drawing = demoDrawing();
  const next = splitWireAt(drawing, "W2", { x: 270, y: 90 });
  expect(netlist(next.topology)).toContainEqual(["J1", "L1:a", "R1:b"]);
  expect(routeDrawing(next).unrouted).toEqual([]);
});

it("preserves graph validity through repeatable connection changes and snapshot replay", () => {
  let seed = 20261114;
  for (let trial = 0; trial < 40; trial++) {
    const original = demoDrawing();
    const snapshots = [original];
    for (let step = 0; step < 6; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const previous = snapshots.at(-1)!;
      const selected = previous.topology.wires[seed % previous.topology.wires.length];
      const next = { ...previous, topology: disconnect(previous.topology, selected.id) };
      expect(validateCircuit(next.topology)).toEqual([]);
      expect(netlist(next.topology).flat().sort()).toEqual(netlist(original.topology).flat().sort());
      snapshots.push(next);
      if (!next.topology.wires.length) break;
    }
    for (const snapshot of snapshots.slice().reverse()) {
      expect(routeDrawing(snapshot).unrouted).toEqual([]);
      expect(validateCircuit(snapshot.topology)).toEqual([]);
    }
    expect(snapshots[0].topology.wires).toHaveLength(4);
  }
});
