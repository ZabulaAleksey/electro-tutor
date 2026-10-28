import { describe, expect, it } from "vitest";
import { ac, dc, diode, INITIAL, line, magnetic, model, rc, star } from "./physics";
import { categories, featured, filterStories, findStory, stories } from "./catalog";

describe("engineering showcase physical contracts", () => {
  it("DC obeys KVL and power balance across supported controls", () => {
    for (const e of [12, 24, 48]) for (const r of [20, 60, 120]) {
      const d = dc(e, r); expect(d.kvl).toBeCloseTo(0, 10); expect(d.balance).toBeCloseTo(0, 10);
      expect(d.i).toBeCloseTo(e / (r + 40), 12); expect(d.u2).toBeGreaterThan(0);
    }
    expect(dc().i).toBeCloseTo(0.24); expect(dc().u1).toBeCloseTo(14.4); expect(dc().u2).toBeCloseTo(9.6);
  });
  it("RLC RMS, phase, instantaneous KVL and complex power agree", () => {
    for (const f of [25, 50, 100]) for (const r of [10, 40, 100]) {
      const a = ac(f, r); expect(a.s ** 2).toBeCloseTo(a.p ** 2 + a.q ** 2, 6);
      expect(a.u).toBeCloseTo(Math.hypot(a.i * r, a.i * a.x), 9);
      for (const angle of [0, Math.PI / 3, Math.PI]) {
        const current = Math.SQRT2 * a.i * Math.sin(angle - a.phi);
        const ul = Math.SQRT2 * a.i * a.xl * Math.cos(angle - a.phi);
        const uc = -Math.SQRT2 * a.i * a.xc * Math.cos(angle - a.phi);
        expect(current * r + ul + uc).toBeCloseTo(Math.SQRT2 * a.u * Math.sin(angle), 9);
      }
    }
    expect(ac(25).phi).toBeLessThan(0); expect(ac(100).phi).toBeGreaterThan(0);
  });
  it("RC preserves initial condition, exponential law, charge derivative and limit", () => {
    for (const resistance of [500, 1000, 2000]) for (const capacitance of [0.0005, 0.001, 0.002]) {
      const initial = rc(0, resistance, capacitance); expect(initial.uc).toBe(0); expect(initial.i).toBe(12 / resistance);
      const atTau = rc(initial.tau, resistance, capacitance); expect(atTau.uc).toBeCloseTo(12 * (1 - Math.exp(-1)), 10);
      expect(atTau.uc + atTau.ur).toBeCloseTo(12, 12);
      const dt = initial.tau * 1e-5, after = rc(initial.tau + dt, resistance, capacitance);
      expect(capacitance * (after.uc - atTau.uc) / dt).toBeCloseTo(atTau.i, 6);
      expect(rc(50 * initial.tau, resistance, capacitance).uc).toBeCloseTo(12, 10);
    }
  });
  it("balanced star gives 5 A per phase, zero neutral current and 3450 W", () => {
    const s = star(false); for (const value of Object.values(s.currents)) expect(Math.hypot(value.re, value.im)).toBeCloseTo(5, 10);
    expect(Math.hypot(s.neutralCurrent.re, s.neutralCurrent.im)).toBeLessThan(1e-12);
    const p = Object.values(s.currents).reduce((sum, v) => sum + (v.re ** 2 + v.im ** 2) * 46, 0); expect(p).toBeCloseTo(3450, 9);
  });
  it("open neutral reuses existing solver and satisfies KCL and phase voltage equations", () => {
    const s = star(true); expect(Math.hypot(s.neutralCurrent.re, s.neutralCurrent.im)).toBeLessThan(1e-12);
    for (const phase of ["A", "B", "C"] as const) { expect(s.voltages[phase].re + s.displacement.re).toBeCloseTo(s.sources[phase].re, 10); expect(s.voltages[phase].im + s.displacement.im).toBeCloseTo(s.sources[phase].im, 10); }
    expect(Math.hypot(s.displacement.re, s.displacement.im)).toBeGreaterThan(0);
  });
  it("diode Q lies on both specified PWL characteristic and load line", () => {
    const d = diode(); expect(d.residual).toBeCloseTo(0, 12); expect(d.ud).toBeCloseTo(d.threshold + d.rd * d.i, 12);
    expect(d.i).toBeCloseTo(4.3 / 1010, 12); expect(diode(0.5).i).toBe(0);
  });
  it("magnetic MMF equals core plus gap drop and flux equals BS", () => {
    const m = magnetic(); expect(m.flux * (m.core + m.air)).toBeCloseTo(m.turns * m.i, 11);
    expect(m.b * m.area).toBeCloseTo(m.flux, 12); expect(m.air).toBeGreaterThan(m.core);
  });
  it("line L'/C', velocity, reflection and load boundary agree", () => {
    const w = line(); expect(Math.sqrt(0.00025 / 1e-7)).toBeCloseTo(w.z0); expect(1 / Math.sqrt(0.00025 * 1e-7)).toBeCloseTo(w.velocity);
    expect(w.gamma).toBeCloseTo(1 / 3); expect(w.loadU / w.loadI).toBeCloseTo(w.rl, 10); expect(w.td).toBeCloseTo(0.0005, 12);
    expect((2 * w.length - w.velocity * w.t)).toBeCloseTo(50, 9);
  });
  it("every published scene has finite model outputs and actual metadata", () => {
    expect(featured).toHaveLength(8); expect(featured.filter(s => s.interaction === "dynamic")).toHaveLength(3);
    expect(new Set(stories.map(s => s.id)).size).toBe(stories.length);
    expect(new Set(stories.map(s => s.template)).size).toBe(5);
    for (const story of stories) { expect(story.route.startsWith("/")).toBe(true); expect(story.verification).toBeTruthy(); const view = model(story.visual, INITIAL); for (const metric of view.metrics) expect(Number.isFinite(metric.value)).toBe(true); for (const curve of view.plot.curves) for (const point of curve.points) for (const value of point) expect(Number.isFinite(value)).toBe(true); }
  });
  it("hash links, filters and empty categories work without fabricated content", () => {
    expect(findStory("#story=rc-charge")?.visual).toBe("rc"); expect(findStory("#story=not-published")).toBeUndefined();
    expect(filterStories("all", "python", "ru").map(s => s.id)).toEqual(["python-rc"]);
    expect(filterStories("power", "", "uk")).toHaveLength(2); expect(filterStories("drive", "", "ru")).toHaveLength(0); expect(categories).toHaveLength(8);
  });
});
