import type { Fraction } from "./lc-polynomial";
import { verifyFosterSynthesis, type FosterVerification } from "./lc-synthesis-equivalence";
import { extractFosterITerms } from "./reactive-foster-i";

export type FosterIITerm =
  | { kind: "shunt-l"; henry: number; strength: number }
  | { kind: "shunt-c"; farad: number; strength: number }
  | { kind: "series-lc"; henry: number; farad: number; omega: number; strength: number };

export type FosterII = { terms: readonly FosterIITerm[]; error: number; verification: FosterVerification };

function susceptance(terms: readonly FosterIITerm[], omega: number): number {
  if (!(omega > 0 && Number.isFinite(omega))) throw Error("invalid-foster-frequency");
  return terms.reduce((sum, term) => {
    if (term.kind === "shunt-l") return sum - 1 / (omega * term.henry);
    if (term.kind === "shunt-c") return sum + omega * term.farad;
    const impedance = omega * term.henry - 1 / (omega * term.farad);
    return sum - 1 / impedance;
  }, 0);
}

export function fosterIIReactance(terms: readonly FosterIITerm[], omega: number): number {
  return -1 / susceptance(terms, omega);
}

/** Expand the admittance and apply the electrical dual of each Foster I element. */
export function synthesizeFosterII(impedance: Fraction): FosterII {
  const { reference, terms: dual } = extractFosterITerms({ numerator: impedance.denominator, denominator: impedance.numerator });
  const terms = dual.map<FosterIITerm>(term => {
    if (term.kind === "series-c") return { kind: "shunt-l", henry: term.farad, strength: term.strength };
    if (term.kind === "series-l") return { kind: "shunt-c", farad: term.henry, strength: term.strength };
    return { kind: "series-lc", henry: term.farad, farad: term.henry, omega: term.omega, strength: term.strength };
  });
  const verification = verifyFosterSynthesis(reference, terms, "Y", omega => susceptance(terms, omega));
  return { terms, error: verification.sweepError, verification };
}
