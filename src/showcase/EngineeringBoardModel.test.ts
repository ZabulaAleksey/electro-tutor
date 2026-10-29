import { describe, expect, it } from "vitest";
import { parseStrokes, serializeStrokes } from "./EngineeringBoardModel";

describe("engineering board persistence", () => {
  it("restores a long valid stroke without truncating points", () => {
    const points = Array.from({ length: 12000 }, (_, index) => `${index},${index}`).join(" ");
    const result = parseStrokes(JSON.stringify([{ id: 1, points }]));
    expect(result.error).toBeUndefined(); expect(result.strokes[0].points.split(" ")).toHaveLength(12000);
  });
  it("rejects a malformed payload atomically", () => {
    const result = parseStrokes(JSON.stringify([{ id: 1, points: "1,1" }, { id: 2, points: "bad" }]));
    expect(result.error).toBeTruthy(); expect(result.strokes).toEqual([]);
  });
  it("fails oversized saves instead of silently dropping strokes", () => {
    expect(() => serializeStrokes([{ id: 1, points: `1,${"1 ".repeat(2000000)}` }])).toThrow("payload too large");
  });
});
