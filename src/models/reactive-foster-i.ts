import { bigintRatio, ratioAt, reduce, shift, type Fraction, type Polynomial } from "./lc-polynomial";
import { verifyFosterSynthesis, type FosterVerification } from "./lc-synthesis-equivalence";
import { resonances } from "./reactive-two-port";

export type FosterITerm =
  | { kind: "series-c"; farad: number; strength: number }
  | { kind: "series-l"; henry: number; strength: number }
  | { kind: "parallel-lc"; henry: number; farad: number; omega: number; strength: number };

export type FosterI = { terms: readonly FosterITerm[]; error: number; verification: FosterVerification };

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

/** Shared partial fraction extraction for the two electrical duals. */
export function extractFosterITerms(impedance: Fraction) {
  if (!impedance.numerator.some(c => c !== 0n) || !impedance.denominator.some(c => c !== 0n)) {
    throw Error("invalid-foster-reactance");
  }
  const reference = reduce(impedance.numerator, impedance.denominator);
  const { numerator: p, denominator: d } = normalizedFunction(reference);
  if (p.length > d.length || d[0] === 0n && (d[1] ?? 0n) === 0n) throw Error("invalid-foster-reactance");
  const points = resonances(reference);
  if (points.some((point, index) => !Number.isFinite(point.omega) ||
    index > 0 && (point.omega <= points[index - 1].omega || point.kind === points[index - 1].kind))) {
    throw Error("foster-synthesis-range");
  }
  const poles = points.filter(point => point.kind === "pole").map(point => point.omega);
  const finiteZeros = points.length - poles.length;
  const dc = d[0] === 0n;
  if (poles.length !== d.length - 1 - Number(dc) || finiteZeros !== p.length - 1 - Number(p[0] === 0n)) {
    throw Error("foster-synthesis-range");
  }

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
  return { reference, terms };
}

export function synthesizeFosterI(impedance: Fraction): FosterI {
  const { reference, terms } = extractFosterITerms(impedance);
  const verification = verifyFosterSynthesis(reference, terms, "Z", omega => fosterIReactance(terms, omega));
  return { terms, error: verification.sweepError, verification };
}
