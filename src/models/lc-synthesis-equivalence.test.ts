import { expect, test } from "vitest";
import type { CircuitTopology } from "../circuit/topology";
import { binaryRatio, verifyLcRationalIdentity } from "./lc-synthesis-equivalence";
import { analyzeLcTopology } from "./reactive-lc-graph";
import { fosterIReactance, synthesizeFosterI } from "./reactive-foster-i";
import { fosterIIReactance, synthesizeFosterII } from "./reactive-foster-ii";
import { cauerReactance, synthesizeCauerI } from "./reactive-cauer-i";
import { synthesizeCauerII } from "./reactive-cauer-ii";
import { reactance, resonances } from "./reactive-two-port";

test("rational verification compares coefficients exactly and rejects changed poles", () => {
  const source = { numerator: [0n, 4n], denominator: [4n, 0n, 1n] };
  expect(verifyLcRationalIdentity(source, { numerator: [0n, 28n], denominator: [28n, 0n, 7n] }))
    .toMatchObject({ method: "exact-rational", coefficientError: 0 });
  const scale = 10n ** 14n;
  const bounded = verifyLcRationalIdentity(source, { numerator: [0n, 4n * scale], denominator: [4n * scale + 1n, 0n, scale] });
  expect(bounded.method).toBe("bounded-rational");
  expect(bounded.coefficientError).toBeGreaterThan(0);
  expect(bounded.coefficientError).toBeLessThan(bounded.coefficientTolerance);
  expect(() => verifyLcRationalIdentity(source, { numerator: [0n, 4n], denominator: [5n, 0n, 1n] }))
    .toThrow("lc-equivalence-coefficients");
  expect(binaryRatio(0.1)).toEqual({ numerator: 3602879701896397n, denominator: 36028797018963968n });
});

test("both Foster forms prove an exactly recoverable rational realization", () => {
  const impedance = { numerator: [12n, 0n, 15n, 0n, 2n], denominator: [0n, 4n, 0n, 1n] };
  const first = synthesizeFosterI(impedance);
  expect(first.verification).toMatchObject({
    method: "exact-rational", domain: "Z", dc: { kind: "pole" }, infinity: { kind: "pole" },
  });
  expect(first.verification.nominalWitnesses[0]).toEqual({ farad: { numerator: 1n, denominator: 3000n } });

  const second = synthesizeFosterII({ numerator: impedance.denominator, denominator: impedance.numerator });
  expect(second.verification).toMatchObject({
    method: "exact-rational", domain: "Y", dc: { kind: "pole" }, infinity: { kind: "pole" },
  });
  expect(second.verification.nominalWitnesses[0]).toEqual({ henry: { numerator: 1n, denominator: 3000n } });
});

test("cancelled imaginary factors do not produce phantom resonant branches", () => {
  const impedance = { numerator: [0n, 20n, 0n, 20n], denominator: [1n, 0n, 1n] };
  const first = synthesizeFosterI(impedance), second = synthesizeFosterII(impedance);
  expect(first.terms).toEqual([{ kind: "series-l", henry: .02, strength: 20 }]);
  expect(second.terms).toEqual([{ kind: "shunt-l", henry: .02, strength: .05 }]);
  expect(first.verification.method).toBe("exact-rational");
  expect(second.verification.method).toBe("exact-rational");
});

type Nominals = readonly [l1: number, l2: number, l3: number, c1: number, c2: number, c3: number, c4: number];

function fixture([l1, l2, l3, c1, c2, c3, c4]: Nominals) {
  const edges = [
    ["L1", "l", l1, "PortA", "N1"], ["C2", "c", c2, "PortA", "N1"],
    ["C3", "c", c3, "N1", "N2"], ["L3", "l", l3, "N2", "PortB"],
    ["C1", "c", c1, "N2", "PortB"], ["L2", "l", l2, "PortA", "PortB"],
    ["C4", "c", c4, "PortA", "PortB"],
  ] as const;
  const graph: CircuitTopology = {
    junctions: ["PortA", "PortB", "N1", "N2"],
    components: edges.map(([id, kind, value]) => ({
      id, kind, terminals: [id + ":a", id + ":b"],
      parameters: { [kind === "l" ? "henry" : "farad"]: value / (kind === "l" ? 1000 : 1e6) },
    })),
    wires: edges.flatMap(([id, , , a, b], index) => [
      { id: "Wa" + index, from: a, to: id + ":a" },
      { id: "Wb" + index, from: id + ":b", to: b },
    ]),
  };
  return analyzeLcTopology(graph, ["PortA", "PortB"]);
}

