export type PracticeResult = "idle" | "invalid" | "incorrect" | "correct";

export function gradePracticeAnswer(value: string): { result: PracticeResult; value?: number } {
  const normalized = value.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(normalized)) return { result: "invalid" };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return { result: "invalid" };
  return Math.abs(parsed - 24 / 11) <= 0.03
    ? { result: "correct", value: parsed }
    : { result: "incorrect", value: parsed };
}
