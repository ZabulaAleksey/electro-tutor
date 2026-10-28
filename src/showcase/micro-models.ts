import { ac, dc, diode, rc, type Metric, type Plot, type Point } from "./physics";
export type MicroKind = "ohm" | "divider" | "parallel" | "power" | "resonance" | "rms" | "star" | "charge" | "discharge" | "diode" | "filter" | "control" | "drive" | "reflection";
export type MicroModel = { formula: string; metrics: Metric[]; plot: Plot; point: Point; time: number; timeMax?: number; characteristic?: Point; values: Record<string, number> };
const points = (max: number, fn: (x: number) => number): Point[] => Array.from({ length: 121 }, (_, k) => { const x = max * k / 120; return [x, fn(x)]; });
const curve = (label: string, fn: (x: number) => number, max: number, color = "blue", dash = false) => ({ label, color, dash, points: points(max, fn) });
const metric = (label: string, value: number, unit: string): Metric => ({ label, value, unit });
const plot = (xLabel: string, yLabel: string, xMax: number, yMax: number, curves: Plot["curves"], yMin = 0): Plot => ({ xLabel, yLabel, xMax, yMin, yMax, curves });

/** Pure analytic models, SI internally; capacitor controls explicitly use µF. */
export function microModel(kind: MicroKind, a: number, b: number, requestedTime = 1): MicroModel {
  const base = { time: 0, values: { a, b } };
  if (kind === "ohm") {
    const i = a / b;
    return { ...base, formula: "I=U/R", metrics: [metric("I", i, "A"), metric("P", a * i, "W")], plot: plot("U, V", "I, A", 48, 52 / b, [curve("I", u => u / b, 48)]), point: [a, i] };
  }
  if (kind === "divider") {
    const d = dc(24, a, b), fn = (r: number) => 24 * r / (a + r);
    return { ...base, formula: "U_2=24\\frac{R_2}{R_1+R_2}", metrics: [metric("U₂", d.u2, "V"), metric("I", d.i, "A")], plot: plot("R₂, Ω", "U₂, V", 200, 26, [curve("U₂", fn, 200)]), point: [b, d.u2] };
  }
  if (kind === "parallel") {
    const i1 = b / (a + b), i2 = a / (a + b), u = a * b / (a + b);
    return { ...base, formula: "I_1=I_s\\frac{R_2}{R_1+R_2},\\ I_s=1\\,A", metrics: [metric("I₁", i1, "A"), metric("I₂", i2, "A"), metric("U", u, "V")], plot: plot("R₁, Ω", "I, A", 200, 1.1, [curve("I₁", r => b / (r + b), 200), curve("I₂", r => r / (r + b), 200, "orange", true)]), point: [a, i1] };
  }
  if (kind === "power") {
    const fn = (load: number) => 24 ** 2 * load / (a + load) ** 2, p = fn(b);
    return { ...base, formula: "P_L=\\frac{E^2R_L}{(r+R_L)^2}", metrics: [metric("Pᴸ", p, "W"), metric("Pmax", 24 ** 2 / (4 * a), "W"), metric("I", 24 / (a + b), "A")], plot: plot("Rᴸ, Ω", "Pᴸ, W", 300, 24 ** 2 / (4 * a) * 1.15, [curve("Pᴸ", fn, 300)]), point: [b, p], characteristic: [a, fn(a)] };
  }
  if (kind === "resonance") {
    const d = ac(a, b), f0 = 1 / (2 * Math.PI * Math.sqrt(d.l * d.c)), fn = (f: number) => f === 0 ? 0 : ac(f, b).i;
    const c = curve("I RMS", fn, 150); c.points.push([f0, fn(f0)]); c.points.sort((p, q) => p[0] - q[0]);
    return { ...base, formula: "I=\\frac{230}{\\sqrt{R^2+(\\omega L-1/\\omega C)^2}}", metrics: [metric("I RMS", d.i, "A"), metric("φ", d.phi * 180 / Math.PI, "°"), metric("f₀", f0, "Hz")], plot: plot("f, Hz", "I RMS, A", 150, 230 / b * 1.15, [c]), point: [a, d.i], characteristic: [f0, fn(f0)] };
  }
  if (kind === "rms") {
    const rms = a / Math.sqrt(2), fn = (ms: number) => a * Math.sin(2 * Math.PI * b * ms / 1000);
    return { ...base, formula: "u=\\hat U\\sin(2\\pi ft),\\ U=\\hat U/\\sqrt2", metrics: [metric("U RMS", rms, "V"), metric("T", 1000 / b, "ms")], plot: plot("t, ms", "u, V", 50, 55, [curve("u(t)", fn, 50), curve("U RMS", () => rms, 50, "orange", true)], -55), point: [0, 0] };
  }
  if (kind === "star") {
    const i = a / b;
    return { ...base, formula: "I_\\phi=U_\\phi/R,\\ U_L=\\sqrt3U_\\phi", metrics: [metric("Iφ", i, "A"), metric("Uᴸ", a * Math.sqrt(3), "V"), metric("P", 3 * a * i, "W")], plot: plot("t, ms", "i, A", 40, i * 1.6, [curve("iA", t => Math.SQRT2 * i * Math.sin(Math.PI * t / 10), 40), curve("iB", t => Math.SQRT2 * i * Math.sin(Math.PI * t / 10 - 2 * Math.PI / 3), 40, "orange", true), curve("iC", t => Math.SQRT2 * i * Math.sin(Math.PI * t / 10 + 2 * Math.PI / 3), 40, "violet", true)], -i * 1.6), point: [0, 0] };
  }
  if (kind === "charge" || kind === "discharge") {
    const tau = a * b * 1e-6, time = Math.max(0, Math.min(requestedTime, 5 * tau)), charging = kind === "charge";
    const fn = (t: number) => charging ? rc(t, a, b * 1e-6).uc : 12 * Math.exp(-t / tau), uc = fn(time), i = (charging ? 12 - uc : uc) / a;
    return { ...base, time, timeMax: 5 * tau, formula: charging ? "u_C=12(1-e^{-t/RC})" : "u_C=12e^{-t/RC}", metrics: [metric("uC(t)", uc, "V"), metric("iR(t)", i * 1000, "mA"), metric("τ", tau, "s")], plot: plot("t, s", "uC, V", 5 * tau, 13.2, [curve("uC", fn, 5 * tau), curve(charging ? "uC(∞)" : "uC(0)", () => 12, 5 * tau, "orange", true)]), point: [time, uc] };
  }
  if (kind === "diode") {
    const d = diode(a, b), max = Math.max(1.2, d.ud * 1.2), c = curve("iD", u => Math.max(0, (u - 0.7) / 10) * 1000, max); c.points.push([0.7, 0]); c.points.sort((p, q) => p[0] - q[0]);
    return { ...base, formula: "i_D=\\max(0,(E-0.7)/(R+10))", metrics: [metric("iD", d.i * 1000, "mA"), metric("uD", d.ud, "V")], plot: plot("uD, V", "iD, mA", max, Math.max(a / b * 1100, 1), [c, curve("(E−uD)/R", u => (a - u) / b * 1000, max, "orange", true)]), point: [d.ud, d.i * 1000] };
  }
  if (kind === "filter") {
    const tau = 1000 * b * 1e-6, fc = 1 / (2 * Math.PI * tau), max = Math.max(5 * fc, 1.2 * a), fn = (f: number) => 1 / Math.hypot(1, 2 * Math.PI * f * tau);
    return { ...base, formula: "H(j\\omega)=1/(1+j\\omega RC)", metrics: [metric("|H|", fn(a), "V/V"), metric("φ", -Math.atan(2 * Math.PI * a * tau) * 180 / Math.PI, "°"), metric("fc", fc, "Hz")], plot: plot("f, Hz", "|H|, V/V", max, 1.1, [curve("|H|", fn, max)]), point: [a, fn(a)], characteristic: [fc, Math.SQRT1_2] };
  }
  if (kind === "control") {
    const time = Math.max(0, Math.min(requestedTime, 5 * b)), fn = (t: number) => a * (1 - Math.exp(-t / b));
    return { ...base, time, timeMax: 5 * b, formula: "\\begin{gathered}W(s)=K/(\\tau s+1)\\\\y=K(1-e^{-t/\\tau})\\end{gathered}", metrics: [metric("y(t)", fn(time), "1"), metric("y(∞)", a, "1"), metric("τ", b, "s")], plot: plot("t, s", "y, 1", 5 * b, a * 1.15, [curve("y", fn, 5 * b), curve("y(∞)", () => a, 5 * b, "orange", true)]), point: [time, fn(time)] };
  }
  if (kind === "drive") {
    const k = 0.5, r = 1, j = 0.2, tau = j * r / (k * k), steady = (k * a - r * b) / (k * k), time = Math.max(0, Math.min(requestedTime, 5 * tau)), fn = (t: number) => steady * (1 - Math.exp(-t / tau)), omega = fn(time), i = (a - k * omega) / r;
    return { ...base, time, timeMax: 5 * tau, values: { a, b, k, r, j, tau, omega, i, steady }, formula: "\\begin{gathered}J\\dot\\omega=kI-M_L\\\\I=(U-k\\omega)/R_a\\end{gathered}", metrics: [metric("ω(t)", omega, "rad/s"), metric("I(t)", i, "A"), metric("n(∞)", steady * 30 / Math.PI, "rpm")], plot: plot("t, s", "ω, rad/s", 5 * tau, steady * 1.15, [curve("ω", fn, 5 * tau), curve("ω(∞)", () => steady, 5 * tau, "orange", true)]), point: [time, omega] };
  }
  const gamma = (a - b) / (a + b), inc = 50, u = inc * (1 + gamma), i = inc * (1 - gamma) / b;
  const front = (v: number): Point[] => [[0, 0], [50, 0], [50, v], [100, v]];
  return { ...base, formula: "\\Gamma_L=(R_L-Z_0)/(R_L+Z_0)", metrics: [metric("Γᴸ", gamma, "1"), metric("Uᴸ", u, "V"), metric("Iᴸ", i, "A")], plot: plot("x, km", "U, V", 100, 110, [{ label: "U⁺", color: "blue", points: [[0, inc], [100, inc]] }, { label: "U⁻", color: "orange", dash: true, points: front(inc * gamma) }, { label: "U", color: "violet", points: front(inc * gamma).map(([x, y]) => [x, y + inc] as Point) }], -60), point: [100, u] };
}
