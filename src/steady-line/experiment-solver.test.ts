import { describe, expect, it } from "vitest";
import type { CircuitComponent, CircuitTopology } from "../circuit/topology";
import {
  solveSteadyExperiment, type DistributedParameters, type SteadyExperimentSettings,
} from "./experiment-solver";

const ideal = { rOhmM: 0, lHenryM: .25e-6, gSiemensM: 0, cFaradM: 100e-12 };
const lossy = { rOhmM: .02, lHenryM: .3e-6, gSiemensM: 2e-6, cFaradM: 90e-12 };

function part(id: string, kind: string, parameters: CircuitComponent["parameters"]): CircuitComponent {
  return { id, kind, terminals: [id + ":a", id + ":b"], parameters };
}

function circuit(components: readonly CircuitComponent[], wires: readonly (readonly [string, string])[]): CircuitTopology {
  return { components, junctions: [], wires: wires.map(([from, to], index) => ({ id: "w" + index, from, to })) };
}

function lineCircuit(source: CircuitComponent, lengthM: number, loadOhm?: number) {
  const line = part("TL1", "line", { lengthM });
  return loadOhm === undefined
    ? circuit([source, line], [[source.id + ":a", "TL1:a"]])
    : circuit([source, line, part("R1", "r", { ohm: loadOhm })], [
      [source.id + ":a", "TL1:a"], ["TL1:b", "R1:a"], ["R1:b", source.id + ":b"],
    ]);
}

const emf = part("E1", "voltage", { voltageV: 50 });

function settings({ frequencyHz = 1e6, referenceEndpoint = "E1:b", sourcePhases = {}, lineParameters = { TL1: ideal } }:
  Partial<SteadyExperimentSettings> = {}): SteadyExperimentSettings {
  return { frequencyHz, referenceEndpoint, sourcePhases, lineParameters };
}

function near(value: { re: number; im: number } | null, re: number, im: number, places = 10) {
  expect(value).not.toBeNull();
  expect(value?.re).toBeCloseTo(re, places);
  expect(value?.im).toBeCloseTo(im, places);
}

