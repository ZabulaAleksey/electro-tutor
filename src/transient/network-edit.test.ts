import { describe, expect, it } from "vitest";
import { DEFAULT_NETWORK, MAX_SECTIONS, at, simulateNetwork, validateNetwork } from "./network";
import { appendSection, placementTargets, removeSection } from "./network-edit";

describe("visual network operations", () => {
  it("splits a section without moving existing connections or changing total delay", () => {
    const model = { ...DEFAULT_NETWORK, source: { ...DEFAULT_NETWORK.source, node: 1 }, shunts: [{ node: 1, resistanceOhm: 75 }] };
    const targets = placementTargets(model, "shunt");
    expect(targets.find(p => p.kind === "node" && p.index === 1)?.edit).toBeNull();
    const next = targets.find(p => p.kind === "span")!.edit!.model;
    expect(next.sections.map(s => [s.lengthM, s.impedanceOhm, s.velocityMS])).toEqual([[500000, 50, 2e8], [500000, 50, 2e8]]);
    expect(next.source.node).toBe(2);
    expect(next.shunts).toEqual([{ node: 2, resistanceOhm: 75 }, { node: 1, resistanceOhm: 100 }]);
    expect(validateNetwork(next)).toEqual([]);
  });

  it("uses the last section impedance for matched termination and calculates the transmitted step", () => {
    const model = appendSection(DEFAULT_NETWORK).model;
    model.sections[1] = { ...model.sections[1], impedanceOhm: 70 };
    const targets = placementTargets(model, "matched");
    expect(targets.filter(p => p.edit).map(p => p.kind)).toEqual(["end"]);
    const next = targets.find(p => p.edit)!.edit!.model;
    expect(next.load).toMatchObject({ kind: "r", value: 70 });
    expect(at(simulateNetwork(next), 2e6, .011).u).toBeCloseTo(100 * 140 / 120);
  });

  it("rejects terminal shorts at an energized ideal source and observes the solver section limit", () => {
    const model = { ...DEFAULT_NETWORK, source: { ...DEFAULT_NETWORK.source, node: 1 } };
    expect(placementTargets(model, "wire").at(-1)).toMatchObject({ edit: null, error: "inconsistent-ideal-source-and-short" });
    let full = model;
    while (full.sections.length < MAX_SECTIONS) full = appendSection(full).model;
    expect(placementTargets(full, "line").at(-1)).toMatchObject({ edit: null, error: "section-limit" });
    expect(placementTargets(full, "shunt").find(p => p.kind === "span")).toMatchObject({ edit: null, error: "section-limit" });
  });

  it("preserves existing attachments on removal and refuses to merge two shunts", () => {
    const model = appendSection(DEFAULT_NETWORK).model;
    model.source = { ...model.source, node: 1 };
    model.shunts = [{ node: 0, resistanceOhm: 20 }, { node: 1, resistanceOhm: 30 }];
    expect(removeSection(model, 0)).toEqual({ error: "merge-shunts" });
    model.shunts = model.shunts.slice(1);
    expect(removeSection(model, 0)).toMatchObject({ confirm: true, model: { source: { node: 0 }, shunts: [{ node: 0, resistanceOhm: 30 }] } });
  });
});
