import { describe, expect, it } from "vitest";
import { newSequenceDocument, z } from "./contract";
import { nextSequenceEditId, readSequenceDocument, validateSequenceDocument } from "./document";

describe("sequence archive", () => {
  it("validates section order, reversible faults and stable edit IDs", () => {
    const input = { ...newSequenceDocument(), edits: [
      { id: "E1", kind: "shunt", area: "line", at: .3, phases: ["C", "A"], target: "ground", impedance: z() },
      { id: "E2", kind: "open", area: "load", at: .8, phases: ["B"] },
    ] };
    const loaded = readSequenceDocument(JSON.stringify(input));
    expect(loaded.edits.map(item => item.id)).toEqual(["E1", "E2"]);
    expect(loaded.edits[0].phases).toEqual(["A", "C"]);
    expect(nextSequenceEditId(loaded)).toBe("E3");
    expect(readSequenceDocument(JSON.stringify(loaded))).toEqual(loaded);
  });

  it("rejects non-finite inputs, self faults, duplicate IDs and unrecognised fields", () => {
    const input = newSequenceDocument();
    expect(() => validateSequenceDocument({ ...input, frequencyHz: Infinity })).toThrow("invalid-sequence-value");
    expect(() => validateSequenceDocument({ ...input, internal: true })).toThrow("invalid-sequence-archive");
    const short = { id: "X", kind: "shunt", impedance: z(), area: "line", at: 0, phases: ["A"], target: "A" };
    expect(() => validateSequenceDocument({ ...input, edits: [short] })).toThrow("invalid-sequence-fault");
    expect(() => validateSequenceDocument({ ...input, edits: [{ ...short, target: "B" }, { ...short, target: "C" }] }))
      .toThrow("duplicate-sequence-edit");
  });
});
