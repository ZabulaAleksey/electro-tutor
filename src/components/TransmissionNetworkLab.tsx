import {useUnsavedChanges} from "../engineering/useUnsavedChanges";
import { LoaderCircle, Pause, Play, Square } from "lucide-react";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Language} from "../types";
import EngineeringPlot from "../engineering/EngineeringPlot";
import {engineeringAxis} from "../engineering/scale";
import {formatEngineeringNumber as n,formatEngineeringValue} from "../engineering/format";
import {localePath} from "../site-path";
import {at,branchVoltage,contactsOf,estimateNetwork,hasLineLoss,DEFAULT_NETWORK,findLoad,nodePort,simulateNetwork,spatial,timeTrace,totalLength,validateNetwork,type Network,type WaveRun} from "../transient/network";
import {NumberEdit,type Layout} from "../transient/NetworkEditor";
import NetworkWorkbench, {restoreNetworkLayout} from "../transient/NetworkWorkbench";
import NetworkInspector from "../transient/NetworkInspector";
import {networkError} from "../transient/network-copy";
import {loadReplacement,readDetached,removeLoad,removeSection,sectionBoundaries,type DetachedPart,type Selection} from "../transient/network-edit";
import { downloadSvg } from "../engineering/exportSvg";
import { experimentRows, experimentTimeLabel, parseExperimentDuration } from "../transient/network-experiment";
import type { Ink } from "../engineering/handwriting";
import {linkMatches,readInkDocument,sameInkTarget,type InkLink,type InkTarget} from "../transient/network-ink";
import "./TransmissionNetworkLab.css";
type Document = {model:Network; layout:Layout; detached:DetachedPart[]; ink?:Ink[]; inkLinks?:(InkLink|null)[]; empty?:boolean};
const documentByteLimit = 320_000;
const documentSize = (value: string) => new TextEncoder().encode(value).byteLength;
const draftKey = "electrotutor-line-draft-v5";
function readLayout(input:unknown):Layout{
 if(!input||typeof input!=="object")return {};
 return Object.fromEntries(Object.entries(input).filter(([id,value])=>
  /^@?[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id)&&typeof value==="number"&&Number.isFinite(value)&&Math.abs(value)<=1e6));
}
function withoutSectionLayout(layout: Layout, id: string): Layout {
 const next = {...layout};
 for(const key of [id,"@x-"+id,"@rot-"+id,"@span-"+id])delete next[key];
 return next;
}
const legacyDraftKey = "electrotutor-line-draft";
const usesNewComponents=(model:Network)=>model.load?.kind==="diode"||
 [...model.series??[],...model.branches??[]].some(link=>link.resistanceOhm===undefined&&!link.switch);
