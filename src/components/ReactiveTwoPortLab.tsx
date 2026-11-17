import {useEffect,useMemo,useRef,useState} from "react";
import type {Language} from "../types";
import {ReactiveImpedanceResults} from "./ReactiveImpedanceResults";
import {formatEngineeringNumber} from "../engineering/format";
import {CapacitorGlyph,InductorGlyph} from "../engineering/symbols";
import {fractionText,isGroup,isNominal,MAX_VALUE,MIN_VALUE,readCircuit,
 replaceCircuit,solveCircuit,type Circuit,type Path} from "../models/reactive-two-port";
import "./ReactiveTwoPortLab.css";

const initial:Circuit={kind:"series",left:{kind:"l",value:20},right:{kind:"c",value:50}};
const parallel:Circuit={...initial,kind:"parallel"};
const duplicate:Circuit={kind:"parallel",left:initial,right:{kind:"series",left:{kind:"l",value:40},right:{kind:"c",value:25}}};
const STORAGE="electrotutor-reactive-two-port-v1";
function readDocument(input:unknown){
 if(!input||typeof input!=="object"||!("schema" in input)||input.schema!==STORAGE||!("circuit" in input))return null;
 return readCircuit(input.circuit);
}
function size(circuit:Circuit):{w:number;h:number}{
 if(!isGroup(circuit))return {w:116,h:46};
 const a=size(circuit.left),b=size(circuit.right);
 return circuit.kind==="series"?{w:a.w+b.w+24,h:Math.max(a.h,b.h)}:
  {w:Math.max(a.w,b.w)+44,h:a.h+b.h+12};
}
function Schematic({circuit,language,selected,onSelect}:{circuit:Circuit;language:Language;selected?:Path;onSelect?:(p:Path)=>void}){
 const dimensions=size(circuit);
 function draw(node:Circuit,x:number,y:number,path:Path):React.ReactNode{
  const current=size(node);
  if(isGroup(node)){
   const a=size(node.left),b=size(node.right);
   if(node.kind==="series"){
    return <g>{draw(node.left,x,y,[...path,"left"])}<path d={`M${x+a.w} ${y}h24`}/>
      {draw(node.right,x+a.w+24,y,[...path,"right"])}</g>;
   }
   const upper=y-(b.h+12)/2,lower=y+(a.h+12)/2,from=x+22,to=x+current.w-22;
   return <g><path d={`M${x} ${y}H${from}M${from} ${upper}V${lower}M${to} ${upper}V${lower}M${to} ${y}H${x+current.w}
    M${from+a.w} ${upper}H${to}M${from+b.w} ${lower}H${to}`}/>
    <circle cx={from} cy={y} r="2.6" fill="currentColor"/><circle cx={to} cy={y} r="2.6" fill="currentColor"/>
    {draw(node.left,from,upper,[...path,"left"])}{draw(node.right,from,lower,[...path,"right"])}</g>;
  }
  const center=x+current.w/2,type=node.kind.toUpperCase();
  const label=type+" "+formatEngineeringNumber(node.value,language)+" "+(node.kind==="l"?"mH":"µF");
  const active=selected?.join()===path.join();
  return <g role={onSelect?"button":undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?label:undefined}
    data-lc-symbol={node.kind} aria-pressed={onSelect?active:undefined}
    onClick={onSelect?()=>onSelect(path):undefined}
    onKeyDown={onSelect?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(path);}}:undefined}>
    <path d={`M${x} ${y}H${center-27}M${center+27} ${y}H${x+current.w}`}/>
    {node.kind==="l"?<InductorGlyph x={center-27} y={y}/>:
     <CapacitorGlyph x={center} y={y} orientation="horizontal" terminalSpan={54}/>}
    <text x={center} y={y-12} textAnchor="middle">{label}</text>
    {onSelect&&<rect x={center-43} y={y-26} width="86" height="44" rx="5" className="lc-symbol-hit"/>}
  </g>;
 }
 const y=dimensions.h/2+8;
 return <svg viewBox={`0 0 ${dimensions.w+28} ${dimensions.h+16}`} className="lc-schematic"
   aria-label={language==="ru"?"Схема двухполюсника":"Схема двополюсника"}>
  <path d={`M6 ${y}H14M${dimensions.w+14} ${y}h8`}/>
  <circle cx="5" cy={y} r="3"/><circle cx={dimensions.w+23} cy={y} r="3"/>
  {draw(circuit,14,y,[])}
 </svg>;
}

