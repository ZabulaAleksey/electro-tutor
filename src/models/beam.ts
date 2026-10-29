/** Linear Euler–Bernoulli beam, x right, y up, applied couples CCW.
 * N=-ΣFx(left), Q=ΣFy(left), M=ΣFy(left)*(x-xi)-Σcouples(left).
 * Cubic Hermite stiffness and exact linear-load primitives use SI throughout. */
export type BeamSupport = { id: string; kind: "fixed" | "pin" | "roller"; x: number };
export type BeamSegment = { start: number; end: number; EI: number; EA: number };
export type BeamForce = { id: string; kind: "force" | "axial" | "moment"; x: number; value: number };
export type BeamDistributed = { id: string; kind: "distributed"; start: number; end: number; q0: number; q1: number };
export type BeamLoad = BeamForce | BeamDistributed;
export type BeamScheme = { version: 1; length: number; segments: BeamSegment[]; supports: BeamSupport[]; loads: BeamLoad[] };
export type BeamSample = { N: number; Q: number; M: number };
type Factor = keyof BeamSample;
type ByFactor<T> = { N: T; Q: T; M: T };
type Reaction = { id: string; x: number; Fx: number; Fy: number; M: number };
export type BeamResult = { status: "ok"; reactions: Reaction[]; sample: (x: number, side?: "left" | "right") => BeamSample; points: ByFactor<[number, number][]>; zeros: ByFactor<number[]>; extrema: ByFactor<{ x: number; value: number }[]>; residuals: { Fx: number; Fy: number; M: number; compatibility: number }; displacements: number[]; nodes: number[] };
export type BeamFailure = { status: "invalid" | "unstable"; code: string };
const factors: Factor[] = ["N", "Q", "M"];
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("BEAM_INVALID_OBJECT"); return v as Record<string, unknown>; };
function number(v: unknown, lo: number, hi: number, code: string) { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw Error(code); return v; }
export function validateBeam(value: unknown): BeamScheme {
  const raw = object(value), length = number(raw.length, .001, 10000, "BEAM_INVALID_LENGTH");
  if (raw.version !== 1) throw Error("BEAM_INVALID_VERSION");
  const list = (key: string, max: number) => { const a = raw[key]; if (!Array.isArray(a) || a.length > max) throw Error(`BEAM_INVALID_${key.toUpperCase()}`); return a as unknown[]; };
  const position = (v: unknown) => number(v, 0, length, "BEAM_INVALID_POSITION"), ids = new Set<string>();
  const id = (v: unknown) => { if (typeof v !== "string" || !/^[\p{L}\p{N}_-]{1,64}$/u.test(v) || ids.has(v)) throw Error("BEAM_INVALID_ID"); ids.add(v); return v; };
  const segments = list("segments", 16).map(v => { const g = object(v); return { start: position(g.start), end: position(g.end), EI: number(g.EI, 1e-3, 1e15, "BEAM_INVALID_STIFFNESS"), EA: number(g.EA, 1e-3, 1e18, "BEAM_INVALID_STIFFNESS") }; }).sort((a, b) => a.start - b.start);
  if (!segments.length) throw Error("BEAM_NO_SEGMENTS");
  const tolerance = length * 1e-10;
  let boundary = 0;
  for (const g of segments) { if (Math.abs(g.start - boundary) > tolerance || g.end - g.start < length * 1e-7) throw Error("BEAM_SEGMENT_GAP"); g.start = boundary; boundary = g.end; }
  if (Math.abs(boundary - length) > tolerance) throw Error("BEAM_SEGMENT_GAP");
  segments[segments.length - 1].end = length;
  const supports: BeamSupport[] = list("supports", 12).map(v => { const a = object(v); if (a.kind !== "fixed" && a.kind !== "pin" && a.kind !== "roller") throw Error("BEAM_INVALID_SUPPORT"); return { id: id(a.id), kind: a.kind as BeamSupport["kind"], x: position(a.x) }; });
  for (let i = 0; i < supports.length; i++) for (let j = 0; j < i; j++) if (Math.abs(supports[i].x - supports[j].x) < length * 1e-7) throw Error("BEAM_DUPLICATE_SUPPORT");
  const loads: BeamLoad[] = list("loads", 32).map(v => { const l = object(v), key = id(l.id); if (l.kind === "distributed") { const start = position(l.start), end = position(l.end); if (end - start < length * 1e-7) throw Error("BEAM_INVALID_DISTRIBUTED"); return { id: key, kind: "distributed", start, end, q0: number(l.q0, -1e12, 1e12, "BEAM_INVALID_LOAD"), q1: number(l.q1, -1e12, 1e12, "BEAM_INVALID_LOAD") }; } if (l.kind !== "force" && l.kind !== "axial" && l.kind !== "moment") throw Error("BEAM_INVALID_LOAD"); return { id: key, kind: l.kind, x: position(l.x), value: number(l.value, -1e12, 1e12, "BEAM_INVALID_LOAD") }; });
  return { version: 1, length, segments, supports, loads };
}
export function parseBeam(text: string) { if (text.length > 200000) throw Error("BEAM_INPUT_TOO_LARGE"); try { return validateBeam(JSON.parse(text)); } catch (e) { if (e instanceof SyntaxError) throw Error("BEAM_INVALID_JSON"); throw e; } }
export const serializeBeam = (s: BeamScheme) => JSON.stringify(validateBeam(s), null, 2);