/** Independent closed-form driving-point X(ω) of the written seven-element topology. */
function portReactance([l1, l2, l3, c1, c2, c3, c4]: Nominals, omega: number) {
  const xL = (millihenry: number) => omega * millihenry / 1000;
  const bC = (microfarad: number) => omega * microfarad / 1e6;
  const tank = (inductor: number, capacitor: number) => 1 / (1 / xL(inductor) - bC(capacitor));
  const lower = tank(l1, c2) - 1 / bC(c3) + tank(l3, c1);
  return 1 / (1 / lower + 1 / xL(l2) - bC(c4));
}

const cases: readonly {
  name: string; values: Nominals; poles: number; zeros: number; activeOrder: number;
}[] = [
  { name: "nominal set A", values: [11, 17, 7, 135, 91, 172, 83], poles: 3, zeros: 2, activeOrder: 6 },
  { name: "nominal set B", values: [8, 32, 17, 60, 130, 45, 47], poles: 3, zeros: 2, activeOrder: 6 },
  { name: "wide range", values: [0.8, 220, 65, 18, 6, 470, 8], poles: 3, zeros: 2, activeOrder: 6 },
  { name: "coincident tank roots", values: [10, 8, 20, 40, 80, 88, 65], poles: 2, zeros: 1, activeOrder: 4 },
];

test.each(cases)("EVAL-05 $name · all four canonical forms match the seven-element analytic port", ({ values, poles, zeros, activeOrder }) => {
  const result = fixture(values);
  if (result.kind !== "finite") throw Error("Expected a finite LC driving-point function");
  const { impedance } = result;
  const critical = resonances(impedance);
  expect(critical.filter(point => point.kind === "pole")).toHaveLength(poles);
  expect(critical.filter(point => point.kind === "zero")).toHaveLength(zeros);
  expect(impedance.denominator.length - 1).toBe(activeOrder);

  const first = synthesizeFosterI(impedance), second = synthesizeFosterII(impedance);
  const cauerI = synthesizeCauerI(impedance), cauerII = synthesizeCauerII(impedance);
  expect(first.terms.reduce((count, term) => count + (term.kind === "parallel-lc" ? 2 : 1), 0)).toBe(activeOrder);
  expect(second.terms.reduce((count, term) => count + (term.kind === "series-lc" ? 2 : 1), 0)).toBe(activeOrder);
  for (const ladder of [cauerI, cauerII]) {
    expect(ladder.elements).toHaveLength(activeOrder);
    expect(ladder.impedance).toEqual(impedance);
    for (const element of ladder.elements) expect(element.valueSI).toBeGreaterThan(0);
  }
  for (const form of [first, second]) {
    expect(form.verification.coefficientError).toBeLessThan(form.verification.coefficientTolerance);
    expect(form.verification.sweepError).toBeLessThan(form.verification.sweepTolerance);
    expect(form.verification.samples).toBeGreaterThanOrEqual(40);
    for (const row of form.verification.nominalWitnesses) {
      for (const nominal of Object.values(row)) {
        expect(nominal.numerator).toBeGreaterThan(0n);
        expect(nominal.denominator).toBeGreaterThan(0n);
      }
    }
  }
  expect(first.verification.method).toBe("bounded-rational");
  expect(second.verification.method).toBe("bounded-rational");

  const low = critical[0].omega * 1e-4;
  const high = critical.at(-1)!.omega * 1e4;
  const probes = [
    low, high,
    ...Array.from({ length: 71 }, (_, index) => low * (high / low) ** (index / 70)),
    ...critical.flatMap(({ omega }) => [omega * 0.9998, omega * 1.0002]),
  ];
  for (const omega of probes) {
    const expected = portReactance(values, omega);
    const actual = [
      reactance(impedance, omega), fosterIReactance(first.terms, omega), fosterIIReactance(second.terms, omega),
      cauerReactance(cauerI.elements, omega), cauerReactance(cauerII.elements, omega),
    ];
    for (const value of actual) expect(Math.abs(value - expected) / Math.max(1, Math.abs(expected))).toBeLessThan(5e-8);
  }

  // Z has inductive DC slope L2 and leading capacitive asymptote from the physical series/parallel graph.
  const [, l2, , c1, c2, c3, c4] = values;
  const highCapacitance = (c4 + 1 / (1 / c1 + 1 / c2 + 1 / c3)) / 1e6;
  expect(Math.abs(portReactance(values, low) / (low * l2 / 1000) - 1)).toBeLessThan(1e-5);
  expect(Math.abs(portReactance(values, high) * (-high * highCapacitance) - 1)).toBeLessThan(1e-5);
});
