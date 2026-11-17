import { powerBranchEndpoints, readPowerNetwork, type PowerBranch, type PowerCalculationCut, type PowerIsland, type PowerNetwork, type PowerStudy } from "./network";

type IslandMembers = { busIds: string[]; branchIds: string[]; sourceIds: string[]; loadIds: string[] };

function inServiceBranches(physical: PowerNetwork): PowerBranch[] {
  return physical.elements.filter((item): item is PowerBranch => {
    if (item.kind === "switch") return item.closed;
    return (item.kind === "line" || item.kind === "transformer") && item.inService;
  });
}

function islandsOf(physical: PowerNetwork): PowerIsland[] {
  const branches = inServiceBranches(physical);
  const adjacent = new Map(physical.buses.map(bus => [bus.id, [] as string[]]));
  for (const branch of branches) {
    const [a, b] = powerBranchEndpoints(branch);
    adjacent.get(a)!.push(b);
    adjacent.get(b)!.push(a);
  }

  const owner = new Map<string, IslandMembers>();
  const groups: IslandMembers[] = [];
  for (const bus of physical.buses) {
    if (owner.has(bus.id)) continue;
    const group: IslandMembers = { busIds: [bus.id], branchIds: [], sourceIds: [], loadIds: [] };
    groups.push(group);
    owner.set(bus.id, group);
    for (const current of group.busIds) {
      for (const neighbor of adjacent.get(current)!) {
        if (owner.has(neighbor)) continue;
        owner.set(neighbor, group);
        group.busIds.push(neighbor);
      }
    }
  }
  for (const branch of branches) owner.get(powerBranchEndpoints(branch)[0])!.branchIds.push(branch.id);
  for (const element of physical.elements) {
    if (element.kind === "source" && element.inService) owner.get(element.busId)!.sourceIds.push(element.id);
    if (element.kind === "load" && element.inService) owner.get(element.busId)!.loadIds.push(element.id);
  }
  return groups.map(group => ({
    ...group,
    energized: group.sourceIds.length > 0,
    topology: !group.branchIds.length ? "isolated" : group.branchIds.length >= group.busIds.length ? "meshed" : "radial",
  }));
}

function readCuts(physical: PowerNetwork, cuts: readonly PowerCalculationCut[]): PowerCalculationCut[] {
  const buses = new Set(physical.buses.map(bus => bus.id));
  const used = new Set<string>();
  return cuts.map(cut => {
    if (!buses.has(cut.busId) || (cut.quantity !== "p" && cut.quantity !== "q")) throw Error("power-invalid-calculation-cut");
    const key = cut.busId + ":" + cut.quantity;
    if (used.has(key)) throw Error("power-duplicate-calculation-cut:" + key);
    used.add(key);
    return { busId: cut.busId, quantity: cut.quantity };
  });
}

/** Electrical reachability is derived only from physical equipment and its operating state. */
export function createPowerStudy(input: unknown, calculationCuts: readonly PowerCalculationCut[] = []): PowerStudy {
  const physical = readPowerNetwork(input);
  return { physical, islands: islandsOf(physical), calculationCuts: readCuts(physical, calculationCuts) };
}
