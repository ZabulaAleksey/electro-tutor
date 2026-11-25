import { expect, it } from "vitest";
import { newLcExperiment } from "../circuit/lc-experiment";
import { simplifyTopologyForView } from "../circuit/topology-equivalence";
import { clearTopologyDevices, restoreTopologyWire } from "../circuit/topology-operations";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { listTopologySlots, type TopologySlot } from "../circuit/topology-slots";
import { netlist } from "../circuit/topology";
import type { Circuit } from "../models/reactive-two-port";
import { layoutLineExperiment } from "./line-experiment-layout";
import { directTargets, distinctLcParallelSlots } from "./line-slot-targets";

type ParallelSlot = Extract<TopologySlot, { kind: "parallel" }>;
const terminals = ["P1:a", "P1:b"];
const inductor: Circuit = { kind: "l", value: 10 };
const capacitor: Circuit = { kind: "c", value: 100 };
const group: Circuit = { kind: "parallel", left: inductor, right: capacitor };

function choices(document: TopologyLabDocument) {
  const paths = listTopologySlots(document.topology, document.observedEndpoints).filter((slot): slot is ParallelSlot =>
    slot.kind === "parallel" && slot.side === "left" && !slot.componentIds.includes("P1"));
  const membership = new Map(netlist(document.topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  const targets = directTargets(document, layoutLineExperiment(document), paths, "", { terminals, membership });
  return { paths, membership, targets };
}

it("offers a single marker for each pair in two serial parallel LC groups", () => {
  const document = newLcExperiment({ kind: "series", left: group, right: group });
  const { targets, paths, membership } = choices(document);
  expect(paths).toHaveLength(4);
  expect(targets).toHaveLength(3);
  expect(new Set(targets.map(target => target.netPair)).size).toBe(3);
  expect(targets.filter(target => target.wholePort).map(target => target.slot.boundaries)).toEqual([terminals]);

  const [samePair] = distinctLcParallelSlots(paths.filter(slot => slot.componentIds.includes("C1") ||
    slot.componentIds.includes("L1")), membership);
  const reversed: ParallelSlot = { ...samePair, boundaries: [samePair.boundaries[1], samePair.boundaries[0]] };
  expect(distinctLcParallelSlots([samePair, reversed], membership)).toEqual([samePair]);
});

it("retains the external pair when long spans are filtered in a dense LC chain", () => {
  const chain = Array.from({ length: 7 }, (_, index) => index % 2 ? inductor : capacitor)
    .reduce<Circuit>((left, right) => ({ kind: "series", left, right }), inductor);
  const { targets, paths } = choices(newLcExperiment(chain));
  expect(paths.length).toBeGreaterThan(24);
  expect(targets.filter(target => target.wholePort).map(({ slot }) => slot.boundaries)).toEqual([terminals]);
});

it("offers the external pair for an empty port and omits it for a shorted port", () => {
  const document = newLcExperiment();
  const empty = clearTopologyDevices(document.topology, ["P1"]);
  expect(choices({ ...document, topology: empty }).targets.map(target => target.slot.boundaries)).toEqual([terminals]);
  const shorted = restoreTopologyWire(empty, { id: "W1", from: terminals[0], to: terminals[1] });
  expect(choices({ ...document, topology: shorted }).targets).toEqual([]);
});

it("keeps a saved parallel canvas editable while retaining the existing series fold", () => {
  const parallel = newLcExperiment({ kind: "parallel", left: inductor, right: inductor });
  const series = newLcExperiment({ kind: "series", left: inductor, right: inductor });
  const options = { preserveParallelGeometry: true };
  expect(simplifyTopologyForView(parallel.topology, parallel.observedEndpoints)).not.toBe(parallel.topology);
  expect(simplifyTopologyForView(parallel.topology, parallel.observedEndpoints, options)).toBe(parallel.topology);
  expect(simplifyTopologyForView(series.topology, series.observedEndpoints, options)).not.toBe(series.topology);
});
