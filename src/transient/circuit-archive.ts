import { emptyDrawing, parts, type Drawing, type PartKind } from "../circuit/drawing";
import { addComponent, addJunction, connect, netlist, type CircuitComponent, type Parameter } from "../circuit/topology";
import { clearGeometry, routeDrawing } from "../circuit/routing";
import type { Layout } from "./NetworkEditor";
import type { DetachedPart, Selection } from "./network-edit";
import { DEFAULT_DIODE, type DiodeParameters } from "./line-diode";
import { validateNetwork, type Contact, type Load, type ModelEvent, type Network, type Section } from "./network";

const adapterId = "transmission-line";
type Pins = readonly [string, string];
type LoadShape = Pick<Load, "id" | "kind"> & { children?: LoadShape[] };
type LineBinding = {
  version: 1;
  source: string;
  sections: string[];
  series?: string[];
  branches?: string[];
  shunts: string[];
  load: LoadShape;
  durationS: number;
  events: ModelEvent[];
  pins: Record<string, Pins>;
  reference: string;
  nodes: string[];
  detached: string[];
};

const valueKeys = { r: "ohm", l: "henry", c: "farad" } as const;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error("invalid-archive-binding");
  return value;
};
function idList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(validId) || new Set(value).size !== value.length) {
    throw Error("invalid-archive-binding");
  }
  return value;
}
function loadShape(value: unknown, depth = 0): LoadShape {
  if (depth > 6 || !record(value) || !validId(value.id) ||
      typeof value.kind !== "string" || !["r", "l", "c", "wire", "open", "series", "parallel", "switch", "diode"].includes(value.kind)) {
    throw Error("invalid-archive-binding");
  }
  if (value.children !== undefined && (!Array.isArray(value.children) || value.children.length > 32)) {
    throw Error("invalid-archive-binding");
  }
  return { id: value.id, kind: value.kind as Load["kind"],
    ...(value.children ? { children: (value.children as unknown[]).map(child => loadShape(child, depth + 1)) } : {}) };
}

function contactParameters(contact: Contact): [PartKind, Record<string, Parameter>] {
  if (contact.component?.kind === "diode") return ["diode", { ...contact.component.diode }];
  if (contact.component) {
    const { kind, value, initial } = contact.component;
    return [kind, { [valueKeys[kind]]: value, ...(initial === undefined ? {} : { initial }) }];
  }
  if (contact.switch) {
    return ["switch", { ...contact.switch, ...(contact.resistanceOhm === undefined ? {} : { contactOhm: contact.resistanceOhm }) }];
  }
  return contact.resistanceOhm === undefined ? ["bridge", {}] : ["r", { ohm: contact.resistanceOhm }];
}

