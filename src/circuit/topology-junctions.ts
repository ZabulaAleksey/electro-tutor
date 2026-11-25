import type { CircuitTopology, ElementId } from "./topology";

/** Render branch points from explicit wire incidence, independently of routing. */
export function visibleJunctionIds(topology: CircuitTopology): ReadonlySet<ElementId> {
  const wireCounts = new Map<ElementId, number>();
  for (const { from, to } of topology.wires) {
    wireCounts.set(from, (wireCounts.get(from) ?? 0) + 1);
    wireCounts.set(to, (wireCounts.get(to) ?? 0) + 1);
  }

  const visible = new Set(topology.junctions.filter(id => (wireCounts.get(id) ?? 0) >= 3));
  for (const { kind, terminals } of topology.components) {
    if (kind === "port") continue;
    // The component lead contributes the third segment at an attached terminal.
    for (const terminal of terminals) {
      if ((wireCounts.get(terminal) ?? 0) >= 2) visible.add(terminal);
    }
  }
  return visible;
}
