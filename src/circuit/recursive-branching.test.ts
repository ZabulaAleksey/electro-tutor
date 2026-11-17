import { expect, it } from "vitest";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "./document";
import { emptyDrawing, junctionAt, placeComponent, wireDrawing } from "./drawing";
import { netlist, type CircuitTopology } from "./topology";

const topology = (drawing: { topology: CircuitTopology }) => netlist(drawing.topology);

it("retains a T branch with one shared junction", () => {
  let drawing = emptyDrawing();
  drawing = placeComponent(drawing, "voltage", { x: 100, y: 180 });
  drawing = placeComponent(drawing, "r", { x: 260, y: 100 });
  drawing = placeComponent(drawing, "r", { x: 260, y: 180 });
  drawing = placeComponent(drawing, "r", { x: 260, y: 260 });
  drawing = junctionAt(drawing, { x: 180, y: 180 });
  drawing = wireDrawing(wireDrawing(wireDrawing(drawing, "V1:b", "J1"), "J1", "R1:a"), "J1", "R2:a");
  drawing = wireDrawing(drawing, "J1", "R3:a");
  expect(topology(drawing)).toEqual([
    ["J1", "R1:a", "R2:a", "R3:a", "V1:b"], ["R1:b"], ["R2:b"], ["R3:b"], ["V1:a"],
  ]);
});

it("retains Pi and ladder branch connectivity", () => {
  let pi = emptyDrawing();
  for (const [kind, x, y] of [["r", 120, 100], ["r", 260, 180], ["r", 400, 100]] as const) pi = placeComponent(pi, kind, { x, y });
  pi = junctionAt(junctionAt(junctionAt(pi, { x: 80, y: 180 }), { x: 460, y: 180 }), { x: 260, y: 300 });
  pi = wireDrawing(wireDrawing(wireDrawing(wireDrawing(wireDrawing(wireDrawing(pi, "J1", "R1:a"), "R1:b", "J2"), "J1", "R2:a"), "R2:b", "J3"), "J2", "R3:a"), "R3:b", "J3");
  expect(topology(pi)).toEqual([["J1", "R1:a", "R2:a"], ["J2", "R1:b", "R3:a"], ["J3", "R2:b", "R3:b"]]);

  let ladder = emptyDrawing();
  for (const [x, y] of [[100, 100], [240, 100], [380, 100], [520, 100]] as const) ladder = placeComponent(ladder, "r", { x, y });
  ladder = junctionAt(junctionAt(junctionAt(ladder, { x: 60, y: 180 }), { x: 240, y: 180 }), { x: 420, y: 180 });
  ladder = wireDrawing(wireDrawing(wireDrawing(wireDrawing(wireDrawing(wireDrawing(ladder, "J1", "R1:a"), "R1:b", "J2"), "J2", "R2:a"), "J2", "R3:a"), "R3:b", "J3"), "J1", "R4:a");
  ladder = wireDrawing(ladder, "R4:b", "J3");
  expect(topology(ladder)).toEqual([["J1", "R1:a", "R4:a"], ["J2", "R1:b", "R2:a", "R3:a"], ["J3", "R3:b", "R4:b"], ["R2:b"]]);
});

it("retains two parallel RLC branches", () => {
  let drawing = emptyDrawing();
  for (const [kind, x, y] of [["r", 120, 100], ["l", 260, 100], ["c", 400, 100], ["r", 120, 260], ["l", 260, 260], ["c", 400, 260]] as const) drawing = placeComponent(drawing, kind, { x, y });
  drawing = junctionAt(junctionAt(drawing, { x: 80, y: 180 }), { x: 460, y: 180 });
  for (const [from, to] of [["J1", "R1:a"], ["R1:b", "L1:a"], ["L1:b", "C1:a"], ["C1:b", "J2"], ["J1", "R2:a"], ["R2:b", "L2:a"], ["L2:b", "C2:a"], ["C2:b", "J2"] as const]) drawing = wireDrawing(drawing, from, to);
  expect(topology(drawing)).toEqual([
    ["C1:a", "L1:b"], ["C1:b", "C2:b", "J2"], ["C2:a", "L2:b"], ["J1", "R1:a", "R2:a"],
    ["L1:a", "R1:b"], ["L2:a", "R2:b"],
  ]);
});

it("keeps the two midpoint nets of a Wheatstone bridge distinct", () => {
  let drawing = emptyDrawing();
  for (const [x, y] of [[145, 85], [395, 85], [145, 275], [395, 275], [270, 180]] as const) {
    drawing = placeComponent(drawing, "r", { x, y });
  }
  drawing = junctionAt(junctionAt(drawing, { x: 70, y: 180 }), { x: 470, y: 180 });
  drawing = junctionAt(junctionAt(drawing, { x: 270, y: 85 }), { x: 270, y: 275 });
  for (const [from, to] of [
    ["J1", "R1:a"], ["J1", "R3:a"], ["J2", "R2:b"], ["J2", "R4:b"],
    ["J3", "R1:b"], ["J3", "R2:a"], ["J3", "R5:a"],
    ["J4", "R3:b"], ["J4", "R4:a"], ["J4", "R5:b"],
  ]) drawing = wireDrawing(drawing, from, to);
  expect(topology(drawing)).toEqual([
    ["J1", "R1:a", "R3:a"], ["J2", "R2:b", "R4:b"], ["J3", "R1:b", "R2:a", "R5:a"], ["J4", "R3:b", "R4:a", "R5:b"],
  ]);
});

it("round-trips a routable connected 100-component JSON document", () => {
  let drawing = emptyDrawing();
  for (let i = 0; i < 100; i++) drawing = placeComponent(drawing, "r", { x: 80 + (i % 20) * 180, y: 80 + Math.floor(i / 20) * 140 });
  for (let i = 1; i < 100; i++) drawing = wireDrawing(drawing, `R${i}:b`, `R${i + 1}:a`);
  drawing = { ...drawing, board: { width: 4096, height: 8192 } };
  const text = serializeCircuit(drawing, defaultCircuitSettings, "100-component ladder");
  const reopened = parseCircuit(text);
  expect(reopened.drawing.topology.components).toHaveLength(100);
  expect(reopened.drawing.topology).toEqual(drawing.topology);
  expect(topology(reopened.drawing)).toEqual(topology(drawing));
  expect(reopened.routing.unrouted).toEqual([]);
});
