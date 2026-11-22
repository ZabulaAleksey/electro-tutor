import { expect, test } from "vitest";
import { at, simulateNetwork } from "./network";
import {
  appendExperimentSection, lineExperimentModel, newLineExperiment, observationAt, readLineExperiment, removeExperimentPart,
} from "./line-experiment";

test("the current source drives the line only after the normally open switch closes", () => {
  const experiment = newLineExperiment();
  const delayed = {
    ...experiment.circuit,
    topology: {
      ...experiment.circuit.topology,
      components: experiment.circuit.topology.components.map(part =>
        part.id === "K1" ? { ...part, parameters: { ...part.parameters, atS: .002 } } : part),
    },
  };
  for (const [circuit, atS] of [[experiment.circuit, 0], [delayed, .002]] as const) {
    const model = lineExperimentModel(circuit, experiment.durationS);
    expect(model.source).toMatchObject({ currentA: .1, onS: atS, resistanceOhm: 0 });
    expect(model.load).toMatchObject({ id: "C1", kind: "c", value: .0001 });
    const run = simulateNetwork(model);
    const probe = model.sections[0].lengthM / 4;
    expect(at(run, probe, atS + .001)).toMatchObject({ u: 0, i: 0 });
    const behindFront = at(run, probe, atS + .002);
    expect(behindFront.u).toBeCloseTo(5, 4);
    expect(behindFront.i).toBeCloseTo(.1, 5);
    expect(behindFront.backward).toBeCloseTo(0, 5);
  }
});

test("a permanently open input gives a specific diagnostic for ideal source current", () => {
  const { circuit, durationS } = newLineExperiment();
  const topology = {
    ...circuit.topology,
    components: circuit.topology.components.map(part =>
      part.id === "K1" ? { ...part, parameters: { ...part.parameters, closes: false } } : part),
  };
  expect(() => lineExperimentModel({ ...circuit, topology }, durationS))
    .toThrow("inconsistent-ideal-current-source-and-open-switch");
});

test("cascade adds a real section before the load and the complete archive restores its observation", () => {
  const experiment = newLineExperiment();
  const circuit = appendExperimentSection(experiment.circuit);
  const model = lineExperimentModel(circuit, experiment.durationS);
  expect(model.sections.map(({ id }) => id)).toEqual(["TL1", "TL2"]);
  expect(model.load.id).toBe("C1");
  const saved = { ...experiment, circuit, selectedSection: "TL2", observations: { TL2: { xM: 75000, timeS: .009 } } };
  const restored = readLineExperiment(JSON.stringify(saved));
  expect(restored).toEqual(saved);
  expect(observationAt(restored, "TL2")).toEqual(saved.observations.TL2);
  expect(() => readLineExperiment(JSON.stringify({ ...saved, selectedSection: "R1" }))).toThrow("line-experiment-section");
  expect(() => readLineExperiment(JSON.stringify({ ...saved, durationS: .005 }))).toThrow("line-experiment-observation");
});

test("deleting the shunt load preserves the line and opens its termination", () => {
  const { circuit, durationS } = newLineExperiment();
  const edited = removeExperimentPart(circuit, "C1");
  expect(edited.topology.components.map(({ id }) => id)).toEqual(["J1", "K1", "TL1"]);
  expect(lineExperimentModel(edited, durationS).load.kind).toBe("open");
});
