import { expect, it } from "vitest";
import { analyzeLcExperiment, newLcExperiment } from "../../src/circuit/lc-experiment";
import { TopologySession } from "../../src/circuit/topology-session";
import { reactance } from "../../src/models/reactive-two-port";

it("adds the independently calculated susceptance of each new LC port branch", () => {
  const frequencies = [17, 190, 4230];
  for (let seed = 1; seed <= 40; seed++) {
    const henry = (1 + seed % 5) * .008;
    const farad = (1 + seed % 7) * .000015;
    const series = seed % 2 === 0;
    const session = new TopologySession(JSON.stringify(newLcExperiment({
      kind: series ? "series" : "parallel",
      left: { kind: "l", value: henry * 1e3 },
      right: { kind: "c", value: farad * 1e6 },
    })));
    const expected = frequencies.map(omega => series
      ? -1 / (omega * henry - 1 / (omega * farad))
      : omega * farad - 1 / (omega * henry));
    for (let step = 0; step < 6; step++) {
      const c = (seed + step) % 3 === 0;
      const id = "Added" + step;
      const value = c ? .000018 + step * .000005 : .012 + step * .003;
      session.apply({
        type: "insert", slot: session.crossSlot("P1:a", "P1:b"),
        component: { id, terminals: [id + ":a", id + ":b"], kind: c ? "c" : "l",
          parameters: c ? { farad: value } : { henry: value } },
      });
      const actual = analyzeLcExperiment(session.document);
      const context = `seed=${seed} step=${step} kind=${c ? "C" : "L"} value=${value}`;
      if (actual.kind !== "finite") throw Error(context + " expected a finite port impedance");
      for (const [i, omega] of frequencies.entries()) {
        expected[i] += c ? omega * value : -1 / (omega * value);
        const error = Math.abs(-1 / reactance(actual.impedance, omega) - expected[i]);
        expect(error, context + ` ω=${omega}`).toBeLessThan(1e-11 * Math.max(1, Math.abs(expected[i])));
      }
    }
  }
});
