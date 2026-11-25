import { abs, add, bigintRatio, binaryRatio, gcd, multiply, ratioAt, type Fraction, type Polynomial } from "./lc-polynomial";
import { resonances } from "./reactive-two-port";
export { binaryRatio } from "./lc-polynomial";

export type LcExactRatio = Readonly<{ numerator: bigint; denominator: bigint }>;
type Nominals<Value> = Readonly<{ henry?: Value; farad?: Value }>;
export type FosterNominalWitness = Nominals<LcExactRatio>;
type Domain = "Z" | "Y";

type CoefficientProof = {
  method: "exact-rational" | "bounded-rational";
  coefficientError: number;
  coefficientTolerance: number;
};

type LimitProof = { kind: "zero" | "pole"; coefficientError: number };

export type FosterVerification = CoefficientProof & {
  domain: Domain;
  sweepError: number;
  sweepTolerance: number;
  samples: number;
  dc: LimitProof;
  infinity: LimitProof;
  nominalWitnesses: readonly FosterNominalWitness[];
};

const frequencyScale = 1000n;
const coefficientScale = 10_000_000_000n;
const coefficientTolerance = 1 / Number(coefficientScale);
const sweepTolerance = 1e-7;

function reducedRatio(numerator: bigint, denominator: bigint): LcExactRatio {
  const common = gcd(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

const polynomialCrosses = (a: Fraction, b: Fraction) => [
  multiply(a.numerator, b.denominator),
  multiply(b.numerator, a.denominator),
] as const;

function coefficientDistance(left: bigint, right: bigint): number {
  const difference = abs(left - right);
  if (difference === 0n) return 0;
  const a = abs(left), b = abs(right);
  const magnitude = a > b ? a : b;
  if (difference * coefficientScale > magnitude) throw Error("lc-equivalence-coefficients");
  return Math.max(Number.MIN_VALUE, bigintRatio(difference, magnitude));
}

/** Compare all coefficients in P₁Q₂−P₂Q₁ independently of a sampling grid.
 * A bounded result uses the larger magnitude of each compared coefficient. */
export function verifyLcRationalIdentity(expected: Fraction, rebuilt: Fraction): CoefficientProof {
  for (const { numerator, denominator } of [expected, rebuilt]) {
    if (!numerator.length || !denominator.some(coefficient => coefficient !== 0n)) {
      throw Error("lc-equivalence-coefficients");
    }
  }
  const [left, right] = polynomialCrosses(expected, rebuilt);
  let coefficientError = 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    coefficientError = Math.max(coefficientError, coefficientDistance(left[i] ?? 0n, right[i] ?? 0n));
  }
  return { method: coefficientError === 0 ? "exact-rational" : "bounded-rational", coefficientError, coefficientTolerance };
}

function decimalRatio(value: number): LcExactRatio {
  const [scientific, exponent] = value.toString().split("e");
  const [whole, decimal = ""] = scientific.split(".");
  const scale = Number(exponent ?? 0) - decimal.length;
  const digits = BigInt(whole + decimal);
  return scale < 0
    ? reducedRatio(digits, 10n ** BigInt(-scale))
    : { numerator: digits * 10n ** BigInt(scale), denominator: 1n };
}

/** Search for a simple rational nominal that round-trips to the displayed
 * double. It is a candidate until the whole port passes exact multiplication. */
function simpleRoundTrip(value: number): LcExactRatio {
  const decimal = decimalRatio(value);
  let { numerator: remainder, denominator: divisor } = decimal;
  let previous = { numerator: 0n, denominator: 1n };
  let current = { numerator: 1n, denominator: 0n };
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  while (divisor) {
    const whole = remainder / divisor;
    const next = {
      numerator: whole * current.numerator + previous.numerator,
      denominator: whole * current.denominator + previous.denominator,
    };
    if (next.numerator > limit || next.denominator > limit) break;
    if (Number(next.numerator) / Number(next.denominator) === value) return next;
    [previous, current] = [current, next];
    [remainder, divisor] = [divisor, remainder % divisor];
  }
  return decimal;
}

function witness({ henry, farad }: Nominals<number>, asRatio: (n: number) => LcExactRatio): FosterNominalWitness {
  if (henry === undefined && farad === undefined
    || [henry, farad].some(value => value !== undefined && !(value > 0 && Number.isFinite(value)))) {
    throw Error("foster-synthesis-range");
  }
  return { ...(henry === undefined ? {} : { henry: asRatio(henry) }), ...(farad === undefined ? {} : { farad: asRatio(farad) }) };
}

function summedResponse(terms: readonly FosterNominalWitness[], domain: Domain): Fraction {
  let sum: Fraction = { numerator: [0n], denominator: [1n] };
  for (const { henry, farad } of terms) {
    const [direct, reciprocal] = domain === "Z" ? [henry, farad] : [farad, henry];
    let term: Fraction;
    if (direct && reciprocal) {
      const n = frequencyScale * direct.numerator;
      term = {
        numerator: [0n, n * reciprocal.denominator],
        denominator: [direct.denominator * reciprocal.denominator, 0n, frequencyScale * n * reciprocal.numerator],
      };
    } else if (direct) {
      term = { numerator: [0n, frequencyScale * direct.numerator], denominator: [direct.denominator] };
    } else if (reciprocal) {
      term = { numerator: [reciprocal.denominator], denominator: [0n, frequencyScale * reciprocal.numerator] };
    } else {
      throw Error("foster-synthesis-range");
    }
    const [left, right] = polynomialCrosses(sum, term);
    sum = { numerator: add(left, right), denominator: multiply(sum.denominator, term.denominator) };
  }
  return sum;
}

function characteristicLimit(expected: Fraction, rebuilt: Fraction, low: boolean): LimitProof {
  const degree = (p: Polynomial) => low ? p.findIndex(coefficient => coefficient !== 0n)
    : p.findLastIndex(coefficient => coefficient !== 0n);
  const [n, d] = [degree(expected.numerator), degree(expected.denominator)];
  const [nextN, nextD] = [degree(rebuilt.numerator), degree(rebuilt.denominator)];
  const order = n - d;
  if (Math.abs(order) !== 1 || order !== nextN - nextD) throw Error("foster-equivalence-range");
  return {
    kind: (low ? order === 1 : order === -1) ? "zero" : "pole",
    coefficientError: coefficientDistance(expected.numerator[n] * rebuilt.denominator[nextD],
      rebuilt.numerator[nextN] * expected.denominator[d]),
  };
}

function sweep(reference: Fraction, evaluate: (omega: number) => number) {
  const roots = resonances(reference);
  const low = (roots[0]?.omega ?? Number(frequencyScale)) / 100;
  const high = (roots.at(-1)?.omega ?? Number(frequencyScale)) * 100;
  const probes = new Set([
    ...Array.from({ length: 41 }, (_, i) => low * (high / low) ** (i / 40)),
    ...roots.flatMap(({ omega }) => [omega * 0.99, omega * 0.9999, omega * 1.0001, omega * 1.01]),
  ]);
  const signed = (p: Polynomial) => p.filter((_, i) => i % 2 === (p[0] === 0n ? 1 : 0))
    .map((coefficient, index) => index % 2 === 0 ? coefficient : -coefficient);
  const numerator = signed(reference.numerator), denominator = signed(reference.denominator);
  const inductive = reference.numerator[0] === 0n;
  let sweepError = 0;
  let samples = 0;
  for (const omega of probes) {
    if (roots.some(root => root.kind === "pole" && Math.abs(omega / root.omega - 1) < 1e-8)) continue;
    const q = omega / Number(frequencyScale);
    const expected = ratioAt(numerator, denominator, q * q) * (inductive ? q : -1 / q);
    const observed = evaluate(omega);
    const error = Math.abs(expected - observed) / Math.max(1, Math.abs(expected), Math.abs(observed));
    if (!Number.isFinite(error) || error > sweepTolerance) throw Error("foster-equivalence-range");
    sweepError = Math.max(sweepError, error);
    samples++;
  }
  if (!samples) throw Error("foster-equivalence-range");
  return { sweepError, sweepTolerance, samples };
}

export function verifyFosterSynthesis(
  reference: Fraction, terms: readonly Nominals<number>[], domain: Domain, evaluate: (omega: number) => number,
): FosterVerification {
  const binary = terms.map(term => witness(term, binaryRatio));
  const rebuilt = summedResponse(binary, domain);
  const verified = verifyLcRationalIdentity(reference, rebuilt);
  const rational = terms.map(term => witness(term, simpleRoundTrip));
  const rationalPort = summedResponse(rational, domain);
  const [left, right] = polynomialCrosses(reference, rationalPort);
  const exact = left.length === right.length && left.every((coefficient, index) => coefficient === right[index]);
  const realization = exact ? rationalPort : rebuilt;

  return {
    ...(exact ? { ...verified, method: "exact-rational" as const, coefficientError: 0 } : verified),
    domain,
    dc: characteristicLimit(reference, realization, true),
    infinity: characteristicLimit(reference, realization, false),
    ...sweep(reference, evaluate),
    nominalWitnesses: exact ? rational : binary,
  };
}