export default function ReactiveTwoPortLab({language}:{language:Language}){
 const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
 const [circuit,setCircuit]=useState<Circuit>(initial),[selected,setSelected]=useState<Path>([]);
 const [cursor,setCursor]=useState<number|null>(null),[ready,setReady]=useState(false),[message,setMessage]=useState("");
 const file=useRef<HTMLInputElement>(null);
 const solved=useMemo(()=>solveCircuit(circuit),[circuit]);
 const groupName=(kind:"series"|"parallel")=>kind==="series"?t("Последовательно","Послідовно"):t("Параллельно","Паралельно");
 useEffect(()=>{
  try{
   const saved=readDocument(JSON.parse(localStorage.getItem(STORAGE)??"null"));
   if(saved)setCircuit(saved);
  }catch{/* The default experiment is available without browser storage. */}
  setReady(true);
 },[]);
 useEffect(()=>{
  if(!ready)return;
  try{localStorage.setItem(STORAGE,JSON.stringify({schema:STORAGE,circuit}));}
  catch{setMessage(ru?"Локальное сохранение недоступно. Используйте экспорт.":"Локальне збереження недоступне. Скористайтеся експортом.");}
 },[ready,circuit,ru]);
 function preset(next:Circuit){setCircuit(next);setSelected([]);setCursor(null);setMessage("");}
 function edit(path:Path,next:Circuit){
  const updated=readCircuit(replaceCircuit(circuit,path,next));
  if(!updated){
   setMessage(t("Допустимо до 8 элементов и 4 уровней вложенности.","Допустимо до 8 елементів і 4 рівнів вкладеності."));
   return;
  }
  setCircuit(updated);setSelected(path);setCursor(null);setMessage("");
 }
 function exportFile(){
  const url=URL.createObjectURL(new Blob([JSON.stringify({schema:STORAGE,circuit},null,2)],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download="electrotutor-lc.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function tree(node:Circuit,path:Path=[]):React.ReactNode{
  const id=path.map(side=>side==="left"?"1":"2").join(".")||"1";
  if(isGroup(node)){
   return <fieldset className="lc-group"><legend>{groupName(node.kind)}</legend>
    <div className="lc-actions">
     <button type="button" onClick={()=>edit(path,{...node,kind:node.kind==="series"?"parallel":"series"})}>
      {groupName(node.kind==="series"?"parallel":"series")}
     </button>
     <button type="button" onClick={()=>edit(path,node.left)}>{t("Оставить левую ветвь","Залишити ліву гілку")}</button>
     <button type="button" onClick={()=>edit(path,node.right)}>{t("Оставить правую ветвь","Залишити праву гілку")}</button>
    </div>
    <div className="lc-branches">{tree(node.left,[...path,"left"])}{tree(node.right,[...path,"right"])}</div>
   </fieldset>;
  }
  const active=path.join()===selected.join();
  return <fieldset className="lc-element" data-lc-selected={active||undefined}><legend>{node.kind.toUpperCase()} · {id}</legend>
   <label>{t("Номинал","Номінал")} {node.kind==="l"?"L, mH":"C, µF"}
    <input key={node.kind} type="number" min={MIN_VALUE} max={MAX_VALUE} step=".001" defaultValue={node.value}
     ref={input=>{if(input&&document.activeElement!==input)input.value=String(node.value);}}
     onFocus={()=>setSelected(path)} onBlur={event=>{event.currentTarget.value=String(node.value);event.currentTarget.setCustomValidity("");}}
     onChange={event=>{
      const value=event.target.valueAsNumber;
      event.target.setCustomValidity(isNominal(value)?"":t("Введите номинал с шагом 0,001.","Введіть номінал із кроком 0,001."));
      if(isNominal(value))edit(path,{...node,value});
     }}/>
   </label>
   <div className="lc-actions">
    <button type="button" onClick={()=>edit(path,{kind:node.kind==="l"?"c":"l",value:node.value})}>
     {t("Заменить на","Замінити на")} {node.kind==="l"?"C":"L"}
    </button>
    {(["series","parallel"] as const).map(kind=><button key={kind} type="button" onClick={()=>edit(path,{kind,left:node,
      right:node.kind==="l"?{kind:"c",value:50}:{kind:"l",value:20}})}>{groupName(kind)} + {node.kind==="l"?"C":"L"}</button>)}
   </div>
  </fieldset>;
 }
 return <fieldset className="lab-hydration-guard" disabled={!ready}><div className="lc-lab" data-lc-ready={ready}>
  <div className="lc-actions" aria-label={t("Готовые эксперименты","Готові експерименти")}>
   <button type="button" onClick={()=>preset(initial)}>{t("Последовательный LC","Послідовний LC")}</button>
   <button type="button" onClick={()=>preset(parallel)}>{t("Параллельный LC","Паралельний LC")}</button>
   <button type="button" onClick={()=>preset(duplicate)}>{t("Совпадающие частоты","Збіжні частоти")}</button>
   <button type="button" onClick={()=>preset({kind:"l",value:20})}>{t("Один элемент","Один елемент")}</button>
  </div>
  <div className="lc-workspace">
   <section className="lc-panel">
    <h2>{t("Схема","Схема")}</h2>
    <div className="lc-drawing"><Schematic circuit={circuit} language={language} selected={selected} onSelect={setSelected}/></div>
    {tree(circuit)}
    <div className="lc-actions">
     <button type="button" onClick={exportFile}>{t("Скачать JSON","Завантажити JSON")}</button>
     <button type="button" onClick={()=>file.current?.click()}>{t("Открыть JSON","Відкрити JSON")}</button>
     <input type="file" accept=".json,application/json" hidden ref={file} onChange={async event=>{
      const input=event.currentTarget,source=input.files?.[0];
      input.value="";
      if(!source)return;
      try{
       const next=source.size<=16000?readDocument(JSON.parse(await source.text())):null;
       if(!next)throw Error("document");
       preset(next);
      }catch{setMessage(t("Файл не соответствует формату LC.","Файл не відповідає формату LC."));}
     }}/>
    </div>
    {message&&<p role="status">{message}</p>}
   </section>
   <ReactiveImpedanceResults impedance={solved.impedance} language={language} cursor={cursor} setCursor={setCursor} />
  </div>
  <section className="lc-panel">
   <h2>{t("Шаги эквивалентного преобразования","Кроки еквівалентного перетворення")}</h2>
   <p>Zₗ = sL · Z꜀ = 1/(sC)</p>
   {solved.steps.length>0&&<ol className="lc-steps">{solved.steps.map((step,index)=><li key={index}><details>
    <summary>{groupName(isGroup(step.circuit)?step.circuit.kind:"series")}</summary>
    <Schematic circuit={step.circuit} language={language}/>
    <p>{isGroup(step.circuit)&&step.circuit.kind==="series"?"Z = Z₁ + Z₂":"Z = Z₁Z₂ / (Z₁ + Z₂)"}</p>
    <p>Z(s) = {fractionText(step.impedance)} Ω</p>
   </details></li>)}</ol>}
  </section>
 </div></fieldset>;
}