/** Symmetric diagonal equilibration avoids mixing metre/radian/axial stiffness scales.
 * Partial pivot elimination rejects near mechanisms. No pseudo-inverse fallback. */
function linearSolve(matrix: number[][], rhs: number[]): number[] | null {
  if (!rhs.length) return [];
  const n = rhs.length, scale = matrix.map((r, i) => Math.sqrt(Math.abs(r[i])));
  if (scale.some(v => !Number.isFinite(v) || v === 0)) return null;
  const a = matrix.map((r, i) => r.map((v, j) => v / scale[i] / scale[j])), b = rhs.map((v, i) => v / scale[i]);
  for (let k = 0; k < n; k++) {
    let pivot = k; for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < 1e-11) return null;
    [a[k], a[pivot]] = [a[pivot], a[k]]; [b[k], b[pivot]] = [b[pivot], b[k]];
    for (let i = k + 1; i < n; i++) { const ratio = a[i][k] / a[k][k]; for (let j = k + 1; j < n; j++) a[i][j] -= ratio * a[k][j]; a[i][k] = 0; b[i] -= ratio * b[k]; }
  }
  const y = Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let sum = b[i]; for (let j = i + 1; j < n; j++) sum -= a[i][j] * y[j]; y[i] = sum / a[i][i]; }
  const x = y.map((v, i) => v / scale[i]); return x.every(Number.isFinite) ? x : null;
}
function primitive(l: BeamDistributed, x: number) { const t = Math.max(0, Math.min(l.end - l.start, x - l.start)), k = (l.q1 - l.q0) / (l.end - l.start), w = l.q0 * t + k * t * t / 2; return { w, m: l.start * w + l.q0 * t * t / 2 + k * t * t * t / 3 }; }
function polynomial(c: number[], t: number) { return c.reduceRight((sum, a) => sum * t + a, 0); }
/** Roots isolated recursively by derivative roots: finds tangent roots too, never
 * interpolates across a force/couple jump or depends on the rendering samples. */
