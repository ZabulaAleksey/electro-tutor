import { describe, expect, it } from "vitest";
import { createCrossSlot, insertTopologyComponent, listTopologySlots } from "./topology-slots";
import { netlist, validateCircuit, type CircuitComponent, type CircuitTopology, type CircuitWire } from "./topology";

function part(id: string, kind = "r", reversed = false): CircuitComponent {
  const parameters: CircuitComponent["parameters"] = kind === "c" ? { farad: 1e-6 } : kind === "l" ? { henry: 0.1 } : { ohm: 50 };
  return { id, kind, terminals: reversed ? [id + ":b", id + ":a"] : [id + ":a", id + ":b"], parameters };
}

const wire = (id: string, from: string, to: string): CircuitWire => ({ id, from, to });
const chain: CircuitTopology = {
  components: [part("R"), part("C", "c"), part("L", "l")],
  junctions: ["mid"],
  wires: [wire("a-split", "R:b", "mid"), wire("b-split", "mid", "C:a"), wire("c-tail", "C:b", "L:a")],
};

function series(topology: CircuitTopology, observed?: readonly string[]) {
  return listTopologySlots(topology, observed).filter(slot => slot.kind === "series");
}

function parallel(topology: CircuitTopology, observed?: readonly string[]) {
  return listTopologySlots(topology, observed).filter(slot => slot.kind === "parallel");
}

function groupKey(members: readonly string[]) {
  return [...members].sort().join(",");
}