export function networkToCircuit(model: Network, layout: Layout = {}, detached: DetachedPart[] = []): Drawing {
  const errors = validateNetwork(model);
  if (errors.length) throw Error(errors.join("; "));
  let drawing = emptyDrawing();
  const occupied = new Set<string>();
  function reserveLoad(item: Load) {
    occupied.add(item.id);
    item.children?.forEach(reserveLoad);
  }
  reserveLoad(model.load);
  for (const item of detached) occupied.add(item.id);
  for (const part of [...model.sections, ...model.series ?? [], ...model.branches ?? []]) occupied.add(part.id);
  let serial = 0;
  const newId = (prefix: string) => {
    let id: string;
    do { id = prefix + ++serial; } while (occupied.has(id));
    occupied.add(id);
    return id;
  };
  function junction() {
    const id = newId("junction");
    drawing = { ...drawing, topology: addJunction(drawing.topology, id) };
    return id;
  }
  const source = newId("source");
  const count = model.sections.length;
  const reference = junction();
  const nodes = Array.from({ length: count * 2 }, junction);
  const pins: Record<string, Pins> = Object.create(null);

  function part(id: string, kind: PartKind, parameters: Record<string, Parameter>, from: string, to: string) {
    const terminals = [id + ":a", id + ":b"];
    drawing = { ...drawing, topology: addComponent(drawing.topology, { id, kind, terminals, parameters }) };
    pins[id] = [from, to];
    const first = connect(drawing.topology, newId("conductor"), from, terminals[0]);
    drawing = { ...drawing, topology: connect(first, newId("conductor"), terminals[1], to) };
  }

  const { voltageV, currentA, resistanceOhm, onS, offS, node } = model.source;
  part(source, currentA === undefined ? "voltage" : "current", {
    ...(currentA === undefined ? { voltageV, resistanceOhm } : { currentA }), onS,
    ...(offS === undefined ? {} : { offS }),
  }, nodes[node], reference);

  model.sections.forEach(({ id, ...parameters }, i) => {
    const from = model.series?.some(contact => contact.from === i) ? count + i : i;
    part(id, "line", parameters, nodes[from], nodes[i + 1]);
  });
  for (const link of [...model.series ?? [], ...model.branches ?? []]) {
    const [kind, parameters] = contactParameters(link);
    part(link.id, kind, parameters, nodes[link.from], link.to === "reference" ? reference : nodes[link.to]);
  }
  const shunts = model.shunts.map(shunt => {
    const id = newId("shunt");
    part(id, "r", { ohm: shunt.resistanceOhm }, nodes[shunt.node], reference);
    return id;
  });

  function projectLoad(load: Load, from: string, to: string): LoadShape {
    const shape: LoadShape = { id: load.id, kind: load.kind };
    if (load.kind === "series") {
      let left = from;
      shape.children = load.children!.map((child, i, children) => {
        const right = i === children.length - 1 ? to : junction();
        const projected = projectLoad(child, left, right);
        left = right;
        return projected;
      });
    } else if (load.kind === "parallel") {
      shape.children = load.children!.map(child => projectLoad(child, from, to));
    } else if (load.kind === "switch") {
      const intermediate = junction();
      part(load.id, "switch", load.closed === undefined ? {} : { closed: load.closed }, from, intermediate);
      shape.children = [projectLoad(load.children![0], intermediate, to)];
    } else if (load.kind === "diode") {
      part(load.id, "diode", { ...load.diode! }, from, to);
    } else if (load.kind === "wire" || load.kind === "open") {
      part(load.id, load.kind === "wire" ? "bridge" : "open", {}, from, to);
    } else {
      part(load.id, load.kind, { [valueKeys[load.kind]]: load.value!,
        ...(load.initial === undefined ? {} : { initial: load.initial }) }, from, to);
    }
    return shape;
  }
  const load = projectLoad(model.load, nodes[count], reference);
  for (const item of detached) {
    const [kind, parameters] = item.template
      ? contactParameters({ id: item.id, from: 0, to: 1, ...item.template })
      : [item.kind === "source" ? "voltage" : item.kind === "wire" ? "bridge" : item.kind, undefined] as const;
    drawing = { ...drawing, topology: addComponent(drawing.topology, {
      id: item.id, kind, terminals: [item.id + ":a", item.id + ":b"], parameters: parameters ?? parts[kind].parameters,
    }) };
  }
  const positions: Drawing["positions"] = Object.create(null);
  const junctionPositions: Drawing["junctionPositions"] = Object.create(null);
  drawing.topology.components.forEach(({ id }, i) => {
    positions[id] = { x: 150 + i % 4 * 130, y: 120 + Math.floor(i / 4) * 118, rotation: 0 };
  });
  drawing.topology.junctions.forEach((id, i) => { junctionPositions[id] = { x: 80, y: 60 + 24 * i }; });
  const data: LineBinding = { version: 1, source, sections: model.sections.map(part => part.id),
    ...(model.series ? { series: model.series.map(part => part.id) } : {}),
    ...(model.branches ? { branches: model.branches.map(part => part.id) } : {}),
    shunts, load, durationS: model.durationS, events: structuredClone(model.events), pins, reference, nodes, detached: detached.map(item => item.id) };
  const base: Drawing = { ...drawing, positions, junctionPositions,
    board: { width: 670, height: Math.max(360, (drawing.topology.junctions.length - 1) * 24 + 110,
      170 + Math.floor((drawing.topology.components.length - 1) / 4) * 118) },
    extension: { adapter: adapterId, data },
  };
  if (!Object.keys(layout).length && !detached.length) return base;

  // Preserve archived offsets/angles in board coordinates. If the old board
  // used tighter clearances, retain the precise original layout in the archive.
  const moved = { ...base, positions: { ...positions } };
  function offset(id: string, key: string, yBase = 82) {
    const position = positions[id];
    if (!position) return;
    const plain = key.replace(/^@/, "");
    const x = layout[key === "@load" ? "@load-x" : "@x-" + plain];
    const y = layout[key];
    const rotation = layout["@rot-" + plain];
    const span = layout["@span-" + id];
    moved.positions[id] = {
      ...position, x: position.x + (x === undefined ? 0 : x - (key === "@load" ? 82 : 0)),
      y: position.y + (y === undefined ? 0 : y - yBase),
      rotation: rotation === undefined ? position.rotation : (Math.round(rotation / 90) * 90 % 360 + 360) % 360,
      ...(span && span >= 30 && span <= 200 ? { span: 2 * span } : {}),
    };
  }
  for (const section of model.sections) offset(section.id, section.id, 84);
  offset(source, "@source");
  for (const contact of [...model.series ?? [], ...model.branches ?? []]) offset(contact.id, "@contact-" + contact.id);
  model.shunts.forEach((shunt, i) => offset(shunts[i], "@shunt-" + shunt.node));
  const locateLoad = (item: LoadShape, root = false) => {
    offset(item.id, root ? "@load" : "@load-" + item.id);
    item.children?.forEach(child => locateLoad(child));
  };
  locateLoad(load, true);
  for (const item of detached) moved.positions[item.id] = { x: item.x, y: item.y, rotation: item.rotation ?? 0 };
  const coords = Object.values(moved.positions);
  const inside = coords.every(p => p.x >= 40 && p.x <= moved.board!.width - 40 && p.y >= 40 && p.y <= moved.board!.height - 40);
  return inside && clearGeometry(moved) && !routeDrawing(moved).unrouted.length ? moved : base;
}

