import { describe, expect, it } from "vitest";
import {
  addComponent, addJunction, connect, disconnect, emptyCircuit, netlist,
  removeComponent, validateCircuit, type CircuitTopology,
} from "./topology";

function fixture() {
  let circuit = addComponent(emptyCircuit(), {
    id: "source", kind: "voltage", terminals: ["p", "n"], parameters: { voltageV: 12 },
  });
  circuit = addComponent(circuit, {
    id: "line", kind: "line", terminals: ["a", "b", "shield"], parameters: { lengthM: 500_000 },
  });
  return addJunction(circuit, "junction");
}

describe("Circuit Engine topology", () => {
  it("derives electrical nets from named ports and removes branches on disconnect", () => {
    const circuit = connect(connect(connect(fixture(), "w1", "p", "junction"),
      "w2", "junction", "a"), "w3", "junction", "shield");
    expect(netlist(circuit)).toEqual([["a", "junction", "p", "shield"], ["b"], ["n"]]);
    expect(netlist(disconnect(circuit, "w3"))).toEqual([["a", "junction", "p"], ["b"], ["n"], ["shield"]]);
    expect(circuit.components[1].parameters.lengthM).toBe(500_000);
  });

  it("preserves electrical connectivity when a redundant conductive path is opened", () => {
    const circuit = connect(connect(connect(fixture(), "w1", "p", "a"),
      "w2", "p", "junction"), "w3", "a", "junction");
    expect(netlist(disconnect(circuit, "w1"))).toEqual(netlist(circuit));
  });

  it("removes incident conductors atomically and leaves the original unchanged", () => {
    const circuit = connect(connect(fixture(), "w1", "p", "a"), "w2", "n", "b");
    expect(netlist(removeComponent(circuit, "source"))).toEqual([["a"], ["b"], ["junction"], ["shield"]]);
    expect(circuit.wires).toHaveLength(2);
  });

  it("rejects identifier collisions, reversed duplicate edges, and unknown endpoints", () => {
    const circuit = connect(fixture(), "w1", "p", "a");
    expect(() => addJunction(circuit, "p")).toThrow("duplicate-id");
    expect(() => connect(circuit, "w2", "a", "p")).toThrow("duplicate-wire");
    expect(() => connect(circuit, "w2", "p", "p")).toThrow("self-wire");
    expect(() => connect(circuit, "w2", "p", "line")).toThrow("unknown-endpoint");
    expect(circuit.wires).toHaveLength(1);
  });

  it("rejects malformed data and non-finite parameters", () => {
    const circuit = fixture();
    const bad: CircuitTopology = {
      ...circuit, components: [
        { id: "bad", kind: "r", terminals: ["r1", "r2"], parameters: { value: Infinity } },
      ],
    };
    expect(validateCircuit(bad)).toContain("invalid-parameter");
    expect(validateCircuit({ components: [null], junctions: [], wires: [] })).toContain("invalid-component");
    expect(validateCircuit({ components: [], junctions: [], wires: [null] })).toContain("invalid-wire");
  });
});
