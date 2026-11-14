import type { LaboratoryAdapter } from "../circuit/adapter";
import { netlist, type CircuitComponent } from "../circuit/topology";
import { DEFAULT_DIODE } from "./line-diode";
import { DEFAULT_NETWORK, MAX_SECTIONS, validateNetwork, type Contact, type Load, type ModelEvent, type Network, type Section } from "./network";

function numeric(component: CircuitComponent, name: string): number {
  const value = component.parameters[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error("invalid-line-parameter");
  return value;
}

type LoadEdge = { from: number; to: number; load: Load };
const property = { r: "ohm", l: "henry", c: "farad" } as const;

function isPassive(kind: string): kind is keyof typeof property {
  return Object.hasOwn(property, kind);
}

function contactFor(part: CircuitComponent, from: number, to: Contact["to"], reversed = false): Contact {
  const terminal = { id: part.id, from, to };
  switch (part.kind) {
    case "diode": return { ...terminal, component: { kind: "diode", diode: { ...DEFAULT_DIODE, reversed } } };
    case "switch": {
      const atS = part.parameters.atS;
      return { ...terminal, switch: {
        closed: part.parameters.closed === true,
        ...(typeof atS === "number" && atS > 0 ? { atS, closes: part.parameters.closes === true } : {}),
      } };
    }
    case "r": return { ...terminal, resistanceOhm: numeric(part, "ohm") };
    case "l": return { ...terminal, component: { kind: "l", value: numeric(part, "henry") } };
    case "c": return { ...terminal, component: { kind: "c", value: numeric(part, "farad") } };
    default: throw Error("unsupported-line-circuit");
  }
}

function terminalLoad(edges: LoadEdge[], output: number, reference: number, allocateId: () => string): Load {
  if (!edges.length) return { id: allocateId(), kind: "open" };
  const edgesByNode = (node: number) => edges.filter(edge => edge.from === node || edge.to === node);
  // Keep the leaf and its stable ID for all series/parallel reductions.
  while (edges.length > 1) {
    const parallel = edges.find(edge => edges.some(other => other !== edge &&
      (edge.from === other.from && edge.to === other.to || edge.from === other.to && edge.to === other.from)));
    if (parallel) {
      const group = edges.filter(edge => edge.from === parallel.from && edge.to === parallel.to ||
        edge.from === parallel.to && edge.to === parallel.from);
      edges = edges.filter(edge => !group.includes(edge));
      edges.push({ ...parallel, load: { id: allocateId(), kind: "parallel", children: group.map(edge => edge.load) } });
      continue;
    }
    const interior = [...new Set(edges.flatMap(edge => [edge.from, edge.to]))]
      .find(node => node !== output && node !== reference && edgesByNode(node).length === 2);
    if (interior === undefined) throw Error("unsupported-line-load");
    const group = edgesByNode(interior);
    const ends = group.map(edge => edge.from === interior ? edge.to : edge.from);
    if (ends[0] === ends[1]) throw Error("unsupported-line-load");
    edges = edges.filter(edge => !group.includes(edge));
    edges.push({ from: ends[0], to: ends[1], load: { id: allocateId(), kind: "series", children: group.map(edge => edge.load) } });
  }
  const { from, to, load } = edges[0];
  if (!(from === output && to === reference || from === reference && to === output)) throw Error("unsupported-line-load");
  return load;
}

export const transmissionCircuitAdapter: LaboratoryAdapter<Network> = {
  convert(topology) {
    const nets = netlist(topology);
    const membership = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
    const sources = topology.components.filter(item => item.kind === "voltage" || item.kind === "current");
    const lines = topology.components.filter(item => item.kind === "line");
    const devices = topology.components.filter(item => isPassive(item.kind) || item.kind === "diode" || item.kind === "switch");
    if (sources.length !== 1 || !lines.length || lines.length > MAX_SECTIONS || devices.length > 32 ||
        sources.length + lines.length + devices.length !== topology.components.length ||
        topology.components.some(item => item.terminals.length !== 2)) throw Error("unsupported-line-circuit");

    const terminals = (item: CircuitComponent) => item.terminals.map(id => membership.get(id)!);
    const source = sources[0];
    const [input, reference] = terminals(source);
    if (input === reference) throw Error("shorted-line-source");
    const nodeByNet = new Map([[input, 0]]);
    const sections: Section[] = [];
    const inline: (Contact & { to: number })[] = [];
    const inlineIds = new Set<string>();
    const extraNets = new Set<number>();
    let current = input;
    const remaining = new Set(lines);
    while (remaining.size) {
      let choices = [...remaining].filter(item => terminals(item).includes(current));
      if (!choices.length && sections.length) {
        const links = devices.filter(item => !inlineIds.has(item.id) && terminals(item).includes(current))
          .flatMap(item => {
            const [a, b] = terminals(item);
            const next = a === current ? b : a;
            return next !== reference && !nodeByNet.has(next) && !extraNets.has(next) &&
              [...remaining].some(line => terminals(line).includes(next)) ? [{ item, next, reversed: b === current }] : [];
          });
        if (links.length !== 1) throw Error("unsupported-line-chain");
        const { item, next, reversed } = links[0];
        const station = sections.length, extraNode = lines.length + station;
        inline.push({ ...contactFor(item, station, extraNode, reversed), to: extraNode });
        inlineIds.add(item.id);
        extraNets.add(next);
        current = next;
        choices = [...remaining].filter(line => terminals(line).includes(current));
      }
      if (choices.length !== 1) throw Error("unsupported-line-chain");
      const part = choices[0];
      const [a, b] = terminals(part);
      const next = a === current ? b : a;
      if (next === reference || nodeByNet.has(next) || extraNets.has(next)) throw Error("unsupported-line-chain");
      remaining.delete(part);
      sections.push({
        id: part.id,
        lengthM: numeric(part, "lengthM"),
        impedanceOhm: numeric(part, "impedanceOhm"),
        velocityMS: numeric(part, "velocityMS"),
        ...(Number(part.parameters.resistanceOhmM) > 0 ? { resistanceOhmM: numeric(part, "resistanceOhmM") } : {}),
      });
      nodeByNet.set(next, sections.length);
      current = next;
    }
    const connectedComponents = new Set(topology.components.flatMap(item => item.terminals));
    if (nets.some(net => !net.some(id => connectedComponents.has(id)))) throw Error("unattached-line-net");

    const ids = new Set(topology.components.map(item => item.id));
    let number = 1;
    const allocateId = () => {
      while (ids.has("equivalentLoad" + number)) number++;
      return "equivalentLoad" + number++;
    };
    const resultIds = new Map(sections.map(section => [section.id, section.id]));
    const branches: Contact[] = [];
    const loadEdges: LoadEdge[] = [];
    const events: ModelEvent[] = [];
    for (const part of devices) {
      resultIds.set(part.id, part.id);
      const changeAt = Number(part.parameters.changeAtS ?? 0);
      if (inlineIds.has(part.id)) {
        if (changeAt > 0) throw Error("unsupported-line-resistance-event");
        continue;
      }
      const [a, b] = terminals(part);
      if (extraNets.has(a) || extraNets.has(b)) throw Error("unsupported-series-node");
      if (a === b) throw Error("shorted-line-device");
      const kind = part.kind;
      const load: Load = kind === "switch" ? { id: part.id, kind: "switch", closed: part.parameters.closed === true } : isPassive(kind)
        ? { id: part.id, kind, value: numeric(part, property[kind]) }
        : { id: part.id, kind: "diode", diode: { ...DEFAULT_DIODE, reversed: a === reference } };
      const isEndLoad = (a === current && b === reference) || (b === current && a === reference);
      const from = nodeByNet.get(a), to = nodeByNet.get(b);
      if (!isEndLoad && (from !== undefined && (to !== undefined || b === reference) ||
          to !== undefined && a === reference)) {
        const flipped = from === undefined;
        const left = (flipped ? to : from)!;
        const right = flipped || b === reference ? "reference" : to!;
        if (load.kind === "switch" && right === "reference") throw Error("unsupported-line-switch");
        if (changeAt > 0) throw Error("unsupported-line-resistance-event");
        branches.push(contactFor(part, left, right, flipped));
      } else {
        if (load.kind === "switch") throw Error("unsupported-line-switch");
        const touchesIntermediate = [a, b].some(net => net !== current && nodeByNet.has(net));
        if (touchesIntermediate) throw Error("unsupported-line-load");
        if (kind === "r" && changeAt > 0) events.push({
          id: allocateId(), atS: changeAt, target: part.id, kind: "resistance", value: numeric(part, "nextOhm"),
        });
        loadEdges.push({ from: a, to: b, load });
      }
    }
    loadEdges.sort((a, b) => a.load.id.localeCompare(b.load.id));
    const onS = Number(source.parameters.onS ?? 0);
    const offS = Number(source.parameters.offS ?? 0);
    const latestEvent = Math.max(onS, offS, ...events.map(event => event.atS), ...[...inline, ...branches].map(link => link.switch?.atS ?? 0));
    const model: Network = {
      ...DEFAULT_NETWORK, durationS: Math.max(DEFAULT_NETWORK.durationS, latestEvent), sections, load: terminalLoad(loadEdges, current, reference, allocateId), events, shunts: [],
      source: {
        voltageV: source.kind === "current" ? 0 : numeric(source, "voltageV"),
        ...(source.kind === "current" ? { currentA: numeric(source, "currentA") } : {}),
        resistanceOhm: Number(source.parameters.resistanceOhm ?? 0), onS, node: 0,
        ...(offS > 0 ? { offS } : {}),
      },
      ...(inline.length ? { series: inline } : {}),
      ...(branches.length ? { branches } : {}),
    };
    const errors = validateNetwork(model);
    if (errors.length) throw Error(errors.join("; "));
    return { model, resultIds };
  },
};

/** The Worker exposes terminal voltage. For a purely resistive equivalent the
 * internal voltages follow directly; mixed reactances need solver state. */
export function resistiveLoadReadings(load: Load, voltage: number, events: readonly ModelEvent[] = [], time = 0): Map<string, { voltage: number; current: number }> {
  const values = new Map<string, { voltage: number; current: number }>();
  const overrides = new Map(events.filter(event => event.kind === "resistance" && event.atS <= time)
    .sort((a, b) => a.atS - b.atS).map(event => [event.target, event.value]));
  function resistance(item: Load): number | undefined {
    if (item.kind === "r") return overrides.get(item.id) ?? item.value;
    if (item.kind !== "parallel" && item.kind !== "series") return undefined;
    const legs = item.children!.map(resistance);
    if (legs.some(leg => leg === undefined || leg <= 0)) return undefined;
    if (item.kind === "series") return legs.reduce<number>((sum, leg) => sum + leg!, 0);
    return 1 / legs.reduce<number>((sum, leg) => sum + 1 / leg!, 0);
  }
  function visit(item: Load, u: number) {
    const equivalent = resistance(item);
    if (!equivalent) return;
    const i = u / equivalent;
    if (item.kind === "r") values.set(item.id, { voltage: u, current: i });
    for (const child of item.children ?? []) visit(child, item.kind === "series" ? resistance(child)! * i : u);
  }
  visit(load, voltage);
  return values;
}
