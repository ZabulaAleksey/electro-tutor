import { bigintRatio, reduce, type Fraction } from "./lc-polynomial";
import { cauerIImpedance, synthesizeCauerI, type CauerElement, type CauerLadder } from "./reactive-cauer-i";

/** Substitute q ↦ 1/q in both polynomials with a common clearing power. */
function invertFrequency(impedance: Fraction): Fraction {
  const size = Math.max(impedance.numerator.length, impedance.denominator.length);
  const reverse = (coefficients: readonly bigint[]) => {
    const reversed = Array.from({ length: size }, (_, index) => coefficients[size - 1 - index] ?? 0n);
    while (reversed.length > 1 && reversed.at(-1) === 0n) reversed.pop();
    return reversed;
  };
  return reduce(reverse(impedance.numerator), reverse(impedance.denominator));
}

export function cauerIIImpedance(elements: readonly CauerElement[]): Fraction {
  return invertFrequency(cauerIImpedance(elements));
}

export function synthesizeCauerII(impedance: Fraction): CauerLadder {
  const transformed = synthesizeCauerI(invertFrequency(impedance));
  const elements = transformed.elements.map<CauerElement>(element => {
    const { numerator, denominator } = element.coefficient;
    const valueSI = bigintRatio(denominator, numerator) / 1000;
    if (!(valueSI > 0 && Number.isFinite(valueSI))) throw Error("cauer-component-range");
    return { ...element, kind: element.kind === "l" ? "c" : "l", valueSI };
  });
  return { elements, impedance: cauerIIImpedance(elements) };
}
