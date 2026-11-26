import { expect, test } from "vitest";
import { parts } from "../circuit/drawing";
import { lineExperimentModel, newLineExperiment } from "./line-experiment";
import { at, loadLeaves, simulateNetwork } from "./network";

test.each([0, .002])("LINE-UX-009A: resolves the physical K1–L2 input and L1–C1 load with closure at %s s", closeS => {
  const { circuit, durationS } = newLineExperiment();
  const experiment = {
    ...circuit,
    topology: {
      ...circuit.topology,
      components: [
        ...circuit.topology.components.map(part => part.id === "K1"
          ? { ...part, parameters: { ...part.parameters, atS: closeS } } : part),
        { id: "L2", kind: "l", terminals: ["L2:a", "L2:b"], parameters: { ...parts.l.parameters } },
        { id: "L1", kind: "l", terminals: ["L1:a", "L1:b"], parameters: { ...parts.l.parameters } },
      ],
      wires: [
        ...circuit.topology.wires.filter(wire => wire.id !== "W2" && wire.id !== "W3"),
        { id: "W2", from: "K1:b", to: "L2:a" },
        { id: "W6", from: "L2:b", to: "TL1:a" },
        { id: "W3", from: "TL1:b", to: "L1:a" },
        { id: "W7", from: "L1:b", to: "C1:a" },
      ],
    },
  };
  const original = JSON.stringify(experiment);
  const model = lineExperimentModel(experiment, durationS);
  const run = simulateNetwork(model);
  const line = model.sections[0];
  const delay = line.lengthM / line.velocityMS;

  expect(JSON.stringify(experiment)).toBe(original);
  expect(model.source.onS).toBe(closeS);
  expect(loadLeaves(model.load).map(({ id }) => id).sort()).toEqual(["C1", "L1"]);
  expect(run.method).toBe("characteristics-trapezoid");
  if (closeS > 0) expect(at(run, 0, closeS / 2).i).toBe(0);

  // Before any reflected wave returns, the input sees only L2 and the
  // characteristic impedance, giving the closed-form step response of an RL circuit.
  const offset = .00015;
  const resistance = model.source.resistanceOhm + line.impedanceOhm;
  const expected = model.source.voltageV / resistance
    * (1 - Math.exp(-resistance * offset / parts.l.parameters.henry));
  // The fixed-step solver resolves the onset within one sample. The maximum
  // slope E/L bounds the resulting current error.
  const samplingError = Math.abs(model.source.voltageV) * run.stepS / parts.l.parameters.henry;
  expect(Math.abs(at(run, 0, closeS + offset).i - expected)).toBeLessThan(samplingError);

  const outputBefore = at(run, line.lengthM, closeS + delay - .0002);
  expect(outputBefore.u).toBeCloseTo(0, 9);
  expect(outputBefore.i).toBeCloseTo(0, 9);
  const outputAfter = at(run, line.lengthM, closeS + delay + .001);
  expect(Math.abs(outputAfter.u)).toBeGreaterThan(.1);
  expect(Math.abs(outputAfter.i)).toBeGreaterThan(.001);

  const energized = { ...experiment, topology: { ...experiment.topology,
    components: experiment.topology.components.map(part => part.id === "L2"
      ? { ...part, parameters: { ...part.parameters, initial: .1 } } : part),
  } };
  expect(() => lineExperimentModel(energized, durationS)).toThrow("unsupported-line-chain");
});