describe("topology lab slots", () => {
  it("enumerates exactly the contiguous R-C-L regions and two sides per region", () => {
    const slots = parallel(chain);
    const expected = ["R", "C", "L", "C,R", "C,L", "C,L,R"];
    expect(new Set(slots.map(slot => groupKey(slot.componentIds)))).toEqual(new Set(expected));
    for (const members of expected) {
      const pair = slots.filter(slot => groupKey(slot.componentIds) === members);
      expect(pair.map(slot => slot.side)).toEqual(["left", "right"]);
      expect(pair[0].id).not.toBe(pair[1].id);
      expect(pair[0].boundaries).toEqual(pair[1].boundaries);
    }
    expect(series(chain).map(slot => slot.wireId)).toEqual(["a-split", "c-tail"]);
    expect(listTopologySlots({ ...chain, components: [...chain.components].reverse(),
      wires: [...chain.wires].reverse() })).toEqual(listTopologySlots(chain));
  });

  it("preserves the distinct partitions of an observed tap and blocks traversal through its net", () => {
    const topology = { ...chain, junctions: [...chain.junctions, "probe"],
      wires: [...chain.wires, wire("probe-branch", "mid", "probe")] };
    expect(series(topology).map(slot => slot.wireId)).toEqual(["a-split", "c-tail"]);
    expect(series(topology, ["probe"]).map(slot => slot.wireId)).toEqual(["a-split", "b-split", "c-tail", "probe-branch"]);
    expect(parallel(topology, ["probe"]).some(slot => groupKey(slot.componentIds) === "C,R")).toBe(false);
    expect(parallel(topology, ["probe"]).some(slot => groupKey(slot.componentIds) === "C,L")).toBe(true);
    expect(() => listTopologySlots(topology, ["missing"])).toThrow("unknown-observed-endpoint");
  });

  it("does not split a redundantly wired net along bypassed edges", () => {
    const topology = { ...chain, wires: [...chain.wires, wire("bypass", "C:a", "R:b")] };
    expect(series(topology).map(slot => slot.wireId)).toEqual(["c-tail"]);
    expect(parallel(topology)).toHaveLength(12);
  });

  it("does not traverse a branch, including an incidence from a multi-terminal device", () => {
    const topology = { ...chain, components: [...chain.components,
      { id: "multi", kind: "device", terminals: ["multi:a", "multi:b", "multi:c"], parameters: {} }],
    wires: [...chain.wires, wire("tap", "mid", "multi:a")] };
    const groups = new Set(parallel(topology).map(slot => groupKey(slot.componentIds)));
    expect(groups).toEqual(new Set(["R", "C", "L", "C,L"]));
    expect(series(topology).map(slot => slot.wireId)).toEqual(["a-split", "b-split", "c-tail", "tap"]);
  });

  it("enumerates simple paths inside a ring without offering a full closed loop", () => {
    const ring = { ...chain, wires: [...chain.wires, wire("end", "L:b", "R:a")] };
    const slots = parallel(ring);
    expect(slots).toHaveLength(12);
    const nets = netlist(ring);
    for (const slot of slots) {
      expect(new Set(slot.componentIds).size).toBe(slot.componentIds.length);
      expect(slot.componentIds.length).toBeLessThan(3);
      expect(nets.some(net => slot.boundaries.every(endpoint => net.includes(endpoint)))).toBe(false);
    }
  });

  it("handles long paths with reversed device terminals and no arbitrary group cap", () => {
    const length = 100;
    const components = Array.from({ length }, (_, i) => part("R" + i, "r", i % 2 === 0));
    const wires = components.slice(1).map((right, i) =>
      wire("link" + i, components[i].terminals[1], right.terminals[0]));
    const topology = { components, wires, junctions: [] };
    const slots = parallel(topology);
    expect(slots).toHaveLength(length * (length + 1));
    expect(slots.filter(slot => slot.componentIds.length === length)).toHaveLength(2);
    expect(new Set(slots.map(slot => slot.id)).size).toBe(slots.length);
  });

  it("splits only the selected wire and supports recursive attachment to the resulting branch", () => {
    const selected = series(chain)[0];
    const next = insertTopologyComponent(chain, selected, part("X"));
    expect(validateCircuit(next)).toEqual([]);
    expect(chain.components.map(component => component.id)).toEqual(["R", "C", "L"]);
    expect(next.wires.find(w => w.id === selected.wireId)).toEqual(wire("a-split", "R:b", "X:a"));
    expect(next.wires).toContainEqual(wire("slotWire1", "X:b", "mid"));
    expect(next.wires).toContainEqual(chain.wires[1]);
    expect(netlist(next)).toContainEqual(["R:b", "X:a"]);
    expect(netlist(next)).toContainEqual(["C:a", "X:b", "mid"]);

    const acrossX = parallel(next).find(slot => slot.componentIds.join() === "X" && slot.side === "right")!;
    const branched = insertTopologyComponent(next, acrossX, part("Y"));
    expect(netlist(branched)).toContainEqual(["R:b", "X:a", "Y:a"]);
    expect(netlist(branched)).toContainEqual(["C:a", "X:b", "Y:b", "mid"]);
    expect(parallel(branched).filter(slot => slot.componentIds.join() === "Y")).toHaveLength(2);
    expect(parallel(branched).some(slot => groupKey(slot.componentIds) === "R,X")).toBe(false);
  });

  it("attaches to an explicit cross pair in caller orientation without joining its two nets", () => {
    const topology = { ...chain, junctions: [...chain.junctions, "slotWire1"] };
    const cross = createCrossSlot(topology, "L:b", "R:a");
    const next = insertTopologyComponent(topology, cross, part("Z"));
    expect(next.wires.slice(0, topology.wires.length)).toEqual(topology.wires);
    expect(next.wires.slice(-2)).toEqual([wire("slotWire2", "L:b", "Z:a"), wire("slotWire3", "Z:b", "R:a")]);
    expect(netlist(next)).toContainEqual(["L:b", "Z:a"]);
    expect(netlist(next)).toContainEqual(["R:a", "Z:b"]);
    expect(() => createCrossSlot(topology, "R:b", "C:a")).toThrow("same-net-slot");
    expect(() => createCrossSlot(topology, "none", "C:a")).toThrow("unknown-slot-endpoint");
  });

  it("rejects stale or forged slots and ID collisions without mutating the source", () => {
    const original = structuredClone(chain);
    const slot = parallel(chain).find(slot => slot.componentIds.join() === "R" && slot.side === "left")!;
    expect(() => insertTopologyComponent(chain, slot, part("X"), ["mid"])).toThrow("stale-topology-slot");
    expect(() => insertTopologyComponent(chain, { ...slot, boundaries: ["R:a", "L:b"] }, part("X")))
      .toThrow("invalid-topology-slot");
    expect(() => insertTopologyComponent(chain, { ...slot, side: "right" }, part("X")))
      .toThrow("invalid-topology-slot");
    expect(() => insertTopologyComponent(chain, { ...slot, componentIds: ["C"] }, part("X")))
      .toThrow("invalid-topology-slot");
    expect(() => insertTopologyComponent(chain, slot, part("R"))).toThrow("duplicate-id");
    expect(() => insertTopologyComponent(chain, slot, { ...part("X"), terminals: ["X:a"] })).toThrow("invalid-slot-component");
    expect(chain).toEqual(original);
  });
});
