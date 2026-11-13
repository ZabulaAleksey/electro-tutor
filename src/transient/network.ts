import { diodeCurrent, diodeVoltage, type DiodeParameters } from "./line-diode";

/** Characteristic-wave network. SI throughout; presentation has no solver state. */
export type Section = { id:string; lengthM:number; impedanceOhm:number; velocityMS:number; resistanceOhmM?:number };
export type Load = { id:string; kind:"r"|"l"|"c"|"wire"|"open"|"series"|"parallel"|"switch"|"diode"; diode?:DiodeParameters; value?:number; initial?:number; closed?:boolean; children?:Load[] };
export type ModelEvent = { id:string; atS:number; target:string; kind:"resistance"|"switch"; value:number; previous?:number };
export type BranchComponent =
 | {kind:"l"|"c";value:number;initial?:number}
 | {kind:"diode";diode:DiodeParameters};
export type Contact = {
 id: string;
 from: number;
 to: number | "reference";
 resistanceOhm?: number;
 component?: BranchComponent;
 switch?: { closed: boolean; atS?: number; closes?: boolean };
};
export type Network = { sections:Section[]; source:{voltageV:number;currentA?:number;resistanceOhm:number;node:number;onS:number;offS?:number};load:Load;durationS:number;events:ModelEvent[];shunts:{node:number;resistanceOhm:number}[]; series?: Array<Contact & { to: number }>; branches?: Contact[] };
export type WaveHistory = {times:number[]|Float64Array;values:number[]|Float64Array};
export type WaveRun = {config:Network;ports:WaveHistory[];events:number[];method:"exact-fronts"|"characteristics-trapezoid";stepS:number;deviceEnergy:WaveHistory;maxResidual:number;rangeU:readonly[number,number];rangeI:readonly[number,number]};
export type WaveValue={u:number;i:number;forward:number;backward:number;forwardI:number;backwardI:number;section:number};
export function distributedParameters(section:Section){
 const {impedanceOhm:z,velocityMS:v}=section,r=section.resistanceOhmM??0;
 return {r,l:z/v,g:r/(z*z),c:1/(z*v)};
}
export const hasLineLoss=(model:Network)=>model.sections.some(section=>(section.resistanceOhmM??0)>0);
const attenuation=(section:Section,distance:number)=>Math.exp(-(section.resistanceOhmM??0)*distance/section.impedanceOhm);
export const MAX_SECTIONS = 6;
export const DEFAULT_NETWORK:Network={sections:[{id:"TL1",lengthM:1e6,impedanceOhm:50,velocityMS:2e8}],source:{voltageV:100,resistanceOhm:0,node:0,onS:0},load:{id:"load",kind:"open"},durationS:.02,events:[],shunts:[]};
export function loadLeaves(load:Load):Load[]{return load.children?.flatMap(loadLeaves)??[load];}
export function isReactive(load:Load,depth=0):boolean{return !!load&&typeof load==="object"&&depth<=6&&(load.kind==="c"||load.kind==="l"||Array.isArray(load.children)&&load.children.some(x=>isReactive(x,depth+1)));}
export function contactsOf(model:Network) {return [...model.series??[],...model.branches??[]];}
const hasStorage=(model:Network)=>contactsOf(model).some(link=>link.component?.kind==="l"||link.component?.kind==="c");
export const isDynamic=(model:Network)=>isReactive(model.load)||hasStorage(model);
const validDiode=(d:DiodeParameters|undefined)=>!!d&&Number.isFinite(d.saturationA)&&d.saturationA>=1e-18&&d.saturationA<=1e-3&&
 Number.isFinite(d.ideality)&&d.ideality>=1&&d.ideality<=4&&typeof d.reversed==="boolean";
