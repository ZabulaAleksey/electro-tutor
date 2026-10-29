import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import { lineStep } from "./line-surface";
import {downloadSvg} from "../engineering/exportSvg";
import {useLocalZoom} from "../engineering/useLocalZoom";
import {zoomAt} from "../engineering/gestures";
import Formula from "../components/Formula";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { engineeringAxis } from "../engineering/scale";
import { formatEngineeringNumber } from "../engineering/format";
import type { EngineeringPlotData } from "../engineering/plot";

export type SurfaceState = {load:number;time:number;point:number;angle:number;zoom:number;flat:boolean};

/** A real orthographic data projection: SVG works without a GPU or WebGL. */
export default function LineSurface({ language, store }: { language: Language; store?: {lineSurface?:SurfaceState} }) {
  const ru = language === "ru", [load, setLoad] = useState(store?.lineSurface?.load ?? 100), [time, setTime] = useState(store?.lineSurface?.time ?? 0.75), [point, setPoint] = useState(store?.lineSurface?.point ?? 75);
  const [angle, setAngle] = useState(store?.lineSurface?.angle ?? -0.48), [zoom, setZoom] = useState(store?.lineSurface?.zoom ?? 1), [flat, setFlat] = useState(store?.lineSurface?.flat ?? false);
  const [pan,setPan]=useState({x:0,y:0});
  const surfaceSvg=useRef<SVGSVGElement>(null);
  useLocalZoom(surfaceSvg,(anchor,factor)=>{const value=zoomAt(zoom,pan,anchor,{x:340,y:260},factor,.5,1.5);setZoom(value.zoom);setPan(value.pan);},!flat);
  const drag = useRef<{ x: number; angle: number } | null>(null);
  const reading = lineStep(point * 1000, time / 1000, load);
  useEffect(()=>{if(store)store.lineSurface={load,time,point,angle,zoom,flat};},[load,time,point,angle,zoom,flat,store]);
  const reflected = 50 * reading.gamma, top = 50 + reflected;
  // Exact planar domains and vertical wavefronts; no interpolated stair-step mesh.
  const faces = [
    {u:0,points:[[0,0,0],[1,0,0],[1,.5,0]]},
    {u:50,points:[[0,0,50],[1,.5,50],[0,1,50]]},
    {u:top,points:[[0,1,top],[1,.5,top],[1,1,top]]},
    {u:25,points:[[0,0,0],[1,.5,0],[1,.5,50],[0,0,50]]},
    {u:(50+top)/2,points:[[0,1,50],[1,.5,50],[1,.5,top],[0,1,top]]}
  ].sort((a,b)=>a.points.reduce((sum,p)=>sum+(p[0]-.5)*370*Math.sin(angle)+(p[1]-.5)*280*Math.cos(angle),0)/a.points.length-b.points.reduce((sum,p)=>sum+(p[0]-.5)*370*Math.sin(angle)+(p[1]-.5)*280*Math.cos(angle),0)/b.points.length);
  const knots=(fronts:number[])=>[0,1,...fronts.flatMap(v=>v>0&&v<1?[v-1e-8,v,v+1e-8]:[])].sort((a,b)=>a-b);
  const spatial=(t:number)=>knots([2*t,2-2*t]).map(x=>({x,t,u:lineStep(x*100000,t/1000,load).u}));
  const temporalPoints=knots([point/200,1-point/200]);
  const project = (x: number, t: number, u: number) => {
    const a = (x - 0.5) * 370, b = (t - 0.5) * 280;
    return [Number((340 + pan.x + (a * Math.cos(angle) - b * Math.sin(angle)) * zoom).toFixed(3)), Number((260 + pan.y + (a * Math.sin(angle) + b * Math.cos(angle)) * 0.47 * zoom - u * 2.05 * zoom).toFixed(3))];
  };
  const xyz = (x: number, t: number, u: number) => project(x, t, u).join(",");
  const xScale=engineeringAxis(0,100,{targetTicks:5}),tScale=engineeringAxis(0,1,{targetTicks:6}),uScale=engineeringAxis(0,100,{targetTicks:6});
  const section:EngineeringPlotData={xLabel:"x, km",yLabel:"U, V",xMax:100,yMin:0,yMax:100,curves:[{label:"U(x)",color:"blue",points:spatial(time).map(p=>[p.x*100,p.u])}]};
  const temporal:EngineeringPlotData={xLabel:"t, ms",yLabel:"U(t), V",xMax:1,yMin:0,yMax:100,curves:[{label:"U(t)",color:"blue",points:temporalPoints.map(t=>[t,lineStep(point*1000,t/1000,load).u])}]};
  function exportImage(){if(!surfaceSvg.current)return;const clone=surfaceSvg.current.cloneNode(true) as SVGSVGElement;clone.setAttribute("viewBox","0 0 680 410");clone.insertAdjacentHTML("afterbegin",'<rect width="680" height="410" fill="var(--surface-plot)"/>');clone.insertAdjacentHTML("beforeend",'<g id="export-scale" fill="var(--ink)" font-size="12"><text x="190" y="385">0 V → 100 V</text><text x="350" y="385">U(x,t) · V</text></g>');const original=surfaceSvg.current;original.appendChild(clone);downloadSvg(clone,"electrotutor-U-x-t.svg");original.removeChild(clone);}

  return <div className="line-surface" data-line-surface>
    <div className="surface-top"><button type="button" aria-label={ru?"Приблизить поверхность":"Наблизити поверхню"} onClick={()=>setZoom(z=>Math.min(1.5,z+.1))}>+</button><button type="button" aria-label={ru?"Отдалить поверхность":"Віддалити поверхню"} onClick={()=>setZoom(z=>Math.max(.5,z-.1))}>−</button><span>U(x,t) · {ru ? "линия без потерь" : "лінія без втрат"}</span><button type="button" onClick={() => setFlat(v => !v)}>{flat ? "3D" : ru ? "2D-сечение" : "2D-переріз"}</button><button type="button" aria-label={ru ? "Сброс камеры" : "Скидання камери"} onClick={() => { setAngle(-0.48); setZoom(1); setPan({x:0,y:0}); }}>↺</button><button type="button" onClick={exportImage} disabled={flat}>{ru?"Экспорт SVG":"Експорт SVG"} ↓</button></div>
    <div className="surface-circuit"><svg className="lab-circuit" viewBox="0 0 400 230" role="img" aria-label={ru?"Схема линии с согласованным источником и резистивной нагрузкой":"Схема лінії з узгодженим джерелом і резистивним навантаженням"}><g fill="none" stroke="var(--schematic-wire)" strokeWidth="2"><path d="M35 65 H75 M125 65 H345 V103 M345 145 V185 H35 V147 M35 103 V65"/><rect x="75" y="56" width="50" height="18" fill="var(--surface-plot)"/><rect x="336" y="103" width="18" height="42" fill="var(--surface-plot)"/><circle cx="35" cy="125" r="22"/><path d="M28 125 H42 M35 118 V132 M180 80 H270 M260 75 L270 80 L260 85 M270 165 H180 M190 160 L180 165 L190 170"/></g><g fill="var(--schematic-wire)" fontSize="14"><text x="72" y="43">Rₛ = 50 Ω</text><text x="226" y="43">Rᴸ = {load} Ω</text><text x="155" y="120">Z₀ = 50 Ω</text><text x="155" y="142">l = 100 km</text><text x="12" y="214">E = 100 V</text><text x="220" y="214">v = 200 000 km/s</text></g></svg><p>{ru?"Падающая + отражённая волна":"Падна + відбита хвиля"}</p></div>
    {!flat ? <svg ref={surfaceSvg} viewBox="0 0 680 360" className="surface-svg" role="img" aria-label={ru ? "Поверхность напряжения U(x,t), перетащите для поворота" : "Поверхня напруги U(x,t), перетягніть для обертання"} style={{ touchAction: "pan-y" }}
      onPointerDown={e => { if(!e.isPrimary||e.pointerType==="touch")return;drag.current = { x: e.clientX, angle }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current) setAngle(Math.max(-1.1, Math.min(0.8, drag.current.angle + (e.clientX - drag.current.x) / 230))); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => {drag.current=null;}} data-zoom={zoom}>
      <g fill="none" stroke="var(--grid-major)" strokeWidth="0.7">{[0, .25, .5, .75, 1].map(v => <path key={v} d={`M${xyz(v,0,0)} L${xyz(v,1,0)} M${xyz(0,v,0)} L${xyz(1,v,0)}`} />)}</g>
      {faces.map((face,j)=><polygon key={j} points={face.points.map(p=>xyz(p[0],p[1],p[2])).join(" ")} fill={`hsl(${210+face.u*.85} 78% ${35+face.u*.19}%)`} stroke="var(--line)" strokeOpacity=".35" strokeWidth=".7"/>)}
      {Array.from({length:17},(_,k)=>k/16).map(t=><polyline key={t} points={spatial(t).map(p=>xyz(p.x,p.t,p.u)).join(" ")} fill="none" stroke="#c7e6ff" strokeOpacity=".18" strokeWidth=".7"/>)}
      <polyline points={spatial(time).map(p=>xyz(p.x,p.t,p.u)).join(" ")} fill="none" stroke="var(--orange)" strokeWidth="2.5" />
      <circle cx={project(point/100,time,reading.u)[0]} cy={project(point/100,time,reading.u)[1]} r="4" fill="#fff" stroke="var(--orange)"/>
      <g stroke="var(--muted)" fill="none"><path d={`M${xyz(0,0,0)} L${xyz(1.09,0,0)} M${xyz(0,0,0)} L${xyz(0,1.1,0)} M${xyz(0,0,0)} L${xyz(0,0,105)}`} /></g>
      <g fill="var(--ink)" stroke="var(--muted)" fontSize="11">
      {xScale.ticks.map(v=><g key={`x${v}`} data-surface-axis="x"><path d={`M${xyz(v/100,0,0)} l0 4`}/><text stroke="none" x={project(v/100,0,0)[0]} y={project(v/100,0,0)[1]+17}>{formatEngineeringNumber(v,language)}</text></g>)}
      {tScale.ticks.filter(v=>v>0).map(v=><g key={`t${v}`} data-surface-axis="t"><path d={`M${xyz(0,v,0)} l-4 0`}/><text stroke="none" x={project(0,v,0)[0]-26} y={project(0,v,0)[1]+5}>{formatEngineeringNumber(v,language)}</text></g>)}
      {uScale.ticks.filter(v=>v>0).map(v=><g key={`u${v}`} data-surface-axis="U"><path d={`M${xyz(0,0,v)} l-4 0`}/><text stroke="none" x={project(0,0,v)[0]-29} y={project(0,0,v)[1]+4}>{formatEngineeringNumber(v,language)}</text></g>)}
      <g stroke="none" fontSize="13"><text x={project(1.06,0,0)[0]} y={project(1.06,0,0)[1]+35}>x, км</text><text x={project(0,1.03,0)[0]-50} y={project(0,1.03,0)[1]+30}>t, мс</text><text x={project(0,0,100)[0]-6} y={project(0,0,100)[1]-16}>U, В</text></g></g>
    </svg> : <div className="surface-section"><EngineeringPlot plot={section} language={language} svgClass="surface-2d" selected={[point,reading.u]} label={ru?"Пространственное сечение напряжения":"Просторовий переріз напруги"} showLegend={false}/></div>}

    <div className="surface-scale"><span>0 V</span><i /><span>100 V</span><small>{ru ? "Цвет: напряжение · идеальная ступень" : "Колір: напруга · ідеальна сходинка"}</small></div>
    <div className="surface-controls"><label>Rᴸ, Ω <strong>{load}</strong><input aria-label="Rᴸ, Ω" type="range" min="0" max="250" step="5" value={load} onChange={e => setLoad(+e.target.value)} /></label><label>t, ms <strong>{formatNumber(language,time,2)}</strong><input aria-label="t, ms" type="range" min="0" max="1" step=".01" value={time} onChange={e => setTime(+e.target.value)} /></label><label>x, km <strong>{point}</strong><input aria-label="x, km" type="range" min="0" max="100" step="1" value={point} onChange={e => setPoint(+e.target.value)} /></label><label>{ru ? "Масштаб" : "Масштаб"}<input aria-label={ru ? "Масштаб поверхности" : "Масштаб поверхні"} type="range" min=".7" max="1.15" step=".05" value={zoom} onChange={e => setZoom(+e.target.value)} /></label><label>{ru?"Поворот":"Обертання"}<input aria-label={ru?"Поворот поверхности":"Обертання поверхні"} type="range" min="-1.1" max=".8" step=".05" value={angle} onChange={e=>setAngle(+e.target.value)}/></label></div>
    <div className="surface-reading"><span>U = <strong data-surface-u>{formatNumber(language,reading.u,3)} V</strong></span><span>I = {formatNumber(language,reading.i,3)} A</span><span>Γ = {formatNumber(language,reading.gamma,3)}</span></div>
    <div className="surface-equation"><Formula>{String.raw`\Gamma=\frac{R_L-Z_0}{R_L+Z_0},\quad u=u^++u^-`}</Formula></div>
    <div className="surface-time"><EngineeringPlot plot={temporal} language={language} svgClass="surface-2d" selected={[time,reading.u]} cursorTime={time} label={ru?"Напряжение во времени в выбранной точке":"Напруга в часі в обраній точці"} showLegend={false}/></div>
    <small className="surface-note">E = 100 V · Rₛ = Z₀ = 50 Ω · l = 100 km · v = 200 000 km/s. {ru ? "Ступень при t=0; до коммутации U=I=0. Жёлтая линия: выбранное время." : "Сходинка при t=0; до комутації U=I=0. Жовта лінія: обраний час."}</small>
  </div>;
}
