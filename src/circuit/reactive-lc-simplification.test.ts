import { expect, it } from "vitest";
import { parallelInductorsDocument } from "../../tests/fixtures/lc-graphs";
import { parseCircuit } from "./document";
import { reactiveLcMode } from "./reactive-lc-mode";
import { simplifyReactiveDocument } from "./reactive-lc-simplification";
import { reactance } from "../models/reactive-two-port";

it("reduces parallel inductors exactly even when their equivalent lies between nominal ticks", () => {
  const document = parallelInductorsDocument();
  const reduced = simplifyReactiveDocument(document);
  expect(reduced.steps).toHaveLength(1);
  expect(reduced.steps[0]).toMatchObject({ members: ["L1", "L2"], connection: "parallel" });
  expect(reduced.branches).toHaveLength(1);
  const [branch] = reduced.branches;
  expect(branch.valueSI).toBeCloseTo(2e-6 / 3, 15);
  expect(new Set([branch.firstNode, branch.secondNode])).toEqual(new Set(["P1:a", "P1:b"]));
  if (reduced.result.kind !== "finite") throw Error("Expected a finite port");
  expect(reduced.result.impedance).toEqual({ numerator: [0n, 1n], denominator: [1500n] });
  expect(reactance(reduced.result.impedance, 1e6)).toBeCloseTo(2 / 3, 12);
  expect(parseCircuit(document).drawing.topology.components.map(part => part.id)).toEqual(["P1", "L1", "L2"]);
});

it("retains all branches and the exact impedance of the asymmetric bridge", () => {
  const document = reactiveLcMode.createDefaultDocument();
  const reduced = simplifyReactiveDocument(document);
  expect(reduced.steps).toEqual([]);
  expect(reduced.branches.length).toBe(5);
  expect(reduced.result).toEqual(reactiveLcMode.readModel(document));
});
