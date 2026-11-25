import type { Language } from "../types";
import { formatEngineeringNumber } from "../engineering/format";
import { CapacitorGlyph, InductorGlyph } from "../engineering/symbols";
import { isGroup, type Circuit, type Path } from "../models/reactive-two-port";

function size(circuit:Circuit):{w:number;h:number}{
 if(!isGroup(circuit))return {w:116,h:46};
 const a=size(circuit.left),b=size(circuit.right);
 return circuit.kind==="series"?{w:a.w+b.w+24,h:Math.max(a.h,b.h)}:
  {w:Math.max(a.w,b.w)+44,h:a.h+b.h+12};
}
export function ReactiveCircuitSchematic({circuit,language,selected,onSelect}:{circuit:Circuit;language:Language;selected?:Path;onSelect?:(p:Path)=>void}){
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
  const nominal=formatEngineeringNumber(node.value,language)+" "+(node.kind==="l"?"mH":"µF");
  const label=type+" "+nominal;
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
