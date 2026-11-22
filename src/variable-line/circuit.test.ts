import { expect, it } from "vitest";
import { TopologySession, type TopologyLabDocument } from "../circuit/topology-session";
import { newVariableLineCircuit, removeVariableLineResistor, setVariableLineResistance,
  variableLineBoundaries, variableLineSeriesWires } from "./circuit";

function insertResistor(document: TopologyLabDocument, wireId: string) {
  const session = new TopologySession(JSON.stringify(document));
  const slot = session.listSlots().find(slot => slot.kind === "series" && slot.wireId === wireId);
  if (!slot) throw Error("fixture-slot");
  session.apply({ type: "insert", slot, component: {
    id: "R3", kind: "r", terminals: ["R3:a", "R3:b"], parameters: { ohm: 25 },
  } });
  return session.document;
}

it("derives boundaries from the chosen on-schematic lead independently of storage order", () => {
  const starter = newVariableLineCircuit();
  expect(variableLineSeriesWires(starter)).toEqual(["W1", "W2", "W3"]);
  for (const id of ["W1", "W2"]) {
    expect(variableLineBoundaries(insertResistor(starter, id))).toEqual({ sourceOhms: 75, loadOhms: 50 });
  }
  const inserted = insertResistor(starter, "W3");
  expect(variableLineBoundaries(inserted)).toEqual({ sourceOhms: 50, loadOhms: 75 });
  expect(variableLineBoundaries(setVariableLineResistance(inserted, "R3", 40))).toEqual({ sourceOhms: 50, loadOhms: 90 });
  expect(removeVariableLineResistor(inserted, "TL1")).toBe(inserted);
  expect(removeVariableLineResistor(inserted, "R3")).toEqual(starter);
});
