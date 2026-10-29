/** Presentation scales only. Physical samples are never rounded or rewritten. */
export type AxisOptions = { pixels?: number; targetTicks?: number; symmetric?: boolean; includeZero?: boolean; logarithmic?: boolean; step?: number };
export type EngineeringAxisScale = { domain: readonly [number, number]; ticks: number[]; minorTicks: number[]; step: number; logarithmic: boolean; position: (value: number) => number; invert: (fraction: number) => number };
const mantissas = [1, 2, 2.5, 5, 10];
const clean = (v: number) => Number(v.toPrecision(14)) || 0;
export function niceStep(value: number) {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError("Finite positive tick step required");
  const power = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(value)));
  return mantissas.map(f => f * power).find(v => Number.isFinite(v) && v >= value * (1 - 1e-13)) ?? value;
}
export function engineeringAxis(minimum: number, maximum: number, options: AxisOptions = {}): EngineeringAxisScale {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) throw new RangeError("Finite axis bounds required");
  let lo = Math.min(minimum, maximum), hi = Math.max(minimum, maximum);
  const count = Math.max(3, Math.min(12, options.targetTicks ?? Math.floor((options.pixels ?? 480) / 85) + 1));
  if (options.logarithmic) {
    if (!(lo > 0)) throw new RangeError("Logarithmic axes require positive data");
    if (lo === hi) { lo = Math.max(Number.MIN_VALUE,lo / 10); hi = Math.min(Number.MAX_VALUE, hi * 10); }
    const lower = Math.floor(Math.log10(lo)), upper = Math.ceil(Math.log10(hi));
    lo = Math.max(Number.MIN_VALUE, 10 ** lower); hi = Math.min(Number.MAX_VALUE, 10 ** upper);
    const logLo = Math.log10(lo), logHi = Math.log10(hi), stride = Math.max(1, Math.ceil((upper - lower) / (count - 1)));
    const ticks: number[] = [], minorTicks: number[] = [];
    for (let e = lower; e <= upper; e++) {
      const v = 10 ** e;
      if (Number.isFinite(v) && v >= lo && v <= hi && (e - lower) % stride === 0) ticks.push(v);
      if (upper - lower <= 5) for (const factor of [2, 3, 4, 5, 6, 7, 8, 9]) { const m = factor * v; if (Number.isFinite(m) && m > lo && m < hi) minorTicks.push(m); }
    }
    return { domain: [lo, hi], ticks, minorTicks, step: stride, logarithmic: true, position: v => (Math.log10(v) - logLo) / (logHi - logLo), invert: f => 10 ** (logLo * (1 - f) + logHi * f) };
  }
  if (options.includeZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) {
    const delta = lo === 0 ? 1 : Math.max(Number.MIN_VALUE, Math.abs(lo) * .1);
    lo = Math.max(-Number.MAX_VALUE, lo - delta); hi = Math.min(Number.MAX_VALUE, hi + delta);
  }
  if (options.symmetric) { const extent = Math.max(Math.abs(lo), Math.abs(hi)); lo = -extent; hi = extent; }
  const normalizer = Math.max(Math.abs(lo), Math.abs(hi), Number.MIN_VALUE);
  const raw = Math.max(Number.MIN_VALUE, ((hi / normalizer - lo / normalizer) / (count - 1)) * normalizer);
  let step = options.step && options.step > 0 && Number.isFinite(options.step) ? options.step : niceStep(raw);
  // Explicit specialised steps are coarsened only to bound work on huge domains.
  if ((hi / normalizer - lo / normalizer) / (step / normalizer) > 100) step = niceStep(raw);
  const first = Math.floor(lo / step), last = Math.ceil(hi / step);
  const domainLo = Math.min(lo, Number.isFinite(first * step) ? clean(first * step) : lo);
  const domainHi = Math.max(hi, Number.isFinite(last * step) ? clean(last * step) : hi);
  const ticks: number[] = [], minorTicks: number[] = [];
  for (let k = 0; k <= Math.min(100, last - first); k++) {
    const value = clean((first + k) * step);
    if (Number.isFinite(value) && value >= domainLo && value <= domainHi && value !== ticks.at(-1)) ticks.push(value);
    if (k < last - first) for (let j = 1; j < 5; j++) {
      const minor = clean((first + k + j / 5) * step);
      if (minor > domainLo && minor < domainHi) minorTicks.push(minor);
    }
  }
  const divisor = domainHi / normalizer - domainLo / normalizer;
  return { domain: [domainLo, domainHi], ticks, minorTicks, step, logarithmic: false, position: v => (v / normalizer - domainLo / normalizer) / divisor, invert: f => domainLo * (1 - f) + domainHi * f };
}
export const niceDomain = (min: number, max: number, options?: AxisOptions) => engineeringAxis(min, max, options).domain;
export const niceTicks = (min: number, max: number, options?: AxisOptions) => engineeringAxis(min, max, options).ticks;
