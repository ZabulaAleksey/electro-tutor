import { describe, expect, it } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { analyzeLcExperiment, newLcExperiment } from "./lc-experiment";
import { addComponent, addJunction, connect, disconnect, netlist, validateCircuit, type CircuitTopology } from "./topology";
import { breakTopologyWire, bypassSeriesDevice, clearTopologyDevices, restoreTopologyWire } from "./topology-operations";
import { TopologySession } from "./topology-session";

const pins = {
  "E1:a": { x: 100, y: 90 }, "E1:b": { x: 100, y: 260 },
  "K1:a": { x: 160, y: 90 }, "K1:b": { x: 240, y: 90 },
  "L9:a": { x: 300, y: 120 }, "L9:b": { x: 380, y: 120 },
  "TL1:a": { x: 460, y: 90 }, "TL1:b": { x: 580, y: 90 },
  "TL1:return-in": { x: 460, y: 260 }, "TL1:return-out": { x: 580, y: 260 },
  "C1:a": { x: 670, y: 155 }, "C1:b": { x: 670, y: 230 },
};
const originalBends = {
  W3: [{ x: 670, y: 90 }], W4: [{ x: 670, y: 260 }], W5: [{ x: 200, y: 260 }],
};

function insertLineInductor() {
  const circuit = newLineExperiment().circuit;
  const session = new TopologySession(JSON.stringify(circuit));
  const slot = session.listSlots().find(candidate => candidate.kind === "series" && candidate.wireId === "W2");
  if (!slot) throw Error("Missing K1–TL1 fixture wire");
  session.apply({
    type: "insert", slot,
    component: { id: "L9", kind: "l", terminals: ["L9:a", "L9:b"], parameters: { henry: 0.01, initial: 0 } },
  });
  return { initial: circuit, inserted: session.document };
}

function disconnectedInductorLead(topology: CircuitTopology) {
  const outgoing = topology.wires.find(wire => wire.from === "L9:b" || wire.to === "L9:b");
  if (!outgoing) throw Error("Missing fixture outgoing wire");
  return disconnect(topology, outgoing.id);
}