export function validBranchComponent(part:BranchComponent) {
 if(part.kind==="diode")return validDiode(part.diode);
 if(part.kind!=="l"&&part.kind!=="c")return false;
 return Number.isFinite(part.value)&&part.value>=(part.kind==="l"?1e-6:1e-9)&&
  part.value<=(part.kind==="l"?1e5:100)&&(part.initial===undefined||Number.isFinite(part.initial)&&Math.abs(part.initial)<=1e6);
}
export function validateNetwork(input:unknown):string[]{try{return validateNetworkShape(input as Network);}catch{return ["invalid-network-shape"];}}
function validateNetworkShape(c:Network):string[]{
 const errors:string[]=[];const finite=(v:number)=>Number.isFinite(v);let nodes=0;
 if(!Array.isArray(c.sections)||c.sections.length<1||c.sections.length>MAX_SECTIONS)return [`sections:1..${MAX_SECTIONS}`];
 const ids=new Set<string>();const validId=(id:unknown)=>typeof id==="string"&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id)&&!Object.prototype.hasOwnProperty.call(Object.prototype,id);for(const s of c.sections){if(!validId(s.id))errors.push("invalid-id");if(ids.has(s.id))errors.push("duplicate-id");ids.add(s.id);if(![s.lengthM,s.impedanceOhm,s.velocityMS].every(v=>finite(v)&&v>0)||s.lengthM<.001||s.lengthM>1e9||s.velocityMS<1||s.velocityMS>3e8||s.impedanceOhm<.001||s.impedanceOhm>1e6)errors.push("invalid-line");}
 if(c.sections.some(s=>s.resistanceOhmM!==undefined&&
   (!finite(s.resistanceOhmM)||s.resistanceOhmM<0||s.resistanceOhmM*s.lengthM/s.impedanceOhm>50)))errors.push("invalid-line-loss");
 if(!Number.isFinite(c.sections.reduce((n,s)=>n+s.lengthM,0))||!c.sections.every(s=>[s.lengthM/s.velocityMS,s.impedanceOhm/s.velocityMS,1/(s.impedanceOhm*s.velocityMS)].every(Number.isFinite)))errors.push("invalid-derived-line-parameters");
 const q=c.source;if(!q||![q.voltageV,q.resistanceOhm,q.onS,c.durationS].every(finite)||Math.abs(q.voltageV)>1e6||q.currentA!==undefined&&(!finite(q.currentA)||Math.abs(q.currentA)>1e6||q.voltageV!==0||q.resistanceOhm!==0)||q.resistanceOhm<0||q.resistanceOhm>1e9||q.resistanceOhm>0&&q.resistanceOhm<1e-6||q.onS<0||q.onS>c.durationS||c.durationS<1e-9||c.durationS>10||!Number.isInteger(q.node)||q.node<0||q.node>c.sections.length||q.offS!==undefined&&(!finite(q.offS)||q.offS<=q.onS||q.offS>c.durationS))errors.push("invalid-source-or-time");
 const series = c.series === undefined ? [] : c.series, branches = c.branches === undefined ? [] : c.branches;
 const validNode = (node: number) => Number.isInteger(node) && node >= 0 && node <= c.sections.length;
 if (!Array.isArray(series) || !Array.isArray(branches) || series.length >= c.sections.length || branches.length > 12) return ["invalid-contacts"];
 const seriesNodes = new Set<number>();
 const canJoin=(link:Contact)=>!link.component&&link.resistanceOhm===undefined&&link.to!=="reference"&&
  (!link.switch||link.switch.closed||link.switch.closes);
 const joined=new Set<number>([q.node]);
 for(let pass=0;pass<2*c.sections.length;pass++)for(const link of [...series,...branches]){
  if(!canJoin(link)||link.to==="reference")continue;
  if(joined.has(link.from)||joined.has(link.to)){joined.add(link.from);joined.add(link.to);}
 }
 const sharesIdealSource=q.currentA===undefined&&q.resistanceOhm===0&&joined.has(c.sections.length);
 const branchPairs = new Set<string>();
 for (const contact of [...series, ...branches]) {
  const inline = series.some(link=>link===contact);
  if (!validId(contact.id) || ids.has(contact.id)) errors.push("duplicate-id");
  ids.add(contact.id);
  if (!inline && (!validNode(contact.from) || contact.to !== "reference" &&
      (!validNode(contact.to) || contact.from === contact.to))) errors.push("invalid-contacts");
  if (inline) {
   if (!validSeriesContact(contact, c.sections.length) || seriesNodes.has(contact.from)) errors.push("invalid-contacts");
   seriesNodes.add(contact.from);
  } else {
   const key = [contact.from, contact.to].sort().join(":");
   if (branchPairs.has(key)) errors.push("invalid-contacts");
   branchPairs.add(key);
  }
  const r = contact.resistanceOhm, sw = contact.switch;
  if(contact.component!==undefined){
   if(!contact.component||r!==undefined||sw!==undefined||!validBranchComponent(contact.component))errors.push("invalid-component");
  }else if(r===undefined?contact.to==="reference":!finite(r)||r<.001||r>1e9)errors.push("invalid-component");
  if (sw !== undefined && (!sw || typeof sw.closed !== "boolean" || sw.atS !== undefined &&
      (!finite(sw.atS) || sw.atS < 0 || sw.atS > c.durationS || typeof sw.closes !== "boolean"))) errors.push("invalid-event");
 }
 const walk=(l:Load,depth=0)=>{if(!l||depth>6||++nodes>32){errors.push("load-size-limit");return;}if(!validId(l.id))errors.push("invalid-id");if(ids.has(l.id))errors.push("duplicate-id");ids.add(l.id);if(!["r","l","c","wire","open","series","parallel","switch","diode"].includes(l.kind))errors.push("unsupported-element");if(l.kind==="diode"&&(depth!==0||l.children?.length||!l.diode||!finite(l.diode.saturationA)||l.diode.saturationA<1e-18||l.diode.saturationA>1e-3||!finite(l.diode.ideality)||l.diode.ideality<1||l.diode.ideality>4||typeof l.diode.reversed!=="boolean"))errors.push("invalid-diode");if(["r","l","c"].includes(l.kind)&&(!finite(l.value??NaN)||(l.value??0)<0||l.kind!=="r"&&l.value===0))errors.push("invalid-component");if(["r","l","c"].includes(l.kind)&&((l.value??0)>(l.kind==="c"?100:l.kind==="l"?1e5:1e8)||(l.value??0)>0&&(l.value??0)<(l.kind==="c"?1e-9:l.kind==="l"?1e-6:.001)))errors.push("component-out-of-range");if(l.initial!==undefined&&(!finite(l.initial)||Math.abs(l.initial)>1e6))errors.push("invalid-initial-state");if(["series","parallel","switch"].includes(l.kind)){if(!l.children?.length||l.kind==="switch"&&l.children.length!==1)errors.push("invalid-connection");l.children?.forEach(x=>walk(x,depth+1));}};walk(c.load);
 if(!Array.isArray(c.events)||c.events.length>64)errors.push("event-limit");else for(const e of c.events){const leaf=loadLeaves(c.load).find(x=>x.id===e.target);const sw=findLoad(c.load,e.target);if(!["switch","resistance"].includes(e.kind)||!finite(e.atS)||e.atS<0||e.atS>c.durationS||!finite(e.value)||e.kind==="resistance"&&(!leaf||leaf.kind!=="r"||e.value<0||e.value>1e8||e.value>0&&e.value<.001)||e.kind==="switch"&&(!sw||sw.kind!=="switch"||![0,1].includes(e.value)))errors.push("invalid-event");}
 if(isDynamic(c)&&(c.events.length||[...series,...branches].some(contact=>contact.switch?.atS!==undefined)))errors.push("reactive-live-events-not-supported:recalculate");
 if(isReactive(c.load)&&branches.some(link=>link.resistanceOhm===undefined&&!link.component))errors.push("reactive-ideal-bridge");
 if(q.currentA===undefined&&q.resistanceOhm===0&&q.voltageV!==0&&[...series,...branches].some(link=>
  link.component?.kind==="c"&&(joined.has(link.from)&&link.to==="reference"||
    sharesIdealSource===false&&shorted(c.load)&&(joined.has(link.from)&&link.to===c.sections.length||
      link.from===c.sections.length&&link.to!=="reference"&&joined.has(link.to)))))errors.push("ideal-source-at-reactive-branch");
 if(c.load.kind==="diode"&&sharesIdealSource)errors.push("ideal-source-at-diode");
 if(isReactive(c.load)&&sharesIdealSource)errors.push("ideal-source-at-reactive-load-not-supported");
 if(!Array.isArray(c.shunts)||c.shunts.length>7)errors.push("invalid-shunts");
 for(const s of Array.isArray(c.shunts)?c.shunts:[])if(!Number.isInteger(s.node)||s.node<0||s.node>c.sections.length||!finite(s.resistanceOhm)||s.resistanceOhm<.001||s.resistanceOhm>1e9)errors.push("invalid-shunt");
 if(Array.isArray(c.shunts)&&new Set(c.shunts.map(s=>s.node)).size!==c.shunts.length)errors.push("one-shunt-per-node");
 if(!errors.length&&q.currentA===undefined&&q.node===c.sections.length&&q.resistanceOhm===0){const l=JSON.parse(JSON.stringify(c.load)) as Load;const times=[...new Set([0,q.onS,q.offS??c.durationS,...c.events.map(e=>e.atS)])].sort((a,b)=>a-b);for(const time of times){for(const e of c.events.filter(e=>e.atS===time)){const target=findLoad(l,e.target)!;if(e.kind==="switch")target.closed=!!e.value;else target.value=e.value;}if(drive(c,time)!==0&&shorted(l))errors.push("inconsistent-ideal-source-and-short");}}
 return [...new Set(errors)];
}
function shorted(l:Load):boolean{if(l.kind==="wire"||l.kind==="r"&&l.value===0)return true;if(l.kind==="switch")return !!(l.closed??true)&&shorted(l.children![0]);if(l.kind==="series")return !!l.children?.length&&l.children.every(shorted);if(l.kind==="parallel")return !!l.children?.some(shorted);return false;}
export function findLoad(l:Load,id:string):Load|undefined{return l.id===id?l:l.children?.map(x=>findLoad(x,id)).find(Boolean);}
export function totalLength(c:Network){return c.sections.reduce((n,s)=>n+s.lengthM,0);}
export function boundaries(c:Network){let x=0;return [0,...c.sections.map(s=>x+=s.lengthM)];}
export function historyValue(h:WaveHistory,t:number,linear=false,leftLimit=false):number{
 const tolerance=64*Number.EPSILON*Math.max(Math.abs(t),Math.abs(h.times.at(-1)??0),Number.MIN_VALUE);if(!h.times.length)return 0;
 let lo=0,hi=h.times.length;while(lo<hi){const m=(lo+hi)>>>1;if(leftLimit?h.times[m]<t-tolerance:h.times[m]<=t+tolerance)lo=m+1;else hi=m;}if(!lo)return 0;const k=lo-1;
 if(linear&&k+1<h.times.length&&t>h.times[k]){const f=(t-h.times[k])/(h.times[k+1]-h.times[k]);return h.values[k]*(1-f)+h.values[k+1]*f;}return h.values[k];
}
function push(h:{times:number[];values:number[]},t:number,v:number){const n=h.times.length;if(n&&Math.abs(h.times[n-1]-t)<1e-15){h.values[n-1]=v;return;}h.times.push(t);h.values.push(v);}
function validSeriesContact(contact: Contact, count: number) {
 return Number.isInteger(contact.from) && contact.from > 0 && contact.from < count && contact.to === count + contact.from;
}
function sameFrontTime(a: number, b: number) {
 return Math.abs(a-b)<=Math.max(1e-15,Math.abs(a)*1e-12);
}
export function contactClosed(contact: Contact, time: number) {
 const sw = contact.switch;
 return !sw || (sw.atS !== undefined && (time >= sw.atS || sameFrontTime(time,sw.atS)) ? sw.closes! : sw.closed);
}
function portNode(c:Network,p:number){
 const index=Math.floor(p/2);
 return p%2 ? index+1 : c.series?.some(contact=>contact.from===index) ? c.sections.length+index : index;
}
function portsAt(c:Network,node:number){return c.sections.flatMap((_,j)=>[2*j,2*j+1]).filter(p=>portNode(c,p)===node);}
function drive(c:Network,t:number){
 const started=t>=c.source.onS||sameFrontTime(t,c.source.onS);
 const stopped=c.source.offS!==undefined&&(t>=c.source.offS||sameFrontTime(t,c.source.offS));
 return started&&!stopped?(c.source.currentA??c.source.voltageV):0;
}
type Eq={g:number;b:number;short:boolean};
const OPEN:Eq={g:0,b:0,short:false};
type State={v:number;i:number};
function companion(l:Load,h:number,states:Map<string,State>,eqs:Map<string,Eq>,overrides:Map<string,number>,initial=false):Eq{
 let e:Eq;const value=overrides.get(l.id)??l.value??0;
 if(l.kind==="open"||l.kind==="diode"||l.kind==="switch"&&(overrides.get(l.id)??Number(l.closed??true))===0)e=OPEN;
 else if(l.kind==="wire"||l.kind==="r"&&value===0)e={g:0,b:0,short:true};
 else if(l.kind==="r")e={g:1/value,b:0,short:false};
 else if(l.kind==="c"||l.kind==="l"){
  const s=states.get(l.id)??{v:0,i:0};const g=l.kind==="c"?(initial?1:2)*value/h:h/((initial?1:2)*value);e={g,b:initial?(l.kind==="c"?-g*(l.initial??0):(l.initial??0)):l.kind==="c"?-g*s.v-s.i:s.i+g*s.v,short:false};
 }else if(l.kind==="switch")e=companion(l.children![0],h,states,eqs,overrides,initial);
 else {const children=l.children!.map(x=>companion(x,h,states,eqs,overrides,initial));if(l.kind==="parallel")e=children.some(x=>x.short)?{g:0,b:0,short:true}:{g:children.reduce((s,x)=>s+x.g,0),b:children.reduce((s,x)=>s+x.b,0),short:false};
  else if(children.some(x=>!x.short&&x.g===0))e=OPEN;
  else {const r=children.reduce((s,x)=>s+(x.short?0:1/x.g),0);e=r===0?{g:0,b:0,short:true}:{g:1/r,b:children.reduce((s,x)=>s+(x.short?0:x.b/x.g),0)/r,short:false};}}
 eqs.set(l.id,e);return e;
}
function commitDevice(l:Load,v:number,i:number,eqs:Map<string,Eq>,states:Map<string,State>,overrides:Map<string,number>){
 states.set(l.id,{v,i});
 if(l.kind==="c"||l.kind==="l")return;
 if(l.kind==="switch"){if((overrides.get(l.id)??Number(l.closed??true))!==0)commitDevice(l.children![0],v,i,eqs,states,overrides);return;}
 if(!l.children)return;
 if(l.kind==="parallel"){const shorts=l.children.filter(child=>eqs.get(child.id)!.short),known=l.children.filter(child=>!eqs.get(child.id)!.short).reduce((sum,child)=>{const e=eqs.get(child.id)!;return sum+e.g*v+e.b;},0);for(const child of l.children){const e=eqs.get(child.id)!;commitDevice(child,v,e.short?(i-known)/shorts.length:e.g*v+e.b,eqs,states,overrides);}}
 else {let used=0;const open=l.children.find(child=>{const e=eqs.get(child.id)!;return !e.short&&e.g===0;});for(const child of l.children){const e=eqs.get(child.id)!;if(child===open)continue;const u=e.short?0:(i-e.b)/e.g;used+=u;commitDevice(child,u,i,eqs,states,overrides);}if(open)commitDevice(open,v-used,0,eqs,states,overrides);}
}
function loadEnergy(l:Load,states:Map<string,State>):number{const s=states.get(l.id);if(s&&l.kind==="c")return .5*l.value!*s.v*s.v;if(s&&l.kind==="l")return .5*l.value!*s.i*s.i;return l.children?.reduce((n,x)=>n+loadEnergy(x,states),0)??0;}
type Terminal = Pick<Contact,"from"|"to">;
type Stamp = Terminal & Eq;
const across=(voltage:number[],link:Terminal)=>voltage[link.from]-(link.to==="reference"?0:voltage[link.to]);
function solveVoltages(c: Network, incident: number[], load: Eq, time: number, incremental=false,
 stamps:Stamp[]=[], injection?:Terminal): number[] {
 const excitation=incremental?0:drive(c,time);
 const currentSource=c.source.currentA!==undefined;
 const conductance=!currentSource&&c.source.resistanceOhm>0?1/c.source.resistanceOhm:0;
 const sourceInjection=currentSource?excitation:excitation*conductance;
 const end = c.sections.length;
 if (!c.series?.length && !c.branches?.length && !injection) {
  return Array.from({length:end+1},(_,node)=>{
   const ps=portsAt(c,node),y=ps.reduce((n,p)=>n+1/c.sections[p>>1].impedanceOhm,0);
   const incoming=ps.reduce((n,p)=>n+2*incident[p]/c.sections[p>>1].impedanceOhm,0);
   const shunt=c.shunts.filter(s=>s.node===node).reduce((n,s)=>n+1/s.resistanceOhm,0);
   const terminal=node===end,source=node===c.source.node;
   if(terminal&&load.short)return 0;
   if(source&&!currentSource&&c.source.resistanceOhm===0)return excitation;
   return (incoming+(source?sourceInjection:0)-(terminal?load.b:0))/(y+shunt+(source?conductance:0)+(terminal?load.g:0));
  });
 }
 const contacts = [...c.series ?? [], ...c.branches ?? []].filter(contact => contactClosed(contact, time));
 const count = end * 2;
 const parents = Array.from({length: count}, (_, i) => i);
 const root = (node: number): number => parents[node] === node ? node : root(parents[node]);
 for (const link of contacts) {
  if (!link.component&&link.resistanceOhm === undefined && link.to !== "reference") parents[root(link.to)] = root(link.from);
 }
 const fixed = new Map<number, number>();
 if (load.short) fixed.set(root(end), 0);
 if (!currentSource && c.source.resistanceOhm === 0) {
  const node=root(c.source.node);
  if(fixed.has(node)&&excitation!==0)throw Error("inconsistent-ideal-source-and-short");
  fixed.set(node,excitation);
 }

 const nodes = [...new Set(c.sections.flatMap((_, i) => [root(portNode(c, 2*i)), root(i+1)]))];
 const unknown = nodes.filter(node => !fixed.has(node));
 const rows = unknown.map(() => Array<number>(unknown.length + 1).fill(0));
 const rhs = unknown.length;
 const stampGround = (node: number, conductance: number, injection: number) => {
  const i = unknown.indexOf(root(node));
  if (i < 0) return;
  rows[i][i] += conductance;
  rows[i][rhs] += injection;
 };
 const stampLink = (from: number, to: number, conductance: number) => {
  if (root(from) === root(to)) return;
  const i = unknown.indexOf(root(from)), j = unknown.indexOf(root(to));
  if (i < 0) return;
  rows[i][i] += conductance;
  if (j < 0) rows[i][rhs] += conductance * fixed.get(root(to))!;
  else rows[i][j] -= conductance;
 };
 incident.forEach((value, port) => {
  const y = 1/c.sections[port >> 1].impedanceOhm;
  stampGround(portNode(c, port), y, 2*y*value);
 });
 for (const shunt of c.shunts) stampGround(shunt.node, 1/shunt.resistanceOhm, 0);
 if (!load.short) stampGround(end, load.g, -load.b);
 if (currentSource || conductance > 0) stampGround(c.source.node, conductance, sourceInjection);
 for(const stamp of stamps){
  if(stamp.to!=="reference"){
   stampLink(stamp.from,stamp.to,stamp.g);
   stampLink(stamp.to,stamp.from,stamp.g);
   stampGround(stamp.to,0,stamp.b);
  }else stampGround(stamp.from,stamp.g,0);
  stampGround(stamp.from,0,-stamp.b);
 }
 if(injection){
  stampGround(injection.from,0,1);
  if(injection.to!=="reference")stampGround(injection.to,0,-1);
 }
 for (const contact of contacts) {
  if (contact.resistanceOhm === undefined) continue;
  const g = 1/contact.resistanceOhm;
  if (contact.to === "reference") stampGround(contact.from, g, 0);
  else {
   stampLink(contact.from, contact.to, g);
   stampLink(contact.to, contact.from, g);
  }
 }
 // Each active node has a positive line admittance. The reduced conductance matrix is positive definite.
 for (let i = 0; i < rhs; i++) {
  for (let j = i+1; j < rhs; j++) {
   const scale = rows[j][i]/rows[i][i];
   for (let k = i+1; k <= rhs; k++) rows[j][k] -= scale*rows[i][k];
  }
 }
 for (let i = rhs-1; i >= 0; i--) {
  for (let j = i+1; j < rhs; j++) rows[i][rhs] -= rows[i][j]*rows[j][rhs];
  rows[i][rhs] /= rows[i][i];
 }
 return parents.map((_, i) => fixed.get(root(i)) ?? rows[unknown.indexOf(root(i))]?.[rhs] ?? 0);
}
type DiodeLink=Terminal & {diode:DiodeParameters};
function nonlinearLinks(c:Network):DiodeLink[]{
 const terminal=c.load.kind==="diode"?[{from:c.sections.length,to:"reference" as const,diode:c.load.diode!}]:[];
 return [...terminal,...contactsOf(c).flatMap(link=>link.component?.kind==="diode"?[{...link,diode:link.component.diode}]:[])];
}
function solveWithDiodes(c:Network, incident:number[], load:Eq, time:number, stamps:Stamp[], diodes:DiodeLink[]){
 const voltage=solveVoltages(c,incident,load,time,false,stamps);
 if(!diodes.length)return voltage;
 const zero=incident.map(()=>0);
 const passive=stamps.map(stamp=>({...stamp,b:0}));
 const responses=diodes.map(link=>solveVoltages(c,zero,{...load,b:0},time,true,passive,link));
 const currents=diodes.map(()=>0);
 // Each coordinate solves the exact scalar Shockley load line. Coupling is
 // iterated in the branch currents, using the nodal response for every update.
 for(let pass=0;pass<160;pass++){
  for(const [i,link] of diodes.entries()){
   const response=responses[i],resistance=across(response,link);
   const sign=link.diode.reversed?-1:1;
   if(resistance<0||!Number.isFinite(resistance))throw Error("invalid-diode-network");
   if(resistance===0)continue; // both terminal voltages are already fixed
   const open=across(voltage,link)+resistance*currents[i];
   const drop=sign*diodeVoltage(sign*open,resistance,link.diode);
   const next=(open-drop)/resistance,delta=next-currents[i];
   currents[i]=next;
   for(let j=0;j<voltage.length;j++)voltage[j]-=delta*response[j];
  }
  if(diodes.every((link,i)=>{
   const sign=link.diode.reversed?-1:1;
   const drop=across(voltage,link),r=across(responses[i],link);
   if(r===0)return Number.isFinite(diodeCurrent(sign*drop,link.diode));
   const error=currents[i]-sign*diodeCurrent(sign*drop,link.diode);
   return Math.abs(error)<=1e-8*Math.max(1,Math.abs(currents[i]));
  }))return voltage;
 }
 throw Error("diode-convergence");
}
function reactiveLinks(c:Network){
 return contactsOf(c).flatMap(link=>link.component&&(link.component.kind==="l"||link.component.kind==="c")?
  [{...link,device:{...link.component,id:link.id}}]:[]);
}
function branchStamps(links:ReturnType<typeof reactiveLinks>, step:number, states:Map<string,State>, initial=false):Stamp[]{
 const eqs=new Map<string,Eq>(),overrides=new Map<string,number>();
 return links.map(link=>({...link,...companion(link.device,step,states,eqs,overrides,initial)}));
}
type Arrival={t:number;port?:number;delta?:number;eventIndex?:number};
class Heap {items:Arrival[]=[];put(x:Arrival){if(this.items.length>=6000)throw Error("wave-queue-limit:shorten-experiment");const a=this.items;let k=a.push(x)-1;while(k){const p=(k-1)>>1;if(a[p].t<=x.t)break;a[k]=a[p];k=p;}a[k]=x;}take(){const a=this.items,first=a[0],last=a.pop()!;if(a.length){let k=0;while(2*k+1<a.length){let j=2*k+1;if(j+1<a.length&&a[j+1].t<a[j].t)j++;if(a[j].t>=last.t)break;a[k]=a[j];k=j;}a[k]=last;}return first;}get first(){return this.items[0];}}
function exact(c:Network,progress?:Progress):WaveRun{
 const ports=c.sections.flatMap(()=>[{times:[] as number[],values:[] as number[]},{times:[] as number[],values:[] as number[]}]),a=ports.map(()=>0),out=ports.map(()=>0),queue=new Heap(),overrides=new Map<string,number>(),events:number[]=[];
 queue.put({t:0});queue.put({t:c.source.onS});if(c.source.offS!==undefined)queue.put({t:c.source.offS});c.events.forEach((event,eventIndex)=>queue.put({t:event.atS,eventIndex}));
 for(const contact of [...c.series ?? [],...c.branches ?? []]) if(contact.switch?.atS!==undefined)queue.put({t:contact.switch.atS});
 const diodes=nonlinearLinks(c);
 let count=0,fronts=0;while(queue.first&&queue.first.t<=c.durationS+1e-14){const t=queue.first.t, pending:number[]=[];
  while(queue.first&&sameFrontTime(t,queue.first.t)){
   if(count%256===0)progress?.(Math.min(1,t/c.durationS));
   if(++count>200000)throw Error("wave-event-limit:shorten-experiment");
   const e=queue.take();
   if(e.port!==undefined)a[e.port]+=e.delta!;
   if(e.eventIndex!==undefined)pending.push(e.eventIndex);
  }
  pending.sort((i,j)=>c.events[i].atS-c.events[j].atS||i-j);
  for(const index of pending){
   const event=c.events[index];
   overrides.set(event.target,event.value);
  }
  const eq=companion(c.load,1,new Map(),new Map(),overrides);events.push(t);
  const voltage=solveWithDiodes(c,a,eq,t,[],diodes);
  for(let p=0;p<ports.length;p++){const u=voltage[portNode(c,p)];const b=u-a[p],delta=b-out[p];if(!Number.isFinite(b)||Math.abs(b)>1e12)throw Error("non-finite-wave");if(Math.abs(delta)>1e-12*Math.max(1,Math.abs(c.source.voltageV),Math.abs(c.source.currentA??0)*c.sections[p>>1].impedanceOhm)){if(++fronts>50000)throw Error("wave-event-limit:shorten-experiment");out[p]=b;push(ports[p],t,b);queue.put({t:t+c.sections[p>>1].lengthM/c.sections[p>>1].velocityMS,port:p^1,delta:delta*attenuation(c.sections[p>>1],c.sections[p>>1].lengthM)});}}
 }
 return ranges({config:c,ports,events:[...new Set(events)].sort((a,b)=>a-b),method:"exact-fronts",stepS:0,deviceEnergy:{times:[0],values:[0]},maxResidual:0,rangeU:[0,0],rangeI:[0,0]});
}
/** Resolve the t=0+ algebraic limits with three BE companion probes; retain exact independent states. */
function initialNetwork(c:Network,epsilon:number):{out:number[];states:Map<string,State>}{
 const trials:{out:number[];states:Map<string,State>}[]=[];
 const links=reactiveLinks(c),diodes=nonlinearLinks(c);
 for(const divisor of [1,2,4]){const states=new Map<string,State>(),eqs=new Map<string,Eq>(),a=c.sections.flatMap(()=>[0,0]),overrides=new Map<string,number>(),eq=companion(c.load,epsilon/divisor,states,eqs,overrides,true),out=a.map(()=>0);
  const stamps=branchStamps(links,epsilon/divisor,states,true);
  const voltage=solveWithDiodes(c,a,eq,0,stamps,diodes);
  for(const [index,stamp] of stamps.entries()){
   const v=across(voltage,stamp);
   states.set(links[index].id,{v,i:stamp.g*v+stamp.b});
  }
  for(let port=0;port<out.length;port++)out[port]=voltage[portNode(c,port)];
  const end=c.sections.length,u=voltage[end];
  const y=portsAt(c,end).reduce((sum,p)=>sum+1/c.sections[p>>1].impedanceOhm,0)
   +c.shunts.filter(x=>x.node===end).reduce((sum,x)=>sum+1/x.resistanceOhm,0)
   + (c.branches??[]).filter(link=>link.to==="reference"&&link.from===end&&contactClosed(link,0)).reduce((sum,link)=>sum+1/link.resistanceOhm!,0);
  const source=end!==c.source.node?0:c.source.currentA!==undefined?drive(c,0):
   c.source.resistanceOhm>0?(drive(c,0)-u)/c.source.resistanceOhm:0;
  const linked=(c.branches??[]).filter(link=>link.to!=="reference"&&link.resistanceOhm!==undefined&&contactClosed(link,0))
   .reduce((sum,link)=>link.from===end?sum+(u-voltage[link.to as number])/link.resistanceOhm!:
    link.to===end?sum+(u-voltage[link.from])/link.resistanceOhm!:sum,0);
  const dynamic=stamps.reduce((sum,stamp)=>sum+(stamp.from===end?1:stamp.to===end?-1:0)*(stamp.g*across(voltage,stamp)+stamp.b),0);
  commitDevice(c.load,u,eq.short?source-y*u-linked-dynamic:eq.g*u+eq.b,eqs,states,overrides);
  trials.push({out,states});
 }
 const extrap=(a:number,b:number,c:number)=>a/3-2*b+8*c/3,states=new Map<string,State>();
 for(const [id] of trials[0].states){const a=trials[0].states.get(id)!,b=trials[1].states.get(id)!,d=trials[2].states.get(id)!;states.set(id,{v:extrap(a.v,b.v,d.v),i:extrap(a.i,b.i,d.i)});}
 for(const l of [...loadLeaves(c.load),...links.map(link=>link.device)]){const current=states.get(l.id)??{v:0,i:0};if(l.kind==="c"){
  if(links.some(link=>link.id===l.id)&&Math.abs(current.v-(l.initial??0))>1e-5*Math.max(1,Math.abs(l.initial??0)))throw Error("inconsistent-initial-state");
  states.set(l.id,{...current,v:l.initial??0});
 }if(l.kind==="l")states.set(l.id,{...current,i:l.initial??0});}
 const tolerance=(a:number,b:number)=>Math.abs(a-b)<=2e-6*Math.max(1,Math.abs(a),Math.abs(b));
 const verify=(l:Load)=>{if(l.kind==="switch"&&!(l.closed??true))return;const p=states.get(l.id);if(!p)return;if(!Number.isFinite(p.v)||!Number.isFinite(p.i)||Math.abs(p.v)>1e10||Math.abs(p.i)>1e10)throw Error("inconsistent-initial-state");const children=l.children?.map(x=>states.get(x.id)).filter((x):x is State=>!!x)??[];if(children.length){const series=l.kind==="series"||l.kind==="switch";if(series&&(!children.every(x=>tolerance(x.i,p.i))||!tolerance(children.reduce((s,x)=>s+x.v,0),p.v))||!series&&(!children.every(x=>tolerance(x.v,p.v))||!tolerance(children.reduce((s,x)=>s+x.i,0),p.i)))throw Error("inconsistent-initial-state");}l.children?.forEach(verify);};verify(c.load);
 return{states,out:trials[0].out.map((a,j)=>extrap(a,trials[1].out[j],trials[2].out[j]))};
}
export const DYNAMIC_STEP_LIMIT=240000;
type Progress=(fraction:number)=>void;
function dynamicPlan(c:Network,resolution=100){
 const links=reactiveLinks(c);
 const minTau=Math.min(...c.sections.map(s=>s.lengthM/s.velocityMS)),leaves=loadLeaves(c.load);
 const contactResistance=[...c.series??[],...c.branches??[]]
   .filter(link=>link.resistanceOhm!==undefined&&contactClosed(link,0)).map(link=>link.resistanceOhm!);
 const resistances=[...contactResistance,c.sections.at(-1)!.impedanceOhm,...(c.source.node===c.sections.length&&c.source.resistanceOhm>0?[c.source.resistanceOhm]:[]),...c.shunts.filter(x=>x.node===c.sections.length).map(x=>x.resistanceOhm),...leaves.filter(l=>l.kind==="r"&&(l.value??0)>0).map(l=>l.value!)],rmin=Math.min(...resistances),rmax=resistances.reduce((a,b)=>a+b,0),deviceTimes=leaves.flatMap(l=>l.kind==="c"?[l.value!*rmin]:l.kind==="l"?[l.value!/rmax]:[]);const zero=c.sections.flatMap(()=>[0,0]);
 for(const link of links){
  const resistance=across(solveVoltages(c,zero,OPEN,0,true,[],link),link);
  if(resistance>0)deviceTimes.push(link.device.kind==="c"?link.device.value*resistance:link.device.value/resistance);
 }
 const steps=Math.ceil(c.durationS/Math.min(minTau/resolution,c.durationS/600,...deviceTimes.map(t=>t/20)));
 return {steps,initialStep:Math.min(...deviceTimes,minTau)*1e-4,links};
}
export function estimateNetwork(c:Network){
 if(validateNetwork(c).length)return null;
 if(!isDynamic(c))return {kind:"exact" as const,frontLimit:50000};
 const {steps}=dynamicPlan(c);
 return {kind:"numeric" as const,steps,bytes:(steps+1)*(2*c.sections.length+2)*8,limit:DYNAMIC_STEP_LIMIT};
}
function numeric(c:Network,resolution=100,progress?:Progress):WaveRun{
 const {steps,initialStep,links}=dynamicPlan(c,resolution),diodes=nonlinearLinks(c);
 if(steps>DYNAMIC_STEP_LIMIT)throw Error("dynamic-resolution-limit:shorten-experiment");
 const h=c.durationS/steps;
 function storedEnergy():number{return loadEnergy(c.load,states)+links.reduce((sum,link)=>sum+loadEnergy(link.device,states),0);}
 const times=Float64Array.from({length:steps+1},(_,k)=>k*h);
 const ports=c.sections.flatMap(()=>[{times,values:new Float64Array(steps+1)},{times,values:new Float64Array(steps+1)}]);
 const initial=initialNetwork(c,initialStep),states=initial.states,overrides=new Map<string,number>();
 const energy={times,values:new Float64Array(steps+1)},events:number[]=[0];
 energy.values[0]=storedEnergy();
 for(let p=0;p<ports.length;p++)ports[p].values[0]=initial.out[p];let nextEvent=0;const sorted=[...c.events].sort((a,b)=>a.atS-b.atS);
 for(let k=1;k<=steps;k++){if(k%512===0)progress?.(k/steps);const t=k*h,a=ports.map((_,p)=>{
   const section=c.sections[p>>1],index=k-section.lengthM/section.velocityMS/h;
   if(index<0)return 0;
   const j=Math.floor(index),fraction=index-j,values=ports[p^1].values;
   return (values[j]+fraction*(values[j+1]-values[j]))*attenuation(section,section.lengthM);
  });while(nextEvent<sorted.length&&sorted[nextEvent].atS<=t+1e-15){overrides.set(sorted[nextEvent].target,sorted[nextEvent].value);nextEvent++;}
  const eqs=new Map<string,Eq>(),eq=companion(c.load,h,states,eqs,overrides);
  const stamps=branchStamps(links,h,states);
  const voltage=solveWithDiodes(c,a,eq,t,stamps,diodes);
  if(voltage.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error("non-finite-wave");
  for(const [index,stamp] of stamps.entries()){
   const v=across(voltage,stamp);
   states.set(links[index].id,{v,i:stamp.g*v+stamp.b});
  }
  for(let port=0;port<ports.length;port++)ports[port].values[k]=voltage[portNode(c,port)]-a[port];
  const u=voltage[c.sections.length];
  commitDevice(c.load,u,eq.short?0:eq.g*u+eq.b,eqs,states,overrides);
  energy.values[k]=storedEnergy();if(k%Math.max(1,Math.ceil(steps/800))===0||k===steps)events.push(t);
 }
 return ranges({config:c,ports,events,method:"characteristics-trapezoid",stepS:h,deviceEnergy:energy,maxResidual:0,rangeU:[0,0],rangeI:[0,0]});
}
function waveBounds(values:WaveHistory['values']){let low=0,high=0;for(const value of values){if(value<low)low=value;if(value>high)high=value;}return [low,high];}
function ranges(run:WaveRun):WaveRun{
 let lowU=0,highU=0,lowI=0,highI=0;const c=run.config;
 // All combinations of independent directional ranges enclose every x/t, not just displayed frames.
 c.sections.forEach((s,j)=>{const f=run.ports[2*j].values,b=run.ports[2*j+1].values;const [f0,f1]=waveBounds(f),[b0,b1]=waveBounds(b);lowU=Math.min(lowU,f0+b0);highU=Math.max(highU,f1+b1);lowI=Math.min(lowI,(f0-b1)/s.impedanceOhm);highI=Math.max(highI,(f1-b0)/s.impedanceOhm);});
 run.rangeU=[lowU,highU];run.rangeI=[lowI,highI];return run;
}
export function simulateNetwork(config:Network,options:{resolution?:number;progress?:Progress}={}):WaveRun{
 const errors=validateNetwork(config);if(errors.length)throw Error(errors.join("; "));const c=JSON.parse(JSON.stringify(config)) as Network;return isDynamic(c)?numeric(c,options.resolution,options.progress):exact(c,options.progress);
}
function incidentAt(c:Network,ports:WaveHistory[],p:number,time:number,linear:boolean){
 const s=c.sections[p>>1];
 return historyValue(ports[p^1],time-s.lengthM/s.velocityMS,linear)*attenuation(s,s.lengthM);
}
function atSection(run:WaveRun,j:number,local:number,t:number,leftLimit=false):WaveValue{const s=run.config.sections[j],linear=run.method!=="exact-fronts",forward=historyValue(run.ports[2*j],t-local/s.velocityMS,linear,leftLimit)*attenuation(s,local),backward=historyValue(run.ports[2*j+1],t-(s.lengthM-local)/s.velocityMS,linear,leftLimit)*attenuation(s,s.lengthM-local);return{u:forward+backward,i:(forward-backward)/s.impedanceOhm,forward,backward,forwardI:forward/s.impedanceOhm,backwardI:-backward/s.impedanceOhm,section:j};}
export function at(run:WaveRun,x:number,t:number):WaveValue{const c=run.config;let left=0,j=0;for(;j<c.sections.length-1&&x>left+c.sections[j].lengthM+1e-9;j++)left+=c.sections[j].lengthM;return atSection(run,j,Math.max(0,Math.min(c.sections[j].lengthM,x-left)),t);}
export type Quantity="u"|"i"|"forward"|"backward"|"forwardI"|"backwardI";
export function spatial(run:WaveRun,t:number,quantity:Quantity="u"):readonly[number,number][]{
 const points:[number,number][]=[];let base=0;for(let j=0;j<run.config.sections.length;j++){const s=run.config.sections[j],positions=[0,s.lengthM];if(run.method==="exact-fronts"){for(const time of run.ports[2*j].times){const x=(t-time)*s.velocityMS;if(x>0&&x<s.lengthM)positions.push(x);}for(const time of run.ports[2*j+1].times){const x=s.lengthM-(t-time)*s.velocityMS;if(x>0&&x<s.lengthM)positions.push(x);}}
  else for(let k=1;k<120;k++)positions.push(s.lengthM*k/120);
  const xs=[...new Set(positions)].sort((a,b)=>a-b);points.push([base,atSection(run,j,0,t)[quantity]]);if(run.method==="exact-fronts")for(let k=0;k<xs.length-1;k++){const from=xs[k],to=xs[k+1],mid=(from+to)/2;
   const value=atSection(run,j,mid,t);
   const alpha=(s.resistanceOhmM??0)/s.impedanceOhm;
   if(!alpha)points.push([base+from,value[quantity]],[base+to,value[quantity]]);
   else for(let n=0;n<=16;n++){
    const x=from+(to-from)*n/16,f=value.forward*Math.exp(-alpha*(x-mid)),b=value.backward*Math.exp(alpha*(x-mid));
    const quantities={u:f+b,i:(f-b)/s.impedanceOhm,forward:f,backward:b,forwardI:f/s.impedanceOhm,backwardI:-b/s.impedanceOhm};
    points.push([base+x,quantities[quantity]]);
   }}
  else for(const x of xs)points.push([base+x,atSection(run,j,x,t)[quantity]]);points.push([base+s.lengthM,atSection(run,j,s.lengthM,t)[quantity]]);base+=s.lengthM;
 }return points;
}
export function* fullTimeTrace(run:WaveRun,x:number,quantity:Quantity="u",start=0,end=run.config.durationS):Generator<readonly[number,number]>{
 let base=0,j=0;while(j<run.config.sections.length-1&&x>base+run.config.sections[j].lengthM+1e-9){base+=run.config.sections[j++].lengthM;}const s=run.config.sections[j],local=Math.max(0,Math.min(s.lengthM,x-base));
 const forward=run.ports[2*j].times,backward=run.ports[2*j+1].times;
 const a=local/s.velocityMS,b=(s.lengthM-local)/s.velocityMS;
 function lowerBound(times:WaveHistory["times"],value:number){
  let lo=0,hi=times.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<value)lo=mid+1;else hi=mid;}
  return lo;
 }
 let i=lowerBound(forward,start-a),k=lowerBound(backward,start-b);
 yield [start,atSection(run,j,local,start)[quantity]];
 while(i<forward.length||k<backward.length){
  const f=i<forward.length?forward[i]+a:Infinity,r=k<backward.length?backward[k]+b:Infinity;
  const t=Math.min(f,r);
  if(t>end)break;
  if(f===t)i++;
  if(r===t)k++;
  if(t<=start)continue;
  if(run.method==="exact-fronts")yield [t,atSection(run,j,local,t,true)[quantity]];
  yield [t,atSection(run,j,local,t)[quantity]];
  if(t===end)return;
 }
 yield [end,atSection(run,j,local,end)[quantity]];
}
export function summarizeTrace(points:Iterable<readonly[number,number]>,start:number,end:number,buckets=600){
 const result:(readonly[number,number])[]=[];
 type Sample={index:number;point:readonly[number,number]};
 let bucket=-1,index=0,first:Sample|undefined,last:Sample|undefined,low:Sample|undefined,high:Sample|undefined;
 const flush=()=>{
  if(first&&last&&low&&high)for(const sample of [...new Set([first,low,high,last])].sort((a,b)=>a.index-b.index))result.push(sample.point);
 };
 for(const point of points){
  const [t,v]=point;
  if(t<start)continue;
  if(t>end)break;
  const next=Math.min(buckets-1,Math.floor((t-start)/(end-start||1)*buckets)),sample={index:index++,point};
  if(next!==bucket){flush();bucket=next;first=low=high=sample;}
  last=sample;
  if(v<low!.point[1])low=sample;
  if(v>high!.point[1])high=sample;
 }
 flush();
 return result;
}
export function timeTrace(run:WaveRun,x:number,quantity:Quantity="u",start=0,end=run.config.durationS){
 return summarizeTrace(fullTimeTrace(run,x,quantity,start,end),start,end);
}
export function lineEnergy(run:WaveRun,t:number):number{const xs=[...new Set(spatial(run,t).map(p=>p[0]))].sort((a,b)=>a-b);let energy=0;for(let j=1;j<xs.length;j++){const v=at(run,(xs[j]+xs[j-1])/2,t),s=run.config.sections[v.section];const width=xs[j]-xs[j-1],argument=(s.resistanceOhmM??0)*width/s.impedanceOhm;
 const factor=run.method==="exact-fronts"&&argument?Math.sinh(argument)/argument:1;
 energy+=(v.forward*v.forward+v.backward*v.backward)/(s.impedanceOhm*s.velocityMS)*width*factor;}return energy;}
export function nodePort(run:WaveRun,node:number,t:number){const c=run.config,ps=portsAt(c,node),u=ps.length?historyValue(run.ports[ps[0]],t,run.stepS>0)+incidentAt(c,run.ports,ps[0],t,run.stepS>0):0;const intoLines=ps.reduce((sum,p)=>sum+(historyValue(run.ports[p],t,run.stepS>0)-incidentAt(c,run.ports,p,t,run.stepS>0))/c.sections[p>>1].impedanceOhm,0);return{u,intoLines};}

export function branchVoltage(run:WaveRun,link:Terminal,time:number){
 return nodePort(run,link.from,time).u-(link.to==="reference"?0:nodePort(run,link.to,time).u);
}
