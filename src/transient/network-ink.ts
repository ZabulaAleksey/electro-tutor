import { readInk, type Ink, type SketchKind } from "../engineering/handwriting";
import { findLoad, validateNetwork, type Load, type Network } from "./network";
import { contactKind, replaceLoad, type DetachedPart } from "./network-edit";

export type InkTarget = { kind: "line" | "contact" | "detached" | "load"; id: string } | { kind: "source" };
export type InkLink = { target: InkTarget; kind: SketchKind };

const passive = ["wire", "r", "l", "c", "switch"] as const;
type Passive = typeof passive[number];
const isPassive = (kind: SketchKind): kind is Passive => (passive as readonly string[]).includes(kind);

export function targetKind(target: InkTarget, model: Network, detached: DetachedPart[], empty: boolean): SketchKind | undefined {
  if (target.kind === "detached") {
    const kind = detached.find(part => part.id === target.id)?.kind;
    return kind === "diode" ? undefined : kind;
  }
  if (empty) return undefined;
  if (target.kind === "line") return model.sections.some(section=>section.id===target.id) ? "line" : undefined;
  if (target.kind === "source") return model.source.currentA === undefined ? "source" : "current";
  if (target.kind === "contact") {
    const contact = [...model.series??[],...model.branches??[]].find(item=>item.id===target.id);
    const kind = contact && contactKind(contact);
    return kind === "diode" ? undefined : kind;
  }
  const load = findLoad(model.load,target.id);
  return load && (passive as readonly string[]).includes(load.kind) ? load.kind as Passive : undefined;
}

export function linkMatches(link: InkLink, model: Network, detached: DetachedPart[], empty: boolean) {
  if (link.kind === "ground" && link.target.kind !== "load") return false;
  return targetKind(link.target,model,detached,empty) === (link.kind === "ground" ? "wire" : link.kind);
}

export function sameInkTarget(a: InkTarget, b: InkTarget) {
  return a.kind === b.kind && (a.kind === "source" || b.kind !== "source" && a.id === b.id);
}

export function readInkDocument(rawInk: unknown, rawLinks: unknown, model: Network, detached: DetachedPart[], empty: boolean) {
  const ink: Ink[] = [];
  const links: unknown[] = [];
  if (Array.isArray(rawInk)) rawInk.slice(0,20).forEach((group,index)=>{
    const [mark] = readInk([group]);
    if (!mark) return;
    ink.push(mark);
    links.push(Array.isArray(rawLinks) ? rawLinks[index] : null);
  });
  return {ink,links:readInkLinks(links,ink,model,detached,empty)};
}

export function readInkLinks(input: unknown, ink: Ink[], model: Network, detached: DetachedPart[], empty: boolean): (InkLink | null)[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return ink.map((_, index) => {
    const candidate = input[index];
    if (!candidate || typeof candidate !== "object" || !candidate.target || typeof candidate.kind !== "string") return null;
    const { kind, id } = candidate.target;
    if (kind !== "source" && (!["line","contact","detached","load"].includes(kind) || typeof id !== "string")) return null;
    const target: InkTarget = kind === "source" ? {kind} : {kind,id};
    const link: InkLink = {target,kind:candidate.kind};
    const key=JSON.stringify(target);
    if(seen.has(key)||!linkMatches(link,model,detached,empty))return null;
    seen.add(key);
    return link;
  });
}

export function correctionKinds(link: InkLink): SketchKind[] {
  if (link.target.kind === "line") return ["line"];
  if (link.target.kind === "source") return ["source","current"];
  if (link.target.kind === "detached" && !isPassive(link.kind)) return [link.kind];
  return link.kind === "ground" ? ["ground","wire","r","l","c","switch"] : [...passive];
}

function newLoad(id: string, kind: Passive, before: Load): Load {
  switch(kind){
    case "r": return {id,kind,value:100};
    case "l": return {id,kind,value:.02};
    case "c": return {id,kind,value:1e-5};
    case "switch": return {id,kind,closed:false,children:[before.kind==="wire"?{id:id+"-wire",kind:"wire"}:{...before,id:id+"-part"}]};
    case "wire": return {id,kind};
  }
}

export function correctInkTarget(model: Network, detached: DetachedPart[], link: InkLink, kind: SketchKind, empty: boolean) {
  if (!linkMatches(link,model,detached,empty) || !correctionKinds(link).includes(kind)) return null;
  const target=link.target;
  const electricalKind=kind==="ground"?"wire":kind;
  if(targetKind(target,model,detached,empty)===electricalKind)return {model,detached};
  if(target.kind==="detached"&&isPassive(electricalKind)){
    const part=detached.find(part=>part.id===target.id);
    if (part?.template?.switch && part.template.resistanceOhm !== undefined) return null;
    return {model,detached:detached.map(part=>part.id===target.id?{...part,kind:electricalKind,template:undefined}:part)};
  }
  let next: Network;
  if(target.kind==="source"){
    const source=model.source;
    next={...model,source:{...source,voltageV:kind==="source"?100:0,currentA:kind==="current"?1:undefined,resistanceOhm:0}};
  }else if(target.kind==="contact"&&isPassive(electricalKind)){
    const original=[...model.series??[],...model.branches??[]].find(contact=>contact.id===target.id);
    if (original?.switch && original.resistanceOhm !== undefined) return null;
    const kind=electricalKind;
    const update = <T extends NetworkContact>(contact: T): T => {
      if(contact.id!==target.id)return contact;
      return {...contact,resistanceOhm:kind==="r"||kind==="switch"&&contact.to==="reference"?100:undefined,
        switch:kind==="switch"?{closed:false}:undefined,
        component:kind==="l"||kind==="c"?{kind,value:kind==="l"?.02:1e-5}:undefined};
    };
    next={...model,series:model.series?.map(update),branches:model.branches?.map(update)};
  }else if(target.kind==="load"&&isPassive(electricalKind)){
    const load=findLoad(model.load,target.id)!;
    if(load.children && electricalKind!=="switch")return null;
    if(model.events.some(event=>event.target===target.id))return null;
    next={...model,load:replaceLoad(model.load,target.id,newLoad(target.id,electricalKind,load))};
  }else return null;
  return validateNetwork(next).length ? null : {model:next,detached};
}

type NetworkContact = NonNullable<Network["branches"]>[number];
