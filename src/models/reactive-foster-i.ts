import { bigintRatio, shift, type Fraction, type Polynomial } from "./lc-polynomial";
import { reactance, resonances } from "./reactive-two-port";

export type FosterITerm =
  | { kind: "series-c"; farad: number; strength: number }
  | { kind: "series-l"; henry: number; strength: number }
  | { kind: "parallel-lc"; henry: number; farad: number; omega: number; strength: number };

export type FosterI = { terms: readonly FosterITerm[]; error: number };

/** Evaluate both polynomials with the same power of the exact binary denominator. */
function ratioAt(numerator: Polynomial, denominator: Polynomial, x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x === 0) return bigintRatio(numerator[0], denominator[0]);
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, x);
  const bits = bytes.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const sign = x < 0 ? -1n : 1n;
  const binaryShift = exponent ? exponent - 1075 : -1074;
  const a = sign * (binaryShift < 0 ? fraction : fraction << BigInt(binaryShift));
  const b = binaryShift < 0 ? 1n << BigInt(-binaryShift) : 1n;
  const degree = Math.max(numerator.length, denominator.length) - 1;
  const evaluate = (p: Polynomial) => {
    let result = p[degree] ?? 0n;
    let denominatorPower = 1n;
    for (let i = degree - 1; i >= 0; i--) {
      denominatorPower *= b;
      result = result * a + (p[i] ?? 0n) * denominatorPower;
    }
    return result;
  };
  return bigintRatio(evaluate(numerator), evaluate(denominator));
}

function parity(p: Polynomial): number {
  const index = p.findIndex(coefficient => coefficient !== 0n);
  if (index < 0 || p.some((coefficient, i) => coefficient !== 0n && i % 2 !== index % 2)) {
    throw Error("invalid-foster-reactance");
  }
  return index % 2;
}

/** Convert Z(q)/q to a rational function in t=q². */
function normalizedFunction(impedance: Fraction): Fraction {
  const n = parity(impedance.numerator);
  const d = parity(impedance.denominator);
  if (n === d) throw Error("invalid-foster-reactance");
  const numerator = impedance.numerator.filter((_, i) => i % 2 === n);
  const denominator = impedance.denominator.filter((_, i) => i % 2 === d);
  return { numerator, denominator: d === 1 ? shift(denominator, 1) : denominator };
}

function positive(value: number): number {
  if (!(value > 0 && Number.isFinite(value))) throw Error("foster-synthesis-range");
  return value;
}

export function fosterIReactance(terms: readonly FosterITerm[], omega: number): number {
  if (!(omega > 0 && Number.isFinite(omega))) throw Error("invalid-foster-frequency");
  return terms.reduce((sum, term) => {
    if (term.kind === "series-c") return sum - 1 / (omega * term.farad);
    if (term.kind === "series-l") return sum + omega * term.henry;
    return sum + 1 / (1 / (omega * term.henry) - omega * term.farad);
  }, 0);
}

function equivalence(impedance: Fraction, terms: readonly FosterITerm[], poles: readonly number[]): number {
  const low = (poles[0] ?? 1000) / 10, high = (poles.at(-1) ?? 1000) * 10;
  const probes = Array.from({ length: 25 }, (_, i) => low * (high / low) ** (i / 24))
    .filter(w => poles.every(pole => Math.abs(w / pole - 1) > 1e-4));
  const errors = probes.map(w => {
    const expected = reactance(impedance, w), rebuilt = fosterIReactance(terms, w);
    return Math.abs(expected - rebuilt) / Math.max(1, Math.abs(expected), Math.abs(rebuilt));
  });
  const error = Math.max(...errors);
  if (!Number.isFinite(error) || error > 1e-7) throw Error("foster-equivalence-range");
  return error;
}

export function synthesizeFosterI(impedance: Fraction): FosterI {
  const { numerator: p, denominator: d } = normalizedFunction(impedance);
  if (p.length > d.length || d[0] === 0n && (d[1] ?? 0n) === 0n) throw Error("invalid-foster-reactance");
  const poles = resonances(impedance).filter(point => point.kind === "pole").map(point => point.omega);
  const dc = d[0] === 0n;
  if (poles.length !== d.length - 1 - Number(dc)) throw Error("foster-synthesis-range");

  const terms: FosterITerm[] = [];
  if (dc) {
    const strength = positive(bigintRatio(p[0], d[1]));
    terms.push({ kind: "series-c", farad: positive(1 / (1000 * strength)), strength });
  }
  if (p.length === d.length) {
    const strength = positive(bigintRatio(p.at(-1)!, d.at(-1)!));
    terms.push({ kind: "series-l", henry: positive(strength / 1000), strength });
  }
  const derivative = d.slice(1).map((coefficient, i) => coefficient * BigInt(i + 1));
  for (const omega of poles) {
    const u = positive((omega / 1000) ** 2);
    const strength = positive(ratioAt(p, derivative, -u));
    terms.push({ kind: "parallel-lc", strength, omega,
      henry: positive(strength / (1000 * u)), farad: positive(1 / (1000 * strength)) });
  }
  if (!terms.length) throw Error("foster-synthesis-range");
  return { terms, error: equivalence(impedance, terms, poles) };
}
