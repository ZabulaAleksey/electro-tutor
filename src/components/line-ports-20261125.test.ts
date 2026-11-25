import { expect, it } from "vitest";
import { netlist, type CircuitComponent } from "../circuit/topology";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { layoutLineExperiment } from "./line-experiment-layout";
import { geometryAfterInsertion } from "./line-slot-geometry";

const section = (id: string): CircuitComponent => ({
  id, kind: "line",
  terminals: [id + ":a", id + ":b", id + ":return-in", id + ":return-out"],
  parameters: {},
});

const circuit: TopologyLabDocument = {
  kind: "electrotutor-topology-lab",
  schemaVersion: 1,
  attachmentSides: [],
  observedEndpoints: [],
  topology: {
    components: [
      { id: "E1", kind: "voltage", terminals: ["E1:a", "E1:b"], parameters: {} },
      { id: "K1", kind: "switch", terminals: ["K1:a", "K1:b"], parameters: {} },
      section("TL1"),
      { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: {} },
    ],
    junctions: [],
    wires: [
      { id: "W1", from: "E1:a", to: "K1:a" },
      { id: "W2", from: "K1:b", to: "TL1:a" },
      { id: "W3", from: "TL1:b", to: "C1:a" },
      { id: "W4", from: "C1:b", to: "TL1:return-out" },
      { id: "W5", from: "E1:b", to: "TL1:return-in" },
    ],
  },
};

function expectOrthogonalWires(document: TopologyLabDocument, layout: ReturnType<typeof layoutLineExperiment>) {
  for (const { id, from, to } of document.topology.wires) {
    const path = layout.wires.find(wire => wire.id === id)?.points;
    expect(path?.[0], id).toEqual(layout.endpoints.get(from));
    expect(path?.at(-1), id).toEqual(layout.endpoints.get(to));
    expect(path?.slice(1).every((point, index) =>
      point.x === path[index].x || point.y === path[index].y), id).toBe(true);
  }
}

it("lays out the transient starter with two local return links and no external return bypass", () => {
  const layout = layoutLineExperiment(circuit);
  expect(layout.components.find(part => part.id === "TL1")).toEqual({ id: "TL1", x: 322, y: 106 });
  expect(layout.returnY).toBe(254);
  expect(section("TL1").terminals.map(id => layout.endpoints.get(id))).toEqual([
    { x: 270, y: 106 }, { x: 374, y: 106 }, { x: 270, y: 254 }, { x: 374, y: 254 },
  ]);
  expect(layout.wires.find(wire => wire.id === "W4")?.points).toEqual([
    { x: 442, y: 232 }, { x: 442, y: 254 }, { x: 374, y: 254 },
  ]);
  expect(layout.wires.find(wire => wire.id === "W5")?.points).toEqual([
    { x: 69, y: 232 }, { x: 69, y: 254 }, { x: 270, y: 254 },
  ]);
  expect(netlist(circuit.topology)).toEqual(expect.arrayContaining([
    ["E1:b", "TL1:return-in"], ["C1:b", "TL1:return-out"],
  ]));
  expectOrthogonalWires(circuit, layout);
});

it("routes both conductors between cascaded sections and keeps the return pins visible when open", () => {
  const cascaded = { ...circuit, topology: {
    ...circuit.topology,
    components: [...circuit.topology.components, section("TL2")],
    wires: [
      ...circuit.topology.wires.map(wire =>
        wire.id === "W3" ? { ...wire, from: "TL2:b" }
          : wire.id === "W4" ? { ...wire, to: "TL2:return-out" } : wire),
      { id: "W6", from: "TL1:b", to: "TL2:a" },
      { id: "W7", from: "TL1:return-out", to: "TL2:return-in" },
    ],
  } };
  const layout = layoutLineExperiment(cascaded);
  expect(layout.appendEndpoint).toBe("TL2:b");
  expect(layout.wires.find(wire => wire.id === "W6")?.points).toEqual([{ x: 374, y: 106 }, { x: 416, y: 106 }]);
  expect(layout.wires.find(wire => wire.id === "W7")?.points).toEqual([{ x: 374, y: 254 }, { x: 416, y: 254 }]);

  const opened = { ...cascaded, topology: { ...cascaded.topology, wires: cascaded.topology.wires.filter(wire => wire.id !== "W7") } };
  const fallback = layoutLineExperiment(opened);
  const pins = section("TL2").terminals.map(id => fallback.endpoints.get(id));
  expect(pins.every(Boolean)).toBe(true);
  expect(new Set(pins.map(point => JSON.stringify(point))).size).toBe(4);
  expect(fallback.wires.some(wire => wire.id === "W7")).toBe(false);
  expectOrthogonalWires(opened, fallback);
});

