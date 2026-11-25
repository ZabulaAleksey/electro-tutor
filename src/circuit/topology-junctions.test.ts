import { describe, expect, it } from "vitest";
import { netlist, type CircuitTopology } from "./topology";
import { visibleJunctionIds } from "./topology-junctions";

const series: CircuitTopology = {
  components: [
    { id: "C3", kind: "c", terminals: ["C3:a", "C3:b"], parameters: { farad: 1e-6 } },
    { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { farad: 2e-6 } },
  ],
  junctions: ["J1"],
  wires: [
    { id: "W1", from: "C3:b", to: "J1" },
    { id: "W2", from: "J1", to: "C1:a" },
  ],
};

describe("visible topology junctions", () => {
  it("keeps a two-wire series junction connectable without marking it", () => {
    expect(visibleJunctionIds(series)).toEqual(new Set());
    expect(netlist(series)).toContainEqual(["C1:a", "C3:b", "J1"]);
  });

  it("marks an explicit junction once it connects three wires", () => {
    const branched = {
      ...series,
      junctions: [...series.junctions, "Tap"],
      wires: [...series.wires, { id: "W3", from: "Tap", to: "J1" }],
    };
    expect(visibleJunctionIds(branched)).toEqual(new Set(["J1"]));
    expect(visibleJunctionIds(series)).toEqual(new Set());
  });

  it("counts a component lead and leaves the separate external port glyph intact", () => {
    const attached: CircuitTopology = {
      ...series,
      components: [...series.components, { id: "P1", kind: "port", terminals: ["P1:a", "P1:b"], parameters: {} }],
      wires: [
        ...series.wires,
        { id: "W3", from: "C1:a", to: "P1:a" },
        { id: "W4", from: "P1:a", to: "C3:a" },
      ],
    };
    expect(visibleJunctionIds(attached)).toEqual(new Set(["C1:a"]));
    expect(netlist(attached)).toContainEqual(["C1:a", "C3:a", "C3:b", "J1", "P1:a"]);
  });

  it("does not join orthogonal wires at a crossing without a shared endpoint", () => {
    // In the drawing these span west–east and north–south and cross at the
    // centre. The topology intentionally contains no endpoint at that point.
    const crossing: CircuitTopology = {
      components: [],
      junctions: ["west", "east", "north", "south"],
      wires: [
        { id: "horizontal", from: "west", to: "east" },
        { id: "vertical", from: "north", to: "south" },
      ],
    };
    expect(visibleJunctionIds(crossing)).toEqual(new Set());
    expect(netlist(crossing)).toEqual([["east", "west"], ["north", "south"]]);
  });
});
