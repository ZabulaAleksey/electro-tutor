import type { LaboratoryAdapter } from "../circuit/adapter";
import { netlist, type CircuitComponent, type CircuitTopology } from "../circuit/topology";
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

function reverseLoad(load: Load, polarity: Map<string, 1 | -1>): Load {
  const direction = polarity.get(load.id);
  if (direction !== undefined) polarity.set(load.id, direction === 1 ? -1 : 1);
  if (load.kind === "l" || load.kind === "c") return { ...load, ...(load.initial === undefined ? {} : { initial: -load.initial }) };
  if (load.kind === "diode") return { ...load, diode: { ...load.diode!, reversed: !load.diode!.reversed } };
  if (load.children) return { ...load, children: load.children.map(child => reverseLoad(child, polarity)) };
  return load;
}
function orientedLoad(edge: LoadEdge, from: number, to: number, polarity: Map<string, 1 | -1>): Load {
  return edge.from === from && edge.to === to ? edge.load : reverseLoad(edge.load, polarity);
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
    case "l": return { ...terminal, component: { kind: "l", value: numeric(part, "henry"), ...(typeof part.parameters.initial === "number" && part.parameters.initial !== 0 ? { initial: (reversed ? -1 : 1) * part.parameters.initial } : {}) } };
    case "c": return { ...terminal, component: { kind: "c", value: numeric(part, "farad"), ...(typeof part.parameters.initial === "number" && part.parameters.initial !== 0 ? { initial: (reversed ? -1 : 1) * part.parameters.initial } : {}) } };
    default: throw Error("unsupported-line-circuit");
  }
}

function terminalLoad(edges: LoadEdge[], output: number, reference: number, allocateId: () => string, polarity: Map<string, 1 | -1>): Load {
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
      edges.push({ ...parallel, load: { id: allocateId(), kind: "parallel", children: group.map(edge => orientedLoad(edge, parallel.from, parallel.to, polarity)) } });
      continue;
    }
    const interior = [...new Set(edges.flatMap(edge => [edge.from, edge.to]))]
      .find(node => node !== output && node !== reference && edgesByNode(node).length === 2);
    if (interior === undefined) throw Error("unsupported-line-load");
    const group = edgesByNode(interior);
    const ends = group.map(edge => edge.from === interior ? edge.to : edge.from);
    if (ends[0] === ends[1]) throw Error("unsupported-line-load");
    edges = edges.filter(edge => !group.includes(edge));
    edges.push({ from: ends[0], to: ends[1], load: { id: allocateId(), kind: "series", children: group.map(edge => {
      const first = edge.from === ends[0] || edge.to === ends[0];
      return orientedLoad(edge, first ? ends[0] : interior, first ? interior : ends[1], polarity);
    }) } });
  }
  const { from, to, load } = edges[0];
  if (!(from === output && to === reference || from === reference && to === output)) throw Error("unsupported-line-load");
  return from === output && to === reference ? load : reverseLoad(load, polarity);
}

function reachableNets(edges: readonly { from: number; to: number }[], start: number) {
  const reached = new Set([start]);
  for (const net of reached) {
    for (const { from, to } of edges) {
      if (from === net) reached.add(to);
      if (to === net) reached.add(from);
    }
  }
  return reached;
}

