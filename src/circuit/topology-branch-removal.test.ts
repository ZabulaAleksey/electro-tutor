import { describe, expect, it } from "vitest";
import { netlist, type CircuitComponent, type CircuitTopology } from "./topology";
import { parallelBranchForComponent, removeParallelBranch } from "./topology-branch-removal";

function part(id: string, kind = "r"): CircuitComponent {
  return { id, kind, terminals: [id + ":a", id + ":b"], parameters: {} };
}

const fixture: CircuitTopology = {
  components: [part("P1", "port"), part("R1"), part("C1", "c"), part("R2"), part("R3")],
  junctions: ["J1", "J2"],
  wires: [
    { id: "W1", from: "P1:a", to: "R1:a" },
    { id: "W2", from: "R1:b", to: "J1" },
    { id: "W3", from: "J1", to: "C1:a" },
    { id: "W4", from: "C1:b", to: "P1:b" },
    { id: "W5", from: "R2:a", to: "R1:a" },
    { id: "W6", from: "R2:b", to: "C1:b" },
    { id: "W7", from: "R3:a", to: "J2" },
  ],
};
const ports = ["P1:a", "P1:b"];

describe("parallel branch deletion", () => {
  it("identifies the same whole branch from either of its series devices", () => {
    expect(parallelBranchForComponent(fixture, "R1", ports)).toEqual(["C1", "R1"]);
    expect(parallelBranchForComponent(fixture, "C1", ports)).toEqual(["C1", "R1"]);
    expect(parallelBranchForComponent(fixture, "R2", ports)).toEqual(["R2"]);
  });

  it("removes only the selected branch, preserves surviving nets, and skips reserved wire IDs", () => {
    const snapshot = JSON.stringify(fixture);
    const result = removeParallelBranch(fixture, "R1", ports, ["W8", "W9"]);
    const survivingEndpoints = new Set([...result.junctions, ...result.components.flatMap(component => component.terminals)]);

    expect(result.components.map(component => component.id)).toEqual(["P1", "R2", "R3"]);
    expect(result.junctions).toEqual(["J2"]);
    const expectedNets = netlist(fixture).map(net => net.filter(endpoint => survivingEndpoints.has(endpoint))).filter(net => net.length);
    expect(netlist(result).map(net => net.join("|")).sort()).toEqual(expectedNets.map(net => net.join("|")).sort());
    expect(result.wires).toEqual([
      fixture.wires[6],
      { id: "W10", from: "P1:b", to: "R2:b" },
      { id: "W11", from: "P1:a", to: "R2:a" },
    ]);
    expect(JSON.stringify(fixture)).toBe(snapshot);
  });

  it("does not treat the measurement port or the remainder of a simple loop as a parallel path", () => {
    const series = {
      ...fixture,
      components: fixture.components.filter(component => component.id !== "R2"),
      wires: fixture.wires.filter(wire => wire.id !== "W5" && wire.id !== "W6"),
    };
    expect(parallelBranchForComponent(series, "R1", ports)).toBeUndefined();
    expect(parallelBranchForComponent(fixture, "P1", ports)).toBeUndefined();

    const closedLoop = {
      ...fixture,
      components: fixture.components.filter(component => component.id !== "P1"),
      wires: fixture.wires.filter(wire => wire.id !== "W1" && wire.id !== "W4"),
    };
    expect(parallelBranchForComponent(closedLoop, "R1")).toBeUndefined();
  });

  it("rejects an observed internal net, selected observed terminal, or an ambiguous tap", () => {
    expect(parallelBranchForComponent(fixture, "R1", [...ports, "J1"])).toBeUndefined();
    expect(parallelBranchForComponent(fixture, "R1", [...ports, "R1:a"])).toBeUndefined();
    const branched = {
      ...fixture,
      wires: [...fixture.wires, { id: "W8", from: "J1", to: "R3:b" }],
    };
    const snapshot = JSON.stringify(branched);
    expect(parallelBranchForComponent(branched, "R1", ports)).toBeUndefined();
    expect(() => removeParallelBranch(branched, "R1", ports)).toThrow("ambiguous-parallel-branch");
    expect(JSON.stringify(branched)).toBe(snapshot);
  });
});