describe("guarded topology commands", () => {
  it("keeps geometry out of net matching and rejects stale inserts without changing history", () => {
    const initial = newLcExperiment();
    const collapsed = { x: 0, y: 0 };
    const alternate = { ...initial, geometry: {
      pins: Object.fromEntries(initial.topology.components.flatMap(part => part.terminals.map(id => [id, collapsed]))),
      bends: {},
    } };
    const plain = new TopologySession(JSON.stringify(initial));
    const drawn = new TopologySession(JSON.stringify(alternate));
    const slot = plain.crossSlot("P1:a", "P1:b");
    expect(drawn.crossSlot("P1:a", "P1:b")).toEqual(slot);
    const branch = { id: "C9", kind: "c", terminals: ["C9:a", "C9:b"], parameters: { farad: .0002 } };
    for (const session of [plain, drawn]) session.apply({ type: "insert", slot, component: branch });
    expect(plain.document.topology).toEqual(drawn.document.topology);
    expect(analyzeLcExperiment(plain.document)).toEqual(analyzeLcExperiment(drawn.document));
    const committed = drawn.export();
    expect(() => drawn.apply({ type: "insert", slot, component: branch })).toThrow("stale-topology-slot");
    expect(drawn.export()).toBe(committed);
    drawn.undo();
    expect(drawn.document).toEqual(alternate);
    drawn.redo();
    expect(drawn.export()).toBe(committed);
  });

  it("bypasses the series inductor between K1 and TL1 while retaining the split wire identity", () => {
    const { initial, inserted } = insertLineInductor();
    const original = JSON.stringify(inserted);
    const repaired = bypassSeriesDevice(inserted.topology, "L9");

    expect(netlist(repaired)).toEqual(netlist(initial.topology));
    expect(repaired.components).toEqual(initial.topology.components);
    expect(repaired.junctions).toEqual(initial.topology.junctions);
    expect(repaired.wires.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(initial.topology.wires);
    expect(validateCircuit(repaired)).toEqual([]);
    expect(JSON.stringify(inserted)).toBe(original);
  });

  it("preserves stored wire orientation when the first lead is drawn in reverse", () => {
    const { inserted } = insertLineInductor();
    const reverseLead = {
      ...inserted.topology,
      wires: inserted.topology.wires.map(wire =>
        wire.id === "W2" ? { ...wire, from: wire.to, to: wire.from } : wire),
    };
    const repaired = bypassSeriesDevice(reverseLead, "L9");

    expect(repaired.wires.find(wire => wire.id === "W2")).toEqual({ id: "W2", from: "TL1:a", to: "K1:b" });
  });

  it.each([false, true])("preserves four-terminal line geometry, bypass bends and undo/redo (reversed lead: %s)", reversed => {
    const { initial, inserted } = insertLineInductor();
    const trailing = inserted.topology.wires.find(wire => wire.from === "L9:b" || wire.to === "L9:b")!;
    const topology = {
      ...inserted.topology,
      wires: inserted.topology.wires.map(wire => reversed && wire.id === "W2"
        ? { ...wire, from: wire.to, to: wire.from } : wire),
    };
    const session = new TopologySession(JSON.stringify({
      ...inserted, topology, geometry: {
        pins, returnY: 260, bends: {
          ...originalBends,
          W2: [{ x: 240, y: 120 }],
          [trailing.id]: [{ x: 460, y: 120 }],
        },
      },
    }));
    const before = session.export();
    session.apply({ type: "remove", componentId: "L9", mode: "conductor" });

    expect(netlist(session.document.topology)).toEqual(netlist(initial.topology));
    const remainingPins = Object.fromEntries(Object.entries(pins).filter(([id]) => !id.startsWith("L9:")));
    const detour = [{ x: 240, y: 120 }, { x: 460, y: 120 }];
    expect(session.document.geometry).toEqual({
      pins: remainingPins, returnY: 260, bends: { ...originalBends, W2: reversed ? detour.toReversed() : detour },
    });
    const bypassed = session.export();
    expect(new TopologySession(bypassed).export()).toBe(bypassed);
    expect(session.undo()).toBe(true);
    expect(session.export()).toBe(before);
    expect(session.redo()).toBe(true);
    expect(session.export()).toBe(bypassed);
  });

  it("keeps broken wire geometry and rebuilds a conducting tee after removing its device", () => {
    const initial = newLineExperiment().circuit;
    const kept = initial.topology.wires.filter(wire => wire.id !== "W2" && wire.id !== "W5");
    const brokenWire = initial.topology.wires.find(wire => wire.id === "W5")!;
    const topology = {
      ...initial.topology,
      components: [...initial.topology.components,
        { id: "L9", kind: "l", terminals: ["L9:a", "L9:b"], parameters: { henry: 0.01, initial: 0 } }],
      wires: [...kept, { id: "W6", from: "K1:b", to: "L9:a" }, { id: "W7", from: "L9:a", to: "TL1:a" }],
    };
    const session = new TopologySession(JSON.stringify({
      ...initial, topology, schemaVersion: 2, brokenWires: [brokenWire],
      geometry: { pins, returnY: 260, bends: {
        ...originalBends, W6: [{ x: 240, y: 120 }], W7: [{ x: 460, y: 120 }],
      } },
    }));
    session.apply({ type: "remove", componentId: "L9", mode: "device" });
    expect(netlist(session.document.topology).find(net => net.includes("K1:b"))).toEqual(["K1:b", "TL1:a"]);
    expect(session.document.brokenWires).toEqual([brokenWire]);
    expect(session.document.geometry?.bends).toEqual({
      ...originalBends, W2: [{ x: 240, y: 120 }, { x: 460, y: 120 }],
    });
    session.apply({ type: "restore-wire", wireId: "W5" });
    expect(session.document.topology.wires).toContainEqual(brokenWire);
    expect(session.document.geometry?.bends.W5).toEqual(originalBends.W5);
  });

  it("deletes a parallel line load branch without shifting any remaining pin or return conductor", () => {
    const initial = newLineExperiment().circuit;
    const topology = {
      ...initial.topology,
      components: [...initial.topology.components,
        { id: "L9", kind: "l", terminals: ["L9:a", "L9:b"], parameters: { henry: 0.01, initial: 0 } }],
      wires: [...initial.topology.wires, { id: "W6", from: "C1:a", to: "L9:a" }, { id: "W7", from: "L9:b", to: "C1:b" }],
    };
    const session = new TopologySession(JSON.stringify({
      ...initial, topology, geometry: { pins, returnY: 260, bends: { ...originalBends,
        W6: [{ x: 300, y: 155 }], W7: [{ x: 380, y: 230 }],
      } },
    }));
    session.apply({ type: "remove", componentId: "L9", mode: "branch" });
    expect(session.document.topology).toEqual(initial.topology);
    expect(session.document.geometry?.pins).toEqual(Object.fromEntries(Object.entries(pins).filter(([id]) => !id.startsWith("L9:"))));
    expect(session.document.geometry?.bends).toEqual(originalBends);
  });

  it("refuses bypassing a protected net or an inductor with a branch deeper in its connection", () => {
    const { initial, inserted } = insertLineInductor();
    expect(() => bypassSeriesDevice(initial.topology, "C1", ["E1:b"])).toThrow("unsafe-series-bypass");
    expect(() => bypassSeriesDevice(inserted.topology, "L9", ["K1:b"])).toThrow("unsafe-series-bypass");

    let withBranch = addComponent(inserted.topology, {
      id: "R9", kind: "r", terminals: ["R9:a", "R9:b"], parameters: { ohm: 50 },
    });
    withBranch = addJunction(withBranch, "J9");
    withBranch = connect(withBranch, "branch-from", "K1:b", "J9");
    withBranch = connect(withBranch, "branch-lead", "J9", "R9:a");
    withBranch = connect(withBranch, "branch-return", "R9:b", "C1:a");
    const before = JSON.stringify(withBranch);

    expect(() => bypassSeriesDevice(withBranch, "L9")).toThrow("unsafe-series-bypass");
    expect(JSON.stringify(withBranch)).toBe(before);
  });

  it("refuses a dangling lead and two leads already joined by a conductor", () => {
    const { inserted } = insertLineInductor();
    const open = disconnectedInductorLead(inserted.topology);
    const stub = connect(addJunction(open, "Jstub"), "stub-lead", "L9:b", "Jstub");
    expect(() => bypassSeriesDevice(stub, "L9")).toThrow("unsafe-series-bypass");

    const shorted = connect(inserted.topology, "already-closed", "L9:a", "L9:b");
    expect(() => bypassSeriesDevice(shorted, "L9")).toThrow("unsafe-series-bypass");
  });

  it("breaks and restores a wire with its original ID and endpoints without mutating snapshots", () => {
    const { topology } = newLineExperiment().circuit;
    const snapshot = JSON.stringify(topology);
    const broken = breakTopologyWire(topology, "W2");

    expect(broken.wire).toEqual({ id: "W2", from: "K1:b", to: "TL1:a" });
    expect(broken.wire).not.toBe(topology.wires.find(wire => wire.id === "W2"));
    expect(netlist(broken.topology).find(net => net.includes("K1:b"))).toEqual(["K1:b"]);
    const restored = restoreTopologyWire(broken.topology, broken.wire);
    expect(restored.wires.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(topology.wires);
    expect(netlist(restored)).toEqual(netlist(topology));
    expect(broken.topology.wires.some(wire => wire.id === "W2")).toBe(false);
    expect(JSON.stringify(topology)).toBe(snapshot);
    expect(() => breakTopologyWire(broken.topology, "W2")).toThrow("unknown-wire");
  });

  it("restores a distinct physical wire in an already connected net without accepting duplicate paths", () => {
    const { topology } = newLineExperiment().circuit;
    const withJunction = addJunction(topology, "J1");
    const withAlternate = connect(connect(withJunction, "split-a", "K1:b", "J1"), "split-b", "J1", "TL1:a");
    const { topology: broken, wire } = breakTopologyWire(withAlternate, "W2");

    expect(netlist(broken)).toEqual(netlist(withAlternate));
    const restored = restoreTopologyWire(broken, wire);
    expect(netlist(restored)).toEqual(netlist(withAlternate));
    expect(restored.wires).toContainEqual(wire);
    expect(() => restoreTopologyWire(restored, { id: "duplicate-path", from: wire.to, to: wire.from })).toThrow("duplicate-wire");
    expect(() => restoreTopologyWire(broken, { ...wire, id: "W1" })).toThrow("duplicate-id");
    expect(() => restoreTopologyWire(broken, { ...wire, to: "missing-node" })).toThrow("unknown-endpoint");
    expect(() => restoreTopologyWire(broken, { ...wire, to: wire.from })).toThrow("self-wire");
  });

  it("keeps the two external terminals after clear and accepts an intentional short", () => {
    const circuit = newLcExperiment();
    const snapshot = JSON.stringify(circuit);
    const cleared = clearTopologyDevices(circuit.topology, ["P1"]);

    expect(cleared).toEqual({
      components: [circuit.topology.components.find(part => part.id === "P1")],
      junctions: [],
      wires: [],
    });
    expect(analyzeLcExperiment({ ...circuit, topology: cleared })).toEqual({ kind: "open" });
    expect(clearTopologyDevices(cleared, ["P1"])).toBe(cleared);
    expect(clearTopologyDevices(circuit.topology)).toEqual({ components: [], junctions: [], wires: [] });

    const shorted = restoreTopologyWire(cleared, { id: "W1", from: "P1:a", to: "P1:b" });
    expect(analyzeLcExperiment({ ...circuit, topology: shorted })).toEqual({ kind: "short" });
    expect(cleared.wires).toEqual([]);
    expect(() => clearTopologyDevices(circuit.topology, ["missing-port"])).toThrow("unknown-retained-component");
    expect(JSON.stringify(circuit)).toBe(snapshot);
  });
});
