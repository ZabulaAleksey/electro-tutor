import { describe, expect, it } from "vitest";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "./document";
import { emptyDrawing, placeComponent, wireDrawing } from "./drawing";
import { deriveEquivalent } from "./equivalent-circuit";

function two(kind: "r" | "l" | "c", parameters: Record<string, number>) {
  let drawing = placeComponent(emptyDrawing(), kind, { x: 120, y: 180 });
  drawing = placeComponent(drawing, kind, { x: 320, y: 180 });
  drawing = wireDrawing(drawing, "R1:b".replace("R", kind === "r" ? "R" : kind === "l" ? "L" : "C"), `${kind === "r" ? "R" : kind === "l" ? "L" : "C"}2:a`);
  drawing = { ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(component => ({ ...component, parameters: { ...component.parameters, ...parameters } })) } };
  return drawing;
}

describe("equivalent circuit view", () => {
  it("builds a routed transient reduction without changing the source", () => {
    const source = two("l", { henry: 0.01, initial: 2 });
    const before = structuredClone(source);
    const result = deriveEquivalent(source, "transient-line");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routing.unrouted).toEqual([]);
    expect(source).toEqual(before);
    expect(parseCircuit(result.document).drawing.topology.components).toHaveLength(1);
    expect(result.provenance[0].members).toHaveLength(2);
  });

  it("uses zero-state only for the steady model", () => {
    const source = two("l", { henry: 0.01, initial: 1 });
    const mismatched = { ...source, topology: { ...source.topology, components: source.topology.components.map((part, index) =>
      index === 1 ? { ...part, parameters: { ...part.parameters, initial: 2 } } : part) } };
    const transient = deriveEquivalent(mismatched, "transient-line");
    expect(transient).toMatchObject({ ok: false, reason: "reduction-conflict" });
    const steady = deriveEquivalent(mismatched, "steady-line");
    expect(steady).toMatchObject({ ok: true, mode: "steady" });
    expect(source.topology.components.every(component => component.parameters.initial === 1)).toBe(true);
  });

  it("rejects mutual coupling and unsupported modes without rendering", () => {
    const source = two("r", { ohm: 10 });
    expect(deriveEquivalent(source, "transient-line", true)).toMatchObject({ ok: false, reason: "mutual-coupling-unsupported" });
    expect(deriveEquivalent(source, "power-system")).toMatchObject({ ok: false, reason: "unsupported-mode" });
  });

  it("does not claim an identity graph is an equivalent", () => {
    const source = placeComponent(emptyDrawing(), "r", { x: 180, y: 180 });
    expect(deriveEquivalent(source, "transient-line")).toMatchObject({ ok: false, reason: "no-reduction" });
  });

  it("keeps a reduced document compatible with the historic file format", () => {
    const source = two("r", { ohm: 10 });
    const result = deriveEquivalent(source, "transient-line");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const document = serializeCircuit(result.drawing, defaultCircuitSettings);
    expect(parseCircuit(document).routing.unrouted).toEqual([]);
  });

  it("preserves capacitor series reciprocal reduction and provenance", () => {
    let source = two("c", { farad: 2 });
    source = { ...source, topology: { ...source.topology, components: source.topology.components.map((part, index) =>
      ({ ...part, parameters: { ...part.parameters, farad: index ? 3 : 2 } })) } };
    const result = deriveEquivalent(source, "free");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const component = result.drawing.topology.components[0];
    expect(component.parameters.farad).toBeCloseTo(1.2, 12);
    expect(result.provenance[0].members?.map(member => member.id)).toEqual(["C1", "C2"]);
  });
});