describe("steady experiment topology", () => {
  it("matches the 50 Ω RMS oracle including active power and no reflection", () => {
    const solved = solveSteadyExperiment(lineCircuit(emf, 50_000, 50), settings({ frequencyHz: 1e3 }));
    expect(solved.sections[0].id).toBe("TL1");
    expect(solved.poles("TL1")).toEqual([]);
    for (const x of [0, 17_431, 50_000]) {
      const { voltage, current, impedanceOhm, powerW } = solved.sample("TL1", x);
      expect(Math.hypot(voltage.total.re, voltage.total.im)).toBeCloseTo(50, 10);
      expect(Math.hypot(current.total.re, current.total.im)).toBeCloseTo(1, 10);
      near(voltage.backward, 0, 0);
      near(current.backward, 0, 0);
      near(impedanceOhm, 50, 0);
      expect(powerW).toBeCloseTo(50, 10);
    }
  });

  it("treats ideal J as an injection b→a and uses its RMS phase", () => {
    const graph = lineCircuit(part("J1", "current", { currentA: 1 }), 40, 50);
    const solved = solveSteadyExperiment(graph, settings({ referenceEndpoint: "J1:b", sourcePhases: { J1: 60 } }));
    const { voltage, current, powerW } = solved.sample("TL1", 0);
    near(current.total, .5, Math.sqrt(3) / 2);
    near(voltage.total, 25, 25 * Math.sqrt(3));
    expect(powerW).toBeCloseTo(50, 10);
  });

  it("solves simultaneous E and J and a physical series RL-C termination", () => {
    const frequencyHz = 1e6;
    const omega = 2 * Math.PI * frequencyHz;
    const diagram = circuit([
      part("E1", "voltage", { voltageV: 50, resistanceOhm: 50 }),
      part("J1", "current", { currentA: .5 }),
      part("TL1", "line", { lengthM: 100 }),
      part("R1", "r", { ohm: 50 }), part("L1", "l", { henry: .00001 }),
      part("C1", "c", { farad: 1 / (omega * omega * .00001) }),
    ], [
      ["E1:a", "J1:a"], ["J1:a", "TL1:a"], ["J1:b", "E1:b"],
      ["TL1:b", "R1:a"], ["R1:b", "L1:a"], ["L1:b", "C1:a"], ["C1:b", "E1:b"],
    ]);
    const solved = solveSteadyExperiment(diagram, settings({ frequencyHz, sourcePhases: { J1: 90 } }));
    const input = solved.sample("TL1", 0);
    // L and C cancel at the same ω. E sees the equal parallel 50 Ω branches.
    near(input.voltage.total, 25, 12.5);
    near(input.current.total, .5, .25);
    near(input.impedanceOhm, 50, 0);
    near(solved.sample("TL1", 100).voltage.total, -25, -12.5);
  });

  it("matches independent complex lossy oracles with unequal normalized R′ and G′", () => {
    const graph = lineCircuit(part("E1", "voltage", { voltageV: 23, resistanceOhm: 12 }), 2200, 80);
    const solved = solveSteadyExperiment(graph, settings({
      frequencyHz: 50e3, sourcePhases: { E1: -17 }, lineParameters: { TL1: lossy },
    }));
    const input = solved.sample("TL1", 0);
    const midpoint = solved.sample("TL1", 1100);
    const output = solved.sample("TL1", 2200);
    // Independent cmath Γ, propagation and source-divider oracle.
    near(input.impedanceOhm, 63.042756394208496, -9.202109478689597);
    near(midpoint.voltage.total, -6.101918831964021, -11.532814196113089);
    near(midpoint.current.total, -.12115177526928557, -.24143452845908195);
    near(output.impedanceOhm, 80, 0);
    expect(input.powerW).toBeCloseTo(5.834336788989652, 10);
    expect(midpoint.powerW).toBeCloseTo(3.5236778562862963, 10);
    expect(output.powerW).toBeCloseTo(2.0905601052711082, 10);
  });

  it("finds the unique interior pole in a lossy section driven from both ends", () => {
    const graph = circuit([
      part("E1", "voltage", { voltageV: .7546445018814549 }),
      part("E2", "voltage", { voltageV: 1.587648258265389 }),
      part("TL1", "line", { lengthM: 2200 }),
    ], [["E1:a", "TL1:a"], ["E2:a", "TL1:b"], ["E1:b", "E2:b"]]);
    const solved = solveSteadyExperiment(graph, settings({
      frequencyHz: 50e3,
      // Independent cmath V(x) = 2 cosh(γ(x−751.25 m)).
      sourcePhases: { E1: 25.74472354213506, E2: 162.63823386962451 },
      lineParameters: { TL1: lossy },
    }));
    const poles = solved.poles("TL1");
    expect(poles).toHaveLength(1);
    expect(poles[0]).toBeCloseTo(751.25, 9);
    const pole = solved.sample("TL1", poles[0]);
    near(pole.voltage.total, 2, 0);
    expect(pole.impedanceOhm).toBeNull();
    expect(solved.sample("TL1", 751.26).impedanceOhm).not.toBeNull();
  });

  it("finds interior and terminal poles of an open standing wave", () => {
    const solved = solveSteadyExperiment(lineCircuit(emf, 240), settings());
    const poles = solved.poles("TL1");
    expect(poles).toHaveLength(3);
    for (const [index, expected] of [40, 140, 240].entries()) {
      expect(poles[index]).toBeCloseTo(expected, 10);
      expect(solved.sample("TL1", poles[index]).impedanceOhm).toBeNull();
    }
    const open = solved.sample("TL1", 240);
    near(open.current.total, 0, 0);
    near(open.current.backward, -open.current.forward.re, -open.current.forward.im);
    expect(open.powerW).toBe(0);
    expect(solved.sample("TL1", 21).powerW).toBe(0);
    expect(solved.sample("TL1", 197).powerW).toBe(0);
    expect(solved.sample("TL1", 40.00001).impedanceOhm).not.toBeNull();
  });

  it("finds distant standing-wave poles and bounds a dense pole list", () => {
    const solved = solveSteadyExperiment(lineCircuit(emf, 50_020), settings());
    const roots = solved.poles("TL1");
    expect(roots).toHaveLength(501);
    expect(roots[498]).toBeCloseTo(49_820, 9);
    expect(solved.sample("TL1", roots[498]).impedanceOhm).toBeNull();
    const dense = solveSteadyExperiment(lineCircuit(emf, 200_020), settings());
    expect(() => dense.poles("TL1")).toThrow("steady-limit");
    expect(dense.sample("TL1", 20).impedanceOhm).toBeNull();
  });

  it("resolves a local standing-wave pole near the far end of an electrically long line", () => {
    const lengthM = 1e9;
    const solved = solveSteadyExperiment(lineCircuit(emf, lengthM), settings({ frequencyHz: 1e8 }));
    // With v = 2e8 m/s the wavelength is 2 m. An open termination has
    // zero current at every half-wavelength back from the end.
    const pole = solved.sample("TL1", lengthM - 1);
    expect(pole.current.total).toEqual({ re: 0, im: 0 });
    expect(pole.impedanceOhm).toBeNull();
    expect(solved.sample("TL1", lengthM - .99).impedanceOhm).not.toBeNull();
    expect(() => solved.poles("TL1")).toThrow("steady-limit");
  });

  it("reports negative active power when the backward wave drives a matched input", () => {
    const graph = circuit([
      part("J1", "current", { currentA: 1 }), part("TL1", "line", { lengthM: 100 }),
      part("R1", "r", { ohm: 50 }),
    ], [["J1:a", "TL1:b"], ["TL1:a", "R1:a"], ["R1:b", "J1:b"]]);
    const solved = solveSteadyExperiment(graph, settings({ referenceEndpoint: "J1:b" }));
    const output = solved.sample("TL1", 100);
    near(output.voltage.forward, 0, 0);
    near(output.voltage.backward, 50, 0);
    near(output.current.total, -1, 0);
    near(output.impedanceOhm, -50, 0);
    expect(output.powerW).toBeCloseTo(-50, 10);
  });

  it("allows a true short and finds the input pole at a quarter wavelength", () => {
    const solved = solveSteadyExperiment(lineCircuit(emf, 50, 0), settings());
    expect(solved.poles("TL1")).toEqual([0]);
    expect(solved.sample("TL1", 0).impedanceOhm).toBeNull();
    near(solved.sample("TL1", 50).voltage.total, 0, 0);
    near(solved.sample("TL1", 50).impedanceOhm, 0, 0);
    expect(() => solveSteadyExperiment(lineCircuit(emf, 50), settings())).toThrow("steady-singular");
  });

  it("preserves independent RLGC for a cascade, including very long attenuating sections", () => {
    const graph = circuit([
      emf, part("TL1", "line", { lengthM: 100 }), part("TL2", "line", { lengthM: 1e8 }),
      part("R1", "r", { ohm: 50 }),
    ], [["E1:a", "TL1:a"], ["TL1:b", "TL2:a"], ["TL2:b", "R1:a"], ["R1:b", "E1:b"]]);
    const lineParameters: Record<string, DistributedParameters> = { TL1: ideal, TL2: lossy };
    const solved = solveSteadyExperiment(graph, settings({ lineParameters }));
    const left = solved.sample("TL1", 100);
    const right = solved.sample("TL2", 0);
    near(left.voltage.total, right.voltage.total.re, right.voltage.total.im);
    near(left.current.total, right.current.total.re, right.current.total.im);
    expect(solved.sections[1].gammaPerM.re).toBeGreaterThan(0);
    expect(left.powerW).toBeGreaterThan(0);
    near(solved.sample("TL2", 1e8).voltage.total, 0, 0);
    expect(solved.sample("TL2", 1e8).powerW).toBe(0);
  });

  it("rejects unusable topology or parameters with stable diagnostics", () => {
    const graph = lineCircuit(emf, 50, 50);
    expect(() => solveSteadyExperiment(graph, settings({ frequencyHz: 0 }))).toThrow("steady-invalid-frequency");
    expect(() => solveSteadyExperiment(graph, settings({ referenceEndpoint: "unknown" }))).toThrow("steady-invalid-reference");
    expect(() => solveSteadyExperiment(graph, settings({ lineParameters: { TL1: { ...ideal, gSiemensM: -1 } } })))
      .toThrow("steady-invalid-line");
    expect(() => solveSteadyExperiment(graph, settings({ lineParameters: {} }))).toThrow("steady-invalid-line");
    expect(() => solveSteadyExperiment(graph, settings()).sample("TL1", -1)).toThrow("steady-position-out-of-range");
  });
});
