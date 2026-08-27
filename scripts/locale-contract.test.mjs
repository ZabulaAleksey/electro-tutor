import { describe, expect, it } from "vitest";
import { validateLocaleCatalogs } from "./locale-contract.mjs";

const valid = { ru: { action: "Открыть", nested: { unit: "А" } }, uk: { action: "Відкрити", nested: { unit: "А" } } };

describe("locale catalog build contract", () => {
  it("accepts paired translations and declared invariants", () => {
    expect(validateLocaleCatalogs(valid, new Set(["nested.unit"]))).toEqual([]);
  });

  it("rejects missing and extra keys", () => {
    const errors = validateLocaleCatalogs({ ru: { one: "один" }, uk: { two: "два" } });
    expect(errors).toContain("uk: missing key one");
    expect(errors).toContain("uk: extra key two");
  });

  it("rejects empty and unapproved identical values", () => {
    const errors = validateLocaleCatalogs({ ru: { empty: "", same: "Text" }, uk: { empty: "", same: "Text" } });
    expect(errors).toContain("ru: empty/non-string key empty");
    expect(errors).toContain("uk: empty/non-string key empty");
    expect(errors.some((error) => error.startsWith("untranslated key same"))).toBe(true);
  });
});
