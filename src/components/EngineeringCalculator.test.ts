import { describe, expect, it } from "vitest";
import { calculateRc, calculateSeries } from "./EngineeringCalculatorModel";

describe("engineering calculator models", () => {
  it("keeps Ohm and Kirchhoff values consistent", () => {
    const result = calculateSeries(12, 10, 20);
    expect(result.current).toBeCloseTo(0.4);
    expect(result.u1 + result.u2).toBeCloseTo(12);
  });
  it("uses the physical RC charging equation", () => {
    const result = calculateRc(10, 1000, 0.0001, 0.1);
    expect(result.tau).toBeCloseTo(0.1);
    expect(result.value).toBeCloseTo(6.3212, 3);
  });
});
