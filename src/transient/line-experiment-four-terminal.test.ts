import { expect, test } from "vitest";
import { parts } from "../circuit/drawing";
import { TopologySession } from "../circuit/topology-session";
import { netlist } from "../circuit/topology";
import { at, simulateNetwork } from "./network";
import {
  appendExperimentSection, lineExperimentModel, newLineExperiment, readLineExperiment, setLineExperimentTermination,
} from "./line-experiment";

test("TL-01 starter JSON separates input and output pairs at the physical line", () => {
  const { circuit } = newLineExperiment();
  expect(circuit.topology.components.find(part => part.id === "TL1")?.terminals)
    .toEqual(["TL1:a", "TL1:b", "TL1:return-in", "TL1:return-out"]);
  expect(circuit.topology.wires).toEqual([
    { id: "W1", from: "E1:a", to: "K1:a" },
    { id: "W2", from: "K1:b", to: "TL1:a" },
    { id: "W3", from: "TL1:b", to: "C1:a" },
    { id: "W4", from: "C1:b", to: "TL1:return-out" },
    { id: "W5", from: "E1:b", to: "TL1:return-in" },
  ]);
  const nets = netlist(circuit.topology);
  expect(nets.find(net => net.includes("TL1:return-in"))).toEqual(["E1:b", "TL1:return-in"]);
  expect(nets.find(net => net.includes("TL1:return-out"))).toEqual(["C1:b", "TL1:return-out"]);
});

test("append carries the circuit and intentional load-rail break onto both new outlet terminals", () => {
  const initial = newLineExperiment();
  const session = new TopologySession(JSON.stringify(initial.circuit));
  session.apply({ type: "break-wire", wireId: "W4" });
  const circuit = appendExperimentSection(session.document, initial.durationS);
  expect(circuit.topology.wires).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: "TL1:b", to: "TL2:a" }),
    expect.objectContaining({ from: "TL1:return-out", to: "TL2:return-in" }),
    { id: "W3", from: "TL2:b", to: "C1:a" },
  ]));
  expect(circuit.brokenWires).toEqual([{ id: "W4", from: "C1:b", to: "TL2:return-out" }]);
  expect(lineExperimentModel(circuit, initial.durationS).load.kind).toBe("open");
  const restored = new TopologySession(JSON.stringify(circuit));
  restored.apply({ type: "restore-wire", wireId: "W4" });
  expect(lineExperimentModel(restored.document, initial.durationS).load).toMatchObject({ kind: "c", id: "C1" });
});

test("TL-02 sets physical matched, short and open loads while retaining auxiliary stations", () => {
  const initial = newLineExperiment();
  const cascade = appendExperimentSection(initial.circuit, initial.durationS);
  const aux = { id: "R7", kind: "r", terminals: ["R7:a", "R7:b"], parameters: parts.r.parameters };
  const junctionResistor = {
    ...cascade, topology: {
      ...cascade.topology,
      components: [...cascade.topology.components, aux],
      wires: [...cascade.topology.wires, { id: "WireAuxA", from: "TL1:b", to: "R7:a" },
        { id: "WireAuxB", from: "R7:b", to: "TL1:return-out" }],
    },
  };
  const matched = setLineExperimentTermination(junctionResistor, "matched", initial.durationS);
  const short = setLineExperimentTermination(matched, "short", initial.durationS);
  const open = setLineExperimentTermination(short, "open", initial.durationS);
  for (const circuit of [matched, short, open]) {
    expect(circuit.topology.components.map(part => part.id)).toEqual(expect.arrayContaining(["E1", "K1", "R7", "TL1", "TL2"]));
    expect(circuit.topology.wires).toEqual(expect.arrayContaining(junctionResistor.topology.wires
      .filter(wire => wire.id.startsWith("WireAux"))));
    expect(circuit.topology.components.some(part => part.id === "C1")).toBe(false);
  }
  expect(lineExperimentModel(matched, initial.durationS).load).toMatchObject({ kind: "r", value: 50 });
  expect(short.topology.wires).toContainEqual(expect.objectContaining({ from: "TL2:b", to: "TL2:return-out" }));
  expect(lineExperimentModel(short, initial.durationS).load.kind).toBe("wire");
  expect(netlist(open.topology).some(net => net.includes("TL2:b") && net.includes("TL2:return-out"))).toBe(false);
  expect(lineExperimentModel(open, initial.durationS).load.kind).toBe("open");
});

