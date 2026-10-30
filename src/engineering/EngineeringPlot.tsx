import { useEffect, useId, useMemo, useRef, useState } from "react";
import { chooseEngineeringUnit, formatAxisLabel, formatEngineeringNumber, inEngineeringUnit, parseAxisLabel } from "./format";
import { engineeringAxis } from "./scale";
import { nearestSample, plotAxes, validatePlotData, type EngineeringPlotData, type PlotPoint } from "./plot";
import type { EngineeringLocale, EngineeringUnit } from "./format";

export type PlotMarker = { point: PlotPoint; label: string };
const screen = (v: number) => Number(v.toFixed(3));
export default function EngineeringPlot({ plot, language, kind="line", compact = false, svgClass = "", legendClass = "", selected, characteristic, cursorTime, domains, area, onSelect, verticals = [], label, showLegend = true, gridMode = "engineering" }: {
  kind?:"line"|"stem"; plot: EngineeringPlotData; language: EngineeringLocale; compact?: boolean; svgClass?: string; legendClass?: string;
  area?:{points:readonly PlotPoint[];baseline?:number;color?:string}; domains?: {x?:readonly[number,number];y?:readonly[number,number]}; onSelect?:(point:PlotPoint)=>void; verticals?:{x:number;label:string}[];
  selected?: PlotPoint; characteristic?: PlotMarker; cursorTime?: number; label: string; showLegend?: boolean; gridMode?: "engineering" | "millimeter";
}) {
  const id=useId().replace(/:/g,""), svg=useRef<SVGSVGElement>(null), units=useRef<{x?:EngineeringUnit;y?:EngineeringUnit}>({});
  const [hover,setHoverState]=useState<PlotPoint|null>(null);
  // Keep the last readout on blur so nearby buttons do not move during a click.
  const lastHover=useRef<PlotPoint|null>(null);
  const setHover=(point:PlotPoint|null)=>{if(point)lastHover.current=point;setHoverState(point);};
  const errors=validatePlotData(plot), valid=!errors.length;
  const cx=characteristic?.point[0], cy=characteristic?.point[1];
  const axes=useMemo(()=>{if(!valid)return null;const a=plotAxes(plot,cx!==undefined&&cy!==undefined?[[cx,cy]]:[],{targetTicks:compact?4:6});if(domains?.x)a.x=engineeringAxis(...domains.x,{targetTicks:compact?4:6,logarithmic:plot.logarithmic});if(domains?.y)a.y=engineeringAxis(...domains.y,{targetTicks:compact?4:6,step:plot.yTickStep});return a;},[plot,cx,cy,compact,valid,domains]);
  const names={x:parseAxisLabel(plot.xLabel),y:parseAxisLabel(plot.yLabel)};
  const choices=useMemo(()=>axes?{
    x:chooseEngineeringUnit(names.x.unit,Math.max(...axes.x.domain.map(Math.abs)),language,{previous:units.current.x}),
    y:chooseEngineeringUnit(names.y.unit,Math.max(...axes.y.domain.map(Math.abs)),language,{previous:units.current.y})
  }:null,[axes,names.x.unit,names.y.unit,language]);
  useEffect(()=>{if(choices)units.current=choices;},[choices]);
  if(!axes||!choices) return <p className="engineering-plot-invalid" role="status">{language==="en"?"Invalid plot data":language==="uk"?"Некоректні дані графіка":"Некорректные данные графика"}</p>;
  const x=(v:number)=>screen(62+axes.x.position(v)*342), y=(v:number)=>screen(190-axes.y.position(v)*151);
  const tick=(v:number,which:"x"|"y")=>formatEngineeringNumber(inEngineeringUnit(v,choices[which]),language,{significantDigits:Math.min(14,Math.max(4,Math.ceil(Math.log10(Math.max(...axes[which].domain.map(Math.abs))/axes[which].step))+2))});
  const coordinates=(p:PlotPoint)=>`${names.x.quantity} = ${plot.categories?plot.categories[Math.round(p[0])]:formatEngineeringNumber(inEngineeringUnit(p[0],choices.x),language,{significantDigits:6})+" "+choices.x.symbol}; ${names.y.quantity} = ${formatEngineeringNumber(inEngineeringUnit(p[1],choices.y),language,{significantDigits:6})} ${choices.y.symbol}`;
  const current=hover??selected;
  function move(clientX:number) { const el=svg.current;if(!el)return; const matrix=el.getScreenCTM();if(!matrix)return;const local=new DOMPoint(clientX,0).matrixTransform(matrix.inverse());const point=nearestSample(plot.curves[0]?.points??[],axes!.x.invert(Math.max(0,Math.min(1,(local.x-62)/342))));if(point)setHover(point);return point; }
  return <div className="engineering-plot-wrap" data-engineering-plot data-x-scale={axes.x.logarithmic?"log":"linear"} data-grid-mode={gridMode} data-x-domain={axes.x.domain.join(",")} data-y-domain={axes.y.domain.join(",")} data-x-unit={choices.x.symbol} data-y-unit={choices.y.symbol}>
    <svg ref={svg} className={`${svgClass} engineering-plot`} viewBox="0 0 440 245" role="img" aria-label={label} tabIndex={0}
      onPointerDown={e=>{const point=move(e.clientX);if(point)onSelect?.(point);}} onPointerMove={e=>move(e.clientX)} onPointerLeave={()=>setHover(null)} onBlur={()=>setHover(null)} onKeyDown={e=>{if(e.key==="Escape"){setHover(null);return;}if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const points=plot.curves[0]?.points??[];const index=current?Math.max(0,points.findIndex(p=>p[0]>=current[0])):0;const next=e.key==="Home"?0:e.key==="End"?points.length-1:Math.max(0,Math.min(points.length-1,index+(e.key==="ArrowRight"?1:-1)));if(points[next]){setHover(points[next]);onSelect?.(points[next]);}}}>
      <defs><clipPath id={`engineering-clip-${id}`}><rect x="60" y="37" width="347" height="155"/></clipPath></defs>
      <g className="engineering-minor-grid" stroke="var(--line)" strokeWidth=".6" opacity=".55">
        {gridMode==="engineering" ? <>{axes.x.minorTicks.map(v=><path key={`x${v}`} d={`M${x(v)} 39 V190`}/>)}{axes.y.minorTicks.map(v=><path key={`y${v}`} d={`M62 ${y(v)} H404`}/>)}</> : <>{Array.from({length:69},(_,k)=><path key={`gx${k}`} d={`M${62+k*5} 39 V190`}/>)}{Array.from({length:31},(_,k)=><path key={`gy${k}`} d={`M62 ${40+k*5} H404`}/>)}</>}
      </g>
      <g className="engineering-major-grid" stroke="var(--line)" strokeWidth="1">{axes.x.ticks.map(v=><path key={`x${v}`} d={`M${x(v)} 39 V190`}/>)}{axes.y.ticks.map(v=><path key={`y${v}`} d={`M62 ${y(v)} H404`}/>)}</g>
      <g fill="var(--muted)" fontSize={compact?15:12} className="engineering-ticks">{axes.x.ticks.map(v=><text key={`x${v}`} x={x(v)} y="211" textAnchor="middle">{plot.categories?.[Math.round(v)]??tick(v,"x")}</text>)}{axes.y.ticks.map(v=><text key={`y${v}`} x="53" y={y(v)+4} textAnchor="end">{tick(v,"y")}</text>)}</g>
      <path d="M62 37 V190 H407" stroke="var(--muted)" fill="none"/>
      <g fill="var(--ink)" fontSize={compact?16:13}><text data-axis-label="y" x="62" y="20">{formatAxisLabel(names.y.quantity,choices.y)}</text><text data-axis-label="x" x="405" y="238" textAnchor="end">{plot.categories?names.x.quantity:formatAxisLabel(names.x.quantity,choices.x)}</text></g>
      <g clipPath={`url(#engineering-clip-${id})`}>
        {axes.y.domain[0]<0&&axes.y.domain[1]>0&&<path d={`M62 ${y(0)} H404`} stroke="var(--muted)" strokeDasharray="3 3"/>}
        {area&&area.points.length>1&&<polygon data-plot-area points={`${x(area.points[0][0])},${y(area.baseline??0)} ${area.points.map(p=>`${x(p[0])},${y(p[1])}`).join(" ")} ${x(area.points.at(-1)![0])},${y(area.baseline??0)}`} fill={`var(--${area.color??"blue"})`} opacity=".18"/>}
        {kind==="stem"?plot.curves.map(c=><g key={c.label} data-stem-series={c.label} stroke={`var(--${c.color})`}>{c.points.map((p,j)=><g key={j} data-stem-frequency={p[0]} data-stem-amplitude={p[1]}><line x1={x(p[0])} x2={x(p[0])} y1={y(0)} y2={y(p[1])} strokeWidth="1.8"/><circle cx={x(p[0])} cy={y(p[1])} r="3" fill={`var(--${c.color})`}/><title>{coordinates(p)}</title></g>)}</g>):plot.curves.map((c,k)=><polyline key={c.label} data-plot-curve={c.label} points={c.points.map(p=>`${x(p[0])},${y(p[1])}`).join(" ")} fill="none" stroke={`var(--${c.color})`} strokeWidth="2.4" strokeDasharray={c.dash?k===2?"2 4":"7 4":undefined}/>)}
        {verticals.map((v,k)=><g key={`${v.label}-${k}`}><path d={`M${x(v.x)} 39 V190`} stroke="var(--muted)" strokeDasharray="2 4"/><title>{v.label}</title></g>)}
        {cursorTime!==undefined&&<path data-time-cursor d={`M${x(cursorTime)} 39 V190`} stroke="var(--green)" strokeDasharray="3 3"/>}
        {characteristic&&<g data-characteristic-x={characteristic.point[0]} data-characteristic-y={characteristic.point[1]}><path d={`M${x(characteristic.point[0])} 39 V190`} stroke="var(--muted)" opacity=".7" strokeDasharray="2 4"/><rect x={x(characteristic.point[0])-3.5} y={y(characteristic.point[1])-3.5} width="7" height="7" fill="var(--white)" stroke="var(--ink)"/><title>{`${characteristic.label}: ${coordinates(characteristic.point)}`}</title></g>}
        {current&&<circle data-cursor-x={current[0]} data-cursor-y={current[1]} cx={x(current[0])} cy={y(current[1])} r="4.5" fill="var(--green)" stroke="var(--white)" strokeWidth="1.5"><title>{coordinates(current)}</title></circle>}
      </g>
      {characteristic&&<text x={Math.min(425-characteristic.label.length*8,Math.max(65,x(characteristic.point[0])+7))} y="33" fill="var(--ink)" fontSize={compact?13:11}>{characteristic.label}</text>}
    </svg>
    {showLegend&&<div className={legendClass}>{plot.curves.map((c,k)=><span key={c.label}><i style={{color:`var(--${c.color})`,borderTopStyle:c.dash?k===2?"dotted":"dashed":"solid"}}/>{c.label}</span>)}{characteristic&&<span>□ {characteristic.label}</span>}</div>}
    {lastHover.current&&<div className="engineering-readout" aria-live="off" aria-hidden={!hover} style={{visibility:hover?"visible":"hidden"}} data-plot-readout={hover?"":undefined}>{language==="en"?"Cursor: ":language==="uk"?"Курсор: ":"Курсор: "}{coordinates(lastHover.current)}</div>}
  </div>;
}
