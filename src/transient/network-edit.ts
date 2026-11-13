import { DEFAULT_DIODE } from "./line-diode";
import { boundaries, DEFAULT_NETWORK, findLoad, MAX_SECTIONS, validBranchComponent, validateNetwork, type BranchComponent, type Contact, type Load, type Network } from "./network";
export function replaceLoad(root:Load,id:string,next:Load):Load{return root.id===id?next:{...root,children:root.children?.map(c=>replaceLoad(c,id,next))};}
export function removeLoad(root: Load, id: string): Load {
  if (root.id === id) return { id: root.id, kind: "open" };
  if (!root.children) return root;
  const children = root.children.filter(child => child.id !== id).map(child => removeLoad(child, id));
  return children.length ? { ...root, children } : { id: root.id, kind: "open" };
}
export function sectionBoundaries(c:Network){return boundaries(c).slice(1,-1).map((x,j)=>({x,label:`${c.sections[j].id} | ${c.sections[j+1].id}`}));}


export type PalettePart = "line" | "wire" | "r" | "l" | "c" | "diode" | "source" | "switch";
export type DetachedPart = {id:string; kind:PalettePart; x:number; y:number; rotation?:number; template?:Pick<Contact,"resistanceOhm"|"component"|"switch">};
const partKinds:readonly PalettePart[] = ["line","wire","r","l","c","diode","source","switch"];
export function readDetached(input:unknown):DetachedPart[]{
 if(!Array.isArray(input))return [];
 const seen=new Set<string>();
 return input.filter((part):part is DetachedPart=>{
  if(!part||typeof part.id!=="string"||!/^draft-[1-9][0-9]{0,8}$/.test(part.id)||seen.has(part.id)||
    !partKinds.includes(part.kind)||!Number.isFinite(part.x)||!Number.isFinite(part.y)||
    Math.abs(part.x)>1e6||Math.abs(part.y)>1e6||part.rotation!==undefined&&![0,90,180,270].includes(part.rotation))return false;
  if(part.template!==undefined){
   if(!part.template||typeof part.template!=="object"||Object.keys(part.template).some(key=>!["resistanceOhm","component","switch"].includes(key)))return false;
   const {resistanceOhm,component,switch:sw}=part.template;
   if(resistanceOhm!==undefined&&(!Number.isFinite(resistanceOhm)||resistanceOhm<0||resistanceOhm>1e9)||
     component!==undefined&&(!component||component.kind!==part.kind||!validBranchComponent(component))||
     sw!==undefined&&(!sw||part.kind!=="switch"||typeof sw.closed!=="boolean"||
       sw.atS!==undefined&&(!Number.isFinite(sw.atS)||sw.atS<0||sw.atS>10||typeof sw.closes!=="boolean")))return false;
  }
  seen.add(part.id);
  return true;
 });
}
export type Selection =
  | { kind: "detached"; id: string }
  | { kind: "line"; id: string }
  | { kind: "source" }
  | { kind: "load"; id?: string }
  | { kind: "contact"; id: string }
  | { kind: "shunt"; node: number };

export type Tool =
  | "line" | "shunt" | "matched" | "r" | "l" | "c" | "open" | "wire" | "switch" | "source" | "diode"
  | { bridgeFrom: number; id?: string; part?: TwoTerminal; wire?: boolean; template?:DetachedPart['template'] }
  | { install:DetachedPart }
  | { relocate: string }
  | { moveLoad: string }
  | { move: Extract<Selection, { kind: "line" | "shunt" }> | { kind: "source" } };

export type Position = { kind: "node" | "span" | "end" | "joint" | "branch" | "branch-span" | "branch-key" | "wire-insert"; index: number };
type Edit = { model: Network; selection: Selection };
export type Placement = Position & { edit: Edit | null; error?: string };

function uniqueSectionId(model: Network) {
  return newElementId(model,"TL");
}

export function appendSection(model: Network): Edit {
  const section = { ...DEFAULT_NETWORK.sections[0], id: uniqueSectionId(model) };
  return { model: { ...model, sections: [...model.sections, section], series: model.series?.map(contact=>({...contact,to:contact.to+1})) }, selection: { kind: "line", id: section.id } };
}

