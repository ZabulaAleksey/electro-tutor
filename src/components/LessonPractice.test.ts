import { describe, expect, it } from "vitest";
import { gradePracticeAnswer } from "../learning/practice";

describe("mesh lesson practice", () => {
  it("accepts the checked current with comma or dot notation", () => {
    expect(gradePracticeAnswer("2,18").result).toBe("correct");
    expect(gradePracticeAnswer("2.18").result).toBe("correct");
    expect(gradePracticeAnswer("2.20").result).toBe("correct");
  });

  it("distinguishes malformed and incorrect answers", () => {
    expect(gradePracticeAnswer("2 volts").result).toBe("invalid");
    expect(gradePracticeAnswer("1.5").result).toBe("incorrect");
  });
});
