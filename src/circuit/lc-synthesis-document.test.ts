import { describe, expect, it } from "vitest";
import baseline from "../../tests/fixtures/electrotutor-20261125-baseline.json";
import { exactLcParameters } from "../models/lc-nominal";
import { factorText, reactance, resonances } from "../models/reactive-two-port";
import { synthesizeCauerI } from "../models/reactive-cauer-i";
import { verifyLcRationalIdentity } from "../models/lc-synthesis-equivalence";
import { synthesizeFosterI } from "../models/reactive-foster-i";
import { synthesizeFosterII } from "../models/reactive-foster-ii";
import { synthesizeCauerII } from "../models/reactive-cauer-ii";
import { analyzeLcExperiment, newLcExperiment, readLcExperiment } from "./lc-experiment";
import { applyCauerTopology, applyExactLcTopology, fosterTopologyDraft } from "./lc-synthesis-document";
import { parseTopologyLabDocument } from "./topology-session";

const seven = readLcExperiment(JSON.stringify(baseline.reactiveSynthesis.archive));

function exactImpedance(document: ReturnType<typeof newLcExperiment>) {
  const result = analyzeLcExperiment(document);
  if (result.kind !== "finite") throw Error("expected-finite-lc-fixture");
  return result.impedance;
}

describe("EVAL-05 editable LC synthesis", () => {
  it.each([["i", synthesizeCauerI], ["ii", synthesizeCauerII]] as const)(
    "applies Cauer %s without snapping derived nominal values to ticks", (form, synthesize) => {
      const expected = exactImpedance(seven);
      const next = applyCauerTopology(seven, form, synthesize(expected).elements);
      const previousIds = new Set(seven.topology.components.filter(part => part.kind !== "port").map(part => part.id));
      const newParts = next.topology.components.filter(part => part.kind !== "port");
      expect(newParts).toHaveLength(6);
      expect(newParts.every(part => !previousIds.has(part.id) && typeof part.parameters.lcExact === "string")).toBe(true);
      expect(next.observedEndpoints).toEqual(seven.observedEndpoints);
      const loaded = readLcExperiment(JSON.stringify(next));
      expect(exactImpedance(loaded)).toEqual(expected);
      expect(loaded).toEqual(next);
    },
  );

  it.each([["i", synthesizeFosterI], ["ii", synthesizeFosterII]] as const)(
    "transports verified Foster %s nominal witnesses into the editable graph", (form, synthesize) => {
      const expected = exactImpedance(seven);
      const verified = synthesize(expected);
      const next = fosterTopologyDraft(seven, form, verified.terms, verified.verification.nominalWitnesses);
      const restored = readLcExperiment(JSON.stringify(next));
      expect(restored.topology.components).toHaveLength(7);
      expect(verifyLcRationalIdentity(expected, exactImpedance(restored)).coefficientError).toBeLessThan(1e-10);
    },
  );

  it("retains an exact one-third tick and rejects a mismatched visible value", () => {
    const original = newLcExperiment({ kind: "series", left: { kind: "c", value: 100 }, right: { kind: "c", value: 200 } });
    const supplied = newLcExperiment({ kind: "c", value: 66.667 });
    const next = applyExactLcTopology(original, supplied.topology,
      new Map([["C1", { numerator: 200_000n, denominator: 3n }]]));
    expect(next.topology.components[0].parameters).toMatchObject({ lcExact: "200000/3" });
    expect(exactImpedance(next)).toEqual(exactImpedance(original));
    const altered = { ...next, topology: { ...next.topology, components: next.topology.components.map(part =>
      part.kind === "c" ? { ...part, parameters: { ...part.parameters, farad: 0.000067 } } : part) } };
    expect(() => parseTopologyLabDocument(JSON.stringify(altered))).toThrow("invalid-lc-exact-value");
  });

  it("keeps finite plotting and resonance bounds when exact coefficients exceed IEEE magnitude", () => {
    const lumped = { kind: "l", value: 10 } as const;
    const original = newLcExperiment({ kind: "series", left: { kind: "series", left: lumped, right: lumped },
      right: { kind: "series", left: lumped, right: { kind: "c", value: 100 } } });
    let index = 0;
    const graph = { ...original.topology, components: original.topology.components.map(part => {
      if (part.kind !== "l") return part;
      const denominator = 10n ** 110n + [1n, 3n, 7n][index++];
      return { ...part, parameters: exactLcParameters("l", { numerator: denominator * 10000n + 1n, denominator }) };
    }) };
    const loaded = readLcExperiment(JSON.stringify({ ...original, topology: graph }));
    const impedance = exactImpedance(loaded);
    expect(impedance.denominator.some(coefficient => !Number.isFinite(Number(coefficient)))).toBe(true);
    const roots = resonances(impedance);
    expect(roots).toHaveLength(1);
    expect(roots[0].omega).toBeCloseTo(1 / Math.sqrt(.03 * .0001), 8);
    expect(reactance(impedance, 1_000)).toBeCloseTo(20, 8);
    expect(factorText(impedance, roots, String)).not.toContain("NaN");
  });
});
