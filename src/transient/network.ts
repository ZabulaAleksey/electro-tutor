/** Lossless characteristic-wave network. SI throughout; presentation has no solver state. */
export type Section = { id:string; lengthM:number; impedanceOhm:number; velocityMS:number };
export type Load = { id:string; kind:"r"|"l"|"c"|"wire"|"open"|"series"|"parallel"|"switch"; value?:number; initial?:number; closed?:boolean; children?:Load[] };
export type ModelEvent = { id:string; atS:number; target:string; kind:"resistance"|"switch"; value:number; previous?:number };
export type Network = { sections:Section[]; source:{voltageV:number;resistanceOhm:number;node:number;onS:number;offS?:number};load:Load;durationS:number;events:ModelEvent[];shunts:{node:number;resistanceOhm:number}[] };
export type WaveHistory = {times:number[];values:number[]};
export type WaveRun = {config:Network;ports:WaveHistory[];events:number[];method:"exact-fronts"|"characteristics-trapezoid";stepS:number;deviceEnergy:WaveHistory;maxResidual:number;rangeU:readonly[number,number];rangeI:readonly[number,number]};
export type WaveValue={u:number;i:number;forward:number;backward:number;forwardI:number;backwardI:number;section:number};
export const DEFAULT_NETWORK:Network={sections:[{id:"TL1",lengthM:1e6,impedanceOhm:50,velocityMS:2e8}],source:{voltageV:100,resistanceOhm:0,node:0,onS:0},load:{id:"load",kind:"open"},durationS:.02,events:[],shunts:[]};
export function loadLeaves(load:Load):Load[]{return load.children?.flatMap(loadLeaves)??[load];}
export function isReactive(load:Load,depth=0):boolean{return !!load&&typeof load==="object"&&depth<=6&&(load.kind==="c"||load.kind==="l"||Array.isArray(load.children)&&load.children.some(x=>isReactive(x,depth+1)));}
export function validateNetwork(input:unknown):string[]{try{return validateNetworkShape(input as Network);}catch{return ["invalid-network-shape"];}}
function validateNetworkShape(c:Network):string[]{
 const errors:string[]=[];const finite=(v:number)=>Number.isFinite(v);let nodes=0;
 if(!Array.isArray(c.sections)||c.sections.length<1||c.sections.length>6)return ["sections:1..6"];
 const ids=new Set<string>();const validId=(id:unknown)=>typeof id==="string"&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id)&&!Object.prototype.hasOwnProperty.call(Object.prototype,id);for(const s of c.sections){if(!validId(s.id))errors.push("invalid-id");if(ids.has(s.id))errors.push("duplicate-id");ids.add(s.id);if(![s.lengthM,s.impedanceOhm,s.velocityMS].every(v=>finite(v)&&v>0)||s.lengthM<.001||s.lengthM>1e9||s.velocityMS<1||s.velocityMS>3e8||s.impedanceOhm<.001||s.impedanceOhm>1e6)errors.push("invalid-line");}
 if(!Number.isFinite(c.sections.reduce((n,s)=>n+s.lengthM,0))||!c.sections.every(s=>[s.lengthM/s.velocityMS,s.impedanceOhm/s.velocityMS,1/(s.impedanceOhm*s.velocityMS)].every(Number.isFinite)))errors.push("invalid-derived-line-parameters");
 const q=c.source;if(!q||![q.voltageV,q.resistanceOhm,q.onS,c.durationS].every(finite)||Math.abs(q.voltageV)>1e6||q.resistanceOhm<0||q.resistanceOhm>1e9||q.resistanceOhm>0&&q.resistanceOhm<1e-6||q.onS<0||q.onS>c.durationS||c.durationS<1e-9||c.durationS>10||!Number.isInteger(q.node)||q.node<0||q.node>c.sections.length||q.offS!==undefined&&(!finite(q.offS)||q.offS<=q.onS||q.offS>c.durationS))errors.push("invalid-source-or-time");
 const walk=(l:Load,depth=0)=>{if(!l||depth>6||++nodes>32){errors.push("load-size-limit");return;}if(!validId(l.id))errors.push("invalid-id");if(ids.has(l.id))errors.push("duplicate-id");ids.add(l.id);if(!["r","l","c","wire","open","series","parallel","switch"].includes(l.kind))errors.push("unsupported-element");if(["r","l","c"].includes(l.kind)&&(!finite(l.value??NaN)||(l.value??0)<0||l.kind!=="r"&&l.value===0))errors.push("invalid-component");if(["r","l","c"].includes(l.kind)&&((l.value??0)>(l.kind==="c"?100:l.kind==="l"?1e5:1e8)||(l.value??0)>0&&(l.value??0)<(l.kind==="c"?1e-9:l.kind==="l"?1e-6:.001)))errors.push("component-out-of-range");if(l.initial!==undefined&&(!finite(l.initial)||Math.abs(l.initial)>1e6))errors.push("invalid-initial-state");if(["series","parallel","switch"].includes(l.kind)){if(!l.children?.length||l.kind==="switch"&&l.children.length!==1)errors.push("invalid-connection");l.children?.forEach(x=>walk(x,depth+1));}};walk(c.load);
 if(!Array.isArray(c.events)||c.events.length>64)errors.push("event-limit");else for(const e of c.events){const leaf=loadLeaves(c.load).find(x=>x.id===e.target);const sw=findLoad(c.load,e.target);if(!finite(e.atS)||e.atS<0||e.atS>c.durationS||!finite(e.value)||e.kind==="resistance"&&(!leaf||leaf.kind!=="r"||e.value<0||e.value>1e8||e.value>0&&e.value<.001)||e.kind==="switch"&&(!sw||sw.kind!=="switch"||![0,1].includes(e.value)))errors.push("invalid-event");}
 if(isReactive(c.load)&&c.events.length)errors.push("reactive-live-events-not-supported:recalculate");
 if(isReactive(c.load)&&c.source.node===c.sections.length&&c.source.resistanceOhm===0)errors.push("ideal-source-at-reactive-load-not-supported");
 if(!Array.isArray(c.shunts)||c.shunts.length>7)errors.push("invalid-shunts");
 for(const s of Array.isArray(c.shunts)?c.shunts:[])if(!Number.isInteger(s.node)||s.node<0||s.node>c.sections.length||!finite(s.resistanceOhm)||s.resistanceOhm<.001||s.resistanceOhm>1e9)errors.push("invalid-shunt");
 if(Array.isArray(c.shunts)&&new Set(c.shunts.map(s=>s.node)).size!==c.shunts.length)errors.push("one-shunt-per-node");
 if(!errors.length&&q.node===c.sections.length&&q.resistanceOhm===0){const l=JSON.parse(JSON.stringify(c.load)) as Load;const times=[...new Set([0,q.onS,q.offS??c.durationS,...c.events.map(e=>e.atS)])].sort((a,b)=>a-b);for(const time of times){for(const e of c.events.filter(e=>e.atS===time)){const target=findLoad(l,e.target)!;if(e.kind==="switch")target.closed=!!e.value;else target.value=e.value;}if(time<c.durationS&&drive(c,time)!==0&&shorted(l))errors.push("inconsistent-ideal-source-and-short");}}
 return [...new Set(errors)];
}
function shorted(l:Load):boolean{if(l.kind==="wire"||l.kind==="r"&&l.value===0)return true;if(l.kind==="switch")return !!(l.closed??true)&&shorted(l.children![0]);if(l.kind==="series")return !!l.children?.length&&l.children.every(shorted);if(l.kind==="parallel")return !!l.children?.some(shorted);return false;}
export function findLoad(l:Load,id:string):Load|undefined{return l.id===id?l:l.children?.map(x=>findLoad(x,id)).find(Boolean);}
export function totalLength(c:Network){return c.sections.reduce((n,s)=>n+s.lengthM,0);}
export function boundaries(c:Network){let x=0;return [0,...c.sections.map(s=>x+=s.lengthM)];}
export function historyValue(h:WaveHistory,t:number,linear=false):number{
 const tolerance=64*Number.EPSILON*Math.max(Math.abs(t),Math.abs(h.times.at(-1)??0),Number.MIN_VALUE);if(!h.times.length||t<h.times[0]-tolerance)return 0;
 let lo=0,hi=h.times.length;while(lo<hi){const m=(lo+hi)>>>1;if(h.times[m]<=t+tolerance)lo=m+1;else hi=m;}const k=Math.max(0,lo-1);
 if(linear&&k+1<h.times.length&&t>h.times[k]){const f=(t-h.times[k])/(h.times[k+1]-h.times[k]);return h.values[k]*(1-f)+h.values[k+1]*f;}return h.values[k];
}
function push(h:WaveHistory,t:number,v:number){const n=h.times.length;if(n&&Math.abs(h.times[n-1]-t)<1e-15){h.values[n-1]=v;return;}h.times.push(t);h.values.push(v);}
function portNode(p:number){return Math.floor(p/2)+(p%2);}
function portsAt(c:Network,node:number){return c.sections.flatMap((_,j)=>[2*j,2*j+1]).filter(p=>portNode(p)===node);}
function drive(c:Network,t:number){return t>=c.source.onS&& (c.source.offS===undefined||t<c.source.offS)?c.source.voltageV:0;}
type Eq={g:number;b:number;short:boolean};
const OPEN:Eq={g:0,b:0,short:false};
type State={v:number;i:number};
function companion(l:Load,h:number,states:Map<string,State>,eqs:Map<string,Eq>,overrides:Map<string,number>,initial=false):Eq{
 let e:Eq;const value=overrides.get(l.id)??l.value??0;
 if(l.kind==="open"||l.kind==="switch"&&(overrides.get(l.id)??Number(l.closed??true))===0)e=OPEN;
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
function solveNode(c:Network,node:number,a:number[],load:Eq,t:number){
 const ps=portsAt(c,node),y=ps.reduce((n,p)=>n+1/c.sections[p>>1].impedanceOhm,0),incident=ps.reduce((n,p)=>n+2*a[p]/c.sections[p>>1].impedanceOhm,0);
 const shunt=c.shunts.filter(s=>s.node===node).reduce((n,s)=>n+1/s.resistanceOhm,0),end=node===c.sections.length,src=node===c.source.node;
 if(end&&load.short)return 0;
 if(src&&c.source.resistanceOhm===0)return drive(c,t);
 const gs=src?1/c.source.resistanceOhm:0;
 return (incident+(src?drive(c,t)*gs:0)-(end?load.b:0))/(y+shunt+gs+(end?load.g:0));
}
type Arrival={t:number;port?:number;delta?:number;event?:ModelEvent;node?:number};
class Heap {items:Arrival[]=[];put(x:Arrival){if(this.items.length>=6000)throw Error("wave-queue-limit:shorten-experiment");const a=this.items;let k=a.push(x)-1;while(k){const p=(k-1)>>1;if(a[p].t<=x.t)break;a[k]=a[p];k=p;}a[k]=x;}take(){const a=this.items,first=a[0],last=a.pop()!;if(a.length){let k=0;while(2*k+1<a.length){let j=2*k+1;if(j+1<a.length&&a[j+1].t<a[j].t)j++;if(a[j].t>=last.t)break;a[k]=a[j];k=j;}a[k]=last;}return first;}get first(){return this.items[0];}}
function exact(c:Network):WaveRun{
 const ports=c.sections.flatMap(()=>[{times:[],values:[]} as WaveHistory,{times:[],values:[]} as WaveHistory]),a=ports.map(()=>0),out=ports.map(()=>0),queue=new Heap(),overrides=new Map<string,number>(),events:number[]=[];
 queue.put({t:0,node:c.source.node});queue.put({t:c.source.onS,node:c.source.node});if(c.source.offS!==undefined)queue.put({t:c.source.offS,node:c.source.node});for(const e of c.events)queue.put({t:e.atS,event:e,node:c.sections.length});
 let count=0,fronts=0;while(queue.first&&queue.first.t<=c.durationS+1e-14){const t=queue.first.t,changed=new Set<number>();
  while(queue.first&&Math.abs(queue.first.t-t)<=Math.max(1e-15,Math.abs(t)*1e-12)){if(++count>20000)throw Error("wave-event-limit:shorten-experiment");const e=queue.take();if(e.port!==undefined){a[e.port]+=e.delta!;changed.add(portNode(e.port));}if(e.node!==undefined)changed.add(e.node);if(e.event)overrides.set(e.event.target,e.event.value);}
  const eq=companion(c.load,1,new Map(),new Map(),overrides);events.push(t);
  for(const node of changed){const u=solveNode(c,node,a,eq,t);for(const p of portsAt(c,node)){const b=u-a[p],delta=b-out[p];if(!Number.isFinite(b)||Math.abs(b)>1e12)throw Error("non-finite-wave");if(Math.abs(delta)>1e-12*Math.max(1,Math.abs(c.source.voltageV))){if(++fronts>2400)throw Error("wave-render-budget:shorten-experiment");out[p]=b;push(ports[p],t,b);queue.put({t:t+c.sections[p>>1].lengthM/c.sections[p>>1].velocityMS,port:p^1,delta});}}}
 }
 return ranges({config:c,ports,events:[...new Set(events)].sort((a,b)=>a-b),method:"exact-fronts",stepS:0,deviceEnergy:{times:[0],values:[0]},maxResidual:0,rangeU:[0,0],rangeI:[0,0]});
}
/** Resolve the t=0+ algebraic limits with three BE companion probes; retain exact independent states. */
function initialNetwork(c:Network,epsilon:number):{out:number[];states:Map<string,State>}{
 const trials:{out:number[];states:Map<string,State>}[]=[];
 for(const divisor of [1,2,4]){const states=new Map<string,State>(),eqs=new Map<string,Eq>(),a=c.sections.flatMap(()=>[0,0]),overrides=new Map<string,number>(),eq=companion(c.load,epsilon/divisor,states,eqs,overrides,true),out=a.map(()=>0);
  for(let node=0;node<=c.sections.length;node++){const u=solveNode(c,node,a,eq,0);for(const p of portsAt(c,node))out[p]=u;if(node===c.sections.length){const y=portsAt(c,node).reduce((sum,p)=>sum+1/c.sections[p>>1].impedanceOhm,0)+c.shunts.filter(x=>x.node===node).reduce((sum,x)=>sum+1/x.resistanceOhm,0),s=node===c.source.node?(drive(c,0)-u)/c.source.resistanceOhm:0;commitDevice(c.load,u,s-y*u,eqs,states,overrides);}}
  trials.push({out,states});
 }
 const extrap=(a:number,b:number,c:number)=>a/3-2*b+8*c/3,states=new Map<string,State>();
 for(const [id] of trials[0].states){const a=trials[0].states.get(id)!,b=trials[1].states.get(id)!,d=trials[2].states.get(id)!;states.set(id,{v:extrap(a.v,b.v,d.v),i:extrap(a.i,b.i,d.i)});}
 for(const l of loadLeaves(c.load)){const current=states.get(l.id)??{v:0,i:0};if(l.kind==="c")states.set(l.id,{...current,v:l.initial??0});if(l.kind==="l")states.set(l.id,{...current,i:l.initial??0});}
 const tolerance=(a:number,b:number)=>Math.abs(a-b)<=2e-6*Math.max(1,Math.abs(a),Math.abs(b));
 const verify=(l:Load)=>{if(l.kind==="switch"&&!(l.closed??true))return;const p=states.get(l.id);if(!p)return;if(!Number.isFinite(p.v)||!Number.isFinite(p.i)||Math.abs(p.v)>1e10||Math.abs(p.i)>1e10)throw Error("inconsistent-initial-state");const children=l.children?.map(x=>states.get(x.id)).filter((x):x is State=>!!x)??[];if(children.length){const series=l.kind==="series"||l.kind==="switch";if(series&&(!children.every(x=>tolerance(x.i,p.i))||!tolerance(children.reduce((s,x)=>s+x.v,0),p.v))||!series&&(!children.every(x=>tolerance(x.v,p.v))||!tolerance(children.reduce((s,x)=>s+x.i,0),p.i)))throw Error("inconsistent-initial-state");}l.children?.forEach(verify);};verify(c.load);
 return{states,out:trials[0].out.map((a,j)=>extrap(a,trials[1].out[j],trials[2].out[j]))};
}
function numeric(c:Network,resolution=100):WaveRun{
 const minTau=Math.min(...c.sections.map(s=>s.lengthM/s.velocityMS)),leaves=loadLeaves(c.load),resistances=[c.sections.at(-1)!.impedanceOhm,...(c.source.node===c.sections.length&&c.source.resistanceOhm>0?[c.source.resistanceOhm]:[]),...c.shunts.filter(x=>x.node===c.sections.length).map(x=>x.resistanceOhm),...leaves.filter(l=>l.kind==="r"&&(l.value??0)>0).map(l=>l.value!)],rmin=Math.min(...resistances),rmax=resistances.reduce((a,b)=>a+b,0),deviceTimes=leaves.flatMap(l=>l.kind==="c"?[l.value!*rmin]:l.kind==="l"?[l.value!/rmax]:[]);let h=Math.min(minTau/resolution,c.durationS/600,...deviceTimes.map(t=>t/20));const steps=Math.ceil(c.durationS/h);if(steps>24000)throw Error("dynamic-resolution-limit:shorten-experiment");h=c.durationS/steps;
 const ports=c.sections.flatMap(()=>[{times:[],values:[]} as WaveHistory,{times:[],values:[]} as WaveHistory]),initial=initialNetwork(c,Math.min(...deviceTimes,minTau)*1e-4),states=initial.states,overrides=new Map<string,number>(),energy:WaveHistory={times:[0],values:[loadEnergy(c.load,states)]},events:number[]=[0];
 for(let p=0;p<ports.length;p++)push(ports[p],0,initial.out[p]);let nextEvent=0;const sorted=[...c.events].sort((a,b)=>a.atS-b.atS);
 for(let k=1;k<=steps;k++){const t=k*h,a=ports.map((_,p)=>historyValue(ports[p^1],t-c.sections[p>>1].lengthM/c.sections[p>>1].velocityMS,true));while(nextEvent<sorted.length&&sorted[nextEvent].atS<=t+1e-15){overrides.set(sorted[nextEvent].target,sorted[nextEvent].value);nextEvent++;}
  const eqs=new Map<string,Eq>(),eq=companion(c.load,h,states,eqs,overrides);for(let node=0;node<=c.sections.length;node++){const u=solveNode(c,node,a,eq,t);for(const p of portsAt(c,node))push(ports[p],t,u-a[p]);if(node===c.sections.length)commitDevice(c.load,u,eq.short?0:eq.g*u+eq.b,eqs,states,overrides);}
  push(energy,t,loadEnergy(c.load,states));if(k%Math.max(1,Math.ceil(steps/800))===0||k===steps)events.push(t);
 }
 return ranges({config:c,ports,events,method:"characteristics-trapezoid",stepS:h,deviceEnergy:energy,maxResidual:0,rangeU:[0,0],rangeI:[0,0]});
}
function ranges(run:WaveRun):WaveRun{
 let lowU=0,highU=0,lowI=0,highI=0;const c=run.config;
 // All combinations of independent directional ranges enclose every x/t, not just displayed frames.
 c.sections.forEach((s,j)=>{const f=run.ports[2*j].values,b=run.ports[2*j+1].values;const f0=Math.min(0,...f),f1=Math.max(0,...f),b0=Math.min(0,...b),b1=Math.max(0,...b);lowU=Math.min(lowU,f0+b0);highU=Math.max(highU,f1+b1);lowI=Math.min(lowI,(f0-b1)/s.impedanceOhm);highI=Math.max(highI,(f1-b0)/s.impedanceOhm);});
 run.rangeU=[lowU,highU];run.rangeI=[lowI,highI];return run;
}
export function simulateNetwork(config:Network,options:{resolution?:number}={}):WaveRun{
 const errors=validateNetwork(config);if(errors.length)throw Error(errors.join("; "));const c=JSON.parse(JSON.stringify(config)) as Network;return isReactive(c.load)?numeric(c,options.resolution):exact(c);
}
function atSection(run:WaveRun,j:number,local:number,t:number):WaveValue{const s=run.config.sections[j],linear=run.method!=="exact-fronts",forward=historyValue(run.ports[2*j],t-local/s.velocityMS,linear),backward=historyValue(run.ports[2*j+1],t-(s.lengthM-local)/s.velocityMS,linear);return{u:forward+backward,i:(forward-backward)/s.impedanceOhm,forward,backward,forwardI:forward/s.impedanceOhm,backwardI:-backward/s.impedanceOhm,section:j};}
export function at(run:WaveRun,x:number,t:number):WaveValue{const c=run.config;let left=0,j=0;for(;j<c.sections.length-1&&x>left+c.sections[j].lengthM+1e-9;j++)left+=c.sections[j].lengthM;return atSection(run,j,Math.max(0,Math.min(c.sections[j].lengthM,x-left)),t);}
export type Quantity="u"|"i"|"forward"|"backward"|"forwardI"|"backwardI";
export function spatial(run:WaveRun,t:number,quantity:Quantity="u"):readonly[number,number][]{
 const points:[number,number][]=[];let base=0;for(let j=0;j<run.config.sections.length;j++){const s=run.config.sections[j],positions=[0,s.lengthM];if(run.method==="exact-fronts"){for(const time of run.ports[2*j].times){const x=(t-time)*s.velocityMS;if(x>0&&x<s.lengthM)positions.push(x);}for(const time of run.ports[2*j+1].times){const x=s.lengthM-(t-time)*s.velocityMS;if(x>0&&x<s.lengthM)positions.push(x);}}
  else for(let k=1;k<120;k++)positions.push(s.lengthM*k/120);
  const xs=[...new Set(positions)].sort((a,b)=>a-b);points.push([base,atSection(run,j,0,t)[quantity]]);if(run.method==="exact-fronts")for(let k=0;k<xs.length-1;k++){const mid=base+(xs[k]+xs[k+1])/2,value=atSection(run,j,mid-base,t)[quantity];points.push([base+xs[k],value],[base+xs[k+1],value]);}
  else for(const x of xs)points.push([base+x,atSection(run,j,x,t)[quantity]]);points.push([base+s.lengthM,atSection(run,j,s.lengthM,t)[quantity]]);base+=s.lengthM;
 }return points;
}
export function timeTrace(run:WaveRun,x:number,quantity:Quantity="u"):readonly[number,number][]{
 if(run.method!=="exact-fronts")return run.events.map(t=>[t,at(run,x,t)[quantity]] as const);
 let base=0,j=0;while(j<run.config.sections.length-1&&x>base+run.config.sections[j].lengthM){base+=run.config.sections[j++].lengthM;}const s=run.config.sections[j],local=x-base,times=[0,run.config.durationS,...run.ports[2*j].times.map(t=>t+local/s.velocityMS),...run.ports[2*j+1].times.map(t=>t+(s.lengthM-local)/s.velocityMS)].filter(t=>t>=0&&t<=run.config.durationS),sorted=[...new Set(times)].sort((a,b)=>a-b);const result:[number,number][]=[];for(const t of sorted){if(t>0)result.push([t,at(run,x,Math.max(0,t-Math.max(1e-14,run.config.durationS*1e-10)))[quantity]]);result.push([t,at(run,x,t)[quantity]]);}return result;
}
export function lineEnergy(run:WaveRun,t:number):number{const xs=[...new Set(spatial(run,t).map(p=>p[0]))].sort((a,b)=>a-b);let energy=0;for(let j=1;j<xs.length;j++){const v=at(run,(xs[j]+xs[j-1])/2,t),s=run.config.sections[v.section];energy+=(v.forward*v.forward+v.backward*v.backward)/(s.impedanceOhm*s.velocityMS)*(xs[j]-xs[j-1]);}return energy;}
export function nodePort(run:WaveRun,node:number,t:number){const c=run.config,ps=portsAt(c,node),u=ps.length?historyValue(run.ports[ps[0]],t,run.stepS>0)+historyValue(run.ports[ps[0]^1],t-c.sections[ps[0]>>1].lengthM/c.sections[ps[0]>>1].velocityMS,run.stepS>0):0;const intoLines=ps.reduce((sum,p)=>sum+(historyValue(run.ports[p],t,run.stepS>0)-historyValue(run.ports[p^1],t-c.sections[p>>1].lengthM/c.sections[p>>1].velocityMS,run.stepS>0))/c.sections[p>>1].impedanceOhm,0);return{u,intoLines};}
