import { useId, useRef, useEffect, useLayoutEffect, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import type { BeamScheme, BeamResult, BeamLoad } from "../models/beam";
import { SupportGlyph } from "../engineering/symbols";
import { engineeringAxis } from "../engineering/scale";
import { formatEngineeringNumber } from "../engineering/format";
import { svgPoint } from "../engineering/gestures";
import { useLocalZoom } from "../engineering/useLocalZoom";
import type { Language } from "../types";
import type { BeamCopy } from "./copy";

export type BeamFactor = "N" | "Q" | "M";
const origin = 110, span = 800, beamY = 210;
export function BeamDiagram({ scheme, result, language, copy, selected, onSelect, onDragStart, onDrag, onDragFinish, onDragCancel, cursor, onCursor, side, factors, reactions, values, zoom, onZoom, onDrop, editor }: {
  scheme: BeamScheme; result: BeamResult | null; language: Language; copy: BeamCopy; selected: string | null;
  onSelect: (id: string) => void; onDragStart: () => void; onDrag: (id: string, x: number, end: boolean) => void; onDragFinish: () => void; onDragCancel: () => void;
  cursor: number; onCursor: (x: number) => void; side: "left" | "right"; factors: BeamFactor[]; reactions: boolean; values: boolean; zoom: number; onZoom: (factor: number, anchor?: {x:number;y:number}) => void; onDrop: (kind: string, x: number) => void; editor: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ pointer: number; id: string; end: boolean } | null>(null);
  useEffect(() => {
    const cancel = () => { if (drag.current) { drag.current = null; onDragCancel(); } };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown", key); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("blur", cancel); };
  }, [onDragCancel]);
  const pan = useRef<{pointer:number;clientX:number;scroll:number}|null>(null);
  const [viewport,setViewport]=useState({left:0,right:1000,scale:1});
  useLayoutEffect(()=>{
    const element=svg.current,parent=element?.parentElement;if(!element||!parent)return;
    const measure=()=>{const scale=element.getBoundingClientRect().width/1000;if(!scale)return;const next={left:parent.scrollLeft/scale,right:(parent.scrollLeft+parent.clientWidth)/scale,scale};setViewport(old=>Math.abs(old.left-next.left)<1e-5&&Math.abs(old.right-next.right)<1e-5&&Math.abs(old.scale-next.scale)<1e-5?old:next);};
    measure();parent.addEventListener("scroll",measure,{passive:true});const observer=new ResizeObserver(measure);observer.observe(parent);observer.observe(element);
    return()=>{parent.removeEventListener("scroll",measure);observer.disconnect();};
  },[zoom,factors.length]);
  const marker = `beam-arrow-${useId().replace(/:/g, "")}`;
  const num = (v: number) => formatEngineeringNumber(v, language, { maximumFractionDigits: 3 });
  const x = (v: number) => origin + span * v / scheme.length;
  const location = (clientX: number, clientY: number) => { const el = svg.current; return el ? Math.max(0, Math.min(scheme.length, (svgPoint(el, clientX, clientY).x - origin) / span * scheme.length)) : 0; };
  useLocalZoom(svg, (anchor, factor) => onZoom(factor, anchor));
  const begin = (e: PointerEvent<SVGGElement>, id: string, end = false) => { if (e.button !== 0 || drag.current) return; e.preventDefault(); e.stopPropagation(); onSelect(id); drag.current = { pointer: e.pointerId, id, end }; onDragStart(); e.currentTarget.setPointerCapture(e.pointerId); };
  const finish = (e: PointerEvent<SVGSVGElement>, cancel = false) => { if (pan.current?.pointer === e.pointerId) { pan.current = null; return; } if (drag.current?.pointer !== e.pointerId) return; drag.current = null; if (cancel) onDragCancel(); else onDragFinish(); };
  const control = (id: string, end = false) => ({ onPointerDown: (e: PointerEvent<SVGGElement>) => begin(e, id, end), onLostPointerCapture: () => { if (drag.current) { drag.current = null; onDragCancel(); } }, tabIndex: 0, role: "button" as const, "aria-label": `${copy.select} ${id}${end ? ` ${copy.end}` : ""}`, onKeyDown: (e: KeyboardEvent<SVGGElement>) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } } });
  const loadPoint = scheme.loads.find(l => l.id === selected), supportPoint = scheme.supports.find(a => a.id === selected);
  const selectedX = loadPoint ? loadPoint.kind === "distributed" ? (loadPoint.start + loadPoint.end) / 2 : loadPoint.x : supportPoint?.x;
  const rowHeight = 165, height = 350 + factors.length * rowHeight;
  function arrow(x1: number, y1: number, x2: number, y2: number, color = "var(--blue)") { return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" markerEnd={`url(#${marker})`} />; }
  function pointLoad(l: Exclude<BeamLoad, { kind: "distributed" }>, index: number) {
    const px = x(l.x), up = l.value >= 0, top = beamY - 60 - index % 2 * 24;
    return <g key={l.id} data-beam-load={l.id} data-load-kind={l.kind} data-load-x={l.x} className={`beam-draggable ${selected === l.id ? "beam-selected" : ""}`} {...control(l.id)}>
      <rect x={px - 22} y={top - 20} width="44" height={beamY - top + 24} fill="transparent" stroke="none" />
      {l.kind === "force" ? up ? arrow(px, beamY, px, top) : arrow(px, top, px, beamY) : l.kind === "axial" ? up ? arrow(px - 40, beamY - 10, px, beamY - 10) : arrow(px + 40, beamY - 10, px, beamY - 10) : <path d={up ? `M${px + 18} ${beamY - 10} A22 22 0 1 0 ${px - 20} ${beamY - 6}` : `M${px - 18} ${beamY - 10} A22 22 0 1 1 ${px + 20} ${beamY - 6}`} fill="none" stroke="var(--violet)" strokeWidth="2" markerEnd={`url(#${marker})`} />}
      <text x={px} y={top - 8} textAnchor="middle" className="beam-load-label">{l.id}{values ? ` = ${num(l.value / 1000)} ${l.kind === "moment" ? "kN·m" : "kN"}` : ""}</text>
    </g>;
  }
  function distributedLoad(l: Extract<BeamLoad,{kind:"distributed"}>) {
    const scale = Math.max(1,Math.abs(l.q0),Math.abs(l.q1)), zero = l.q0*l.q1<0 ? -l.q0/(l.q1-l.q0) : null;
    const profile = (t:number) => { const q=l.q0+(l.q1-l.q0)*t;return [x(l.start+(l.end-l.start)*t),beamY-Math.abs(q)/scale*50] as const; };
    const locations=[0,...(zero===null?[]:[zero]),1];
    const arrows=[...new Set([...Array.from({length:Math.max(2,Math.ceil((l.end-l.start)/scheme.length*18)+1)},(_,i)=>i/Math.max(1,Math.ceil((l.end-l.start)/scheme.length*18))),...(zero===null?[]:[zero])])].sort((a,b)=>a-b);
    return <g key={l.id} data-beam-load={l.id} data-load-kind="distributed" className={selected===l.id?"beam-selected":""} onClick={()=>onSelect(l.id)}>
      {arrows.map((t,i)=>{const [px,py]=profile(t),q=l.q0+(l.q1-l.q0)*t;return <g key={i} data-distributed-arrow={q}>{Math.abs(q)<scale*1e-12?null:q<0?arrow(px,py,px,beamY):arrow(px,beamY,px,py)}</g>;})}
      <polyline data-distributed-profile points={locations.map(t=>profile(t).join(",")).join(" ")} stroke="var(--blue)" fill="none"><title>|q(x)| · q₀ → q₁</title></polyline>
      {zero!==null&&<g data-q-zero={l.start+(l.end-l.start)*zero}><circle cx={profile(zero)[0]} cy={beamY} r="4" fill="var(--white)" stroke="var(--blue)"/><text x={profile(zero)[0]+7} y={beamY-7}>q=0</text></g>}
      <text x={(x(l.start)+x(l.end))/2} y="128" textAnchor="middle">{l.id}{values?`: ${num(l.q0/1000)} → ${num(l.q1/1000)} kN/m`:""}</text>
      {[false,true].map(end=><g key={String(end)} className="beam-draggable" {...control(l.id,end)}><rect x={x(end?l.end:l.start)-18} y="132" width="36" height="85" fill="transparent" stroke="none"/><circle cx={x(end?l.end:l.start)} cy="145" r="6" fill="var(--white)" stroke="var(--blue)"/></g>)}
    </g>;
  }
  return <div className="beam-scroll" data-beam-viewport><svg ref={svg} className="beam-drawing" style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 760}px` }} viewBox={`0 0 1000 ${height}`} role="group" aria-label={copy.beam} data-beam-scheme
    onPointerDown={e => { if (e.pointerType!=="mouse"&&!(e.target as Element).closest(".beam-draggable,foreignObject")) { pan.current={pointer:e.pointerId,clientX:e.clientX,scroll:e.currentTarget.parentElement?.scrollLeft??0};e.currentTarget.setPointerCapture(e.pointerId); } }}
    onPointerMove={e => { if(pan.current?.pointer===e.pointerId&&e.currentTarget.parentElement)e.currentTarget.parentElement.scrollLeft=pan.current.scroll+pan.current.clientX-e.clientX; const at = location(e.clientX, e.clientY); onCursor(at); if (drag.current?.pointer === e.pointerId) onDrag(drag.current.id, at, drag.current.end); }} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}
    onKeyDown={e => { if (e.key === "Escape" && drag.current) { drag.current = null; onDragCancel(); } }}
    onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onDrop(e.dataTransfer.getData("application/x-electrotutor-beam"), location(e.clientX, e.clientY)); }}>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" /></marker></defs>
    <g className="beam-scheme-ink">
      {scheme.segments.map((g, i) => <g key={i} data-beam-segment={i}><rect x={x(g.start)} y={beamY - 4} width={x(g.end) - x(g.start)} height="8" fill={i % 2 ? "var(--muted)" : "var(--ink)"} /><text x={x((g.start + g.end) / 2)} y="305" textAnchor="middle" fontSize="12">{`EI${i + 1} = ${num(g.EI / 1e6)} MN·m²`}</text></g>)}
      {scheme.supports.map(a => <g key={a.id} className={`beam-draggable ${selected === a.id ? "beam-selected" : ""}`} data-beam-support={a.id} data-support-kind={a.kind} {...control(a.id)}><rect x={x(a.x) - 25} y={beamY - 12} width="50" height="62" fill="transparent" stroke="none" /><SupportGlyph x={x(a.x)} y={beamY} kind={a.kind === "fixed" ? a.x > scheme.length / 2 ? "fixed-right" : "fixed-left" : a.kind} /><text x={x(a.x)} y="270" textAnchor="middle">{a.id}</text></g>)}
      {scheme.loads.map((l,index)=>l.kind!=="distributed"?pointLoad(l,index):distributedLoad(l))}
      <path d={`M${origin} 280H${origin + span} M${origin} 274V286M${origin + span} 274V286`} stroke="var(--muted)" fill="none" />
      <text x={origin} y="299">0</text><text x={origin + span} y="299" textAnchor="end">{num(scheme.length)} m</text>
      {reactions && result?.reactions.map((r, i) => <g key={r.id} data-beam-reaction={r.id}>
        {Math.abs(r.Fy) > 1e-6 && (r.Fy >= 0 ? arrow(x(r.x) + 10, 265, x(r.x) + 10, 218, "var(--green)") : arrow(x(r.x) + 10, 218, x(r.x) + 10, 265, "var(--green)"))}
        {values && <text x={Math.max(113, Math.min(790, x(r.x) + 25))} y={235 + i % 2 * 17} fontSize="12" fill="var(--green)">{r.id}: {num(r.Fy / 1000)} kN</text>}
      </g>)}
    </g>
    {result && factors.map((factor, index) => { const data = result.points[factor], base = 350 + index * rowHeight, unit = factor === "M" ? "kN·m" : "kN", vals = data.map(p => p[1] / 1000), axis = engineeringAxis(Math.min(0, ...vals), Math.max(0, ...vals), { targetTicks: 4 }), y = (v: number) => base + 112 - axis.position(v / 1000) * 98, pts = data.map(([at, v]) => `${x(at)},${y(v)}`).join(" "), candidates = result.extrema[factor], maximum = candidates.reduce<{ x: number; value: number } | undefined>((b, p) => !b || p.value > b.value ? p : b, undefined), minimum = candidates.reduce<{ x: number; value: number } | undefined>((b, p) => !b || p.value < b.value ? p : b, undefined), extremes = [maximum, minimum].filter((p, i, a) => p && (i === 0 || p.value !== a[0]?.value));
      return <g key={factor} data-beam-epure={factor}>
        <text x="16" y={base + 20} className="beam-factor-label">{factor}(x)</text><text x="16" y={base + 40} fontSize="12">{unit}</text>
        {axis.ticks.map(v => <g key={v}><path d={`M${origin} ${y(v * 1000)}H${origin + span}`} stroke="var(--line)" strokeWidth=".6" /><text x={origin - 10} y={y(v * 1000) + 4} textAnchor="end" fontSize="11">{num(v)}</text></g>)}
        <polygon points={`${origin},${y(0)} ${pts} ${origin + span},${y(0)}`} fill={`var(--${factor === "M" ? "violet" : factor === "N" ? "green" : "blue"})`} opacity=".12" />
        <path d={`M${origin} ${y(0)}H${origin + span}`} stroke="var(--muted)" />
        <polyline data-beam-curve={factor} points={pts} stroke={`var(--${factor === "M" ? "violet" : factor === "N" ? "green" : "blue"})`} strokeWidth="2" fill="none" />
        {result.zeros[factor].filter(z => z > 1e-8 && z < scheme.length - 1e-8).map((z, k) => <g key={k} data-beam-zero={z}><circle cx={x(z)} cy={y(0)} r="3" fill="var(--white)" stroke="var(--ink)" /><title>{`${copy.zero}: x = ${num(z)} m`}</title></g>)}
        {values && extremes.map((p, k) => p && <g key={k}><circle cx={x(p.x)} cy={y(p.value)} r="3" fill="var(--ink)" /><text x={Math.max(115, Math.min(780, x(p.x) + 7))} y={base + (k ? 133 : 4)} fontSize="12">{k ? copy.min : copy.max}: {num(p.value / 1000)} {unit}; x={num(p.x)} m</text></g>)}
        <circle data-beam-cursor-value={factor} cx={x(cursor)} cy={y(result.sample(cursor, side)[factor])} r="4" fill="var(--green)" />
        <g fill="var(--muted)" fontSize="11">{Array.from({ length: 9 }, (_, j) => j * scheme.length / 8).map(at => <text key={at} x={x(at)} y={base + 153} textAnchor="middle">{num(at)}</text>)}<text x="940" y={base + 153}>x, m</text></g>
      </g>;
    })}
    <path data-beam-cursor d={`M${x(cursor)} 115V${height - 5}`} stroke="var(--green)" strokeDasharray="4 4" pointerEvents="none" />
    {selectedX !== undefined && <foreignObject x={Math.max(viewport.left+8/viewport.scale,Math.min(viewport.right-228/viewport.scale,x(selectedX)-110/viewport.scale))} y="3" width={220/viewport.scale} height={115/viewport.scale}><div className="beam-inline-editor" style={{width:220,transform:`scale(${1/viewport.scale})`,transformOrigin:"0 0"}} onPointerDown={e => e.stopPropagation()}>{editor}</div></foreignObject>}
  </svg></div>;
}
