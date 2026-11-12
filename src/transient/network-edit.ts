import { boundaries, DEFAULT_NETWORK, findLoad, MAX_SECTIONS, validateNetwork, type Load, type Network } from "./network";
export function replaceLoad(root:Load,id:string,next:Load):Load{return root.id===id?next:{...root,children:root.children?.map(c=>replaceLoad(c,id,next))};}
export function removeLoad(root: Load, id: string): Load {
  if (root.id === id) return { id: root.id, kind: "open" };
  if (!root.children) return root;
  const children = root.children.filter(child => child.id !== id).map(child => removeLoad(child, id));
  return children.length ? { ...root, children } : { id: root.id, kind: "open" };
}
export function sectionBoundaries(c:Network){return boundaries(c).slice(1,-1).map((x,j)=>({x,label:`${c.sections[j].id} | ${c.sections[j+1].id}`}));}


export type Selection =
  | { kind: "line"; id: string }
  | { kind: "source" }
  | { kind: "load" }
  | { kind: "shunt"; node: number };

export type Tool =
  | "line" | "shunt" | "matched" | "r" | "l" | "c" | "open" | "wire"
  | { move: Extract<Selection, { kind: "line" | "shunt" }> | { kind: "source" } };

export type Position = { kind: "node" | "span" | "end"; index: number };
type Edit = { model: Network; selection: Selection };
export type Placement = Position & { edit: Edit | null; error?: string };

function uniqueSectionId(model: Network) {
  let index = 1;
  while (model.sections.some(section => section.id === `TL${index}`) || findLoad(model.load, `TL${index}`)) index++;
  return `TL${index}`;
}

export function appendSection(model: Network): Edit {
  const section = { ...DEFAULT_NETWORK.sections[0], id: uniqueSectionId(model) };
  return { model: { ...model, sections: [...model.sections, section] }, selection: { kind: "line", id: section.id } };
}

export function removeSection(model: Network, index: number) {
  if (index < 0 || index >= model.sections.length || model.sections.length <= 1) return { error: "last-line" } as const;
  const left = index, right = index + 1;
  const occupied = (node: number) => model.shunts.some(shunt => shunt.node === node);
  if (occupied(left) && occupied(right)) return { error: "merge-shunts" } as const;
  const remap = (node: number) => node >= right ? node - 1 : node;
  const next = {
    ...model,
    sections: model.sections.filter((_, i) => i !== index),
    source: { ...model.source, node: remap(model.source.node) },
    shunts: model.shunts.map(shunt => ({ ...shunt, node: remap(shunt.node) })),
  };
  const error = validateNetwork(next).join("; ");
  if (error) return { error } as const;
  return {
    model: next,
    confirm: model.source.node === right || occupied(right) || right === model.sections.length && model.load.kind !== "open",
  };
}

export function loadReplacement(model: Network, load: Load): Network {
  return {
    ...model,
    load,
    events: model.events.filter(event => {
      const before = findLoad(model.load, event.target);
      const after = findLoad(load, event.target);
      return before && after && before.kind === after.kind &&
        before.value === after.value && before.closed === after.closed;
    }),
  };
}

function candidate(model: Network, tool: Tool, position: Position): Edit {
  const { index, kind } = position;
  if (typeof tool === "object") {
    const { move } = tool;
    if (move.kind === "source") return { model: { ...model, source: { ...model.source, node: index } }, selection: move };
    if (move.kind === "line") {
      const sections = [...model.sections];
      const from = sections.findIndex(section => section.id === move.id);
      const [section] = sections.splice(from, 1);
      sections.splice(index, 0, section);
      return { model: { ...model, sections }, selection: move };
    }
    return {
      model: { ...model, shunts: model.shunts.map(shunt => shunt.node === move.node ? { ...shunt, node: index } : shunt) },
      selection: { kind: "shunt", node: index },
    };
  }
  if (tool === "line") return appendSection(model);
  if (tool === "shunt") {
    if (kind === "node") return {
      model: { ...model, shunts: [...model.shunts, { node: index, resistanceOhm: 100 }] },
      selection: { kind: "shunt", node: index },
    };
    const sections = [...model.sections];
    const section = sections[index];
    const half = { ...section, lengthM: section.lengthM / 2 };
    sections.splice(index, 1, half, { ...half, id: uniqueSectionId(model) });
    const remap = (node: number) => node > index ? node + 1 : node;
    return {
      model: {
        ...model, sections, source: { ...model.source, node: remap(model.source.node) },
        shunts: [...model.shunts.map(shunt => ({ ...shunt, node: remap(shunt.node) })), { node: index + 1, resistanceOhm: 100 }],
      },
      selection: { kind: "shunt", node: index + 1 },
    };
  }
  const value = tool === "matched" ? model.sections.at(-1)!.impedanceOhm : { r: 50, l: .02, c: 1e-5, open: undefined, wire: undefined }[tool];
  const load = { id: model.load.id, kind: tool === "matched" ? "r" as const : tool, value };
  return { model: loadReplacement(model, load), selection: { kind: "load" } };
}

export function placementTargets(model: Network, tool: Tool): Placement[] {
  const nodes: Position[] = Array.from({ length: model.sections.length + 1 }, (_, index) => ({ kind: "node", index }));
  const spans: Position[] = model.sections.map((_, index) => ({ kind: "span", index }));
  const end: Position = { kind: "end", index: model.sections.length };
  return [...nodes, ...spans, end].map(position => {
    const { kind, index } = position;
    let error: string | undefined;
    if (typeof tool === "object") {
      const { move } = tool;
      if (move.kind === "line" && (kind !== "span" || model.sections[index]?.id === move.id)) error = "choose-line";
      if (move.kind === "source" && (kind !== "node" || index === model.source.node)) error = "choose-node";
      if (move.kind === "shunt" && (kind !== "node" || model.shunts.some(shunt => shunt.node === index))) error = "free-node";
    } else if (tool === "shunt") {
      if (kind === "end" || kind === "node" && model.shunts.some(shunt => shunt.node === index)) error = "free-node";
      if (kind === "span" && model.sections.length >= MAX_SECTIONS) error = "section-limit";
      if (kind === "span" && model.sections[index].lengthM < .002) error = "short-section";
    } else if (kind !== "end") error = "choose-end";
    if (tool === "line" && kind === "end" && model.sections.length >= MAX_SECTIONS) error = "section-limit";
    if (error) return { ...position, error, edit: null };
    const edit = candidate(model, tool, position);
    error = validateNetwork(edit.model).join("; ");
    return { ...position, error: error || undefined, edit: error ? null : edit };
  });
}
