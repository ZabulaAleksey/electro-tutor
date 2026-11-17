import { useMemo } from "react";
import type { Language } from "../types";
import EngineeringPlot from "../engineering/EngineeringPlot";
import type { PlotPoint } from "../engineering/plot";
import { formatEngineeringNumber } from "../engineering/format";
import { factorText, fractionText, limits, reactance, resonances, type Fraction, type Resonance } from "../models/reactive-two-port";

function makePlot(z:Fraction,roots:Resonance[],language:Language){
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

export function ReactiveImpedanceResults({ impedance, language, cursor, setCursor }: {
  impedance: Fraction;
  language: Language;
  cursor: number | null;
  setCursor: (omega: number) => void;
}) {
 const t=(r:string,u:string)=>language==="ru"?r:u;
 const roots=useMemo(()=>resonances(impedance),[impedance]);
 const graph=useMemo(()=>makePlot(impedance,roots,language),[impedance,roots,language]);
 const ends=limits(impedance);
 const format=(n:number)=>formatEngineeringNumber(n,language);
 const mode=(kind:"zero"|"pole")=>kind==="zero"?t("Нуль · резонанс напряжений","Нуль · резонанс напруг"):
  t("Полюс · резонанс токов","Полюс · резонанс струмів");
 const picked=cursor===null?null:roots.find(r=>Math.abs(r.omega-cursor)<=Number.EPSILON*cursor*4);
 const x=cursor===null?null:picked?.kind==="pole"?null:picked?.kind==="zero"?0:reactance(impedance,cursor);
 return <section className="lc-panel lc-results">
    <h2>{t("Входной импеданс","Вхідний імпеданс")}</h2>
    <p data-lc-formula><b>Z(s) = </b>{fractionText(impedance)} Ω, q = s / (1000 rad/s)</p>
    <p><b>Z(jω) = jX(ω)</b></p>
    <details><summary>{t("Факторизованная форма","Факторизована форма")}</summary>
     <p>Z(s) = {factorText(impedance,roots,format)} Ω</p>
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
   </section>;
}
