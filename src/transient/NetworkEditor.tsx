import {useEffect,useRef,useState} from "react";
import {replaceLoad,removeLoad} from "./network-edit";
import type {Language} from "../types";
import {formatEngineeringNumber as number} from "../engineering/format";
import {findLoad,type Load} from "./network";
export function NumberEdit({label,value,onChange,min=-1e12,max=1e12,step="any"}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number|string}){
 const [draft,setDraft]=useState(String(value)),input=useRef<HTMLInputElement>(null);useEffect(()=>{if(document.activeElement!==input.current)setDraft(String(value));},[value]);const valid=draft.trim()!==""&&Number.isFinite(Number(draft))&&Number(draft)>=min&&Number(draft)<=max;
 return <label className="network-field"><span>{label}</span><input ref={input} type="number" aria-label={label} step={step} min={min} max={max} value={draft} aria-invalid={!valid} onChange={e=>{const raw=e.target.value;setDraft(raw);const n=Number(raw);if(raw.trim()&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}} onBlur={()=>{if(valid)setDraft(String(value));}}/>{!valid&&<small role="alert">{min}…{max}</small>}</label>;
}
export function LoadEditor({load,onChange,language,live,timeS,onResistance,compact=false,root=load}:{load:Load;onChange:(l:Load)=>void;language:Language;live:boolean;timeS:number;onResistance:(id:string,value:number)=>void;compact?:boolean;root?:Load}){
 const ru=language==="ru",counter=useRef(1),uid=()=>{let id="E"+counter.current++;while(findLoad(root,id))id="E"+counter.current++;return id;};
 const add=(at:Load,kind:Load["kind"])=>{const child:Load=kind==="series"||kind==="parallel"?{id:uid(),kind,children:[{id:uid(),kind:"r",value:50}]}:kind==="switch"?{id:uid(),kind,closed:true,children:[{id:uid(),kind:"r",value:50}]}:{id:uid(),kind,value:kind==="r"?50:kind==="c"?1e-5:.02};const next=at.kind==="open"?{...child,id:at.id}:at.kind==="series"||at.kind==="parallel"?{...at,children:[...at.children!,child]}:{id:uid(),kind:"series" as const,children:[at,child]};onChange(replaceLoad(load,at.id,next));};
 const confirmBranch=(l:Load)=>!l.children?.length||window.confirm(ru?"Изменить нагрузку вместе с её вложенными элементами?":"Змінити навантаження разом із вкладеними елементами?");
 const render=(l:Load):React.ReactNode=><fieldset className="load-branch" key={l.id}><legend>{l.id} · {l.kind.toUpperCase()}</legend>
  {["series","parallel"].includes(l.kind)&&<label className="network-field"><span>{ru?"Соединение":"З’єднання"}</span><select value={l.kind} onChange={e=>onChange(replaceLoad(load,l.id,{...l,kind:e.target.value as Load["kind"]}))}><option value="series">{ru?"Последовательно":"Послідовно"}</option><option value="parallel">{ru?"Параллельно":"Паралельно"}</option></select></label>}
  {["r","l","c"].includes(l.kind)&&<NumberEdit label={`${l.id} · ${l.kind.toUpperCase()}, ${l.kind==="r"?"Ω":l.kind==="c"?"µF":"mH"}`} value={(l.value??0)*(l.kind==="c"?1e6:l.kind==="l"?1000:1)} min={l.kind==="r"?0:.001} max={1e8} onChange={n=>{const value=n/(l.kind==="c"?1e6:l.kind==="l"?1000:1);if(live&&l.kind==="r"&&timeS>0)onResistance(l.id,value);else onChange(replaceLoad(load,l.id,{...l,value}));}}/>}
  {(l.kind==="c"||l.kind==="l")&&<NumberEdit label={`${l.id} · ${l.kind==="c"?"uC(0), V":"iL(0), A"}`} value={l.initial??0} min={-1e6} max={1e6} onChange={initial=>onChange(replaceLoad(load,l.id,{...l,initial}))}/>}
  {l.kind==="switch"&&<label><input type="checkbox" checked={l.closed??true} onChange={e=>onChange(replaceLoad(load,l.id,{...l,closed:e.target.checked}))}/>{ru?"Ключ замкнут":"Ключ замкнений"}</label>}
  {l.children?.map(render)}
  <div className="network-buttons">{(["r","l","c","parallel","switch"] as const).map(kind=><button type="button" key={kind} onClick={()=>add(l,kind)}>+ {kind==="parallel"?(ru?"ветвь":"гілка"):kind==="switch"?(ru?"ключ":"ключ"):kind.toUpperCase()}</button>)}<button type="button" onClick={()=>{if(confirmBranch(l))onChange(replaceLoad(load,l.id,{id:l.id,kind:"wire"}));}}>{ru?"Провод":"Провід"}</button>{(!compact||l.id!==load.id)&&<button type="button" onClick={()=>{if(confirmBranch(l))onChange(removeLoad(load,l.id));}}>{ru?"Удалить":"Видалити"}</button>}</div>
 </fieldset>;
 return <div>{render(load)}<small>{ru?"Начальные uC(0) и iL(0) заданы для каждого элемента. Несогласованные состояния блокируют расчёт. R/L/C — сосредоточенные линейные элементы.":"Початкові uC(0) та iL(0) задано для кожного елемента. Неузгоджені стани блокують розрахунок. R/L/C — зосереджені лінійні елементи."}</small></div>;
}
export type Layout=Record<string,number>;
type Size={w:number;h:number};
function size(l:Load):Size{if(!l.children?.length)return{w:90,h:90};const sizes=l.children.map(size);if(l.kind==="switch")return{w:sizes[0].w+30,h:sizes[0].h+70};if(l.kind==="parallel")return{w:sizes.reduce((s,x)=>s+x.w,0)+20,h:Math.max(...sizes.map(s=>s.h))+40};return{w:Math.max(...sizes.map(s=>s.w))+20,h:sizes.reduce((s,x)=>s+x.h,0)+20};}
export function LoadCircuit({load,language,onObject,region,displacement,rotation}:{load:Load;language:Language;
 onObject?:(id:string,label:string)=>React.SVGProps<SVGGElement>;
 region?:{x:number;y:number;width:number;height:number};
 displacement?:(id:string)=>{x:number;y:number}; rotation?:(id:string)=>number}){
 const root=size(load),scale=region?region.height/root.h:1;
 const turn=(x:number,y:number,center:number,angle:number)=>{
  const r=angle*Math.PI/180,dx=x,dy=y-center;
  return {x:Math.round(Math.cos(r))*dx-Math.round(Math.sin(r))*dy,y:center+Math.round(Math.sin(r))*dx+Math.round(Math.cos(r))*dy};
 };
 const leads=(fromX:number,fromY:number,toX:number,toY:number)=>`M${fromX} ${fromY}H${toX}V${toY}`;
 const render=(l:Load,x:number,y:number):React.ReactNode=>{const s=size(l),anchor=x+s.w/2,move=displacement?.(l.id),cx=anchor+(move?.x??0)/scale,dy=(move?.y??0)/scale;
  if(l.kind==="switch"&&l.children?.length){const child=l.children[0],cs=size(child),closed=l.closed??true,angle=rotation?.(l.id)??0,center=y+30+dy;
 const a=turn(0,y+20+dy,center,angle),b=turn(0,y+40+dy,center,angle);return <g key={l.id}><g {...onObject?.(l.id,l.id+" · "+(language==="ru"?"Ключ":"Ключ"))} data-load-switch={l.id} data-closed={closed}><path d={`${leads(anchor,y,cx+a.x,a.y)} ${leads(anchor,y+50,cx+b.x,b.y)} M${anchor} ${y+50+cs.h}V${y+s.h}`}/><g transform={`rotate(${angle} ${cx} ${center})`}><path d={closed?`M${cx} ${y+20+dy}V${y+40+dy}`:`M${cx} ${y+20+dy}L${cx+18} ${y+35+dy}`}/><circle cx={cx} cy={y+20+dy} r="2" fill="var(--surface-canvas)"/><circle cx={cx} cy={y+40+dy} r="2" fill="var(--surface-canvas)"/><text x={cx+25} y={y+30+dy} fill="var(--ink)" stroke="none" fontSize="11">K · {l.id}</text><rect className="network-svg-hit" x={cx-14} y={y+9+dy} width="48" height="37"/></g></g>{render(child,anchor-cs.w/2,y+50)}</g>;}
  if(l.children?.length){if(l.kind==="parallel"){let next=x;return <g key={l.id}><path d={`M${cx} ${y}V${y+15} M${x+45} ${y+15}H${x+s.w-45} M${x+45} ${y+s.h-15}H${x+s.w-45} M${cx} ${y+s.h-15}V${y+s.h}`}/>{l.children.map(child=>{const cs=size(child),xx=next;next+=cs.w;return <g key={child.id}><path d={`M${xx+cs.w/2} ${y+15}V${y+20} M${xx+cs.w/2} ${y+20+cs.h}V${y+s.h-15}`}/>{render(child,xx,y+20)}</g>;})}</g>;}let top=y+10;return <g key={l.id}><path d={`M${cx} ${y}V${y+10} M${cx} ${y+s.h-10}V${y+s.h}`}/>{l.children.map(child=>{const cs=size(child),yy=top;top+=cs.h;return render(child,cx-cs.w/2,yy);})}{l.kind==="switch"&&<text x={cx+25} y={y+8} stroke="none" fill="var(--muted)" fontSize="11">K · {l.closed?"1":"0"}</text>}</g>;}
  const originY=y;
  y+=dy;
  const angle=rotation?.(l.id)??0,center=y+45;
  const a=turn(0,y+25,center,angle),b=turn(0,y+65,center,angle);
  return <g key={l.id} {...onObject?.(l.id,l.id+" · "+l.kind.toUpperCase())}><path d={`${leads(anchor,originY,cx+a.x,a.y)} ${leads(anchor,originY+s.h,cx+b.x,b.y)}`}/><g transform={`rotate(${angle} ${cx} ${center})`}><rect className="network-svg-hit" x={cx-20} y={y+22} width="62" height="46"/>{l.kind==="r"?<rect x={cx-9} y={y+25} width="18" height="40" fill="var(--surface-canvas)"/>:l.kind==="c"?<path d={`M${cx} ${y+25}V${y+39} M${cx-18} ${y+39}H${cx+18} M${cx-18} ${y+51}H${cx+18} M${cx} ${y+51}V${y+65}`}/>:l.kind==="l"?<path d={`M${cx} ${y+25}a10 5 0 0 1 0 10a10 5 0 0 1 0 10a10 5 0 0 1 0 10a10 5 0 0 1 0 10`}/>:l.kind==="wire"?<path d={`M${cx} ${y+25}V${y+65}`}/>:<><circle cx={cx} cy={y+30} r="3"/><circle cx={cx} cy={y+60} r="3"/></>}<text x={cx+23} y={y+48} fill="var(--ink)" stroke="none" fontSize="11">{l.id}{l.value!==undefined?` = ${number(l.value,language,{significantDigits:3})} ${l.kind==="r"?"Ω":l.kind==="c"?"F":"H"}`:""}</text></g></g>;
 };
 if(region){
  return <g transform={`translate(${region.x+region.width/2-root.w*scale/2} ${region.y}) scale(${scale})`}>{render(load,0,0)}</g>;
 }
 return <svg className="load-circuit" viewBox={`0 0 ${root.w+120} ${root.h+30}`} role="img" aria-label={language==="ru"?"Схема соединений нагрузки":"Схема з’єднань навантаження"}><g transform="translate(10 10)" fill="none" stroke="var(--schematic-wire)" strokeWidth="1.7">{render(load,0,0)}</g></svg>;
}
