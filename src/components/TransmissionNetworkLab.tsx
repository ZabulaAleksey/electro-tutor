import {useUnsavedChanges} from "../engineering/useUnsavedChanges";
import {OperationStatus} from "./OperationStatus";
import {getLocale} from "../i18n";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Language} from "../types";
import EngineeringPlot from "../engineering/EngineeringPlot";
import {engineeringAxis} from "../engineering/scale";
import {formatEngineeringNumber as n,formatEngineeringValue} from "../engineering/format";
import {localePath} from "../site-path";
import {at,DEFAULT_NETWORK,findLoad,historyValue,lineEnergy,nodePort,simulateNetwork,spatial,timeTrace,totalLength,validateNetwork,type Network,type WaveRun} from "../transient/network";
import {NumberEdit,type Layout} from "../transient/NetworkEditor";
import NetworkWorkbench from "../transient/NetworkWorkbench";
import NetworkInspector from "../transient/NetworkInspector";
import {networkError} from "../transient/network-copy";
import {loadReplacement,removeSection,sectionBoundaries,type Selection} from "../transient/network-edit";
import NetworkSurface from "../transient/NetworkSurface";
import "./TransmissionNetworkLab.css";
type Document = {model:Network; layout:Layout};
const draftKey = "electrotutor-line-draft-v4";
const legacyDraftKey = "electrotutor-line-draft";
const usesNewComponents=(model:Network)=>model.load?.kind==="diode"||
 [...model.series??[],...model.branches??[]].some(link=>link.resistanceOhm===undefined&&!link.switch);