test("v1 two-terminal archives remain editable with their original terminal order and wire IDs", () => {
  const { circuit, ...experiment } = newLineExperiment();
  const legacy = {
    ...circuit,
    topology: {
      ...circuit.topology,
      components: circuit.topology.components.map(part => part.kind === "line" ? { ...part, terminals: ["TL1:a", "TL1:b"] } : part),
      wires: [
        { id: "W1", from: "E1:a", to: "K1:a" },
        { id: "W2", from: "K1:b", to: "TL1:a" },
        { id: "W3", from: "TL1:b", to: "C1:a" },
        { id: "W4", from: "C1:b", to: "E1:b" },
      ],
    },
  };
  const loaded = readLineExperiment(JSON.stringify({ ...experiment, circuit: legacy }));
  expect(loaded.circuit).toEqual(legacy);
  const cascaded = appendExperimentSection(loaded.circuit, experiment.durationS);
  expect(cascaded.topology.components.filter(part => part.kind === "line").map(part => part.terminals))
    .toEqual([["TL1:a", "TL1:b"], ["TL2:a", "TL2:b"]]);
  const terminated = setLineExperimentTermination(loaded.circuit, "short", experiment.durationS);
  const model = lineExperimentModel(terminated, experiment.durationS);
  expect(model.load).toMatchObject({ kind: "r", value: 0 });
  const sample = at(simulateNetwork(model), model.sections[0].lengthM, .006);
  expect(sample.u).toBeCloseTo(0, 10);
  expect(sample.i).toBeCloseTo(.48, 6);
  expect(sample.backward).toBeCloseTo(-sample.forward, 10);
});

test("four-terminal archive role order is validated without relaxing other component interfaces", () => {
  const { circuit, ...experiment } = newLineExperiment();
  const invalid = {
    ...circuit, topology: {
      ...circuit.topology, components: circuit.topology.components.map(part => part.id === "TL1"
        ? { ...part, terminals: ["TL1:a", "TL1:return-in", "TL1:b", "TL1:return-out"] } : part),
    },
  };
  expect(() => readLineExperiment(JSON.stringify({ ...experiment, circuit: invalid }))).toThrow("unsupported-component");
});


test("replacing a terminating device keeps surviving observation nets and allocates unique wire IDs", () => {
  const initial = newLineExperiment();
  const circuit = {
    ...initial.circuit,
    observedEndpoints: ["J1"],
    topology: {
      ...initial.circuit.topology,
      junctions: ["J1"],
      wires: [...initial.circuit.topology.wires, { id: "W6", from: "C1:a", to: "J1" }],
    },
  };
  const matched = setLineExperimentTermination(circuit, "matched", initial.durationS);
  expect(matched.observedEndpoints).toEqual(["J1"]);
  expect(netlist(matched.topology).find(net => net.includes("J1"))).toContain("TL1:b");
  expect(setLineExperimentTermination(matched, "matched", initial.durationS)).toBe(matched);
});

