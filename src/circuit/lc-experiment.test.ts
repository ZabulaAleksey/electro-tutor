import { describe, expect, it } from "vitest";
import { limits, reactance, resonances, solveCircuit, type Circuit } from "../models/reactive-two-port";
import { maxCircuitFileBytes, parseCircuit } from "./document";
import {
  analyzeLcExperiment, lcMoveTargets, moveLcExperiment, newLcExperiment, readLcExperiment, removeLcPart,
} from "./lc-experiment";
import { reactiveLcMode } from "./reactive-lc-mode";
import { simplifyReactiveTopology } from "./reactive-lc-simplification";
import { netlist, type CircuitComponent } from "./topology";
import { TopologySession, type TopologyLabDocument } from "./topology-session";

const capacitor: CircuitComponent = { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { farad: .0001 } };

function addCapacitor(kind: "series" | "parallel"): TopologyLabDocument {
  const session = new TopologySession(JSON.stringify(newLcExperiment()));
  const slot = session.listSlots().find(slot => slot.kind === kind && (
    slot.kind === "series" ? slot.wireId === "W2"
      : slot.componentIds.length === 1 && slot.componentIds[0] === "L1" && slot.side === "right"
  ));
  if (!slot) throw Error("fixture-slot");
  session.apply({ type: "insert", slot, component: capacitor });
  return session.document;
}

function impedance(document: TopologyLabDocument) {
  const result = analyzeLcExperiment(document);
  if (result.kind !== "finite") throw Error("expected-finite-port");
  return result.impedance;
}

describe("topological LC experiment", () => {
  it("matches the series and parallel resonance oracles after actual slot insertion", () => {
    const series = impedance(addCapacitor("series"));
    expect(resonances(series)).toEqual([{ kind: "zero", omega: 1000 }]);
    expect(reactance(series, 500)).toBeCloseTo(-15, 12);
    expect(reactance(series, 2000)).toBeCloseTo(15, 12);
    expect(limits(series)).toEqual({ dc: "pole", high: "pole" });

    const parallel = impedance(addCapacitor("parallel"));
    expect(resonances(parallel)).toEqual([{ kind: "pole", omega: 1000 }]);
    expect(reactance(parallel, 500)).toBeCloseTo(20 / 3, 12);
    expect(reactance(parallel, 2000)).toBeCloseTo(-20 / 3, 12);
    expect(limits(parallel)).toEqual({ dc: "zero", high: "zero" });
  });

  it("moves the original L through a series C and proves exact port equivalence", () => {
    const before = addCapacitor("series");
    expect(lcMoveTargets(before, "L1")).toEqual(["slotWire1"]);
    const after = moveLcExperiment(before, "L1", "slotWire1");
    expect(after.topology.components).toEqual(before.topology.components);
    expect(after.observedEndpoints).toEqual(["P1:a", "P1:b"]);
    expect(netlist(after.topology).find(net => net.includes("P1:a"))).toContain("C1:a");
    expect(netlist(after.topology).find(net => net.includes("P1:b"))).toContain("L1:b");
    expect(impedance(after)).toEqual(impedance(before));
  });

  it("rejects the existing location, an observed intermediate node and nonzero initial state", () => {
    const before = addCapacitor("series");
    expect(() => moveLcExperiment(before, "L1", "W1")).toThrow("lc-move-noop");
    const observed = { ...before, observedEndpoints: [...before.observedEndpoints, "L1:b"] };
    expect(lcMoveTargets(observed, "L1")).toEqual([]);
    expect(() => moveLcExperiment(observed, "L1", "slotWire1")).toThrow("unsafe-series-move");
    const energized = {
      ...before, topology: { ...before.topology, components: before.topology.components.map(part =>
        part.id === "C1" ? { ...part, parameters: { ...part.parameters, initial: 5 } } : part) },
    };
    expect(lcMoveTargets(energized, "L1")).toEqual([]);
    expect(() => moveLcExperiment(energized, "L1", "slotWire1")).toThrow("lc-move-initial-state");
    expect(lcMoveTargets(addCapacitor("parallel"), "L1")).toEqual([]);
  });

  it("keeps the port and surviving parallel branch connected when a host device is deleted", () => {
    const before = addCapacitor("parallel");
    expect(removeLcPart(before, "P1")).toBe(before);
    const observed = { ...before, observedEndpoints: [...before.observedEndpoints, "L1:a"] };
    const after = removeLcPart(observed, "L1");
    expect(after.topology.junctions).toContain("L1:a");
    expect(netlist(after.topology).find(net => net.includes("L1:a"))).toEqual(["C1:a", "L1:a", "P1:a"]);
    expect(reactance(impedance(after), 1000)).toBeCloseTo(-10, 12);
    expect(analyzeLcExperiment(removeLcPart(after, "C1"))).toEqual({ kind: "open" });
  });
});

describe("LC archives and exact reduction", () => {
  it("reopens a native archive with side and observations and protects the external port", () => {
    const original = addCapacitor("parallel");
    expect(readLcExperiment(JSON.stringify(original))).toEqual(original);
    const reopened = readLcExperiment(JSON.stringify({ ...original, observedEndpoints: ["L1:a"] }));
    expect(reopened.observedEndpoints).toEqual(["L1:a", "P1:a", "P1:b"]);
    expect(reopened.attachmentSides).toEqual([{ componentId: "C1", side: "right" }]);
    expect(() => readLcExperiment(" ".repeat(maxCircuitFileBytes + 1))).toThrow("file-limit");
    const unsupported = { ...original, topology: { ...original.topology, components: original.topology.components.map(part =>
      part.id === "C1" ? { ...part, kind: "r", parameters: { ohm: 1 } } : part) } };
    expect(() => readLcExperiment(JSON.stringify(unsupported))).toThrow("invalid-lc-component");
  });

  it("imports the legacy LC graph v1/v2 with intact connections and analysis", () => {
    const old = reactiveLcMode.createDefaultDocument();
    const expected = reactiveLcMode.readModel(old);
    const v1 = JSON.parse(old);
    v1.schemaVersion = 1;
    delete v1.settings.snap;
    for (const text of [old, JSON.stringify(v1)]) {
      const reopened = readLcExperiment(text);
      expect(analyzeLcExperiment(reopened)).toEqual(expected);
      expect(netlist(reopened.topology)).toEqual(netlist(parseCircuit(old).drawing.topology));
      expect(reopened.topology.components.map(part => part.id).sort()).toEqual(["C1", "C2", "L1", "L2", "L3", "P1"]);
    }
  });

  it("imports the legacy LC tree and only reduces unprotected connections", () => {
    const tree: Circuit = { kind: "series", left: { kind: "l", value: 10 }, right: { kind: "l", value: 20 } };
    const reopened = readLcExperiment(JSON.stringify({ schema: "electrotutor-reactive-two-port-v1", circuit: tree }));
    expect(impedance(reopened)).toEqual(solveCircuit(tree).impedance);
    const reduced = simplifyReactiveTopology(reopened.topology, reopened.observedEndpoints);
    expect(reduced.steps).toHaveLength(1);
    const protectedMiddle = simplifyReactiveTopology(reopened.topology, [...reopened.observedEndpoints, "J1"]);
    expect(protectedMiddle.steps).toEqual([]);
    expect(protectedMiddle.result).toEqual(analyzeLcExperiment(reopened));
  });
});
