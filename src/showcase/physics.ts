import { calculateStar, STAR_PRESETS } from "../models/star-neutral";

export type SceneKind = "dc" | "ac" | "three" | "rc" | "diode" | "magnet" | "neutral" | "line";
export type Parameters = { dc: { e: number; r1: number }; ac: { frequency: number; resistance: number }; rc: { resistance: number; capacitance: number } };
export const INITIAL: Parameters = { dc: { e: 24, r1: 60 }, ac: { frequency: 50, resistance: 40 }, rc: { resistance: 1000, capacitance: 0.001 } };
export const n = (value: number, digits = 2) => Number(value.toFixed(digits)).toString();
export function dc(e = 24, r1 = 60, r2 = 40) {
  const i = e / (r1 + r2), u1 = i * r1, u2 = i * r2;
  return { e, r1, r2, i, u1, u2, p: e * i, kvl: e - u1 - u2, balance: e * i - i * i * (r1 + r2) };
}
export function ac(frequency = 50, resistance = 40, u = 230, l = 0.2, c = 0.0001) {
  const omega = 2 * Math.PI * frequency, xl = omega * l, xc = 1 / (omega * c);
  const x = xl - xc, z = Math.hypot(resistance, x), i = u / z, phi = Math.atan2(x, resistance);
  return { frequency, resistance, u, l, c, omega, xl, xc, x, z, i, phi, p: i * i * resistance, q: i * i * x, s: u * i };
}
export function rc(t: number, resistance = 1000, capacitance = 0.001, e = 12) {
  const tau = resistance * capacitance, decay = Math.exp(-Math.max(0, t) / tau);
  const uc = e * (1 - decay), i = e / resistance * decay;
  return { tau, e, resistance, capacitance, t: Math.max(0, t), uc, i, ur: i * resistance, energy: capacitance * uc * uc / 2 };
}
export function diode(e = 5, r = 1000, threshold = 0.7, rd = 10) {
  const i = Math.max(0, (e - threshold) / (r + rd)), ud = i > 0 ? threshold + rd * i : e;
  return { e, r, threshold, rd, i, ud, residual: e - r * i - ud };
}
export function magnetic() {
  const mu0 = 4 * Math.PI * 1e-7, mur = 1000, area = 4e-4, length = 0.3, gap = 0.001, turns = 200, i = 0.5;
  const core = length / (mu0 * mur * area), air = gap / (mu0 * area), mmf = turns * i, flux = mmf / (core + air);
  return { mu0, mur, area, length, gap, turns, i, core, air, mmf, flux, b: flux / area };
}
export function star(open: boolean) {
  const calculation = calculateStar(open ? STAR_PRESETS.open : STAR_PRESETS.balanced);
  if (!calculation.ok) throw new Error("Invalid showcase star preset");
  return calculation.result;
}
export function line() {
  const e = 100, z0 = 50, rs = 50, rl = 100, length = 100, velocity = 200000;
  const incident = e * z0 / (rs + z0), gamma = (rl - z0) / (rl + z0), td = length / velocity;
  return { e, z0, rs, rl, length, velocity, incident, gamma, td, t: 1.5 * td, loadU: incident * (1 + gamma), loadI: incident * (1 - gamma) / z0 };
}
export type Point = readonly [number, number];
export type Curve = { label: string; color: string; dash?: boolean; points: Point[] };
export type Plot = { xLabel: string; yLabel: string; xMax: number; yMin: number; yMax: number; curves: Curve[] };
export type Metric = { label: string; value: number; unit: string; color?: string };
export type SceneModel = { kind: SceneKind; formula: string; substitution: string; metrics: Metric[]; plot: Plot };
const sample = (max: number, fn: (x: number) => number, count = 100): Point[] => Array.from({ length: count + 1 }, (_, k) => { const x = max * k / count; return [x, fn(x)]; });
const magnitude = (z: { re: number; im: number }) => Math.hypot(z.re, z.im);
export function model(kind: SceneKind, p: Parameters): SceneModel {
  if (kind === "dc") {
    const d = dc(p.dc.e, p.dc.r1);
    return { kind, formula: "I=\\frac{E}{R_1+R_2},\\quad E=U_{R1}+U_{R2}", substitution: `I=\\frac{${d.e}}{${d.r1}+${d.r2}}=${n(d.i, 3)}\\,\\mathrm A`, metrics: [{ label: "I", value: d.i, unit: "A", color: "orange" }, { label: "Uᵣ₁", value: d.u1, unit: "V", color: "blue" }, { label: "Uᵣ₂", value: d.u2, unit: "V", color: "violet" }, { label: "P", value: d.p, unit: "W", color: "green" }], plot: { xLabel: "A → B → 0", yLabel: "φ, V", xMax: 2, yMin: 0, yMax: d.e * 1.15, curves: [{ label: "φ", color: "blue", points: [[0, d.e], [0.3, d.e], [0.9, d.u2], [1.15, d.u2], [1.8, 0], [2, 0]] }] } };
  }
  if (kind === "ac") {
    const a = ac(p.ac.frequency, p.ac.resistance), max = 2000 / a.frequency;
    return { kind, formula: "Z=R+j(\\omega L-\\frac{1}{\\omega C}),\\quad I=\\frac{U}{|Z|}", substitution: `Z=${a.resistance}+j(${n(a.xl)}-${n(a.xc)})\\,\\Omega`, metrics: [{ label: "I RMS", value: a.i, unit: "A", color: "orange" }, { label: "φ", value: a.phi * 180 / Math.PI, unit: "°", color: "violet" }, { label: "|Z|", value: a.z, unit: "Ω" }, { label: "P", value: a.p, unit: "W", color: "green" }], plot: { xLabel: "t, ms", yLabel: "u/Û; i/Î", xMax: max, yMin: -1.2, yMax: 1.2, curves: [{ label: "u / Û", color: "blue", points: sample(max, t => Math.sin(a.omega * t / 1000)) }, { label: "i / Î", color: "orange", dash: true, points: sample(max, t => Math.sin(a.omega * t / 1000 - a.phi)) }] } };
  }
  if (kind === "rc") {
    const r = rc(0, p.rc.resistance, p.rc.capacitance), max = 5 * r.tau;
    return { kind, formula: "u_C(t)=E(1-e^{-t/RC}),\\quad i(t)=\\frac{E}{R}e^{-t/RC}", substitution: `\\tau=${p.rc.resistance}\\cdot${n(p.rc.capacitance * 1e6)}\\,\\mu\\mathrm F=${n(r.tau)}\\,\\mathrm s`, metrics: [{ label: "τ", value: r.tau, unit: "s", color: "green" }, { label: "uC(∞)", value: r.e, unit: "V", color: "blue" }], plot: { xLabel: "t, s", yLabel: "u / E; i / i(0⁺)", xMax: max, yMin: 0, yMax: 1.1, curves: [{ label: "uC / E", color: "blue", points: sample(max, t => rc(t, p.rc.resistance, p.rc.capacitance).uc / r.e) }, { label: "i / i(0⁺)", color: "orange", dash: true, points: sample(max, t => Math.exp(-t / r.tau)) }] } };
  }
  if (kind === "three" || kind === "neutral") {
    const s = star(kind === "neutral"), currents = Object.values(s.currents), balanced = kind === "three";
    return { kind, formula: balanced ? "U_L=\\sqrt3U_\\phi,\\quad P=3U_\\phi I_\\phi" : "U_n=\\frac{\\sum U_k/Z_k}{\\sum 1/Z_k},\\quad I_k=\\frac{U_k-U_n}{Z_k}", substitution: balanced ? `U_L=\\sqrt3\\cdot230=${n(Math.sqrt(3) * 230)}\\,\\mathrm V` : `U_n=${n(s.displacement.re)}${s.displacement.im < 0 ? "-" : "+"}j${n(Math.abs(s.displacement.im))}\\,\\mathrm V`, metrics: [...currents.map((v, k) => ({ label: `I${"ABC"[k]}`, value: magnitude(v), unit: "A", color: ["orange", "blue", "violet"][k] })), { label: balanced ? "P" : "|Un|", value: balanced ? 3 * 230 * 5 : magnitude(s.displacement), unit: balanced ? "W" : "V", color: "green" }], plot: { xLabel: "t, ms", yLabel: "i, A", xMax: 20, yMin: -Math.max(...currents.map(magnitude)) * 1.65, yMax: Math.max(...currents.map(magnitude)) * 1.65, curves: currents.map((v, k) => ({ label: `i${"ABC"[k]}`, color: ["orange", "blue", "violet"][k], dash: k === 1, points: sample(20, t => Math.SQRT2 * magnitude(v) * Math.cos(Math.PI * t / 10 + Math.atan2(v.im, v.re))) })) } };
  }
  if (kind === "diode") {
    const d = diode();
    return { kind, formula: "U_D=0.7+r_dI,\\quad E=RI+U_D", substitution: `I=\\frac{5-0.7}{1000+10}=${n(d.i * 1000, 3)}\\,\\mathrm{mA}`, metrics: [{ label: "I", value: d.i * 1000, unit: "mA", color: "orange" }, { label: "UD", value: d.ud, unit: "V", color: "green" }], plot: { xLabel: "uD, V", yLabel: "iD, mA", xMax: 1, yMin: 0, yMax: 6, curves: [{ label: "iD(uD)", color: "orange", points: sample(1, u => Math.max(0, (u - 0.7) / 10 * 1000), 150) }, { label: "(E − uD) / R", color: "blue", dash: true, points: sample(1, u => (5 - u)) }] } };
  }
  if (kind === "magnet") {
    const m = magnetic();
    return { kind, formula: "\\mathcal R=\\frac{l_c}{\\mu_0\\mu_rS}+\\frac{g}{\\mu_0S},\\quad\\Phi=\\frac{NI}{\\mathcal R}", substitution: `\\Phi=\\frac{200\\cdot0.5}{${n((m.core + m.air) / 1e6, 3)}\\cdot10^6}=${n(m.flux * 1e6)}\\,\\mu\\mathrm{Wb}`, metrics: [{ label: "NI", value: m.mmf, unit: "A·turn" }, { label: "Φ", value: m.flux * 1e6, unit: "µWb", color: "blue" }, { label: "B", value: m.b, unit: "T", color: "green" }], plot: { xLabel: "NI, A·turn", yLabel: "B, T", xMax: 200, yMin: 0, yMax: 0.22, curves: [{ label: "B(NI)", color: "blue", points: sample(200, mmf => mmf / (m.core + m.air) / m.area) }] } };
  }
  const w = line();
  return { kind, formula: "Z_0=\\sqrt{L'/C'},\\quad\\Gamma_L=\\frac{R_L-Z_0}{R_L+Z_0}", substitution: `\\Gamma_L=\\frac{100-50}{100+50}=\\frac13,\\quad U^+=\\frac{100\\cdot50}{50+50}=50\\,\\mathrm V`, metrics: [{ label: "Td", value: w.td * 1000, unit: "ms" }, { label: "ΓL", value: w.gamma, unit: "", color: "violet" }, { label: "UL", value: w.loadU, unit: "V", color: "blue" }, { label: "IL", value: w.loadI, unit: "A", color: "orange" }], plot: { xLabel: "x, km · t = 0.75 ms", yLabel: "u, V; Z₀i, V", xMax: 100, yMin: 0, yMax: 80, curves: [{ label: "u(x)", color: "blue", points: [[0, 50], [50, 50], [50, w.loadU], [100, w.loadU]] }, { label: "Z₀i(x)", color: "orange", dash: true, points: [[0, 50], [50, 50], [50, w.loadI * 50], [100, w.loadI * 50]] }] } };
}
