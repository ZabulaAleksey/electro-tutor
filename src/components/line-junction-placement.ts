import { visibleJunctionIds } from "../circuit/topology-junctions";
import type { Point, TopologyLayout } from "../circuit/topology-layout";
import type { CircuitTopology } from "../circuit/topology";

type JunctionMarker = Point & { id: string };
type Step = Point & { length: number; destination: Point };

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function stepToward(from: Point, to: Point | undefined): Step | undefined {
  if (!to) return;
  const x = to.x - from.x;
  const y = to.y - from.y;
  if (x !== 0 && y !== 0 || x === 0 && y === 0) return;
  return { x: Math.sign(x), y: Math.sign(y), length: Math.abs(x) + Math.abs(y), destination: to };
}

function routeFrom(points: readonly Point[], origin: Point): readonly Point[] {
  if (!points.length) return [];
  const ordered = samePoint(points[0], origin)
    ? points
    : samePoint(points[points.length - 1], origin) ? [...points].reverse() : [];
  return ordered.filter((point, index) => index === 0 || !samePoint(point, ordered[index - 1]));
}

/** Follow a common, directed wire prefix until the wires visibly separate. */
function departure(origin: Point, routes: readonly (readonly Point[])[]): Point {
  if (routes.length < 2) return origin;
  const cursors = routes.map(() => 1);
  let here = origin;
  let incoming: Step | undefined;
  for (;;) {
    const steps: Step[] = [];
    for (const [index, route] of routes.entries()) {
      const step = stepToward(here, route[cursors[index]]);
      if (!step) return origin;
      steps.push(step);
    }
    const direction = steps[0];
    if (steps.some(step => !samePoint(step, direction))) {
      if (!incoming) return origin;
      const rays = new Set(steps.map(step => step.x + "," + step.y));
      rays.add(-incoming.x + "," + -incoming.y);
      return rays.size >= 3 ? here : origin;
    }
    const nearest = steps.reduce((first, step) => step.length < first.length ? step : first);
    here = nearest.destination;
    steps.forEach((step, index) => {
      if (samePoint(step.destination, here)) cursors[index]++;
    });
    incoming = direction;
  }
}

/** Preserve graph-defined junctions, but paint joined rail routes at their visible fork. */
export function lineJunctionPlacements(
  topology: CircuitTopology,
  layout: Pick<TopologyLayout, "endpoints" | "wires">,
): JunctionMarker[] {
  const visible = visibleJunctionIds(topology);
  const byId = new Map(layout.wires.map(wire => [wire.id, wire.points]));
  const attached = new Map([...visible].map(id => [id, [] as Array<readonly Point[]>]));
  for (const wire of topology.wires) {
    for (const id of [wire.from, wire.to]) {
      const paths = attached.get(id);
      const point = layout.endpoints.get(id);
      if (paths && point) paths.push(routeFrom(byId.get(wire.id) ?? [], point));
    }
  }
  return [...attached].flatMap(([id, paths]) => {
    const origin = layout.endpoints.get(id);
    return origin ? [{ id, ...departure(origin, paths) }] : [];
  });
}