function diode(part: CircuitComponent): DiodeParameters {
  const { saturationA, ideality, reversed } = part.parameters;
  if (typeof reversed !== "boolean") throw Error("invalid-archive-binding");
  return { ...DEFAULT_DIODE, saturationA: number(saturationA), ideality: number(ideality), reversed };
}

function readContact(part: CircuitComponent, from: number, to: Contact["to"]): Contact {
  const link = { id: part.id, from, to };
  const parameters = part.parameters;
  switch (part.kind) {
    case "bridge": return link;
    case "r": return { ...link, resistanceOhm: number(parameters.ohm) };
    case "l":
    case "c": return { ...link, component: {
      kind: part.kind, value: number(parameters[valueKeys[part.kind]]),
      ...(parameters.initial === undefined ? {} : { initial: number(parameters.initial) }),
    } };
    case "diode": return { ...link, component: { kind: "diode", diode: diode(part) } };
    case "switch": {
      const { closed, closes, atS, contactOhm } = parameters;
      if (typeof closed !== "boolean" || (atS !== undefined && typeof closes !== "boolean")) throw Error("invalid-archive-binding");
      return { ...link, switch: { closed, ...(atS === undefined ? {} : { atS: number(atS), closes: closes as boolean }) },
        ...(contactOhm === undefined ? {} : { resistanceOhm: number(contactOhm) }) };
    }
    default: throw Error("invalid-archive-binding");
  }
}

export function isArchivedCircuit(drawing: Drawing): boolean {
  return drawing.extension?.adapter === adapterId;
}

