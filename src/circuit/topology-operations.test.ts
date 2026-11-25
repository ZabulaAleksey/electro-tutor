import { describe, expect, it } from "vitest";
import { newLineExperiment } from "../transient/line-experiment";
import { analyzeLcExperiment, newLcExperiment } from "./lc-experiment";
import { addComponent, addJunction, connect, disconnect, netlist, validateCircuit, type CircuitTopology } from "./topology";
import { breakTopologyWire, bypassSeriesDevice, clearTopologyDevices, restoreTopologyWire } from "./topology-operations";
import { TopologySession } from "./topology-session";

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