/** Unattached and single-ended limbs carry no terminal current. */
function connectedTerminalEdges(edges: LoadEdge[], output: number, outputReturn: number): LoadEdge[] {
  if (output === outputReturn) return [];
  const adjacent = new Map<number, LoadEdge[]>();
  for (const edge of edges) {
    for (const node of [edge.from, edge.to]) {
      const neighbors = adjacent.get(node) ?? [];
      neighbors.push(edge);
      adjacent.set(node, neighbors);
    }
  }

  // Keep exactly the blocks between the two terminals. An attached cycle can
  // have no leaves and still meet the rest of the graph at just one node.
  const discovered = new Map<number, number>();
  const pending: LoadEdge[] = [];
  const active = new Set<LoadEdge>();
  function visit(node: number, parent?: LoadEdge): { low: number; containsReturn: boolean } {
    const order = discovered.size;
    discovered.set(node, order);
    let low = order;
    let containsReturn = node === outputReturn;
    for (const edge of adjacent.get(node) ?? []) {
      if (edge === parent) continue;
      const neighbor = edge.from === node ? edge.to : edge.from;
      const previous = discovered.get(neighbor);
      if (previous !== undefined) {
        if (previous < order) {
          pending.push(edge);
          low = Math.min(low, previous);
        }
        continue;
      }
      pending.push(edge);
      const child = visit(neighbor, edge);
      low = Math.min(low, child.low);
      containsReturn ||= child.containsReturn;
      if (child.low >= order) {
        let member: LoadEdge;
        do {
          member = pending.pop()!;
          if (child.containsReturn) active.add(member);
        } while (member !== edge);
      }
    }
    return { low, containsReturn };
  }
  visit(output);
  return edges.filter(edge => active.has(edge));
}