it("keeps signal and return pairs together when the line is reversed", () => {
  const reversed = { ...circuit, topology: {
    ...circuit.topology,
    wires: [
      circuit.topology.wires[0],
      { id: "W2", from: "K1:b", to: "TL1:b" },
      { id: "W3", from: "TL1:a", to: "C1:a" },
      { id: "W4", from: "C1:b", to: "TL1:return-in" },
      { id: "W5", from: "E1:b", to: "TL1:return-out" },
    ],
  } };
  const layout = layoutLineExperiment(reversed);
  expect(layout.rotations.get("TL1")).toBe(180);
  expect(layout.appendEndpoint).toBe("TL1:a");
  expect(section("TL1").terminals.map(id => layout.endpoints.get(id))).toEqual([
    { x: 374, y: 106 }, { x: 270, y: 106 }, { x: 374, y: 254 }, { x: 270, y: 254 },
  ]);
  expectOrthogonalWires(reversed, layout);
});

it("draws an intentional output short between its two named output terminals", () => {
  const shorted = { ...circuit, topology: {
    ...circuit.topology,
    components: circuit.topology.components.filter(part => part.id !== "C1"),
    wires: [
      ...circuit.topology.wires.filter(wire => wire.id !== "W3" && wire.id !== "W4"),
      { id: "Wshort", from: "TL1:b", to: "TL1:return-out" },
    ],
  } };
  const layout = layoutLineExperiment(shorted);
  expect(layout.endpoints.get("TL1:b")).not.toEqual(layout.endpoints.get("TL1:return-out"));
  expect(netlist(shorted.topology)).toContainEqual(["TL1:b", "TL1:return-out"]);
  expectOrthogonalWires(shorted, layout);
});

it("retains valid saved pin rotation without reporting a horizontal shared return lane", () => {
  const pins = Object.fromEntries(layoutLineExperiment(circuit).endpoints);
  const verticalPins = [
    { x: 322, y: 106 }, { x: 322, y: 210 }, { x: 278, y: 106 }, { x: 278, y: 210 },
  ];
  section("TL1").terminals.forEach((terminal, index) => { pins[terminal] = verticalPins[index]; });
  const rotated = { ...circuit, geometry: { pins, bends: {}, returnY: 254 } };
  const layout = layoutLineExperiment(rotated);
  expect(layout.rotations.get("TL1")).toBe(90);
  expect(layout.returnY).toBeUndefined();
  expect(section("TL1").terminals.map(id => layout.endpoints.get(id))).toEqual(verticalPins);
  expectOrthogonalWires(rotated, layout);
});

it("makes room for a series part by translating all four line terminals together", () => {
  const editor = layoutLineExperiment(circuit);
  const part = { id: "L1", kind: "l", terminals: ["L1:a", "L1:b"], parameters: {} };
  const topology = {
    ...circuit.topology,
    components: [...circuit.topology.components, part],
    wires: [
      ...circuit.topology.wires.map(wire => wire.id === "W2" ? { ...wire, to: "L1:a" } : wire),
      { id: "W6", from: "L1:b", to: "TL1:a" },
    ],
  };
  const slot = { id: "series:W2", kind: "series", wireId: "W2", sourceKey: "", boundaries: ["K1:b", "TL1:a"] } as const;
  const geometry = geometryAfterInsertion(editor, circuit.topology, topology, slot, part);
  const updated = { ...circuit, topology, geometry };
  const layout = layoutLineExperiment(updated);
  for (const terminal of section("TL1").terminals) {
    const original = editor.endpoints.get(terminal)!;
    expect(layout.endpoints.get(terminal), terminal).toEqual({ x: original.x + 104, y: original.y });
  }
  expectOrthogonalWires(updated, layout);
});