type Limits={u:readonly[number,number];i:readonly[number,number]};
const limits=(run:WaveRun):Limits=>({u:engineeringAxis(...run.rangeU,{includeZero:true,targetTicks:5}).domain,i:engineeringAxis(...run.rangeI,{includeZero:true,targetTicks:5}).domain});
const speeds=Array.from({length:10},(_,index)=>2**(index-4));
export default function TransmissionNetworkLab({language}:{language:Language}){
 const ru=language==="ru",[mounted,setMounted]=useState(false),[model,setModel]=useState<Network>(()=>structuredClone(DEFAULT_NETWORK)),[run,setRun]=useState<WaveRun>(()=>simulateNetwork(DEFAULT_NETWORK)),[time,setTime]=useState(0),[speed,setSpeed]=useState(1),[running,setRunning]=useState(false),[probe,setProbe]=useState(750000),[mode,setMode]=useState<"recalculate"|"live">("recalculate"),[domains,setDomains]=useState<Limits>(()=>limits(simulateNetwork(DEFAULT_NETWORK))),[busy,setBusy]=useState(true),[error,setError]=useState(""),[waves,setWaves]=useState(true),[layout,setLayout]=useState<Layout>({}),[selection,setSelection]=useState<Selection|null>(null),[revision,setRevision]=useState(0);
 const [progress,setProgress]=useState(0),[retry,setRetry]=useState(0);
 const [durationDraft,setDurationDraft]=useState<string|null>(null),[timeZoom,setTimeZoom]=useState(1),[windowCenter,setWindowCenter]=useState(0);
 const voltagePlot=useRef<HTMLDivElement>(null);
 const [empty,setEmpty]=useState(false);
 const [ink,setInk]=useState<Ink[]>([]);
 const [inkLinks,setInkLinks]=useState<(InkLink|null)[]>([]);
 const [detached,setDetached]=useState<DetachedPart[]>([]);
 const [actionError,setActionError]=useState("");
 const [savedDocument,setSavedDocument]=useState(JSON.stringify({model:structuredClone(DEFAULT_NETWORK),layout:{},detached:[]}));const restore=useRef(false);
 const worker=useRef<Worker|null>(null),request=useRef(0),preserve=useRef(false),timeRef=useRef(0),speedRef=useRef(1),past=useRef<Document[]>([]),future=useRef<Document[]>([]),file=useRef<HTMLInputElement>(null);
 useEffect(()=>{timeRef.current=time;},[time]);useEffect(()=>{speedRef.current=speed;},[speed]);
 useEffect(()=>{
  if(restore.current)return;
  restore.current=true;
  try{
   const data=[draftKey,"electrotutor-line-draft-v4","electrotutor-line-draft-v3",legacyDraftKey]
    .map(key=>localStorage.getItem(key)).find(value=>value!==null);
   if(!data||documentSize(data)>documentByteLimit)return;
   const parsed=JSON.parse(data);
   if(validateNetwork(parsed.model).length)return;
   const detached=readDetached(parsed.detached);
   const restored=parsed.empty===true?structuredClone(DEFAULT_NETWORK):parsed.model;
   const layout=restoreNetworkLayout(readLayout(parsed.layout),restored,parsed.empty===true);
   const {ink:restoredInk,links:restoredLinks}=readInkDocument(parsed.ink,parsed.inkLinks,restored,detached,parsed.empty===true);
   setInk(restoredInk);setInkLinks(restoredLinks);
   setModel(restored);setLayout(layout);setDetached(detached);setEmpty(parsed.empty===true);
   setSavedDocument(JSON.stringify({model:restored,layout,detached,...(restoredInk.length?{ink:restoredInk}:{}),...(restoredLinks.some(Boolean)?{inkLinks:restoredLinks}:{}),...(parsed.empty===true?{empty:true}:{})}));
  }catch{/* Existing model stays usable when local storage is unavailable. */}
 },[]);
 useEffect(()=>setMounted(true),[]);
 function cancelCalculation(){
  ++request.current;
  worker.current?.terminate();
  worker.current=null;
  setBusy(false);setRunning(false);
  setError(ru?"Расчёт отменён.":"Розрахунок скасовано.");
 }
 useEffect(()=>{
  const id=++request.current;
  setProgress(0);
  if(empty){setBusy(false);setError("");return;}
  const errors=validateNetwork(model);
  if(errors.length){setBusy(false);setError(networkError(errors.join("; "),language));return;}
  setBusy(true);setError("");
  const w=new Worker(new URL("../transient/network.worker.ts",import.meta.url),{type:"module"});worker.current=w;w.onmessage=(e:MessageEvent<{id:number;run?:WaveRun;error?:string;progress?:number}>)=>{if(e.data.id!==request.current)return;if(e.data.progress!==undefined){setProgress(e.data.progress);return;}setBusy(false);if(e.data.error){setError(networkError(e.data.error,language));setRunning(false);return;}if(e.data.run){setRun(e.data.run);if(!preserve.current)setDomains(limits(e.data.run));setError("");}};w.onerror=()=>{setError(ru?"Вычислитель недоступен. Расчёт не выполнен.":"Обчислювач недоступний. Розрахунок не виконано.");setBusy(false);setRunning(false);};
  const timer=setTimeout(()=>{if(request.current===id)w.postMessage({id,config:model});},120);
  return()=>{clearTimeout(timer);w.terminate();if(worker.current===w)worker.current=null;};
 },[model,language,empty,retry,ru]);
 useEffect(()=>{if(!running)return;let frame=0,last:number|undefined;const media=matchMedia("(prefers-reduced-motion: reduce)");const stop=()=>{if(document.hidden||media.matches)setRunning(false);};if(document.hidden||media.matches){setRunning(false);return;}const tick=(now:number)=>{if(last!==undefined){const dt=Math.min(.1,(now-last)/1000)*speedRef.current*run.config.durationS/8;const next=Math.min(run.config.durationS,timeRef.current+dt);timeRef.current=next;setTime(next);if(next>=run.config.durationS){setRunning(false);return;}}last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);document.addEventListener("visibilitychange",stop);media.addEventListener("change",stop);return()=>{cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",stop);media.removeEventListener("change",stop);};},[running,run]);
 function apply(next:Document,keep=false){
  setInk(next.ink??[]);
  setInkLinks(next.inkLinks??[]);
  setLayout(next.layout);
  setDetached(next.detached);
  setEmpty(!!next.empty);
  if(next.model===model&&!!next.empty===empty)return;
  preserve.current=keep;
  setRevision(v=>v+1);
  if(!keep){setRunning(false);setTime(0);timeRef.current=0;setTimeZoom(1);setWindowCenter(0);}
  setModel(next.model);
  setProbe(x=>Math.min(x,totalLength(next.model)));
 }
 function edit(next:Network,keep=false,nextLayout=layout,nextDetached=detached,nextEmpty=empty,nextInk=ink,nextLinks=inkLinks){
  if(next!==model&&JSON.stringify(next)===JSON.stringify(model))next=model;
  if(next===model&&JSON.stringify(nextLayout)===JSON.stringify(layout)&&JSON.stringify(nextDetached)===JSON.stringify(detached)&&nextEmpty===empty&&nextInk===ink&&nextLinks===inkLinks)return;
  setActionError("");
  past.current.push({model,layout,detached,ink,inkLinks,empty});
  if(past.current.length>40)past.current.shift();
  future.current=[];
  const validLinks=nextInk.length ? nextLinks.map(link=>link&&linkMatches(link,next,nextDetached,nextEmpty)?link:null) : [];
  apply({model:next,layout:nextLayout,detached:nextDetached,ink:nextInk,inkLinks:validLinks,empty:nextEmpty},keep);
 }
 function history(direction:"undo"|"redo"){
  const from=direction==="undo"?past:future,to=direction==="undo"?future:past,next=from.current.pop();
  if(!next)return;
  to.current.push({model,layout,detached,ink,inkLinks,empty});
  apply(next);
 }
 const selected=selection&&(!empty||selection.kind==="detached")&&(selection.kind==="detached"?detached.some(part=>part.id===selection.id):selection.kind==="line"?model.sections.some(s=>s.id===selection.id):
  selection.kind==="shunt"?model.shunts.some(sh=>sh.node===selection.node):selection.kind==="contact"?[...model.series??[],...model.branches??[]].some(link=>link.id===selection.id):selection.kind==="load"&&selection.id?!!findLoad(model.load,selection.id):true)?selection:null;
 function deleteSection(index:number){
  const result=removeSection(model,index);
  if("error" in result){
   setActionError(result.error==="attached-contacts"?(ru?"Сначала перенесите или удалите элементы в соседних узлах.":"Спочатку перенесіть або видаліть елементи в сусідніх вузлах."):result.error==="merge-shunts"?(ru?"Удалите один из двух шунтов перед объединением узлов.":"Видаліть один із двох шунтів перед об’єднанням вузлів."):networkError(result.error!,language));
   return;
  }
  if(result.confirm&&!window.confirm(ru?"После удаления подключения правого узла перейдут на соседний узел. Продолжить?":"Після видалення підключення правого вузла перейдуть на сусідній вузол. Продовжити?"))return;
  edit(result.model,false,withoutSectionLayout(layout,model.sections[index].id));
  setSelection(null);
 }
 function seek(t:number){setRunning(false);const next=Math.max(0,Math.min(run.config.durationS,t));timeRef.current=next;setTime(next);}
 function physicalEvent(id:string,value:number,kind:"resistance"|"switch"="resistance"){
  if(run.method!=="exact-fronts"){setRunning(false);setError(ru?"Живые события поддержаны для резистивной схемы. Для RLC используйте пересчёт.":"Живі події підтримано для резистивної схеми. Для RLC використайте перерахунок.");return;}
  const prior=model.events.filter(e=>e.target===id&&e.atS<=time).sort((a,b)=>a.atS-b.atS).at(-1)?.value??findLoad(model.load,id)?.value??Number(findLoad(model.load,id)?.closed??true);
  edit({...model,events:[...model.events.filter(e=>!(e.target===id&&Math.abs(e.atS-time)<1e-12)),{id:`event-${Date.now()}`,atS:time,target:id,kind,value,previous:prior}]},true);
 }
 function changeLoad(load:Network["load"]){
  if(mode==="live"&&time>0){
   const all=(item:Network["load"]):Network["load"][]=>[item,...(item.children?.flatMap(all)??[])];
   const changed=all(load).filter(item=>{
    const current=findLoad(effectiveLoad,item.id);
    return item.kind==="switch"&&current?.kind==="switch"&&current.closed!==item.closed;
   });
   if(changed.length===1){physicalEvent(changed[0].id,Number(changed[0].closed),"switch");return;}
  }
  const retainBase=(item:Network["load"]):Network["load"]=>{
   const base=findLoad(model.load,item.id),current=findLoad(effectiveLoad,item.id);
   const children=item.children?.map(retainBase);
   if(base?.kind!==item.kind||current?.kind!==item.kind)return {...item,children};
   return {...item,value:current.value===item.value?base.value:item.value,
    closed:current.closed===item.closed?base.closed:item.closed,children};
  };
  const next=loadReplacement(model,retainBase(load));
  if(validateNetwork(next).includes("reactive-live-events-not-supported:recalculate")){
   if(!window.confirm(ru?"Для расчёта с RLC нужно удалить записанные события. Продолжить?":"Для розрахунку з RLC потрібно видалити записані події. Продовжити?"))return;
   edit({...next,events:[]});
   return;
  }
  edit(next);
 }
 const L=totalLength(run.config),reading=at(run,probe,time),effectiveLoad=useMemo(()=>{const l=structuredClone(model.load);for(const e of model.events.filter(e=>e.atS<=time).sort((a,b)=>a.atS-b.atS)){const element=findLoad(l,e.target);if(element){if(e.kind==="switch")element.closed=!!e.value;else element.value=e.value;}}return l;},[model,time]);
 const spatialU=useMemo(()=>spatial(run,time,"u"),[run,time]),spatialI=useMemo(()=>spatial(run,time,"i"),[run,time]);
 const windowWidth=run.config.durationS/timeZoom;
 const timeStart=Math.max(0,Math.min(run.config.durationS-windowWidth,windowCenter-windowWidth/2)),timeEnd=timeStart+windowWidth;
 const traceU=useMemo(()=>timeTrace(run,probe,"u",timeStart,timeEnd),[run,probe,timeStart,timeEnd]),
  traceI=useMemo(()=>timeTrace(run,probe,"i",timeStart,timeEnd),[run,probe,timeStart,timeEnd]);
 const cost=useMemo(()=>empty?null:estimateNetwork(model),[model,empty]);
 const earliest=Math.max(1e-9,model.source.onS,model.source.offS??0,...model.events.map(event=>event.atS),
  ...contactsOf(model).map(link=>link.switch?.atS??0));
 const parsedDuration=durationDraft===null?null:parseExperimentDuration(durationDraft);
 function duration(seconds:number){
  if(seconds<earliest){setActionError(ru?"Длительность должна включать все коммутации.":"Тривалість має охоплювати всі комутації.");return;}
  edit({...model,durationS:seconds});
 }
 const source=nodePort(run,run.config.source.node,time),loadPort=nodePort(run,run.config.sections.length,time),boundary=sectionBoundaries(run.config);
 const numericErrors=empty?[]:validateNetwork(model),valid=!empty&&mounted&&!numericErrors.length&&!busy&&!error&&JSON.stringify(run.config)===JSON.stringify(model);
 const documentValue=JSON.stringify({model,layout,detached,...(ink.length?{ink}:{}),...(inkLinks.some(Boolean)?{inkLinks}:{}),...(empty?{empty:true}:{})});
 const version5=model.source.currentA!==undefined||ink.length>0||empty||detached.length>0||Object.entries(layout).some(([key,value])=>key.startsWith("@x-")||key.startsWith("@rot-")||value<50||value>110)||
  (contactsOf(model).some(link=>link.component)||hasLineLoss(model));
 const inspectedDiode=selected?.kind==="contact"?contactsOf(model).find(link=>link.id===selected.id):undefined;
 const diodePoint=!valid?undefined:inspectedDiode?.component?.kind==="diode"?
  (inspectedDiode.component.diode.reversed?-1:1)*branchVoltage(run,inspectedDiode,time):
  run.config.load.kind==="diode"?(run.config.load.diode?.reversed?-1:1)*at(run,L,time).u:undefined;
 const saveLocal=()=>{try{if(documentSize(documentValue)>documentByteLimit||validateNetwork(model).length)throw Error();localStorage.setItem(draftKey,documentValue);setSavedDocument(documentValue);return true;}catch{return false;}};
 useEffect(()=>{
  if(!mounted||documentValue===savedDocument||documentSize(documentValue)>documentByteLimit||validateNetwork(model).length)return;
  try{localStorage.setItem(draftKey,documentValue);setSavedDocument(documentValue);}catch{/* Explicit save and navigation guard remain available. */}
 },[mounted,documentValue,savedDocument,model]);
 const navigationDialog=useUnsavedChanges({dirty:documentValue!==savedDocument,onSave:saveLocal,language});
 const exportModel=()=>{if(!saveLocal()){setActionError(ru?"Не удалось сохранить схему локально":"Не вдалося зберегти схему локально");return;}const data=JSON.stringify({schema:version5?"electrotutor-line-v5":usesNewComponents(model)?"electrotutor-line-v4":model.series?.length||model.branches?.length?"electrotutor-line-v3":"electrotutor-line-v2",model,layout,...(version5?{detached,...(ink.length?{ink}:{}),...(inkLinks.some(Boolean)?{inkLinks}:{}),...(empty?{empty:true}:{})}:{})}),url=URL.createObjectURL(new Blob([data],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="electrotutor-line.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const start=()=>{if(time>=run.config.durationS)seek(0);setRunning(true);};
 const eventTimes=[0,...run.events,run.config.durationS].sort((a,b)=>a-b),next=eventTimes.find(t=>t>time+1e-12),previous=[...eventTimes].reverse().find(t=>t<time-1e-12);
 const units=(v:number,unit:string)=>formatEngineeringValue(v,unit,language);
 function exportTrace(format:"json"|"csv"){
  if(!valid)return;
  const rows=experimentRows(run,probe);
  const content=format==="csv"
   ? ["time_s,voltage_V,current_A",...Array.from(rows,row=>row.join(","))].join("\n")
   : JSON.stringify({
      schema:"electrotutor-line-experiment-v1",
      circuit:{model:run.config,layout,detached,...(ink.length?{ink}:{}),...(inkLinks.some(Boolean)?{inkLinks}:{})},
      time:{startS:0,endS:run.config.durationS,currentS:time,stepS:run.stepS},
      method:run.method,
      probeM:probe,
      units:{position:"m",time:"s",voltage:"V",current:"A"},
      columns:["time_s","voltage_V","current_A"],
      measurements:Array.from(rows),
     });
  const url=URL.createObjectURL(new Blob([content],{type:format==="csv"?"text/csv":"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download="electrotutor-line-experiment."+format;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const plot=(axis:"x"|"t",q:"u"|"i")=>{const pts=axis==="x"?(q==="u"?spatialU:spatialI):(q==="u"?traceU:traceI),curves=[{label:axis==="x"?`${q.toUpperCase()}(x)`:`${q.toUpperCase()}(t)`,color:axis==="x"||q==="u"?"blue":"orange",points:pts}];if(waves&&axis==="x"){curves.push({label:ru?`Прямая ${q.toUpperCase()}⁺`:`Пряма ${q.toUpperCase()}⁺`,color:"red",points:spatial(run,time,q==="u"?"forward":"forwardI")});curves.push({label:ru?`Обратная ${q.toUpperCase()}⁻`:`Зворотна ${q.toUpperCase()}⁻`,color:"green",points:spatial(run,time,q==="u"?"backward":"backwardI")});}
  return <EngineeringPlot plot={{xLabel:axis==="x"?"x, m":"t, s",yLabel:q==="u"?"U, V":"I, A",xMax:axis==="x"?L:timeEnd,xMin:axis==="t"?timeStart:0,yMin:domains[q][0],yMax:domains[q][1],curves:curves.map((c,j)=>({...c,dash:j>0}))}} language={language} domains={{x:axis==="x"?[0,L]:[timeStart,timeEnd],y:domains[q]}} selected={[axis==="x"?probe:time,reading[q]]} cursorTime={axis==="t"&&time>=timeStart&&time<=timeEnd?time:undefined} verticals={axis==="x"?boundary:undefined} onSelect={p=>axis==="x"?setProbe(Math.max(0,Math.min(L,p[0]))):seek(p[0])} label={`${q.toUpperCase()}(${axis})`} legendClass="network-legend"/>;
 };
 return <fieldset disabled={!mounted} aria-hidden={!mounted} className="lab-hydration-guard"><div className="network-lab" data-network-lab data-calculation-ready={valid?"true":"false"} data-method={run.method} data-model-revision={revision} data-current-time={time} data-current-speed={speed} data-probe-u={reading.u} data-probe-i={reading.i}>
  <section className="network-workbench" aria-label={ru?"Конструктор линий":"Конструктор ліній"}>
   <NetworkWorkbench model={model} layout={layout} language={language} selected={selected} onSelect={setSelection}
    empty={empty} onClear={()=>{edit(structuredClone(DEFAULT_NETWORK),false,{},[],true,[]);setSelection(null);}}
    onProbe={index=>{if(index>=0)setProbe(model.sections.slice(0,index).reduce((sum,line)=>sum+line.lengthM,0)+model.sections[index].lengthM/2);}}
    onDetach={(item,part)=>{
     let next:Network;
     let nextLayout=layout;
     if(item.kind==="contact")next={...model,series:model.series?.filter(link=>link.id!==item.id),branches:model.branches?.filter(link=>link.id!==item.id)};
     else if(item.kind==="shunt")next={...model,shunts:model.shunts.filter(shunt=>shunt.node!==item.node)};
     else if(item.kind==="load"){
      const load=findLoad(model.load,item.id??model.load.id);
      if(!load||load.children?.length||load.kind==="open")return;
      next=loadReplacement(model,removeLoad(model.load,load.id));
     }else if(item.kind==="line"){
      const result=removeSection(model,model.sections.findIndex(section=>section.id===item.id));
      if("error" in result||result.confirm){setActionError(ru?"Сначала перенесите подключения линии.":"Спочатку перенесіть підключення лінії.");return;}
      next=result.model;
      nextLayout=withoutSectionLayout(layout,item.id);
     }else return;
     const errors=validateNetwork(next);
     if(errors.length){setActionError(networkError(errors.join("; "),language));return;}
     const target: InkTarget | null = item.kind==="load" ? {kind:"load",id:item.id??model.load.id} :
       item.kind==="contact" || item.kind==="line" ? item : null;
     const links=inkLinks.map(link=>link&&target&&sameInkTarget(link.target,target)
       ? {...link,target:{kind:"detached",id:part.id} as const,kind:link.kind==="ground"?"wire" as const:link.kind} : link);
     edit(next,false,nextLayout,[...detached,part],empty,ink,links);setSelection({kind:"detached",id:part.id});
    }}
    onDelete={item=>{
     if(item.kind==="load"&&findLoad(model.load,item.id??model.load.id)?.children?.length&&
        !window.confirm(ru?"Удалить нагрузку и все её элементы?":"Видалити навантаження та всі його елементи?"))return;
     if(item.kind==="line"){deleteSection(model.sections.findIndex(line=>line.id===item.id));return;}
     if(item.kind==="detached")edit(model,true,layout,detached.filter(part=>part.id!==item.id));
     else if(item.kind==="contact")edit({...model,series:model.series?.filter(link=>link.id!==item.id),branches:model.branches?.filter(link=>link.id!==item.id)});
     else if(item.kind==="shunt")edit({...model,shunts:model.shunts.filter(shunt=>shunt.node!==item.node)});
     else if(item.kind==="load")edit(loadReplacement(model,removeLoad(model.load,item.id??model.load.id)));
     else {setActionError(ru?"Источник необходим для расчёта. Его можно переместить.":"Джерело потрібне для розрахунку. Його можна перемістити.");return;}
     setSelection(null);
    }}
    ink={ink} inkLinks={inkLinks}
    onSketchCommit={(next,item,nextLayout,nextDetached,strokes,kind,index)=>{
     const target: InkTarget | null = item?.kind==="load" ? {kind:"load",id:item.id??next.load.id} :
       item?.kind==="shunt" ? null : item;
     const link=target?{target,kind}:null;
     const links=ink.map((_,i)=>inkLinks[i]??null);
     const nextInk=index===undefined?[...ink.slice(-19),strokes]:ink.map((mark,i)=>i===index?strokes:mark);
     // Replacing an excitation gives ownership to its latest mark.
     const nextLinks=index===undefined
       ? [...links.slice(-19).map(before=>target&&before&&sameInkTarget(before.target,target)?null:before),link]
       : links.map((before,i)=>i===index?link:before);
     edit(next,false,nextLayout,nextDetached,item&&item.kind!=="detached"?false:empty,nextInk,nextLinks);
     setSelection(item);
    }}
    detached={detached} onDetached={next=>edit(model,true,layout,next)}
    onCommit={(next,item,previous)=>{
     const target: InkTarget | null=item.kind==="load"?{kind:"load",id:item.id??next.load.id}:item.kind==="shunt"?null:item;
     const from: InkTarget | undefined=previous?.kind==="load"?{kind:"load",id:previous.id??model.load.id}:
       previous?.kind==="shunt"?undefined:previous;
     const links=inkLinks.map(link=>{
      if(!link||!target)return link;
      if(from&&sameInkTarget(link.target,from))return {...link,target};
      return sameInkTarget(link.target,target)&&item.kind==="load"?null:link;
     });
     const nextParts=previous?.kind==="detached"?detached.filter(part=>part.id!==previous.id):detached;
     edit(next,false,layout,nextParts,false,ink,links);
     setSelection(item);
    }}
    inspector={arm=>selected&&selected.kind!=="detached"&&<NetworkInspector selection={selected} model={model} load={effectiveLoad} language={language}
     onEdit={next=>{const errors=validateNetwork(next);if(errors.length)setActionError(networkError(errors.join("; "),language));else edit(next);}} onMove={arm} onDeleteLine={deleteSection} onChangeLoad={changeLoad} onResistance={physicalEvent}
     live={mode==="live"} time={time} onMode={setMode}
     diodePoint={diodePoint}
     onDuration={durationS=>edit({...model,durationS})}/>}
    undo={()=>history("undo")} redo={()=>history("redo")} canUndo={!!past.current.length} canRedo={!!future.current.length}
    load={effectiveLoad} time={time} onLayout={(next)=>edit(model,true,next)}
    tools={<><button type="button" onClick={exportModel}>{ru?"Сохранить схему":"Зберегти схему"}</button>
     <button type="button" onClick={()=>file.current?.click()}>{ru?"Открыть JSON":"Відкрити JSON"}</button>
     <input ref={file} hidden type="file" accept=".json,application/json" onChange={async e=>{
      const f=e.target.files?.[0];if(!f)return;
      try{
       if(f.size>documentByteLimit)throw Error("file-limit:320kB");
       const saved=JSON.parse(await f.text());
       if(!["electrotutor-line-v2","electrotutor-line-v3","electrotutor-line-v4","electrotutor-line-v5"].includes(saved.schema))throw Error("schema");
       if(saved.schema!=="electrotutor-line-v5"&&saved.model?.source?.currentA!==undefined)throw Error("schema");
       if(saved.schema==="electrotutor-line-v2"&&(saved.model?.series?.length||saved.model?.branches?.length)||
          ["electrotutor-line-v2","electrotutor-line-v3"].includes(saved.schema)&&usesNewComponents(saved.model))throw Error("schema");
       const errors=validateNetwork(saved.model);if(errors.length)throw Error(errors.join(";"));
       const latest=saved.schema==="electrotutor-line-v5";
       if(!latest&&(contactsOf(saved.model).some(link=>link.component)||hasLineLoss(saved.model)))throw Error("schema");
       const blank=latest&&saved.empty===true;
       const imported=blank?structuredClone(DEFAULT_NETWORK):saved.model;
       const importedLayout=readLayout(saved.layout);
       const restoredLayout=restoreNetworkLayout(importedLayout,imported,blank);
       const importedParts=latest?readDetached(saved.detached):[];
       const archive=latest?readInkDocument(saved.ink,saved.inkLinks,imported,importedParts,blank):{ink:[],links:[]};
       edit(imported,false,restoredLayout,importedParts,blank,archive.ink,archive.links);
       if (restoredLayout!==importedLayout) setActionError(networkError("unroutable-layout",language));
       setSelection(null);
      }catch(error){setActionError(networkError(String(error),language));}e.target.value="";
     }}/></>}
    transport={<>
     <button type="button" className="network-play" disabled={!valid||running} aria-busy={busy&&!empty} onClick={start}>
      {busy&&!empty ? <LoaderCircle size={16} className="network-play-spinner" aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}
      Пуск
     </button>
     <button type="button" disabled={!running} onClick={()=>setRunning(false)}><Pause size={16} aria-hidden="true"/>Пауза</button>
     <button type="button" disabled={!running&&time===0} onClick={()=>seek(0)}><Square size={16} aria-hidden="true"/>Стоп</button>
     <label className="network-speed-choice"><span>{ru?"Скорость":"Швидкість"}</span><select value={speed} onChange={event=>setSpeed(Number(event.target.value))}>
      {speeds.map(value=><option key={value} value={value}>×{value<1?"1/"+1/value:value}</option>)}
     </select></label>
    </>}
    timing={<>
     <div className="network-duration">
      <label className="network-field">
       <span>{ru?"Длительность расчёта":"Тривалість розрахунку"}</span>
       <input type="text" placeholder="10 ms" value={durationDraft??experimentTimeLabel(model.durationS,language,true)}
        aria-invalid={durationDraft!==null&&(parsedDuration===null||parsedDuration<earliest||parsedDuration>10)}
        onChange={event=>setDurationDraft(event.target.value)}
        onBlur={()=>{
         if(durationDraft===null)return;
         const seconds=parsedDuration;
         if(seconds===null||seconds>10){
          setActionError(ru?"Введите длительность до 10 s с единицей s, ms или µs.":"Введіть тривалість до 10 s з одиницею s, ms або µs.");
          return;
         }
         duration(seconds);
         if(seconds>=earliest)setDurationDraft(null);
        }}
        onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();if(event.key==="Escape")setDurationDraft(null);}}/>
      </label>
      <div className="network-buttons">{[.001,.01,.1,1,10].map(seconds=><button type="button" key={seconds} onClick={()=>{setDurationDraft(null);duration(seconds);}}>{experimentTimeLabel(seconds,language)}</button>)}</div>
      {cost?.kind==="numeric"&&<small>{n(cost.steps,language)} {ru?"шагов":"кроків"} · {n(cost.bytes/1048576,language)} MiB {ru?"данных":"даних"}{cost.steps>cost.limit?(ru?" · превышен расчётный бюджет":" · перевищено розрахунковий бюджет"):""}</small>}
     </div>
     <NumberEdit label={ru?"Физическое время t, ms":"Фізичний час t, ms"} value={time*1000} min={0} max={run.config.durationS*1000} onChange={v=>seek(v/1000)}/>
     <input type="range" aria-label={ru?"Курсор времени":"Курсор часу"} min="0" max={run.config.durationS} step={run.config.durationS/2000} value={time} onChange={e=>seek(Number(e.target.value))}/>
     <div className="network-buttons">
      <button type="button" onClick={()=>seek(previous??Math.max(0,time-run.config.durationS/100))}>← {ru?"Шаг":"Крок"}</button>
      <button type="button" onClick={()=>seek(next??Math.min(run.config.durationS,time+run.config.durationS/100))}>{ru?"Шаг":"Крок"} →</button>
      <button type="button" disabled={next===undefined||run.method!=="exact-fronts"} onClick={()=>next!==undefined&&seek(next)}>{ru?"Следующий фронт":"Наступний фронт"}</button>
     </div>
     <label>{ru?"Окно времени":"Вікно часу"} <select value={timeZoom} onChange={event=>{setWindowCenter(time);setTimeZoom(Number(event.target.value));}}>
      {[1,2,5,10,50,100].map(factor=><option key={factor} value={factor}>×{factor}</option>)}
     </select></label>
     {timeZoom>1&&<label>{ru?"Центр окна":"Центр вікна"} <input type="range" min={0} max={run.config.durationS} step={run.config.durationS/2000} value={windowCenter} onChange={event=>setWindowCenter(Number(event.target.value))}/></label>}
    </>}
    reference={localePath(language,"/interactive/transmission-line-reference/")}/>
   <div className="network-workbench-links"><small>{ru?"MCP — скоро":"MCP — незабаром"}</small>
    {empty&&<small>{ru?"Добавьте линию":"Додайте лінію"}</small>}
    {busy&&!empty&&<><progress max={1} value={progress} aria-label={ru?"Прогресс расчёта":"Хід розрахунку"}/><button type="button" onClick={cancelCalculation}>{ru?"Отменить расчёт":"Скасувати розрахунок"}</button></>}
    {!busy&&error&&!empty&&<button type="button" onClick={()=>setRetry(value=>value+1)}>{ru?"Повторить расчёт":"Повторити розрахунок"}</button>}</div>
   {actionError&&<p role="alert" className="network-error">{actionError}</p>}
  </section>
  <section hidden={empty} id="network-results" aria-labelledby="network-measurements-title" className="network-measurements">
   <h2 id="network-measurements-title">{ru?"Измерения":"Вимірювання"}</h2>
   {error&&<p role="alert" className="network-error">{error}</p>}
   {!valid&&<p className="network-note">{ru?"Эпюры скрыты до успешного расчёта текущей схемы.":"Епюри приховано до успішного розрахунку поточної схеми."}</p>}<div hidden={!valid}><div className="network-metrics"><strong data-probe-value="U">U = {units(reading.u,"V")}</strong><strong data-probe-value="I">I = {units(reading.i,"A")}</strong><span>{ru?"Источник":"Джерело"}: {units(source.u,"V")}</span><span>{ru?"Нагрузка":"Навантаження"}: {units(loadPort.u,"V")}</span></div><label className="network-time-slider"><span>{ru?"Точка наблюдения":"Точка спостереження"} x = {units(probe,"m")}</span><input aria-label={ru?"Точка наблюдения x":"Точка спостереження x"} type="range" min="0" max={L} step={L/1000} value={probe} onChange={e=>setProbe(Number(e.target.value))}/></label>
   <label><input type="checkbox" checked={waves} onChange={e=>setWaves(e.target.checked)}/>
    {ru?"Прямая / обратная / сумма":"Пряма / зворотна / сума"}
   </label>
   <div className="network-plot-grid">
    <div ref={voltagePlot}>{plot("x","u")}</div><div>{plot("x","i")}</div>
    <div>{plot("t","u")}</div><div>{plot("t","i")}</div>
   </div>
   <details className="network-export"><summary>{ru?"Экспорт результатов":"Експорт результатів"}</summary>
    <div className="network-buttons"><button type="button" onClick={()=>exportTrace("json")}>JSON</button>
     <button type="button" onClick={()=>exportTrace("csv")}>CSV</button>
     <button type="button" onClick={()=>{
      const svg=voltagePlot.current?.querySelector("svg");
      if(svg)downloadSvg(svg,"electrotutor-line-voltage.svg");
     }}>SVG · U(x)</button></div>
   </details>
   </div>
  </section>
 {navigationDialog}</div></fieldset>;
}
