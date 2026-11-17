import { add, bigintRatio, gcd, multiply, reduce, scale, shift, type Fraction } from "./lc-polynomial";

export type CauerPlacement = "series" | "shunt";
export type CauerElement = {
  placement: CauerPlacement;
  kind: "l" | "c";
  valueSI: number;
  coefficient: { numerator: bigint; denominator: bigint };
};
export type CauerLadder = { elements: readonly CauerElement[]; impedance: Fraction };

const reciprocal = ({ numerator, denominator }: Fraction): Fraction => ({ numerator: denominator, denominator: numerator });
const zero = (p: readonly bigint[]): boolean => p.every(coefficient => coefficient === 0n);

function addFractions(a: Fraction, b: Fraction): Fraction {
  return reduce(add(multiply(a.numerator, b.denominator), multiply(b.numerator, a.denominator)),
    multiply(a.denominator, b.denominator));
}

export function cauerIImpedance(elements: readonly CauerElement[]): Fraction {
  let tail: Fraction | null = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const { numerator, denominator } = elements[i].coefficient;
    const extracted = { numerator: [0n, numerator], denominator: [denominator] };
    tail = tail ? addFractions(extracted, reciprocal(tail)) : extracted;
  }
  if (!tail) throw Error("empty-cauer-ladder");
  return elements[0].placement === "series" ? tail : reciprocal(tail);
}

export function cauerReactance(elements: readonly CauerElement[], omega: number): number {
  if (!(omega > 0 && Number.isFinite(omega))) throw Error("invalid-cauer-frequency");
  let downstream: number | null = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const { placement, kind, valueSI } = elements[i];
    const element = kind === "l" ? omega * valueSI : -1 / (omega * valueSI);
    if (downstream === null) downstream = element;
    else if (placement === "series") downstream += element;
    else if (downstream !== 0) downstream = 1 / (1 / element + 1 / downstream);
  }
  if (downstream === null) throw Error("empty-cauer-ladder");
  return downstream;
}

function sameCoefficients(a: readonly bigint[], b: readonly bigint[]): boolean {
  return a.length === b.length && a.every((coefficient, i) => coefficient === b[i]);
}

export function synthesizeCauerI(impedance: Fraction): CauerLadder {
  if (zero(impedance.numerator) || zero(impedance.denominator)) throw Error("invalid-cauer-impedance");
  const original = reduce(impedance.numerator, impedance.denominator);
  let remainder = original;
  let placement: CauerPlacement = "series";
  if (remainder.denominator.length > remainder.numerator.length) {
    remainder = reciprocal(remainder);
    placement = "shunt";
  }

  const elements: CauerElement[] = [];
  while (elements.length < Math.max(original.numerator.length, original.denominator.length)) {
    const { numerator, denominator } = remainder;
    if (numerator.length !== denominator.length + 1) throw Error("invalid-cauer-expansion");
    const leadingN = numerator.at(-1)!, leadingD = denominator.at(-1)!;
    const divisor = gcd(leadingN, leadingD) * (leadingD < 0n ? -1n : 1n);
    const coefficient = { numerator: leadingN / divisor, denominator: leadingD / divisor };
    const valueSI = bigintRatio(coefficient.numerator, coefficient.denominator) / 1000;
    if (!(valueSI > 0 && Number.isFinite(valueSI))) throw Error("cauer-component-range");
    elements.push({ placement, kind: placement === "series" ? "l" : "c", valueSI, coefficient });

    const difference = add(scale(numerator, coefficient.denominator), scale(shift(denominator, 1), -coefficient.numerator));
    if (zero(difference)) {
      const rebuilt = cauerIImpedance(elements);
      if (!sameCoefficients(original.numerator, rebuilt.numerator) ||
          !sameCoefficients(original.denominator, rebuilt.denominator)) throw Error("cauer-equivalence");
      return { elements, impedance: rebuilt };
    }
    remainder = reduce(scale(denominator, coefficient.denominator), difference);
    placement = placement === "series" ? "shunt" : "series";
  }
  throw Error("cauer-expansion-limit");
}