export const transmissionCircuitAdapter = {
  convert(topology: CircuitTopology) {
    const nets = netlist(topology);
    const membership = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
    const sources = topology.components.filter(item => item.kind === "voltage" || item.kind === "current");
    const lines = topology.components.filter(item => item.kind === "line");
    const devices = topology.components.filter(item => isPassive(item.kind) || item.kind === "diode" || item.kind === "switch");
    const fourTerminal = lines.some(item => item.terminals.length === 4);
    if (sources.length !== 1 || !lines.length || lines.length > MAX_SECTIONS || devices.length > 32 ||
        sources.length + lines.length + devices.length !== topology.components.length ||
        lines.some(item => item.terminals.length !== (fourTerminal ? 4 : 2)) ||
        [...sources, ...devices].some(item => item.terminals.length !== 2)) throw Error("unsupported-line-circuit");

    const terminals = (item: CircuitComponent) => item.terminals.map(id => membership.get(id)!);
    const signalNets = (item: CircuitComponent) => terminals(item).slice(0, 2);
    const source = sources[0];
    const [input, reference] = terminals(source);
    if (input === reference) throw Error("shorted-line-source");
    const returnNets = new Set(lines.flatMap(item => terminals(item).slice(2)));
    returnNets.add(reference);
    if (returnNets.has(input)) throw Error("shorted-line-signal");
    const returnStations = new Set([reference]);
    let outputReturn = reference;
    let terminalShort = false;
    const nodeByNet = new Map([[input, 0]]);
    const sections: Section[] = [];
    const inline: (Contact & { to: number })[] = [];
    const inlineIds = new Set<string>();
    const extraNets = new Set<number>();
    const resultPolarity = new Map<string, 1 | -1>();
    let current = input;
    let foldedInputSwitchId: string | undefined;
    const remaining = new Set(lines);
    while (remaining.size) {
      let choices = [...remaining].filter(item => signalNets(item).includes(current));
      if (!choices.length) {
        const linksToLine = (node: number) => devices.filter(item => !inlineIds.has(item.id) && terminals(item).includes(node))
          .flatMap(item => {
            const [a, b] = terminals(item);
            const next = a === node ? b : a;
            return (fourTerminal || next !== reference) && !nodeByNet.has(next) && !extraNets.has(next) &&
              [...remaining].some(line => signalNets(line).includes(next)) ? [{ item, next, reversed: b === node }] : [];
          });
        let links = linksToLine(current);
        if (!links.length && fourTerminal && !sections.length && source.kind === "voltage" &&
            devices.every(item => item.kind !== "l" && item.kind !== "c" || !item.parameters.initial)) {
          const inputDevices = devices.filter(item => terminals(item).includes(current));
          const [key] = inputDevices;
          // A closed ideal key has zero drop. Keep the coil as a separate
          // dynamic contact; the experiment owns the timing of a cold closure.
          if (inputDevices.length === 1 && key.kind === "switch" && key.parameters.closed === true &&
              Number(key.parameters.contactOhm ?? 0) === 0 && Number(key.parameters.atS ?? 0) === 0) {
            const afterKey = terminals(key).find(node => node !== current);
            if (afterKey !== undefined && !returnNets.has(afterKey)) {
              const adjacent = devices.filter(item => terminals(item).includes(afterKey));
              const candidates = linksToLine(afterKey);
              if (adjacent.length === 2 && candidates.length === 1 && candidates[0].item.kind === "l") {
                foldedInputSwitchId = key.id;
                links = candidates;
              }
            }
          }
        }
        if (links.length !== 1) {
          if (fourTerminal && !sections.length && !links.length) {
            const deviceEdges = devices.map(item => {
              const [from, to] = terminals(item);
              return { from, to };
            }).filter(({ from, to }) => !returnNets.has(from) && !returnNets.has(to));
            const reached = reachableNets(deviceEdges, current);
            if (!lines.some(line => signalNets(line).some(node => reached.has(node)))) throw Error("open-line-source-signal");
          }
          throw Error("unsupported-line-chain");
        }
        const { item, next, reversed } = links[0];
        if (returnNets.has(next)) throw Error(fourTerminal ? "shorted-line-signal" : "unsupported-line-chain");
        const station = sections.length;
        if (station === 0 && !foldedInputSwitchId &&
            (item.kind !== "switch" || Number(item.parameters.contactOhm ?? 0) !== 0)) {
          throw Error("unsupported-line-input-contact");
        }
        const extraNode = station === 0 ? 2 * lines.length : lines.length + station;
        inline.push({ ...contactFor(item, station, extraNode, reversed), to: extraNode });
        inlineIds.add(item.id);
        resultPolarity.set(item.id, reversed ? -1 : 1);
        extraNets.add(next);
        current = next;
        choices = [...remaining].filter(line => signalNets(line).includes(current));
      }
      if (choices.length !== 1) throw Error("unsupported-line-chain");
      const part = choices[0];
      const [a, b, returnA, returnB] = terminals(part);
      const forward = a === current;
      const next = forward ? b : a;
      if (fourTerminal) {
        const [returnIn, returnOut] = forward ? [returnA, returnB] : [returnB, returnA];
        if (returnIn !== outputReturn) throw Error(sections.length ? "open-line-cascade-return" : "open-line-source-return");
        if (returnStations.has(returnOut)) throw Error("bypassed-line-return");
        returnStations.add(returnOut);
        outputReturn = returnOut;
        terminalShort = next === returnOut && remaining.size === 1;
        if (returnNets.has(current) || returnNets.has(next) && !terminalShort) throw Error("shorted-line-signal");
      }
      if (next === reference || nodeByNet.has(next) || extraNets.has(next)) throw Error("unsupported-line-chain");
      remaining.delete(part);
      sections.push({
        id: part.id,
        lengthM: numeric(part, "lengthM"),
        impedanceOhm: numeric(part, "impedanceOhm"),
        velocityMS: numeric(part, "velocityMS"),
        ...(Number(part.parameters.resistanceOhmM) > 0 ? { resistanceOhmM: numeric(part, "resistanceOhmM") } : {}),
      });
      resultPolarity.set(part.id, forward ? 1 : -1);
      if (!terminalShort) nodeByNet.set(next, sections.length);
      current = next;
    }
    const connectedComponents = new Set(topology.components.flatMap(item => item.terminals));
    if (!fourTerminal && nets.some(net => !net.some(id => connectedComponents.has(id)))) throw Error("unattached-line-net");

    const ids = new Set(topology.components.map(item => item.id));
    let number = 1;
    const allocateId = () => {
      while (ids.has("equivalentLoad" + number)) number++;
      return "equivalentLoad" + number++;
    };
    const resultIds = new Map(sections.map(section => [section.id, section.id]));
    const branches: Contact[] = [];
    const loadEdges: LoadEdge[] = [];
    let events: ModelEvent[] = [];
    const projectReference = (node: number) => returnNets.has(node) ? reference : node;
    const forgetInactivePart = (part: { id: string; initial?: number }) => {
      if (part.initial) throw Error("inconsistent-initial-state:" + part.id);
      resultIds.delete(part.id);
      resultPolarity.delete(part.id);
    };
    for (const part of devices) {
      if (part.id === foldedInputSwitchId) continue;
      resultIds.set(part.id, part.id);
      const changeAt = Number(part.parameters.changeAtS ?? 0);
      if (inlineIds.has(part.id)) {
        if (changeAt > 0) throw Error("unsupported-line-resistance-event");
        continue;
      }
      resultPolarity.set(part.id, 1);
      const [rawA, rawB] = terminals(part);
      const a = projectReference(rawA), b = projectReference(rawB);
      if (extraNets.has(a) || extraNets.has(b)) throw Error("unsupported-series-node");
      if (a === b) {
        if (!terminalShort || rawA !== current || rawB !== current) throw Error("shorted-line-device");
        forgetInactivePart({ id: part.id, initial: Number(part.parameters.initial ?? 0) });
        continue;
      }
      const kind = part.kind;
      const load: Load = kind === "switch" ? { id: part.id, kind: "switch", closed: part.parameters.closed === true } : isPassive(kind)
        ? { id: part.id, kind, value: numeric(part, property[kind]), ...(typeof part.parameters.initial === "number" && part.parameters.initial !== 0 ? { initial: part.parameters.initial } : {}) }
        : { id: part.id, kind: "diode", diode: { ...DEFAULT_DIODE, reversed: false } };
      const isEndLoad = !terminalShort && ((a === current && b === reference) || (b === current && a === reference));
      const from = nodeByNet.get(a), to = nodeByNet.get(b);
      if (!isEndLoad && (from !== undefined && (to !== undefined || b === reference) ||
          to !== undefined && a === reference)) {
        const flipped = from === undefined;
        const left = (flipped ? to : from)!;
        const right = flipped || b === reference ? "reference" : to!;
        if (load.kind === "switch" && right === "reference") throw Error("unsupported-line-switch");
        if (changeAt > 0) throw Error("unsupported-line-resistance-event");
        resultPolarity.set(part.id, flipped ? -1 : 1);
        branches.push(contactFor(part, left, right, flipped));
      } else {
        if (!fourTerminal && load.kind === "switch") throw Error("unsupported-line-switch");
        const touchesIntermediate = [a, b].some(net => net !== current && nodeByNet.has(net));
        if (touchesIntermediate) throw Error("unsupported-line-load");
        if (kind === "r" && changeAt > 0) events.push({
          id: allocateId(), atS: changeAt, target: part.id, kind: "resistance", value: numeric(part, "nextOhm"),
        });
        // The physical load must reach the final return terminal. Keeping its
        // raw nets here detects an external return routed past the line port.
        loadEdges.push({ from: rawA, to: rawB, load });
      }
    }
    if (fourTerminal && [...reachableNets(loadEdges, current)].some(node => node !== outputReturn && returnNets.has(node))) {
      throw Error("bypassed-line-return");
    }
    const connected = fourTerminal ? connectedTerminalEdges(loadEdges, current, outputReturn) : loadEdges;
    if (fourTerminal) {
      const active = new Set(connected.map(({ load }) => load.id));
      for (const { load } of loadEdges) if (!active.has(load.id)) forgetInactivePart(load);
      events = events.filter(event => active.has(event.target));
      if (connected.some(({ load }) => load.kind === "switch")) throw Error("unsupported-line-switch");
    }
    connected.sort((a, b) => a.load.id.localeCompare(b.load.id));
    const load = terminalShort ? { id: allocateId(), kind: "wire" } as const
      : terminalLoad(connected, current, outputReturn, allocateId, resultPolarity);
    const onS = Number(source.parameters.onS ?? 0);
    const offS = Number(source.parameters.offS ?? 0);
    const latestEvent = Math.max(onS, offS, ...events.map(event => event.atS), ...[...inline, ...branches].map(link => link.switch?.atS ?? 0));
    const model: Network = {
      ...DEFAULT_NETWORK, durationS: Math.max(DEFAULT_NETWORK.durationS, latestEvent), sections, load, events, shunts: [],
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
    return { model, resultIds, resultPolarity, foldedInputSwitchId };
  },
} satisfies LaboratoryAdapter<Network>;

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