type Limits={u:readonly[number,number];i:readonly[number,number]};
const limits=(run:WaveRun):Limits=>({u:engineeringAxis(...run.rangeU,{includeZero:true,targetTicks:5}).domain,i:engineeringAxis(...run.rangeI,{includeZero:true,targetTicks:5}).domain});
const speeds=Array.from({length:10},(_,index)=>2**(index-4));
export default function TransmissionNetworkLab({language}:{language:Language}){
 const operationCopy=getLocale(language).operationStatus;
 const ru=language==="ru",[mounted,setMounted]=useState(false),[model,setModel]=useState<Network>(()=>structuredClone(DEFAULT_NETWORK)),[run,setRun]=useState<WaveRun>(()=>simulateNetwork(DEFAULT_NETWORK)),[time,setTime]=useState(0),[speed,setSpeed]=useState(1),[running,setRunning]=useState(false),[probe,setProbe]=useState(750000),[mode,setMode]=useState<"recalculate"|"live">("recalculate"),[domains,setDomains]=useState<Limits>(()=>limits(simulateNetwork(DEFAULT_NETWORK))),[busy,setBusy]=useState(true),[error,setError]=useState(""),[quantity,setQuantity]=useState<"u"|"i">("u"),[surface,setSurface]=useState(false),[waves,setWaves]=useState(true),[layout,setLayout]=useState<Layout>({}),[selection,setSelection]=useState<Selection|null>(null),[revision,setRevision]=useState(0),[comparison,setComparison]=useState<WaveRun|null>(null);
 const [actionError,setActionError]=useState("");
 const [savedDocument,setSavedDocument]=useState(JSON.stringify({model:structuredClone(DEFAULT_NETWORK),layout:{}}));const restore=useRef(false);
 const worker=useRef<Worker|null>(null),request=useRef(0),preserve=useRef(false),timeRef=useRef(0),speedRef=useRef(1),past=useRef<Document[]>([]),future=useRef<Document[]>([]),file=useRef<HTMLInputElement>(null);
 useEffect(()=>{timeRef.current=time;},[time]);useEffect(()=>{speedRef.current=speed;},[speed]);
 useEffect(()=>{if(restore.current)return;restore.current=true;try{const data=(localStorage.getItem(draftKey)??localStorage.getItem("electrotutor-line-draft-v3")??localStorage.getItem(legacyDraftKey));if(data&&data.length<=100000){const parsed=JSON.parse(data);if(!validateNetwork(parsed.model).length){const safeLayout:Layout={};if(parsed.layout&&typeof parsed.layout==="object")for(const [id,value] of Object.entries(parsed.layout)){if(/^@?[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)&&typeof value==="number"&&Number.isFinite(value)&&value>=50&&value<=110)safeLayout[id]=value;}setModel(parsed.model);setLayout(safeLayout);setSavedDocument(JSON.stringify({model:parsed.model,layout:safeLayout}));}}}catch{/* Existing model stays usable when local storage is unavailable. */}},[]);
 useEffect(()=>{setMounted(true);const w=new Worker(new URL("../transient/network.worker.ts",import.meta.url),{type:"module"});worker.current=w;w.onmessage=(e:MessageEvent<{id:number;run?:WaveRun;error?:string}>)=>{if(e.data.id!==request.current)return;setBusy(false);if(e.data.error){setError(networkError(e.data.error,language));setRunning(false);return;}if(e.data.run){setRun(e.data.run);if(!preserve.current)setDomains(limits(e.data.run));setError("");}};w.onerror=()=>{setError(ru?"Вычислитель недоступен. Расчёт не выполнен.":"Обчислювач недоступний. Розрахунок не виконано.");setBusy(false);setRunning(false);};return()=>{w.terminate();worker.current=null;};},[ru,language]);
 useEffect(()=>{
  if(!worker.current)return;
  const id=++request.current;
  const errors=validateNetwork(model);
  if(errors.length){setBusy(false);setError(networkError(errors.join("; "),language));setRunning(false);return;}
  setBusy(true);
  const timer=setTimeout(()=>worker.current?.postMessage({id,config:model}),120);
  return()=>clearTimeout(timer);
 },[model,language]);
 useEffect(()=>{if(!running)return;let frame=0,last:number|undefined;const media=matchMedia("(prefers-reduced-motion: reduce)");const stop=()=>{if(document.hidden||media.matches)setRunning(false);};if(document.hidden||media.matches){setRunning(false);return;}const tick=(now:number)=>{if(last!==undefined){const dt=Math.min(.1,(now-last)/1000)*speedRef.current*run.config.durationS/8;const next=Math.min(run.config.durationS,timeRef.current+dt);timeRef.current=next;setTime(next);if(next>=run.config.durationS){setRunning(false);return;}}last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);document.addEventListener("visibilitychange",stop);media.addEventListener("change",stop);return()=>{cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",stop);media.removeEventListener("change",stop);};},[running,run]);
 function apply(next:Document,keep=false){
  if(next.model===model){setLayout(next.layout);return;}
  preserve.current=keep;
  setRevision(v=>v+1);
  if(!keep){setRunning(false);setTime(0);timeRef.current=0;}
  setModel(next.model);
  setLayout(next.layout);
  setProbe(x=>Math.min(x,totalLength(next.model)));
 }
 function edit(next:Network,keep=false,nextLayout=layout){
  if(next===model&&JSON.stringify(nextLayout)===JSON.stringify(layout))return;
  if(next!==model&&JSON.stringify(next)===JSON.stringify(model)&&JSON.stringify(nextLayout)===JSON.stringify(layout))return;
  setActionError("");
  past.current.push({model,layout});
  if(past.current.length>40)past.current.shift();
  future.current=[];
  apply({model:next,layout:nextLayout},keep);
 }
 function history(direction:"undo"|"redo"){
  const from=direction==="undo"?past:future,to=direction==="undo"?future:past,next=from.current.pop();
  if(!next)return;
  to.current.push({model,layout});
  apply(next);
 }
 const selected=selection&&(selection.kind==="line"?model.sections.some(s=>s.id===selection.id):
  selection.kind==="shunt"?model.shunts.some(sh=>sh.node===selection.node):selection.kind==="contact"?[...model.series??[],...model.branches??[]].some(link=>link.id===selection.id):selection.kind==="load"&&selection.id?!!findLoad(model.load,selection.id):true)?selection:null;
 function deleteSection(index:number){
  const result=removeSection(model,index);
  if("error" in result){
   setActionError(result.error==="attached-contacts"?(ru?"Сначала перенесите или удалите элементы в соседних узлах.":"Спочатку перенесіть або видаліть елементи в сусідніх вузлах."):result.error==="merge-shunts"?(ru?"Удалите один из двух шунтов перед объединением узлов.":"Видаліть один із двох шунтів перед об’єднанням вузлів."):networkError(result.error!,language));
   return;
  }
  if(result.confirm&&!window.confirm(ru?"После удаления подключения правого узла перейдут на соседний узел. Продолжить?":"Після видалення підключення правого вузла перейдуть на сусідній вузол. Продовжити?"))return;
  const nextLayout={...layout};
  delete nextLayout[model.sections[index].id];
  edit(result.model,false,nextLayout);
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
 const traceU=useMemo(()=>timeTrace(run,probe,"u"),[run,probe]),traceI=useMemo(()=>timeTrace(run,probe,"i"),[run,probe]);
 const source=nodePort(run,run.config.source.node,time),loadPort=nodePort(run,run.config.sections.length,time),boundary=sectionBoundaries(run.config);
 const numericErrors=validateNetwork(model),valid=mounted&&!numericErrors.length&&!busy&&!error&&JSON.stringify(run.config)===JSON.stringify(model);
 const documentValue=JSON.stringify({model,layout});
 const saveLocal=()=>{try{if(documentValue.length>100000||validateNetwork(model).length)throw Error();localStorage.setItem(draftKey,documentValue);setSavedDocument(documentValue);return true;}catch{return false;}};
 useEffect(()=>{
  if(!mounted||documentValue===savedDocument||documentValue.length>100000||validateNetwork(model).length)return;
  try{localStorage.setItem(draftKey,documentValue);setSavedDocument(documentValue);}catch{/* Explicit save and navigation guard remain available. */}
 },[mounted,documentValue,savedDocument,model]);
 const navigationDialog=useUnsavedChanges({dirty:documentValue!==savedDocument,onSave:saveLocal,language});
 const exportModel=()=>{if(!saveLocal()){setActionError(ru?"Не удалось сохранить схему локально":"Не вдалося зберегти схему локально");return;}const data=JSON.stringify({schema:usesNewComponents(model)?"electrotutor-line-v4":model.series?.length||model.branches?.length?"electrotutor-line-v3":"electrotutor-line-v2",model,layout},null,2),url=URL.createObjectURL(new Blob([data],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="electrotutor-line.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const start=()=>{if(time>=run.config.durationS)seek(0);setRunning(true);};
 const contactEvents=[...model.series??[],...model.branches??[]].flatMap(link=>link.switch?.atS===undefined?[]:[{id:link.id,atS:link.switch.atS,target:link.id,kind:"switch" as const,value:Number(link.switch.closes),previous:Number(link.switch.closed)}]);
 const recordedEvents=[...model.events,...contactEvents].sort((a,b)=>a.atS-b.atS);
 const eventTimes=[0,...run.events,run.config.durationS].sort((a,b)=>a-b),next=eventTimes.find(t=>t>time+1e-12),previous=[...eventTimes].reverse().find(t=>t<time-1e-12);
 const units=(v:number,unit:string)=>formatEngineeringValue(v,unit,language);
 const plot=(axis:"x"|"t",q:"u"|"i")=>{const pts=axis==="x"?(q==="u"?spatialU:spatialI):(q==="u"?traceU:traceI),curves=[{label:axis==="x"?`${q.toUpperCase()}(x)`:`${q.toUpperCase()}(t)`,color:q==="u"?"blue":"orange",points:pts}];if(waves&&axis==="x"){curves.push({label:ru?`Прямая ${q.toUpperCase()}⁺`:`Пряма ${q.toUpperCase()}⁺`,color:"green",points:spatial(run,time,q==="u"?"forward":"forwardI")});curves.push({label:ru?`Обратная ${q.toUpperCase()}⁻`:`Зворотна ${q.toUpperCase()}⁻`,color:"violet",points:spatial(run,time,q==="u"?"backward":"backwardI")});}if(comparison){const other=axis==="x"?spatial(comparison,Math.min(time,comparison.config.durationS),q):timeTrace(comparison,Math.min(probe,totalLength(comparison.config)),q);curves.push({label:ru?"Сохранённый опыт":"Збережений дослід",color:"muted",points:other});}
  return <EngineeringPlot plot={{xLabel:axis==="x"?"x, m":"t, s",yLabel:q==="u"?"U, V":"I, A",xMax:axis==="x"?L:run.config.durationS,yMin:domains[q][0],yMax:domains[q][1],curves:curves.map((c,j)=>({...c,dash:j>0}))}} language={language} domains={{x:[0,axis==="x"?L:run.config.durationS],y:domains[q]}} selected={[axis==="x"?probe:time,reading[q]]} cursorTime={axis==="t"?time:undefined} verticals={axis==="x"?boundary:undefined} onSelect={p=>axis==="x"?setProbe(Math.max(0,Math.min(L,p[0]))):seek(p[0])} label={`${q.toUpperCase()}(${axis})`} legendClass="network-legend"/>;
 };
 return <fieldset disabled={!mounted} aria-hidden={!mounted} className="lab-hydration-guard"><div className="network-lab" data-network-lab data-calculation-ready={valid?"true":"false"} data-method={run.method} data-model-revision={revision} data-current-time={time} data-current-speed={speed} data-probe-u={reading.u} data-probe-i={reading.i}>
  <section className="network-workbench" aria-label={ru?"Конструктор линий":"Конструктор ліній"}>
   <NetworkWorkbench model={model} layout={layout} language={language} selected={selected} onSelect={setSelection}
    onCommit={(next,item)=>{edit(next);setSelection(item);}}
    inspector={arm=>selected&&<NetworkInspector selection={selected} model={model} load={effectiveLoad} language={language}
     onEdit={next=>{const errors=validateNetwork(next);if(errors.length)setActionError(networkError(errors.join("; "),language));else edit(next);}} onMove={arm} onDeleteLine={deleteSection} onChangeLoad={changeLoad} onResistance={physicalEvent}
     live={mode==="live"} time={time} onMode={setMode}
     diodePoint={valid&&run.config.load.kind==="diode"?(run.config.load.diode?.reversed?-1:1)*at(run,L,time).u:undefined}
     onDuration={durationS=>edit({...model,durationS})}/>}
    undo={()=>history("undo")} redo={()=>history("redo")} canUndo={!!past.current.length} canRedo={!!future.current.length}
    load={effectiveLoad} time={time} onLayout={(next)=>edit(model,true,next)}
    tools={<><button type="button" onClick={exportModel}>{ru?"Сохранить схему":"Зберегти схему"}</button>
     <button type="button" onClick={()=>file.current?.click()}>{ru?"Открыть JSON":"Відкрити JSON"}</button>
     <input ref={file} hidden type="file" accept=".json,application/json" onChange={async e=>{
      const f=e.target.files?.[0];if(!f)return;
      try{
       if(f.size>100000)throw Error("file-limit:100kB");
       const saved=JSON.parse(await f.text());
       if(!["electrotutor-line-v2","electrotutor-line-v3","electrotutor-line-v4"].includes(saved.schema))throw Error("schema");
       if(saved.schema==="electrotutor-line-v2"&&(saved.model?.series?.length||saved.model?.branches?.length)||
          saved.schema!=="electrotutor-line-v4"&&usesNewComponents(saved.model))throw Error("schema");
       const errors=validateNetwork(saved.model);if(errors.length)throw Error(errors.join(";"));
       const safeLayout=Object.fromEntries(Object.entries(saved.layout??{}).filter(([id,y])=>/^@?[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)&&typeof y==="number"&&Number.isFinite(y)&&y>=50&&y<=110)) as Layout;
       edit(saved.model,false,safeLayout);setSelection(null);
      }catch(error){setActionError(networkError(String(error),language));}e.target.value="";
     }}/></>}
    transport={<>
     <button type="button" disabled={!valid||running} onClick={start}>▶ {ru?"Старт":"Старт"}</button>
     <button type="button" disabled={!running} onClick={()=>setRunning(false)}>⏸ {ru?"Пауза":"Пауза"}</button>
     <button type="button" disabled={!running&&time===0} onClick={()=>seek(0)}>■ {ru?"Стоп":"Стоп"}</button>
     <label className="network-speed-choice"><span>{ru?"Скорость":"Швидкість"}</span><select value={speed} onChange={event=>setSpeed(Number(event.target.value))}>
      {speeds.map(value=><option key={value} value={value}>×{value<1?"1/"+1/value:value}</option>)}
     </select></label>
    </>}
    timing={<>
     <NumberEdit label={ru?"Физическое время t, ms":"Фізичний час t, ms"} value={time*1000} min={0} max={run.config.durationS*1000} onChange={v=>seek(v/1000)}/>
     <input type="range" aria-label={ru?"Курсор времени":"Курсор часу"} min="0" max={run.config.durationS} step={run.config.durationS/2000} value={time} onChange={e=>seek(Number(e.target.value))}/>
     <div className="network-buttons">
      <button type="button" onClick={()=>seek(previous??Math.max(0,time-run.config.durationS/100))}>← {ru?"Шаг":"Крок"}</button>
      <button type="button" onClick={()=>seek(next??Math.min(run.config.durationS,time+run.config.durationS/100))}>{ru?"Шаг":"Крок"} →</button>
      <button type="button" disabled={next===undefined||run.method!=="exact-fronts"} onClick={()=>next!==undefined&&seek(next)}>{ru?"Следующий фронт":"Наступний фронт"}</button>
     </div>
    </>}
    reference={localePath(language,"/interactive/transmission-line-reference/")}/>
   <div className="network-workbench-links"><a href="#network-results">{ru?"Измерения и графики":"Вимірювання та графіки"} ↓</a>
    <OperationStatus busy={busy} error={!!error} message={busy?operationCopy.busy:error||operationCopy.ready}/></div>
   {actionError&&<p role="alert" className="network-error">{actionError}</p>}
  </section>
  <section id="network-results" aria-label={ru?"Измерения и графики":"Вимірювання та графіки"} className="network-measurements"><div className="network-section-head"><h2>{ru?"Измерения":"Вимірювання"}</h2><OperationStatus busy={busy} error={!!error} message={busy?operationCopy.busy:error||operationCopy.ready}/></div>{error&&<p role="alert" className="network-error">{error}</p>}
   {!valid&&<p className="network-note">{ru?"Эпюры скрыты до успешного расчёта текущей схемы.":"Епюри приховано до успішного розрахунку поточної схеми."}</p>}<div hidden={!valid}><div className="network-metrics"><strong data-probe-value="U">U = {units(reading.u,"V")}</strong><strong data-probe-value="I">I = {units(reading.i,"A")}</strong><span>{ru?"Источник":"Джерело"}: {units(source.u,"V")}</span><span>{ru?"Нагрузка":"Навантаження"}: {units(loadPort.u,"V")}</span></div><label className="network-time-slider"><span>{ru?"Точка наблюдения":"Точка спостереження"} x = {units(probe,"m")}</span><input aria-label={ru?"Точка наблюдения x":"Точка спостереження x"} type="range" min="0" max={L} step={L/1000} value={probe} onChange={e=>setProbe(Number(e.target.value))}/></label>
   <div className="network-buttons"><label><input type="checkbox" checked={waves} onChange={e=>setWaves(e.target.checked)}/>{ru?"Прямая / обратная / сумма":"Пряма / зворотна / сума"}</label><button type="button" onClick={()=>setComparison(run)}>{ru?"Запомнить опыт":"Запам’ятати дослід"}</button>{comparison&&<button type="button" onClick={()=>setComparison(null)}>{ru?"Убрать сравнение":"Прибрати порівняння"}</button>}</div>
   <div className="network-plot-grid"><div>{plot("x","u")}</div><div>{plot("x","i")}</div><div>{plot("t","u")}</div><div>{plot("t","i")}</div></div>
   <div className="network-buttons"><button type="button" aria-expanded={surface} onClick={()=>setSurface(v=>!v)}>{surface?(ru?"Скрыть 3D":"Сховати 3D"):(ru?"Поверхность 3D":"Поверхня 3D")}</button>{surface&&<label className="network-field"><span>{ru?"Величина поверхности":"Величина поверхні"}</span><select value={quantity} onChange={e=>setQuantity(e.target.value as "u"|"i")}><option value="u">U(x,t)</option><option value="i">I(x,t)</option></select></label>}</div>{surface&&<NetworkSurface run={run} time={time} probe={probe} quantity={quantity} domain={domains[quantity]} language={language} onProbe={setProbe}/>}
   <details><summary>{ru?"Физическая модель и ограничения":"Фізична модель та обмеження"}</summary><p>{ru?"U=U⁺+U⁻; I=(U⁺−U⁻)/Z₀. Идеальные последовательные линии, общий обратный провод, до 6 участков, источник в одном узле, концевая RLC-нагрузка или диод Шокли. Для RLC задаются согласованные начальные состояния. Длина/скорость/Z₀ определяют L′,C′; потери/ветвления/произвольные нелинейные сети не рассчитываются.":"U=U⁺+U⁻; I=(U⁺−U⁻)/Z₀. Ідеальні послідовні лінії, спільний зворотний провід, до 6 ділянок, джерело в одному вузлі, кінцеве RLC-навантаження або діод Шоклі. Для RLC задаються узгоджені початкові стани. Довжина/швидкість/Z₀ визначають L′,C′; втрати/відгалуження/довільні нелінійні мережі не обчислюються."}</p><p>{run.method==="exact-fronts"?(ru?"Событийные характеристики для резистивных схем и концевого диода. Диапазон заранее ограничен экстремумами рассчитанных прямых/обратных волн; это консервативная граница, не обещание достижимого пика.":"Подієві характеристики для резистивних схем і кінцевого діода. Діапазон заздалегідь обмежено екстремумами розрахованих прямих/зворотних хвиль; це консервативна межа, не обіцянка досяжного піка."):(ru?"RLC: метод характеристик с задержками и трапецеидальными companion-состояниями. Внутренний шаг ":"RLC: метод характеристик із затримками та трапецеїдальними companion-станами. Внутрішній крок ")+units(run.stepS,"s")}</p><p>{ru?"Энергия линии + накопленная энергия нагрузки":"Енергія лінії + накопичена енергія навантаження"}: {units(lineEnergy(run,time)+historyValue(run.deviceEnergy,time,true),"J")}</p><a href={localePath(language,"/interactive/transmission-line-reference/")}>{ru?"Сохранённая численная FDTD-модель · сравнение":"Збережена чисельна FDTD-модель · порівняння"}</a></details></div>
  </section>
  <section><h2>{ru?"История физических событий":"Історія фізичних подій"}</h2>{!recordedEvents.length?<p className="network-note">{ru?"Задайте время коммутации на ключе или изменение сопротивления в настройках нагрузки.":"Задайте час комутації на ключі або зміну опору в налаштуваннях навантаження."}</p>:<table><thead><tr><th>t</th><th>{ru?"Параметр":"Параметр"}</th><th>{ru?"Было → стало":"Було → стало"}</th><th>{ru?"Действие":"Дія"}</th></tr></thead><tbody>{recordedEvents.map(e=><tr key={e.id}><td>{units(e.atS,"s")}</td><td>{e.target} · {e.kind}</td><td>{n(e.previous??0,language)} → {n(e.value,language)} {e.kind==="resistance"?"Ω":"1"}</td><td><button type="button" onClick={()=>seek(Math.max(0,e.atS-1e-10))}>{ru?"До события":"До події"}</button></td></tr>)}</tbody></table>}</section>
 {navigationDialog}</div></fieldset>;
}