test("append preserves supplied input pins and draws the added line on both stored rails", () => {
  const { circuit } = newLineExperiment();
  const pins = {
    "TL1:a": { x: 267, y: 102 }, "TL1:b": { x: 377, y: 102 },
    "TL1:return-in": { x: 267, y: 240 }, "TL1:return-out": { x: 377, y: 240 },
  };
  const appended = appendExperimentSection({ ...circuit, geometry: { pins, bends: {}, returnY: 240 } });
  expect(appended.geometry?.pins).toMatchObject({
    ...pins,
    "TL2:a": { x: 401, y: 102 }, "TL2:b": { x: 505, y: 102 },
    "TL2:return-in": { x: 401, y: 240 }, "TL2:return-out": { x: 505, y: 240 },
  });
  expect(appended.geometry?.returnY).toBe(240);
});


test("preset replacement removes a load disconnected by an archived lead without resetting the line", () => {
  const { circuit, durationS } = newLineExperiment();
  const session = new TopologySession(JSON.stringify(circuit));
  session.apply({ type: "break-wire", wireId: "W4" });
  expect(lineExperimentModel(session.document, durationS).load.kind).toBe("open");
  const matched = setLineExperimentTermination(session.document, "matched", durationS);
  expect(matched.topology.components.some(part => part.kind === "c")).toBe(false);
  expect(matched.brokenWires).toBeUndefined();
  expect(matched.topology.wires).toContainEqual({ id: "W5", from: "E1:b", to: "TL1:return-in" });
  expect(lineExperimentModel(matched, durationS).load).toMatchObject({ kind: "r", value: 50 });
});

test.each(["open", "short"] as const)("selecting matched from %s keeps all stored pins and lays out the new resistor", mode => {
  const { circuit, durationS } = newLineExperiment();
  const pins = {
    "E1:a": { x: 69, y: 128 }, "E1:b": { x: 69, y: 232 },
    "K1:a": { x: 124, y: 106 }, "K1:b": { x: 228, y: 106 },
    "TL1:a": { x: 270, y: 106 }, "TL1:b": { x: 374, y: 106 },
    "TL1:return-in": { x: 270, y: 254 }, "TL1:return-out": { x: 374, y: 254 },
  };
  const previous = setLineExperimentTermination({ ...circuit, geometry: { pins, bends: {} } }, mode, durationS);
  const matched = setLineExperimentTermination(previous, "matched", durationS);
  expect(matched.geometry?.pins).toEqual({ ...pins, "R1:a": { x: 442, y: 128 }, "R1:b": { x: 442, y: 232 } });
});


function indirectOutputShort() {
  const circuit = setLineExperimentTermination(newLineExperiment().circuit, "short");
  const topology = circuit.topology;
  return {
    ...circuit,
    observedEndpoints: ["JTap"],
    topology: {
      ...topology,
      junctions: ["JShort", "JTap"],
      wires: [
        ...topology.wires.filter(wire => wire.from !== "TL1:b" || wire.to !== "TL1:return-out"),
        { id: "JunctionWire1", from: "TL1:b", to: "JShort" },
        { id: "JunctionWire2", from: "JShort", to: "TL1:return-out" },
        { id: "TapWire", from: "TL1:b", to: "JTap" },
      ],
    },
  };
}

test("removing a short through an unobserved junction preserves the side wire and its observation", () => {
  const circuit = indirectOutputShort();
  const opened = setLineExperimentTermination(circuit, "open");
  expect(opened.topology.wires).toContainEqual({ id: "TapWire", from: "TL1:b", to: "JTap" });
  expect(opened.topology.wires.some(wire => wire.from === "JShort" || wire.to === "JShort")).toBe(false);
  expect(opened.observedEndpoints).toEqual(["JTap"]);
  expect(lineExperimentModel(opened, newLineExperiment().durationS).load.kind).toBe("open");
});

test("a short through an observed junction is rejected without disturbing the document", () => {
  const circuit = { ...indirectOutputShort(), observedEndpoints: ["JShort", "JTap"] };
  const archive = JSON.stringify(circuit);
  expect(() => setLineExperimentTermination(circuit, "open")).toThrow("ambiguous-line-termination-bridge");
  expect(JSON.stringify(circuit)).toBe(archive);
});