export function circuitToArchivedNetwork(drawing: Drawing): Network {
  const data = drawing.extension?.data;
  if (!isArchivedCircuit(drawing) || !record(data) || data.version !== 1 || !record(data.pins) ||
      !validId(data.source) || !validId(data.reference) || !Array.isArray(data.events) || data.events.length > 64) {
    throw Error("invalid-archive-binding");
  }
  const sections = idList(data.sections, 6);
  const nodes = idList(data.nodes, 12);
  if (data.detached !== undefined) idList(data.detached, 64);
  const series = data.series === undefined ? undefined : idList(data.series, 5);
  const branches = data.branches === undefined ? undefined : idList(data.branches, 12);
  const shunts = idList(data.shunts, 7);
  const pins = data.pins;
  if (Object.keys(pins).length > 64) throw Error("invalid-archive-binding");
  const junctions = new Set(drawing.topology.junctions);
  if (nodes.length !== sections.length * 2 || !junctions.has(data.reference) ||
      nodes.includes(data.reference) || nodes.some(node => !junctions.has(node))) throw Error("invalid-archive-binding");
  const nets = new Map(netlist(drawing.topology).flatMap((net, i) => net.map(id => [id, i] as const)));
  const anchors = [...new Set([data.reference, ...nodes, ...Object.values(pins).flatMap(pair => idList(pair, 2))])];
  if (anchors.some(anchor => !junctions.has(anchor)) || new Set(anchors.map(anchor => nets.get(anchor))).size !== anchors.length) {
    throw Error("archive-merged-nodes");
  }
  const components = new Map(drawing.topology.components.map(part => [part.id, part]));
  const used = new Set<string>();
  function partById(id: string, keepPins = true): CircuitComponent {
    const part = components.get(id);
    const expected = idList(pins[id], 2);
    if (!part || used.has(id) || part.terminals.length !== 2 || expected.length !== 2) throw Error("archive-disconnected");
    if (keepPins && part.terminals.some((pin, i) => nets.get(pin) !== nets.get(expected[i]))) throw Error("archive-disconnected");
    used.add(id);
    return part;
  }
  function portNode(pin: string): number | "reference" {
    if (nets.get(pin) === nets.get(dataReference)) return "reference";
    const index = nodes.findIndex(node => nets.get(node) === nets.get(pin));
    if (index < 0) throw Error("archive-disconnected");
    return index;
  }
  const dataReference = data.reference;
  const source = partById(data.source, false);
  const [sourceNode, ground] = source.terminals.map(portNode);
  if (sourceNode === "reference" || ground !== "reference" ||
      (source.kind !== "current" && source.kind !== "voltage")) throw Error("archive-disconnected");
  const sourceParameters = source.parameters;

  function readLoad(shape: LoadShape): Load {
    if (shape.kind === "series" || shape.kind === "parallel") {
      return { ...shape, children: shape.children?.map(readLoad) };
    }
    const part = partById(shape.id);
    const p = part.parameters;
    if (part.kind !== (shape.kind === "wire" ? "bridge" : shape.kind)) throw Error("invalid-archive-binding");
    if (shape.kind === "switch") {
      if (p.closed !== undefined && typeof p.closed !== "boolean") throw Error("invalid-archive-binding");
      return { ...shape, ...(p.closed === undefined ? {} : { closed: p.closed as boolean }), children: shape.children?.map(readLoad) };
    }
    if (shape.kind === "diode") return { ...shape, diode: diode(part) };
    if (shape.kind === "wire" || shape.kind === "open") return { ...shape };
    return { ...shape, value: number(p[valueKeys[shape.kind]]), ...(p.initial === undefined ? {} : { initial: number(p.initial) }) };
  }

  function readLink(id: string, inline: boolean): Contact {
    const part = partById(id, inline);
    const [from, to] = part.terminals.map(portNode);
    if (from === "reference") throw Error("archive-disconnected");
    return readContact(part, from, to);
  }
  const model: Network = {
    source: {
      voltageV: source.kind === "current" ? 0 : number(sourceParameters.voltageV),
      ...(source.kind === "current" ? { currentA: number(sourceParameters.currentA) } : {}),
      resistanceOhm: number(sourceParameters.resistanceOhm ?? 0), node: sourceNode, onS: number(sourceParameters.onS ?? 0),
      ...(sourceParameters.offS === undefined ? {} : { offS: number(sourceParameters.offS) }),
    },
    sections: sections.map(id => {
      const part = partById(id);
      if (part.kind !== "line") throw Error("invalid-archive-binding");
      const p = part.parameters;
      const section: Section = { id, impedanceOhm: number(p.impedanceOhm), velocityMS: number(p.velocityMS), lengthM: number(p.lengthM) };
      if (p.resistanceOhmM !== undefined) section.resistanceOhmM = number(p.resistanceOhmM);
      return section;
    }),
    load: readLoad(loadShape(data.load)),
    durationS: number(data.durationS), events: structuredClone(data.events) as ModelEvent[],
    shunts: shunts.map(id => {
      const part = partById(id, false);
      const [node, to] = part.terminals.map(portNode);
      if (node === "reference" || to !== "reference" || part.kind !== "r") throw Error("archive-disconnected");
      return { node, resistanceOhm: number(part.parameters.ohm) };
    }),
    ...(series ? { series: series.map(id => readLink(id, true) as Contact & { to: number }) } : {}),
    ...(branches ? { branches: branches.map(id => readLink(id, false)) } : {}),
  };
  const terminalsOnWires = new Set(drawing.topology.wires.flatMap(wire => [wire.from, wire.to]));
  if ([...components.values()].some(part => !used.has(part.id) && part.terminals.some(pin => terminalsOnWires.has(pin)))) {
    throw Error("archive-unbound-component");
  }
  const errors = validateNetwork(model);
  if (errors.length) throw Error(errors.join("; "));
  // Lab binding is untrusted JSON. Re-derive the expected terminal groups from
  // the decoded model and reject any binding that disagrees with actual nets.
  const canonical = networkToCircuit(model);
  const selectedTerminalNets = (topology: Drawing["topology"], ids: Set<string>) => {
    const pins = new Set(topology.components.filter(part => ids.has(part.id)).flatMap(part => part.terminals));
    return netlist(topology).map(net => net.filter(id => pins.has(id))).filter(net => net.length).sort((a, b) => a[0].localeCompare(b[0]));
  };
  const actual = selectedTerminalNets(drawing.topology, used);
  const projected = selectedTerminalNets(canonical.topology, new Set(canonical.topology.components.map(part => part.id)));
  const newSource = (canonical.extension!.data as LineBinding).source;
  const canonicalShunts = (canonical.extension!.data as LineBinding).shunts;
  const idMap = new Map([[newSource, data.source], ...canonicalShunts.map((id, i) => [id, shunts[i]] as const)]);
  const renamed = projected.map(net => net.map(pin => {
    const id = pin.slice(0, -2);
    return (idMap.get(id) ?? id) + pin.slice(-2);
  }).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  if (JSON.stringify(actual) !== JSON.stringify(renamed)) throw Error("archive-disconnected");
  return model;
}

/** Inspector selection follows the archive's stable identities. */
export function archivedSelection(drawing: Drawing, id: string): Selection | null {
  if (!isArchivedCircuit(drawing)) return null;
  const binding = drawing.extension!.data as LineBinding;
  if (id === binding.source) return { kind: "source" };
  if (binding.sections.includes(id)) return { kind: "line", id };
  if ([...binding.series ?? [], ...binding.branches ?? []].includes(id)) return { kind: "contact", id };
  if (binding.shunts.includes(id)) {
    const [node] = binding.pins[id];
    return { kind: "shunt", node: binding.nodes.indexOf(node) };
  }
  if (binding.detached?.includes(id)) return { kind: "detached", id };
  return Object.hasOwn(binding.pins, id) ? { kind: "load", id } : null;
}

export function archivedAnchors(drawing: Drawing): { signal: readonly string[]; reference: string } | null {
  if (!isArchivedCircuit(drawing)) return null;
  const binding = drawing.extension!.data as LineBinding;
  if (!Array.isArray(binding.nodes) || !Array.isArray(binding.sections)) return null;
  return { signal: binding.nodes.slice(0, binding.sections.length + 1), reference: binding.reference };
}

export function preserveArchivedPositions(next: Drawing, before: Drawing): Drawing {
  const positions = Object.fromEntries(Object.entries(next.positions).map(([id, position]) => [id, before.positions[id] ?? position]));
  const moved = { ...next, positions, board: {
    width: Math.max(next.board!.width, before.board?.width ?? 0),
    height: Math.max(next.board!.height, before.board?.height ?? 0),
  } };
  return clearGeometry(moved) && !routeDrawing(moved).unrouted.length ? moved : next;
}
