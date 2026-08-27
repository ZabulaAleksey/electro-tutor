import { describe, expect, it } from "vitest";
import {
  CIRCULAR_DIAGRAM_DEFAULTS,
  CIRCULAR_DIAGRAM_LIMITS,
  canonicalizeCircularDiagramState,
  normalizeCircularDiagramState,
  parseCircularDiagramSearch,
  type CircularDiagramState,
} from "./circular-diagram-state";

describe("circular diagram URL state", () => {
  it("parses version 1 and canonicalizes field order", () => {
    const result = parseCircularDiagramSearch(
      "?phi=-20&v=1&r=50&zm=12&i0m=2.75&i0a=10&ikm=9&ika=-40&za=15",
    );

    expect(result.status).toBe("normalized");
    expect(result.state).toEqual({
      i0m: 2.75,
      i0a: 10,
      ikm: 9,
      ika: -40,
      zm: 12,
      za: 15,
      phi: -20,
      r: 50,
    });
    expect(result.canonicalSearch).toBe(
      "?v=1&i0m=2.75&i0a=10&ikm=9&ika=-40&zm=12&za=15&phi=-20&r=50",
    );
  });

  it("migrates a valid legacy partial link", () => {
    const result = parseCircularDiagramSearch("?i0m=2.75&r=50");

    expect(result.status).toBe("migrated");
    expect(result.state).toEqual({
      ...CIRCULAR_DIAGRAM_DEFAULTS,
      i0m: 2.75,
      r: 50,
    });
    expect(result.canonicalSearch).toContain("?v=1&i0m=2.75");
  });

  it("accepts every inclusive boundary", () => {
    const minimums: CircularDiagramState = {
      i0m: 0,
      i0a: -180,
      ikm: 0,
      ika: -180,
      zm: 0.01,
      za: -90,
      phi: -90,
      r: 0,
    };
    const maximums: CircularDiagramState = {
      i0m: 1000,
      i0a: 180,
      ikm: 1000,
      ika: 180,
      zm: 1_000_000,
      za: 90,
      phi: 90,
      r: 100,
    };

    expect(parseCircularDiagramSearch(canonicalizeCircularDiagramState(minimums)).state)
      .toEqual(minimums);
    expect(parseCircularDiagramSearch(canonicalizeCircularDiagramState(maximums)).state)
      .toEqual(maximums);
  });

  it.each([
    ["NaN", "?v=1&i0m=NaN"],
    ["Infinity", "?v=1&i0m=Infinity"],
    ["negative magnitude", "?v=1&i0m=-1"],
    ["huge magnitude", "?v=1&ikm=1e309"],
    ["out-of-range angle", "?v=1&i0a=181"],
    ["empty known value", "?v=1&zm="],
    ["hex syntax", "?v=1&r=0x10"],
    ["duplicate key", "?v=1&i0m=2&i0m=3"],
    ["duplicate version", "?v=1&v=1"],
    ["unknown version", "?v=99&i0m=2"],
    ["encoded invalid value", "?v=1&i0m=%49%6e%66%69%6e%69%74%79"],
    ["oversized query", `?v=1&note=${"x".repeat(1025)}`],
  ])("recovers defaults for %s", (_case, search) => {
    const result = parseCircularDiagramSearch(search);

    expect(result.status).toBe("recovered");
    expect(result.state).toEqual(CIRCULAR_DIAGRAM_DEFAULTS);
    expect(result.canonicalSearch).toBe(
      canonicalizeCircularDiagramState(CIRCULAR_DIAGRAM_DEFAULTS),
    );
  });

  it("strips unknown keys without changing valid known state", () => {
    const result = parseCircularDiagramSearch("?utm_source=test&i0m=3&v=1&payload=%7B%7D");

    expect(result.status).toBe("normalized");
    expect(result.state.i0m).toBe(3);
    expect(result.canonicalSearch).not.toContain("utm_source");
    expect(result.canonicalSearch).not.toContain("payload");
  });

  it("normalizes trusted UI values with the same limits", () => {
    expect(normalizeCircularDiagramState({
      ...CIRCULAR_DIAGRAM_DEFAULTS,
      i0m: -1,
      i0a: 250,
      zm: Number.POSITIVE_INFINITY,
      r: 101,
    })).toEqual({
      ...CIRCULAR_DIAGRAM_DEFAULTS,
      i0m: CIRCULAR_DIAGRAM_LIMITS.i0m.min,
      i0a: CIRCULAR_DIAGRAM_LIMITS.i0a.max,
      zm: CIRCULAR_DIAGRAM_DEFAULTS.zm,
      r: CIRCULAR_DIAGRAM_LIMITS.r.max,
    });
  });

  it("is canonical and idempotent for a deterministic property sample", () => {
    let seed = 0x5eed1234;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let index = 0; index < 128; index += 1) {
      const state = Object.fromEntries(
        Object.entries(CIRCULAR_DIAGRAM_LIMITS).map(([key, limits]) => [
          key,
          limits.min + next() * (limits.max - limits.min),
        ]),
      ) as CircularDiagramState;
      const canonical = canonicalizeCircularDiagramState(state);
      const reparsed = parseCircularDiagramSearch(canonical);

      expect(reparsed.status).toBe("valid");
      expect(reparsed.canonicalSearch).toBe(canonical);
    }
  });
});
