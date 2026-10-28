import { describe, expect, it } from "vitest";
import { microLabs, microGroups } from "./micro-catalog";
import { microModel } from "./micro-models";
const result = (kind: Parameters<typeof microModel>[0], a: number, b: number, time = 1) => Object.fromEntries(microModel(kind, a, b, time).metrics.map(m => [m.label, m.value]));

describe("micro laboratory physical invariants", () => {
  it("publishes exactly fourteen unique complete models covering all eight groups", () => {
    expect(microLabs).toHaveLength(14); expect(new Set(microLabs.map(l => l.id)).size).toBe(14);
    expect(new Set(microLabs.map(l => l.category)).size).toBe(Object.keys(microGroups).length);
    for (const lab of microLabs) { expect(lab.title.ru).toBeTruthy(); expect(lab.title.uk).toBeTruthy(); expect(lab.assumption.ru).toBeTruthy(); expect(lab.verification).toBeTruthy(); }
  });
  it("all control corners and time boundaries produce finite physical output and in-frame markers", () => {
    for (const lab of microLabs) for (const a of [lab.parameters[0].min, lab.parameters[0].max]) for (const b of [lab.parameters[1].min, lab.parameters[1].max]) for (const t of [0, 1, 100]) {
      const d = microModel(lab.model, a, b, t), p = d.plot;
      expect([...d.metrics.map(m => m.value), ...p.curves.flatMap(c => c.points.flat()), ...d.point].every(Number.isFinite), lab.id).toBe(true);
      expect(d.point[0]).toBeGreaterThanOrEqual(0); expect(d.point[0]).toBeLessThanOrEqual(p.xMax);
      expect(d.point[1]).toBeGreaterThanOrEqual(p.yMin); expect(d.point[1]).toBeLessThanOrEqual(p.yMax);
      expect(p.yMax).toBeGreaterThan(p.yMin);
    }
  });
  it("DC power and voltage divider obey both Kirchhoff and energy balance", () => {
    const d = result("ohm", 48, 60); expect(d.I).toBeCloseTo(0.8); expect(d.P).toBeCloseTo(d.I ** 2 * 60);
    const r = result("divider", 60, 40); expect(r["U₂"]).toBeCloseTo(9.6); expect(r.I * 60 + r["U₂"]).toBeCloseTo(24);
  });
  it("parallel current division obeys KCL, equal branch voltages and power conservation", () => {
    const d = result("parallel", 60, 40); expect(d["I₁"] + d["I₂"]).toBeCloseTo(1);
    expect(d["I₁"] * 60).toBeCloseTo(d.U); expect(d["I₂"] * 40).toBeCloseTo(d.U);
    expect(d["I₁"] ** 2 * 60 + d["I₂"] ** 2 * 40).toBeCloseTo(d.U);
  });
  it("maximum load power is attained at RL = r including the zero-load limit", () => {
    const peak = result("power", 40, 40)["Pᴸ"]; expect(peak).toBeCloseTo(3.6);
    expect(result("power", 40, 0)["Pᴸ"]).toBe(0); expect(result("power", 40, 20)["Pᴸ"]).toBeLessThan(peak); expect(result("power", 40, 80)["Pᴸ"]).toBeLessThan(peak);
  });
  it("RLC resonance gives zero phase and U/R current; exact peak is sampled", () => {
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.2 * 1e-4)), d = microModel("resonance", f0, 40), r = result("resonance", f0, 40);
    expect(r["I RMS"]).toBeCloseTo(230 / 40); expect(r["φ"]).toBeCloseTo(0); expect(d.plot.curves[0].points.some(([x]) => x === f0)).toBe(true);
  });
  it("RMS equals independent integral of u squared over the plotted 2.5 periods", () => {
    const d = microModel("rms", 20, 50), pts = d.plot.curves[0].points;
    const integral = pts.slice(1).reduce((v, p, i) => v + (p[0] - pts[i][0]) * (p[1] ** 2 + pts[i][1] ** 2) / 2, 0);
    expect(Math.sqrt(integral / 50)).toBeCloseTo(result("rms", 20, 50)["U RMS"], 9);
  });
  it("three phase wave currents sum to zero at every time and total real power agrees", () => {
    const d = microModel("star", 230, 46), r = result("star", 230, 46);
    expect(r["Iφ"]).toBeCloseTo(5); expect(r.P).toBeCloseTo(3450);
    for (let k = 0; k < d.plot.curves[0].points.length; k++) expect(d.plot.curves.reduce((sum, c) => sum + c.points[k][1], 0)).toBeCloseTo(0, 10);
  });
  it("RC initial conditions, complementary charge/discharge, derivative and energy are correct", () => {
    expect(result("charge", 1000, 1000, 0)["uC(t)"]).toBe(0); expect(result("discharge", 1000, 1000, 0)["uC(t)"]).toBe(12);
    const t = 0.8, h = 1e-5, q = result("charge", 1000, 1000, t), d = result("discharge", 1000, 1000, t);
    expect(q["uC(t)"] + d["uC(t)"]).toBeCloseTo(12);
    const derivative = (result("discharge", 1000, 1000, t + h)["uC(t)"] - result("discharge", 1000, 1000, t - h)["uC(t)"]) / (2 * h);
    expect(0.001 * derivative).toBeCloseTo(-d["iR(t)"] / 1000, 10);
    expect(0.001 * d["uC(t)"] * derivative).toBeCloseTo(-((d["iR(t)"] / 1000) ** 2) * 1000, 9);
  });
  it("PWL diode off and forward operating points satisfy the load line", () => {
    expect(result("diode", 0.1, 1000).iD).toBe(0);
    const d = result("diode", 5, 1000), i = d.iD / 1000;
    expect(i * 1000 + d.uD).toBeCloseTo(5); expect(d.uD).toBeCloseTo(0.7 + 10 * i);
  });
  it("RC filter has the true -3dB cutoff, -45 degree phase and exact marker", () => {
    const fc = 1 / (2 * Math.PI * 1000 * 1e-6), d = result("filter", fc, 1);
    expect(d["|H|"]).toBeCloseTo(Math.SQRT1_2); expect(d["φ"]).toBeCloseTo(-45);
    expect(microModel("filter", fc, 1).point[1]).toBeCloseTo(Math.SQRT1_2);
  });
  it("first-order step solves tau*y' + y = K with y(0)=0", () => {
    const k = 2, tau = 1.5, t = 0.7, h = 1e-5, y = result("control", k, tau, t)["y(t)"];
    const dy = (result("control", k, tau, t + h)["y(t)"] - result("control", k, tau, t - h)["y(t)"]) / (2 * h);
    expect(tau * dy + y).toBeCloseTo(k, 9); expect(result("control", k, tau, 0)["y(t)"]).toBe(0);
  });
  it("DC drive solves torque dynamics, back EMF and electrical power balance", () => {
    const d = microModel("drive", 24, 2, 1), v = d.values, h = 1e-5;
    const derivative = (microModel("drive", 24, 2, 1 + h).values.omega - microModel("drive", 24, 2, 1 - h).values.omega) / (2 * h);
    expect(v.j * derivative).toBeCloseTo(v.k * v.i - 2, 8);
    expect(24).toBeCloseTo(v.i * v.r + v.k * v.omega); expect(24 * v.i).toBeCloseTo(v.i ** 2 * v.r + v.k * v.i * v.omega);
    expect(microModel("drive", 24, 2, 0).values.omega).toBe(0); expect(v.steady).toBeCloseTo(40);
  });
  it("lossless line obeys resistive load condition including matched and shorted boundaries", () => {
    for (const load of [0, 25, 50, 100, 200]) { const d = result("reflection", load, 50); expect(d["Uᴸ"]).toBeCloseTo(load * d["Iᴸ"]); expect(d["Γᴸ"]).toBeGreaterThanOrEqual(-1); expect(d["Γᴸ"]).toBeLessThan(1); }
    expect(result("reflection", 50, 50)["Γᴸ"]).toBe(0); expect(result("reflection", 0, 50)["Uᴸ"]).toBe(0);
  });
});