export function removeSection(model: Network, index: number) {
  if (index < 0 || index >= model.sections.length || model.sections.length <= 1) return { error: "last-line" } as const;
  const left = index, right = index + 1;
  const occupied = (node: number) => model.shunts.some(shunt => shunt.node === node);
  if (occupied(left) && occupied(right)) return { error: "merge-shunts" } as const;
  if (model.series?.some(contact => contact.from === left || contact.from === right) ||
      model.branches?.some(contact => [left,right].includes(contact.from) || contact.to !== "reference" && [left,right].includes(contact.to))) {
    return { error: "attached-contacts" } as const;
  }
  const remap = (node: number) => node >= right ? node - 1 : node;
  const next = {
    ...model,
    sections: model.sections.filter((_, i) => i !== index),
    source: { ...model.source, node: remap(model.source.node) },
    shunts: model.shunts.map(shunt => ({ ...shunt, node: remap(shunt.node) })),
    series: model.series?.map(contact => ({ ...contact, from: remap(contact.from), to: model.sections.length-1+remap(contact.from) })),
    branches: model.branches?.map(contact => ({ ...contact, from: remap(contact.from), to: contact.to === "reference" ? contact.to : remap(contact.to) })),
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

export function newElementId(model: Network, prefix: string) {
 let index=1;
 const used=(id:string)=>model.sections.some(s=>s.id===id)||findLoad(model.load,id)||
  model.series?.some(x=>x.id===id)||model.branches?.some(x=>x.id===id);
 while(used(prefix+index))index++;
 return prefix+index;
}

export function splitSection(model: Network, index: number) {
 const section=model.sections[index],half={...section,lengthM:section.lengthM/2},sections=[...model.sections];
 sections.splice(index,1,half,{...half,id:uniqueSectionId(model)});
 const remap=(node:number)=>node>index?node+1:node;
 return {...model,sections,source:{...model.source,node:remap(model.source.node)},
  shunts:model.shunts.map(shunt=>({...shunt,node:remap(shunt.node)})),
  series:model.series?.map(contact=>({...contact,from:remap(contact.from),to:sections.length+remap(contact.from)})),
  branches:model.branches?.map(contact=>({...contact,from:remap(contact.from),to:contact.to==="reference"?contact.to:remap(contact.to)}))};
}

type TwoTerminal = "r" | "l" | "c" | "diode" | "switch" | "wire";
export const isTwoTerminal=(tool:Tool):tool is TwoTerminal=>
 tool==="r"||tool==="l"||tool==="c"||tool==="diode"||tool==="switch"||tool==="wire";
export const contactKind=(link:Contact):TwoTerminal=>link.component?.kind??(link.switch?"switch":link.resistanceOhm===undefined?"wire":"r");
const prefixes:Record<TwoTerminal,string>={r:"R",l:"L",c:"C",diode:"VD",switch:"K",wire:"W"};
function newContact(model:Network,tool:TwoTerminal,inline:boolean):Contact{
 const component:BranchComponent|undefined=tool==="l"||tool==="c"?{kind:tool,value:tool==="l"?.02:1e-5}:
   tool==="diode"?{kind:tool,diode:{...DEFAULT_DIODE}}:undefined;
 return {id:newElementId(model,prefixes[tool]),from:0,to:"reference",component,
  resistanceOhm:tool==="r"||tool==="switch"&&!inline?100:undefined,switch:tool==="switch"?{closed:false}:undefined};
}
function contactPlacement(model: Network, tool: TwoTerminal, position: Position, existing?: Contact): Edit {
 const inline=position.kind==="joint"||position.kind==="span";
 const split=position.kind==="span"||position.kind==="branch-span";
 const next=split?splitSection(model,position.index):model;
 const from=position.index+Number(split);
 const contact=existing??newContact(model,tool,inline);
 const id=contact.id;
 if(position.kind==="end"){
  const load:Load={id,kind:tool,value:contact.resistanceOhm,...contact.component};
  return {model:loadReplacement(model,load),selection:{kind:"load"}};
 }
 if(inline)return {model:{...next,series:[...next.series??[],{...contact,from,to:next.sections.length+from}]},selection:{kind:"contact",id}};
 const resistanceOhm=tool==="switch"?contact.resistanceOhm??100:contact.resistanceOhm;
 return {model:{...next,branches:[...next.branches??[],{...contact,from,to:"reference",resistanceOhm}]},selection:{kind:"contact",id}};
}

function candidate(model: Network, tool: Tool, position: Position): Edit {
  const { index, kind } = position;
  if (typeof tool === "object") {
    if ("bridgeFrom" in tool) {
      const existing=[...model.series??[],...model.branches??[]].find(link=>link.id===tool.id);
      const contact=existing??{...newContact(model,tool.part??(tool.wire?"wire":"r"),true),...tool.template};
      const branch={...contact,from:tool.bridgeFrom,to:index};
      return {model:{...model,series:model.series?.filter(link=>link.id!==contact.id),
        branches:[...(model.branches??[]).filter(link=>link.id!==contact.id),branch]},selection:{kind:"contact",id:contact.id}};
    }
    if("install" in tool){
      const {kind,template}=tool.install;
      if(isTwoTerminal(kind)&&template){
        const before=position.kind==="wire-insert"?model.branches?.[position.index]:undefined;
        const contact={...newContact(model,kind,position.kind==="joint"||position.kind==="span"),...template};
        if(before)return {model:{...model,branches:model.branches!.map(link=>link===before?{...contact,from:link.from,to:link.to}:link)},
          selection:{kind:"contact",id:contact.id}};
        return contactPlacement(model,kind,position,contact);
      }
      return candidate(model,kind,position);
    }
    if("moveLoad" in tool){
      const load=findLoad(model.load,tool.moveLoad)!;
      const base=loadReplacement(model,removeLoad(model.load,load.id));
      const kind=load.kind as TwoTerminal;
      const id=newElementId(model,prefixes[kind]);
      const component:BranchComponent|undefined=kind==="l"||kind==="c"?{kind,value:load.value!,initial:load.initial}:
        kind==="diode"?{kind,diode:load.diode!}:undefined;
      return contactPlacement(base,kind,position,{id,from:0,to:"reference",component,resistanceOhm:kind==="r"?load.value:undefined});
    }
    if ("relocate" in tool) {
      const existing=[...model.series??[],...model.branches??[]].find(link=>link.id===tool.relocate)!;
      const base={...model,series:model.series?.filter(link=>link.id!==existing.id),branches:model.branches?.filter(link=>link.id!==existing.id)};
      return contactPlacement(base,contactKind(existing),position,existing);
    }
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
  if (tool === "source") return {model:{...model,source:{...model.source,node:index}},selection:{kind:"source"}};
  if(isTwoTerminal(tool)&&kind==="wire-insert"){
    const bridge=model.branches![index];
    const part=newContact(model,tool,true);
    return {model:{...model,branches:model.branches!.map((link,i)=>i===index?{...part,from:bridge.from,to:bridge.to}:link)},selection:{kind:"contact",id:part.id}};
  }
  if (tool==="switch" && kind==="branch-key") {
    const branch=model.branches![index];
    return {model:{...model,branches:model.branches!.map(link=>link===branch?{...link,switch:{closed:true}}:link)},selection:{kind:"contact",id:branch.id}};
  }
  if (isTwoTerminal(tool) && kind!=="end") return contactPlacement(model,tool,position);
  if (tool==="switch") {
    const id=newElementId(model,"K");
    const child=model.load.kind==="open"?{id:newElementId(model,"R"),kind:"r" as const,value:model.sections.at(-1)!.impedanceOhm}:model.load;
    return {model:loadReplacement(model,{id,kind:"switch",closed:false,children:[child]}),selection:{kind:"load",id}};
  }
  if (tool === "shunt") {
    if (kind === "node") return {
      model: { ...model, shunts: [...model.shunts, { node: index, resistanceOhm: 100 }] },
      selection: { kind: "shunt", node: index },
    };
    const split=splitSection(model,index);
    return {
      model: {...split,shunts:[...split.shunts,{node:index+1,resistanceOhm:100}]},
      selection: { kind: "shunt", node: index + 1 },
    };
  }
  if(tool==="diode") return {model:loadReplacement(model,{id:model.load.id,kind:"diode",diode:{...DEFAULT_DIODE}}),selection:{kind:"load"}};
  const value = tool === "matched" ? model.sections.at(-1)!.impedanceOhm : { r: 50, l: .02, c: 1e-5, open: undefined, wire: undefined }[tool];
  const load = { id: model.load.id, kind: tool === "matched" ? "r" as const : tool, value };
  return { model: loadReplacement(model, load), selection: { kind: "load" } };
}

export function placementTargets(model: Network, tool: Tool): Placement[] {
  if(typeof tool==="object"&&"install" in tool)return placementTargets(model,tool.install.kind).map(target=>{
    if(!target.edit||!tool.install.template||!isTwoTerminal(tool.install.kind)||target.kind==="branch-key"||tool.install.kind==="switch"&&target.kind==="end")return target;
    const edit=candidate(model,tool,target),error=validateNetwork(edit.model).join("; ");
    return {...target,edit:error?null:edit,error:error||undefined};
  });
  const nodes: Position[] = Array.from({ length: model.sections.length + 1 }, (_, index) => ({ kind: "node", index }));
  const spans: Position[] = model.sections.map((_, index) => ({ kind: "span", index }));
  const end: Position = { kind: "end", index: model.sections.length };
  const topology: Position[] = isTwoTerminal(tool)||typeof tool==="object"&&("relocate" in tool||"moveLoad" in tool)
    ? [...nodes.slice(1,-1).map(node=>({...node,kind:"joint" as const})),...nodes.map(node=>({...node,kind:"branch" as const})),
      ...spans.map(span=>({...span,kind:"branch-span" as const})),
      ...(isTwoTerminal(tool)&&tool!=="wire"?(model.branches??[]).flatMap((branch,index)=>
        contactKind(branch)==="wire"?[{kind:"wire-insert" as const,index}]:[]):[]),
      ...(tool==="switch" ? (model.branches??[]).flatMap((branch,index)=>branch.switch||branch.component?[]:[{kind:"branch-key" as const,index}]) : [])]
    : [];
  return [...(typeof tool==="object"&&"bridgeFrom" in tool?nodes: [...nodes,...spans,...topology,end])].map(position => {
    const { kind, index } = position;
    let error: string | undefined;
    const moving=typeof tool==="object"&&"relocate" in tool;
    const movingLoad=typeof tool==="object"&&"moveLoad" in tool;
    const connection=moving||movingLoad||isTwoTerminal(tool);
    const movingWire=moving&&[...model.series??[],...model.branches??[]].some(link=>link.id===tool.relocate&&contactKind(link)==="wire");
    if (connection && kind!=="end") {
      if (kind==="node"||(tool==="wire"||movingWire||movingLoad&&findLoad(model.load,tool.moveLoad)?.kind==="wire")&&(kind==="branch"||kind==="branch-span"))error="choose-connection";
      if (kind==="branch"&&(model.shunts.some(shunt=>shunt.node===index)||
        model.branches?.some(link=>link.from===index&&link.to==="reference"&&(!moving||link.id!==tool.relocate))))error="free-node";
      if (kind==="joint"&&model.series?.some(contact=>contact.from===index&&(!moving||contact.id!==tool.relocate)))error="occupied-joint";
      if ((kind==="span"||kind==="branch-span")&&model.sections.length>=MAX_SECTIONS)error="section-limit";
      if ((kind==="span"||kind==="branch-span")&&model.sections[index].lengthM<.002)error="short-section";
    } else if (typeof tool==="object"&&"bridgeFrom" in tool) {
      if(index===tool.bridgeFrom)error="choose-node";
    } else if (moving||movingLoad) {
      const link=moving?[...model.series??[],...model.branches??[]].find(link=>link.id===tool.relocate):undefined;
      if(movingLoad||!link||link.switch||model.load.kind!=="open")error="choose-connection";
    } else if (typeof tool === "object"&&"move" in tool) {
      const { move } = tool;
      if (move.kind === "line" && (kind !== "span" || model.sections[index]?.id === move.id)) error = "choose-line";
      if (move.kind === "source" && (kind !== "node" || index === model.source.node)) error = "choose-node";
      if (move.kind === "shunt" && (kind !== "node" || model.shunts.some(shunt => shunt.node === index))) error = "free-node";
    } else if(typeof tool==="object")return {...position,edit:null,error:"choose-connection"};
    else if(tool==="source") {
      if(kind!=="node")error="choose-node";
    } else if (tool === "shunt") {
      if (kind === "end" || kind === "node" && (model.shunts.some(shunt => shunt.node === index)||model.branches?.some(link=>link.from===index&&link.to==="reference"))) error = "free-node";
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
