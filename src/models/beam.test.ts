import { describe, expect, it } from "vitest";
import { solveBeam, validateBeam, parseBeam, serializeBeam, type BeamSample, type BeamScheme } from "./beam";
import fixtureData from "./beam-goldens.json";
type Expected = { reactions?: Partial<{ Fx: number; Fy: number; M: number }>[]; tipLeft?: Partial<BeamSample>; tipRight?: Partial<BeamSample>; at?: Partial<BeamSample> & { x: number }; jump?: { x: number; leftQ: number; rightQ: number } };
const fixtures: { id: string; scheme: unknown; expected: Expected; provenance: string }[] = fixtureData;
function solved(s: BeamScheme) { const result = solveBeam(s); expect(result.status).toBe("ok"); if (result.status !== "ok") throw Error(result.code); return result; }
function samples(actual: BeamSample, expected: Partial<BeamSample>) { for (const key of ["N", "Q", "M"] as const) if (expected[key] !== undefined) expect(actual[key]).toBeCloseTo(expected[key]!, 5); }
describe("independent analytical beam goldens", () => {
  for (const fixture of fixtures) it(fixture.id, () => {
    const s = validateBeam(fixture.scheme), result = solved(s), e = fixture.expected;
    expect(fixture.provenance.length).toBeGreaterThan(20);
    for (const [i, r] of (e.reactions ?? []).entries()) for (const key of ["Fx", "Fy", "M"] as const) if (r[key] !== undefined) expect(result.reactions[i][key]).toBeCloseTo(r[key]!, 6);
    if (e.tipLeft) samples(result.sample(s.length, "left"), e.tipLeft);
    if (e.tipRight) samples(result.sample(s.length, "right"), e.tipRight);
    if (e.at) samples(result.sample(e.at.x, "left"), e.at);
    if (e.jump) { expect(result.sample(e.jump.x, "left").Q).toBeCloseTo(e.jump.leftQ, 6); expect(result.sample(e.jump.x, "right").Q).toBeCloseTo(e.jump.rightQ, 6); }
    for (const key of ["Fx", "Fy", "M"] as const) expect(result.residuals[key]).toBeCloseTo(0, 6);
    expect(result.residuals.compatibility).toBeLessThan(1e-10);
    for (const a of s.supports) { const i = result.nodes.indexOf(a.x) * 3; expect(result.displacements[i + 1]).toBe(0); if (a.kind !== "roller") expect(result.displacements[i]).toBe(0); if (a.kind === "fixed") expect(result.displacements[i + 2]).toBe(0); }
  });
  it("round-trips only validated input, no derived results", () => { const s = validateBeam(fixtures[0].scheme); expect(parseBeam(serializeBeam(s))).toEqual(s); expect(() => parseBeam("{" )).toThrow("BEAM_INVALID_JSON"); expect(() => parseBeam(" ".repeat(200001))).toThrow("BEAM_INPUT_TOO_LARGE"); });
  it("rejects malformed/duplicate/gapped/overlapping/unbounded inputs", () => {
    const s = validateBeam(fixtures[0].scheme);
    for (const value of [null, [], { ...s, length: 0 }, { ...s, length: Infinity }, { ...s, supports: [null] }, { ...s, loads: Array(33).fill(s.loads[0]) }, { ...s, supports: [s.supports[0], { ...s.supports[0], id: "different" }] }, { ...s, loads: [{ ...s.loads[0], id: "A" }] }, { ...s, segments: [{ ...s.segments[0], start: .1 }] }, { ...s, segments: [...s.segments, { ...s.segments[0], start: 1 }] }, { ...s, segments: [{ ...s.segments[0], EI: -1 }] }]) expect(() => validateBeam(value)).toThrow();
  });
  it("rejects rigid-body bending and axial mechanisms without invented reactions", () => { const s = validateBeam(fixtures[0].scheme); for (const supports of [[], [{ id: "r", kind: "roller" as const, x: 0 }], [{ id: "r", kind: "roller" as const, x: 0 }, { id: "r2", kind: "roller" as const, x: 2 }], [{ id: "pin", kind: "pin" as const, x: 1 }]]) expect(solveBeam({ ...s, supports }).status).toBe("unstable"); });
  it("variable EI changes indeterminate reactions: force method δP=P·5/(6EI), f=5/(2EI)", () => {
    const s: BeamScheme = { version: 1, length: 2, segments: [{ start: 0, end: 1, EI: 10000, EA: 1e6 }, { start: 1, end: 2, EI: 20000, EA: 1e6 }], supports: [{ id: "A", kind: "fixed", x: 0 }, { id: "B", kind: "roller", x: 2 }], loads: [{ id: "F", kind: "force", x: 1, value: -1000 }] };
    const r = solved(s); expect(r.reactions[1].Fy).toBeCloseTo(1000 / 3, 6); expect(r.reactions[0].M).toBeCloseTo(1000 / 3, 6);
    const uniform = solved({ ...s, segments: s.segments.map(g => ({ ...g, EI: 10000 })) }); expect(uniform.reactions[1].Fy).toBeCloseTo(312.5, 6);
  });
  it("variable EA enforces axial compatibility between fixed ends", () => { const s: BeamScheme = { version: 1, length: 2, segments: [{ start: 0, end: 1, EI: 10000, EA: 1e6 }, { start: 1, end: 2, EI: 10000, EA: 2e6 }], supports: [{ id: "A", kind: "fixed", x: 0 }, { id: "B", kind: "fixed", x: 2 }], loads: [{ id: "P", kind: "axial", x: 1, value: 900 }] }; const r = solved(s); expect(r.reactions[0].Fx).toBeCloseTo(-300); expect(r.reactions[1].Fx).toBeCloseTo(-600); samples(r.sample(1, "left"), { N: 300 }); samples(r.sample(1, "right"), { N: -600 }); });
  it("self-equilibrated sign-changing q still creates nodal forces/couples and cubic epures", () => { const s = validateBeam(fixtures.find(g => g.id === "fixed-fixed-udl")!.scheme); const r = solved({ ...s, loads: [{ id: "q", kind: "distributed", start: 0, end: 2, q0: -1000, q1: 1000 }] }); expect(r.reactions[0].Fy).toBeCloseTo(400); expect(r.reactions[1].Fy).toBeCloseTo(-400); expect(r.reactions[0].M).toBeCloseTo(200 / 3); expect(r.reactions[1].M).toBeCloseTo(200 / 3); expect(r.zeros.Q).toHaveLength(2); expect(r.zeros.Q[0]).toBeCloseTo(1 - Math.sqrt(.2), 9); expect(r.extrema.M.some(p => Math.abs(p.x - (1 - Math.sqrt(.2))) < 1e-8)).toBe(true); });
  it("exact limits and plotted duplicated x preserve force/couple jumps", () => { const s = validateBeam(fixtures.find(g => g.id === "simple-centre-force")!.scheme); const r = solved({ ...s, loads: [...s.loads, { id: "couple", kind: "moment", x: 1.25, value: 300 }] }); expect(r.sample(1.25, "right").M - r.sample(1.25, "left").M).toBeCloseTo(-300, 9); expect(r.sample(2, "right").M - r.sample(2, "left").M).toBeCloseTo(0, 9); expect(r.sample(2, "right").Q - r.sample(2, "left").Q).toBeCloseTo(-1000, 9); const ends = r.points.M.filter(([x]) => x === 1.25); expect(ends).toHaveLength(2); expect(ends[1][1] - ends[0][1]).toBeCloseTo(-300, 9); });
});
