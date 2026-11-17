import { expect, it } from "vitest";
import { lineDemoDrawing } from "../circuit/drawing";
import type { CircuitTopology } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";

it("converts a free ideal input switch while retaining the separate first line node", () => {
  const base = lineDemoDrawing().topology;
  const topology: CircuitTopology = {
    ...base,
    components: [...base.components, { id: "K1", kind: "switch", terminals: ["K1:a", "K1:b"], parameters: { closed: false } }],
    wires: [
      ...base.wires.slice(1),
      { id: "W4", from: "V1:a", to: "K1:b" },
      { id: "W5", from: "K1:a", to: "TL1:a" },
    ],
  };
  const { model, resultPolarity } = transmissionCircuitAdapter.convert(topology);
  expect(model.series).toEqual([{ id: "K1", from: 0, to: 2, switch: { closed: false } }]);
  expect(resultPolarity.get("K1")).toBe(-1);
  const resistive = { ...topology, components: topology.components.map(part => part.id === "K1"
    ? { ...part, parameters: { ...part.parameters, contactOhm: 5 } } : part) };
  expect(() => transmissionCircuitAdapter.convert(resistive)).toThrow("unsupported-line-input-contact");
});

it("normalizes an initial voltage measured from reference to line once", () => {
  const base = lineDemoDrawing().topology;
  const topology: CircuitTopology = {
    ...base,
    components: base.components.map(part => part.id === "R1"
      ? { ...part, kind: "c", parameters: { farad: .001, initial: 4 } } : part),
    wires: [
      base.wires[0], { id: "W2", from: "V1:b", to: "R1:a" }, { id: "W3", from: "R1:b", to: "TL1:b" },
    ],
  };
  const { model, resultPolarity } = transmissionCircuitAdapter.convert(topology);
  expect(model.load).toMatchObject({ kind: "c", initial: -4 });
  expect(resultPolarity.get("R1")).toBe(-1);
});