function roots(c: number[], width: number): number[] {
  const scaled = c.map((a, i) => a * width ** i), magnitude = Math.max(...scaled.map(Math.abs));
  if (magnitude === 0) return [];
  while (scaled.length > 1 && Math.abs(scaled.at(-1)!) < magnitude * 1e-13) scaled.pop();
  if (scaled.length === 1) return [];
  const derivative = scaled.slice(1).map((v, i) => (i + 1) * v), critical = roots(derivative, 1), stops = [0, ...critical.filter(v => v > 0 && v < 1), 1].sort((a, b) => a - b), found: number[] = [];
  const near = magnitude * 1e-11;
  for (const t of stops) if (Math.abs(polynomial(scaled, t)) < near) found.push(t);
  for (let i = 1; i < stops.length; i++) { let lo = stops[i - 1], hi = stops[i], v = polynomial(scaled, lo); if (v * polynomial(scaled, hi) >= 0) continue; for (let j = 0; j < 60; j++) { const mid = (lo + hi) / 2, m = polynomial(scaled, mid); if (m * v <= 0) hi = mid; else { lo = mid; v = m; } } found.push((lo + hi) / 2); }
  return found.sort((a, b) => a - b).filter((v, i, a) => !i || Math.abs(v - a[i - 1]) > 1e-9).map(t => t * width);
}
export function solveBeam(raw: BeamScheme): BeamResult | BeamFailure {
  let s: BeamScheme; try { s = validateBeam(raw); } catch (e) { return { status: "invalid", code: e instanceof Error ? e.message : "BEAM_INVALID" }; }
  const xs = [...new Set([0, s.length, ...s.segments.flatMap(g => [g.start, g.end]), ...s.supports.map(a => a.x), ...s.loads.flatMap(l => l.kind === "distributed" ? [l.start, l.end] : [l.x])])].sort((a, b) => a - b);
  if (xs.some((v, i) => i && v - xs[i - 1] < s.length * 1e-9)) return { status: "invalid", code: "BEAM_CLOSE_NODES" };
  const count = xs.length * 3, K = Array.from({ length: count }, () => Array<number>(count).fill(0)), f = Array<number>(count).fill(0), distributed = s.loads.filter((l): l is BeamDistributed => l.kind === "distributed");
  for (let e = 0; e < xs.length - 1; e++) {
    const a = xs[e], b = xs[e + 1], h = b - a, midpoint = (a + b) / 2, g = s.segments.find(p => midpoint >= p.start && midpoint <= p.end)!;
    const ids = [3 * e + 1, 3 * e + 2, 3 * e + 4, 3 * e + 5], c = g.EI / h ** 3, local = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h * h, -6 * h, 2 * h * h], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h * h, -6 * h, 4 * h * h]];
    ids.forEach((r, i) => ids.forEach((col, j) => { K[r][col] += c * local[i][j]; }));
    const axial = g.EA / h; K[3 * e][3 * e] += axial; K[3 * e][3 * e + 3] -= axial; K[3 * e + 3][3 * e] -= axial; K[3 * e + 3][3 * e + 3] += axial;
    for (const l of distributed) if (midpoint > l.start && midpoint < l.end) {
      const gradient = (l.q1 - l.q0) / (l.end - l.start), q0 = l.q0 + gradient * (a - l.start), q1 = l.q0 + gradient * (b - l.start);
      const loads = [h * (7 * q0 + 3 * q1) / 20, h * h * (3 * q0 + 2 * q1) / 60, h * (3 * q0 + 7 * q1) / 20, -h * h * (2 * q0 + 3 * q1) / 60];
      ids.forEach((r, i) => { f[r] += loads[i]; });
    }
  }
  for (const l of s.loads) if (l.kind !== "distributed") f[xs.indexOf(l.x) * 3 + (l.kind === "axial" ? 0 : l.kind === "force" ? 1 : 2)] += l.value;
  const constraints = new Set<number>();
  for (const a of s.supports) { const i = xs.indexOf(a.x) * 3; constraints.add(i + 1); if (a.kind !== "roller") constraints.add(i); if (a.kind === "fixed") constraints.add(i + 2); }
  const free = Array.from({ length: count }, (_, i) => i).filter(i => !constraints.has(i)), solution = linearSolve(free.map(i => free.map(j => K[i][j])), free.map(i => f[i]));
  if (!solution) return { status: "unstable", code: "BEAM_SINGULAR" };
  const d = Array<number>(count).fill(0); free.forEach((i, k) => { d[i] = solution[k]; });
  const residual = K.map((row, i) => row.reduce((sum, v, j) => sum + v * d[j], 0) - f[i]);
  let compatibility = Math.max(0, ...free.map(i => Math.abs(residual[i]) / Math.max(1, Math.abs(f[i]), K[i].reduce((sum, v, j) => sum + Math.abs(v * d[j]), 0))), ...[...constraints].map(i => Math.abs(d[i])));
  if (!Number.isFinite(compatibility) || compatibility > 1e-7) return { status: "unstable", code: "BEAM_NUMERICAL_ERROR" };
  const reactions: Reaction[] = s.supports.map(a => { const i = xs.indexOf(a.x) * 3; return { id: a.id, x: a.x, Fx: constraints.has(i) ? residual[i] : 0, Fy: residual[i + 1], M: constraints.has(i + 2) ? residual[i + 2] : 0 }; });
  const sample = (x: number, side: "left" | "right" = "right"): BeamSample => {
    const z = Math.max(0, Math.min(s.length, x)), includes = (at: number) => at < z || at === z && side === "right";
    let N = 0, Q = 0, M = 0;
    for (const r of reactions) if (includes(r.x)) { N -= r.Fx; Q += r.Fy; M += r.Fy * (z - r.x) - r.M; }
    for (const l of s.loads) { if (l.kind === "distributed") { const p = primitive(l, z); Q += p.w; M += z * p.w - p.m; } else if (includes(l.x)) { if (l.kind === "axial") N -= l.value; else if (l.kind === "force") { Q += l.value; M += l.value * (z - l.x); } else M -= l.value; } }
    return { N, Q, M };
  };
  const points: BeamResult["points"] = { N: [], Q: [], M: [] }, zeros: BeamResult["zeros"] = { N: [], Q: [], M: [] }, extrema: BeamResult["extrema"] = { N: [], Q: [], M: [] };
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1], h = b - a, v = sample(a, "right"); let q = 0, slope = 0;
    for (const l of distributed) if ((a + b) / 2 > l.start && (a + b) / 2 < l.end) { const k = (l.q1 - l.q0) / (l.end - l.start); q += l.q0 + k * (a - l.start); slope += k; }
    // Independent deformation compatibility from recovered M/EI and N/EA,
    // including the exact load particular solution (not cubic FE interpolation).
    const segment = s.segments.find(g => (a+b)/2 >= g.start && (a+b)/2 <= g.end)!;
    const rotation = d[i*3+2] + (v.M*h + v.Q*h*h/2 + q*h**3/6 + slope*h**4/24) / segment.EI;
    const displacement = d[i*3+1] + d[i*3+2]*h + (v.M*h*h/2 + v.Q*h**3/6 + q*h**4/24 + slope*h**5/120) / segment.EI;
    const axialDisplacement = d[i*3] + v.N*h/segment.EA;
    compatibility = Math.max(compatibility,
      Math.abs(rotation-d[(i+1)*3+2])/Math.max(1,Math.abs(rotation),Math.abs(d[(i+1)*3+2])),
      Math.abs(displacement-d[(i+1)*3+1])/Math.max(1,s.length,Math.abs(displacement),Math.abs(d[(i+1)*3+1])),
      Math.abs(axialDisplacement-d[(i+1)*3])/Math.max(1,s.length,Math.abs(axialDisplacement),Math.abs(d[(i+1)*3])));
    const polynomials: ByFactor<number[]> = { N: [v.N], Q: [v.Q, q, slope / 2], M: [v.M, v.Q, q / 2, slope / 6] };
    for (const factor of factors) {
      const p = polynomials[factor], isolated = roots(p, h); zeros[factor].push(...isolated.map(t => a + t));
      const stationary = factor === "N" ? [] : roots(p.slice(1).map((c, k) => (k + 1) * c), h);
      for (const t of [0, ...stationary.filter(t => t > 0 && t < h), h]) extrema[factor].push({ x: a + t, value: polynomial(p, t) });
      const locations = [...new Set([0, ...Array.from({ length: 31 }, (_, j) => h * (j + 1) / 32), ...isolated, ...stationary, h])].sort((x, y) => x - y);
      for (const t of locations) points[factor].push([a + t, polynomial(p, t)]);
    }
  }
  for (const factor of factors) {
    zeros[factor] = zeros[factor].sort((a, b) => a - b).filter((v, i, a) => !i || Math.abs(v - a[i - 1]) > s.length * 1e-8);
    extrema[factor] = extrema[factor].filter((v, i, a) => !i || Math.abs(v.x - a[i - 1].x) > s.length * 1e-10 || Math.abs(v.value - a[i - 1].value) > 1e-8);
  }
  let Fx = 0, Fy = 0, M = 0;
  for (const l of s.loads) { if (l.kind === "distributed") { const p = primitive(l, s.length); Fy += p.w; M += p.m; } else if (l.kind === "axial") Fx += l.value; else if (l.kind === "force") { Fy += l.value; M += l.value * l.x; } else M += l.value; }
  for (const r of reactions) { Fx += r.Fx; Fy += r.Fy; M += r.M + r.Fy * r.x; }
  if (!Number.isFinite(compatibility) || compatibility > 1e-7) return {status:"unstable",code:"BEAM_COMPATIBILITY_ERROR"};
  return { status: "ok", reactions, sample, points, zeros, extrema, residuals: { Fx, Fy, M, compatibility }, displacements: d, nodes: xs };
}
