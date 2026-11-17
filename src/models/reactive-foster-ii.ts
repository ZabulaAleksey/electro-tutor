import type { Fraction } from "./lc-polynomial";
import { synthesizeFosterI } from "./reactive-foster-i";

export type FosterIITerm =
  | { kind: "shunt-l"; henry: number; strength: number }
  | { kind: "shunt-c"; farad: number; strength: number }
  | { kind: "series-lc"; henry: number; farad: number; omega: number; strength: number };

export type FosterII = { terms: readonly FosterIITerm[]; error: number };

export function fosterIIReactance(terms: readonly FosterIITerm[], omega: number): number {
  if (!(omega > 0 && Number.isFinite(omega))) throw Error("invalid-foster-frequency");
  const susceptance = terms.reduce((sum, term) => {
    if (term.kind === "shunt-l") return sum - 1 / (omega * term.henry);
    if (term.kind === "shunt-c") return sum + omega * term.farad;
    const impedance = omega * term.henry - 1 / (omega * term.farad);
    return sum - 1 / impedance;
  }, 0);
  return -1 / susceptance;
}

/** Expand the admittance and apply the electrical dual of each Foster I element. */
export function synthesizeFosterII(impedance: Fraction): FosterII {
  const dual = synthesizeFosterI({ numerator: impedance.denominator, denominator: impedance.numerator });
  const terms = dual.terms.map<FosterIITerm>(term => {
    if (term.kind === "series-c") return { kind: "shunt-l", henry: term.farad, strength: term.strength };
    if (term.kind === "series-l") return { kind: "shunt-c", farad: term.henry, strength: term.strength };
    return { kind: "series-lc", henry: term.farad, farad: term.henry, omega: term.omega, strength: term.strength };
  });
  return { terms, error: dual.error };
}
