import { expect, test } from "vitest";
import { at, simulateNetwork } from "./network";
import {
  appendExperimentSection, lineExperimentModel, newLineExperiment, observationAt, readLineExperiment, removeExperimentPart,
} from "./line-experiment";

function legacyCurrentExperiment() {
  const experiment = newLineExperiment();
  const text = JSON.stringify(experiment).replaceAll("E1", "J1");
  const saved = JSON.parse(text);
  const source = saved.circuit.topology.components.find((part: { id: string }) => part.id === "J1");
  source.kind = "current";
  source.parameters = { currentA: .1, onS: 0, offS: 0 };
  return readLineExperiment(JSON.stringify(saved));
}

test("E1 launches a voltage step with the physical line impedance and a delayed reflection from C1", () => {
  const { circuit, durationS } = newLineExperiment();
  const model = lineExperimentModel(circuit, durationS);
  expect(model.source.voltageV).toBe(12);
  expect(model.source.currentA).toBeUndefined();
  const run = simulateNetwork(model);
  const x = model.sections[0].lengthM / 4;
  expect(at(run, x, .001)).toMatchObject({ u: 0, i: 0 });
  const front = at(run, x, .002);
  expect(front.u).toBeCloseTo(12, 4);
  expect(front.i).toBeCloseTo(12 / 50, 4);
  expect(front.backward).toBeCloseTo(0, 5);
  expect(Math.abs(at(run, x, .009).backward)).toBeGreaterThan(.1);
});

test("the current source drives the line only after the normally open switch closes", () => {
  const experiment = legacyCurrentExperiment();
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
  const { circuit, durationS } = legacyCurrentExperiment();
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
  expect(edited.topology.components.map(({ id }) => id)).toEqual(["E1", "K1", "TL1"]);
  expect(lineExperimentModel(edited, durationS).load.kind).toBe("open");
});
