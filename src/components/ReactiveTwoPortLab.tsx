import {useEffect,useMemo,useRef,useState} from "react";
import type {Language} from "../types";
import EngineeringPlot from "../engineering/EngineeringPlot";
import type {PlotPoint} from "../engineering/plot";
import {formatEngineeringNumber} from "../engineering/format";
import {CapacitorGlyph,InductorGlyph} from "../engineering/symbols";
import {factorText,fractionText,isGroup,isNominal,limits,MAX_VALUE,MIN_VALUE,reactance,readCircuit,
 replaceCircuit,resonances,solveCircuit,type Circuit,type Path,type Resonance} from "../models/reactive-two-port";
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

function makePlot(z:ReturnType<typeof solveCircuit>["impedance"],roots:Resonance[],language:Language){
 const ru=language==="ru";
 const edges=roots.map(r=>r.omega);
 const low=(edges[0]??1000)/10,high=(edges.at(-1)??1000)*10;
 const cuts=[low,...edges,high];
 const references=Array.from({length:81},(_,i)=>Math.abs(reactance(z,low*(high/low)**(i/80)))).filter(Number.isFinite).sort((a,b)=>a-b);
 const bound=Math.max(1,references[Math.floor(references.length*.72)]*1.7);
 const curves=cuts.slice(1).map((to,index)=>{
  const from=cuts[index],span=Math.log(to/from);
  const points=Array.from({length:41},(_,i)=>{
   const left=roots[index-1],right=roots[index];
   if(i===0&&left?.kind==="zero")return [from,0] as PlotPoint;
   if(i===40&&right?.kind==="zero")return [to,0] as PlotPoint;
   const fraction=i===0&&left?.kind==="pole"?.003:i===40&&right?.kind==="pole"?.997:i/40;
   const omega=from*Math.exp(span*fraction);
   return [omega,reactance(z,omega)] as PlotPoint;
  }).filter(([,x])=>Number.isFinite(x));
  const inductive=reactance(z,Math.sqrt(from*to))>0;
  const sign=inductive?(ru?"Индуктивный":"Індуктивна"):(ru?"Ёмкостный":"Ємнісна");
  return {label:`${sign} · ${index+1}`,color:inductive?"blue":"orange",points};
 }).filter(curve=>curve.points.length>1);
 return {low,high,bound,plot:{xLabel:"ω, rad/s",yLabel:"X, Ω",xMin:low,xMax:high,yMin:-bound,yMax:bound,logarithmic:true,curves}};
}

export default function ReactiveTwoPortLab({language}:{language:Language}){
 const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
 const [circuit,setCircuit]=useState<Circuit>(initial),[selected,setSelected]=useState<Path>([]);
 const [cursor,setCursor]=useState<number|null>(null),[ready,setReady]=useState(false),[message,setMessage]=useState("");
 const file=useRef<HTMLInputElement>(null);
 const solved=useMemo(()=>solveCircuit(circuit),[circuit]);
 const roots=useMemo(()=>resonances(solved.impedance),[solved]);
 const graph=useMemo(()=>makePlot(solved.impedance,roots,language),[solved,roots,language]);
 const ends=limits(solved.impedance);
 const format=(n:number)=>formatEngineeringNumber(n,language,{significantDigits:9});
 const groupName=(kind:"series"|"parallel")=>kind==="series"?t("Последовательно","Послідовно"):t("Параллельно","Паралельно");
 const mode=(kind:"zero"|"pole")=>kind==="zero"?t("Нуль · резонанс напряжений","Нуль · резонанс напруг"):
  t("Полюс · резонанс токов","Полюс · резонанс струмів");
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
 const picked=cursor===null?null:roots.find(r=>Math.abs(r.omega-cursor)<=Number.EPSILON*cursor*4);
 const x=cursor===null?null:picked?.kind==="pole"?null:picked?.kind==="zero"?0:reactance(solved.impedance,cursor);
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
   <section className="lc-panel lc-results">
    <h2>{t("Входной импеданс","Вхідний імпеданс")}</h2>
    <p data-lc-formula><b>Z(s) = </b>{fractionText(solved.impedance)} Ω, q = s / (1000 rad/s)</p>
    <p><b>Z(jω) = jX(ω)</b></p>
    <details><summary>{t("Факторизованная форма","Факторизована форма")}</summary>
     <p>Z(s) = {factorText(solved.impedance,roots,format)} Ω</p>
     <small>{t("Коэффициенты в этой записи округлены.","Коефіцієнти в цьому записі округлено.")}</small>
    </details>
    <EngineeringPlot plot={graph.plot} language={language} label="X(ω)" domains={{x:[graph.low,graph.high],y:[-graph.bound,graph.bound]}}
     selected={cursor!==null&&x!==null&&Number.isFinite(x)?[cursor,x]:undefined} cursorTime={cursor??undefined}
     onSelect={([omega])=>setCursor(omega)} selectAcrossCurves showLegend={false}
     verticals={roots.map(r=>({x:r.omega,label:mode(r.kind)}))}/>
    <p className="lc-signs"><span>{t("Синий: X > 0","Синій: X > 0")}</span><span>{t("Оранжевый: X < 0","Помаранчевий: X < 0")}</span></p>
    {cursor!==null&&<output data-lc-cursor>ω = {format(cursor)} rad/s · f = {format(cursor/(2*Math.PI))} Hz · {x===null||!Number.isFinite(x)?"|X| → ∞":`X = ${format(x)} Ω`}</output>}
    <p>ω → 0: |Z| → {ends.dc==="zero"?"0":"∞"} · ω → ∞: |Z| → {ends.high==="zero"?"0":"∞"}</p>
    {roots.length?<ul className="lc-resonances">{roots.map(r=><li key={r.kind+r.omega}>
     <button type="button" onClick={()=>setCursor(r.omega)} data-lc-resonance={r.kind} data-omega={r.omega}>
      {mode(r.kind)} · {format(r.omega)} rad/s · {format(r.omega/(2*Math.PI))} Hz
     </button>
    </li>)}</ul>:<p>{t("Конечных резонансных частот нет.","Скінченних резонансних частот немає.")}</p>}
   </section>
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
