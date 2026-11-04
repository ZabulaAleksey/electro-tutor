import { describe, expect, it } from "vitest";
import katex from "katex";
import fixtures from "./mesh-reference.json";
import { meshPreset, solveMesh, type MeshParameters, type MeshExample } from "./mesh-current";
import { format3, makeDraft, meshLatex, parameters, parseValue } from "../mesh/presentation";
describe("mesh lab: independent nodal reference fixtures", () => {
  for (const f of fixtures) it(f.name, () => {
    const s = solveMesh(f.input as MeshParameters); expect(s.status).toBe("ok"); if (s.status !== "ok") throw Error(s.code);
    for (const key of ["mesh", "branch", "voltages", "resistorPower"] as const) s[key].forEach((v, k) => expect(v).toBeCloseTo(f.expected[key][k], 9));
    s.sources.forEach((source, k) => expect(source.power).toBeCloseTo(f.expected.sourcePower[k], 9));
    for (const key of ["nodeVoltage", "generated", "absorbed"] as const) expect(s[key]).toBeCloseTo(f.expected[key], 9);
    for (const v of Object.values(s.residuals)) expect(Math.abs(v)).toBeLessThan(1e-9);
    const m = meshLatex(s); for (const latex of [m.matrix, m.rhs, ...m.rows]) expect(() => katex.renderToString(latex, { throwOnError: true, strict: "error" })).not.toThrow();
  });
  for (const example of [1, 2, 3, 4] as MeshExample[]) it(`preset${example} exactly matches published data and survives draft parsing`, () => {
    const f = fixtures.find(v => v.name === `example${example}-published`)!; expect(meshPreset(example)).toEqual(f.input);
    expect(parameters(example, makeDraft(meshPreset(example)))).toEqual(f.input);
  });
});
it("includes absorbing current source and allows source reversal", () => {
  const s = solveMesh(meshPreset(4)); if (s.status !== "ok") throw Error("missing solution");
  expect(s.sources.find(x => x.id === "J")!.power).toBeCloseTo(20 / 3, 12); expect(s.generated).toBe(32); expect(s.absorbed).toBeCloseTo(32, 12);
});
for (const example of [1, 2, 3, 4] as MeshExample[]) {
  it(`preset${example} rejects incompatible ideal-zero resistance constraints`, () => { const p = meshPreset(example); p.r.fill(0); expect(solveMesh(p)).toEqual({ status: "error", code: "inconsistent" }); });
  it(`preset${example} reports underdetermined zero circuit without fabricating currents`, () => { const p = meshPreset(example); p.r.fill(0); p.emf.fill(0); expect(solveMesh(p)).toEqual({ status: "error", code: "underdetermined" }); });
}
it("distinguishes shared-resistor rank deficiency from conflicting sources", () => {
  expect(solveMesh({ example: 2, r: [0, 0, 2], emf: [12, 12], current: 0 })).toEqual({ status: "error", code: "underdetermined" });
  expect(solveMesh({ example: 2, r: [0, 0, 2], emf: [12, 24], current: 0 })).toEqual({ status: "error", code: "inconsistent" });
});
for (const [p, currents] of [[{ example: 1, r: [0, 4, 2], emf: [12], current: 0 }, [9, 3]], [{ example: 1, r: [2, 4, 0], emf: [12], current: 0 }, [6, 0]], [{ example: 4, r: [0, 4], emf: [12], current: 1 }, [4, 3]], [{ example: 3, r: [2, 0, 6, 2], emf: [24, 6], current: 0 }, [12, 3, 3]]] as const) {
  it(`handles an individually shorted resistor in example${p.example}`, () => { const s = solveMesh({ ...p, r: [...p.r], emf: [...p.emf] }); expect(s.status).toBe("ok"); if (s.status === "ok") s.mesh.forEach((v, k) => expect(v).toBeCloseTo(currents[k], 10)); });
}
it("rejects malformed, nonfinite, negative and out-of-domain inputs without clamping", () => {
  for (const value of [NaN, Infinity, -1, .0001, 1e6 + 1]) { const p = meshPreset(1); p.r[0] = value; expect(solveMesh(p).status).toBe("error"); }
  for (const value of [NaN, Infinity, 1e4 + 1]) { const p = meshPreset(1); p.emf[0] = value; expect(solveMesh(p).status).toBe("error"); }
  const p = meshPreset(4); p.current = 1001; expect(solveMesh(p).status).toBe("error");
  expect(solveMesh({ ...meshPreset(1), r: [] }).status).toBe("error");
  for (const raw of ["", " ", "abc", "Infinity", "1e309", "1,2,3", "0x10"]) expect(Number.isFinite(parseValue(raw))).toBe(false);
  expect(parseValue("-1,25")).toBe(-1.25); expect(parseValue("1e3")).toBe(1000);
});
it("preserves full precision and source data; formats calculated values with three significant figures", () => {
  expect(format3(1.2)).toBe("1,20"); expect(format3(-0)).toBe("0,00"); expect(format3(12345)).toBe("1,23e+4");
  const p = meshPreset(1); p.r[0] = 2.333333; const before = structuredClone(p); const s = solveMesh(p); expect(p).toEqual(before);
  expect(s.status).toBe("ok"); if (s.status === "ok") { expect(s.mesh[0]).not.toBe(Number(s.mesh[0].toPrecision(3))); expect(s.matrix[0][0]).toBe(4.333333); }
});

for (const example of [1, 2, 3, 4] as MeshExample[]) it(`preset${example} obeys source reversal and impedance scaling across supported scales`, () => {
  const original = meshPreset(example), baseline = solveMesh(original); if (baseline.status !== "ok") throw Error("baseline");
  const reverse = solveMesh({ ...original, emf: original.emf.map(v => -v), current: -original.current }); expect(reverse.status).toBe("ok");
  if (reverse.status === "ok") { reverse.mesh.forEach((v, k) => expect(v).toBeCloseTo(-baseline.mesh[k], 10)); expect(reverse.generated).toBeCloseTo(baseline.generated, 10); }
  for (const scale of [.001, 10000]) {
    const result = solveMesh({ ...original, r: original.r.map(v => v * scale), current: original.current / scale }); expect(result.status).toBe("ok");
    if (result.status === "ok") { result.mesh.forEach((v, k) => expect(v * scale).toBeCloseTo(baseline.mesh[k], 9)); expect(result.generated * scale).toBeCloseTo(baseline.generated, 9); }
  }
});
