import { expect, it } from "vitest";
import { at, inputContact, nodePort, simulateNetwork, STARTER_NETWORK, validateNetwork, type Network } from "./network";

it("exports a valid starter network with an ideal input switch and no component/R", () => {
  expect(validateNetwork(STARTER_NETWORK)).toEqual([]);
  expect(inputContact(STARTER_NETWORK)).toMatchObject({ from: 0, to: 2, switch: { closed: false } });
  expect(inputContact(STARTER_NETWORK)?.component).toBeUndefined();
  expect(inputContact(STARTER_NETWORK)?.resistanceOhm).toBeUndefined();
  expect(STARTER_NETWORK.load).toMatchObject({ kind: "r", value: 50 });
});

it("launches after the input switch closes and arrives at the matched load", () => {
  const contact = inputContact(STARTER_NETWORK)!;
  const model: Network = { ...structuredClone(STARTER_NETWORK), series: [{ ...contact, switch: { closed: false, atS: .001, closes: true } }] };
  const run = simulateNetwork(model);
  expect(at(run, 0, .0005).u).toBeCloseTo(0);
  expect(at(run, 0, .001).u).toBeCloseTo(50);
  expect(at(run, 500_000, .0034).u).toBeCloseTo(0);
  expect(at(run, 500_000, .0036).u).toBeCloseTo(50);
  expect(at(run, 500_000, .0036).i).toBeCloseTo(1);
});

it("removes line current from the source side after opening the input switch", () => {
  const contact = inputContact(STARTER_NETWORK)!;
  const model: Network = { ...structuredClone(STARTER_NETWORK), series: [{ ...contact, switch: { closed: true, atS: .008, closes: false } }] };
  const run = simulateNetwork(model);
  expect(at(run, 0, .0079).i).toBeCloseTo(1);
  expect(at(run, 0, .008).i).toBeCloseTo(0);
  expect(nodePort(run, 0, .008)).toEqual({u:100,intoLines:0});
  expect(at(run, 500_000, .007).i).toBeCloseTo(1);
  expect(at(run, 500_000, .011).i).toBeCloseTo(0);
});
