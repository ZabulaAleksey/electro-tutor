import type { CircuitComponent } from "../circuit/topology";
import { bigintRatio, gcd } from "./lc-polynomial";

export type LcTicks = { numerator: bigint; denominator: bigint };
export type LcKind = "l" | "c";

const tickScale = { l: 1_000_000, c: 1_000_000_000 } as const;
const tolerance = 5e-13;
const decimalRatio = /^[1-9]\d{0,119}\/[1-9]\d{0,119}$/;

export function lcNominalSI(kind: LcKind, ticks: LcTicks): number {
  return bigintRatio(ticks.numerator, ticks.denominator) / tickScale[kind];
}

export function readExactLcNominal({ kind, parameters }: CircuitComponent): LcTicks | undefined {
  if (!Object.hasOwn(parameters, "lcExact")) return;
  const raw = parameters.lcExact;
  if ((kind !== "l" && kind !== "c") || typeof raw !== "string" || !decimalRatio.test(raw)) {
    throw Error("invalid-lc-exact-value");
  }
  const [numerator, denominator] = raw.split("/").map(BigInt);
  if (gcd(numerator, denominator) !== 1n) throw Error("invalid-lc-exact-value");
  const ticks = { numerator, denominator };
  const expected = lcNominalSI(kind, ticks);
  const value = parameters[kind === "l" ? "henry" : "farad"];
  if (typeof value !== "number" || !Number.isFinite(value) || !(expected > 0 && Number.isFinite(expected))
    || Math.abs(value - expected) / expected > tolerance) throw Error("invalid-lc-exact-value");
  return ticks;
}

export function exactLcParameters(kind: LcKind, ticks: LcTicks): CircuitComponent["parameters"] {
  const divisor = gcd(ticks.numerator, ticks.denominator);
  if (ticks.numerator <= 0n || ticks.denominator <= 0n || divisor <= 0n) throw Error("invalid-lc-exact-value");
  const nominal = { numerator: ticks.numerator / divisor, denominator: ticks.denominator / divisor };
  const value = lcNominalSI(kind, nominal);
  const lcExact = nominal.numerator + "/" + nominal.denominator;
  if (!(value > 0 && Number.isFinite(value)) || !decimalRatio.test(lcExact)) throw Error("invalid-lc-exact-value");
  return kind === "l" ? { henry: value, initial: 0, lcExact } : { farad: value, initial: 0, lcExact };
}
