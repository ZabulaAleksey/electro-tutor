import {navigate} from "astro:transitions/client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import { localePath } from "../site-path";
import { localizeLatexNumbers } from "../engineering/format";
import Formula from "../components/Formula";
import CircuitDiagram from "../components/CircuitDiagram";
import { findStory, type Story } from "./catalog";
import { assumptions, showcaseCopy, softwareExamples } from "./copy";
import { INITIAL, ac, model, n, rc, type Parameters } from "./physics";
import { CircuitVisual, Phasors, ScenePlot } from "./SceneVisual";
import "./showcase.css";
import PanoramicCarousel from "./PanoramicCarousel";
import LaboratoryCatalog from "../catalogue/LaboratoryCatalog";
import LineSurface, { type SurfaceState } from "./LineSurface";

import "./panoramic.css";
const CachedFormula = memo(Formula);

type SceneState = { lineSurface?:SurfaceState; parameters: Record<string, Parameters>; times: Record<string, number>; running: Record<string, boolean> };
function LiveScene({ story, language, store, motion, reduced, bookingUrl }: { story: Story; language: Language; store: SceneState; motion: boolean; reduced: boolean; bookingUrl?: string }) {
  const copy = showcaseCopy[language], [parameters, setParameters] = useState(() => store.parameters[story.id] ?? { dc: { ...INITIAL.dc, ...story.parameters?.dc }, ac: { ...INITIAL.ac, ...story.parameters?.ac }, rc: { ...INITIAL.rc, ...story.parameters?.rc } });
  const [time, setTime] = useState(store.times[story.id] ?? (story.interaction === "illustration" ? 1 : 0));
  const [running, setRunning] = useState(store.running[story.id] ?? true);
  const timeRef = useRef(time), lastPaint = useRef(0);
  const view = useMemo(() => model(story.visual, parameters), [story.visual, parameters]);
  const dynamic = story.interaction === "dynamic";
  const maximumTime = story.visual === "rc" ? 5 * parameters.rc.resistance * parameters.rc.capacitance : Infinity;
  useEffect(() => {
    if (!dynamic || !running || !motion || reduced || timeRef.current >= maximumTime) return;
    let frame = 0, last = 0;
    function tick(now: number) {
      if (last) timeRef.current = Math.min(maximumTime, timeRef.current + Math.min((now - last) / 1000, 0.1));
      last = now;
      store.times[story.id] = timeRef.current;
      if (now - lastPaint.current >= 30) { setTime(timeRef.current); lastPaint.current = now; }
      if (timeRef.current < maximumTime) frame = requestAnimationFrame(tick);
      else { setTime(timeRef.current); setRunning(false); store.running[story.id] = false; }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dynamic, running, motion, reduced, maximumTime, store, story.id]);
  function reset() { timeRef.current = 0; store.times[story.id] = 0; store.running[story.id] = true; setTime(0); setRunning(true); }
  function change(next: Parameters) {
    store.parameters[story.id] = next; setParameters(next);
    if (story.visual === "rc") reset();
  }
  const phase = ac(parameters.ac.frequency, parameters.ac.resistance);
  const charge = rc(time, parameters.rc.resistance, parameters.rc.capacitance);
  const metrics = story.visual === "rc" ? [...view.metrics, { label: "uC(t)", value: charge.uc, unit: "V", color: "blue" }, { label: "i(t)", value: charge.i * 1000, unit: "mA", color: "orange" }] : view.metrics;
  const mesh = story.id === "numpy-mesh" || story.template === "lesson";
  const software = story.template === "software" ? softwareExamples.find(item => item.name.startsWith(story.id === "python-rc" ? "Python" : story.id === "numpy-mesh" ? "NumPy" : "LTspice")) : undefined;
  function slider(label: string, value: number, min: number, max: number, step: number, update: (v: number) => void) {
    return <label className="lab-slider"><span>{label}<strong>{formatNumber(language, value)}</strong></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={event => update(Number(event.target.value))} /></label>;
  }
  if (story.visual === "line") return <div className="panoramic-line-scene" data-scene={story.id} data-motion="paused"><LineSurface language={language} store={store} /><div className="lab-result-footer"><a href={localePath(language,story.route)}>{copy.open} ↗</a></div></div>;
  return <div className="lab-scene-grid" data-scene={story.id} data-template={story.template} data-motion={dynamic && running && motion && !reduced && time < maximumTime ? "running" : "paused"}>
    <div className="lab-schematic-panel">
      <div className="lab-panel-kicker"><span>01 / {copy.scheme}</span><span>{dynamic ? copy.animation : copy.snapshot}</span></div>
      {mesh ? <CircuitDiagram language={language} /> : <CircuitVisual kind={story.visual} parameters={parameters} time={time} language={language} />}
      {(story.visual === "three" || story.visual === "neutral") && <svg className="lab-vector-inset" viewBox="180 0 200 165" role="img" aria-label={story.visual === "neutral" ? (language === "ru" ? "Фазоры напряжений и смещение нейтрали" : "Фазори напруг і зміщення нейтралі") : (language === "ru" ? "Фазоры токов RMS" : "Фазори струмів RMS")}><Phasors kind={story.visual} parameters={parameters} language={language} /></svg>}
      <div className={dynamic ? "lab-controls" : "lab-controls-static"}>
        {dynamic && story.visual === "dc" && <>{slider(copy.source, parameters.dc.e, 12, 48, 1, e => change({ ...parameters, dc: { ...parameters.dc, e } }))}{slider(copy.firstResistance, parameters.dc.r1, 20, 120, 5, r1 => change({ ...parameters, dc: { ...parameters.dc, r1 } }))}</>}
        {dynamic && story.visual === "ac" && <>{slider(copy.frequency, parameters.ac.frequency, 25, 100, 1, frequency => change({ ...parameters, ac: { ...parameters.ac, frequency } }))}{slider(copy.resistance, parameters.ac.resistance, 10, 100, 1, resistance => change({ ...parameters, ac: { ...parameters.ac, resistance } }))}</>}
        {dynamic && story.visual === "rc" && <>{slider(copy.resistance, parameters.rc.resistance, 500, 2000, 100, resistance => change({ ...parameters, rc: { ...parameters.rc, resistance } }))}{slider(copy.capacitance, parameters.rc.capacitance * 1e6, 500, 2000, 100, capacitance => change({ ...parameters, rc: { ...parameters.rc, capacitance: capacitance / 1e6 } }))}</>}
      </div>
      <div className={`lab-motion-controls ${dynamic ? "" : "lab-static-controls"}`}>
        {dynamic && <><button type="button" disabled={reduced} aria-label={running && !reduced ? copy.pause : copy.play} aria-pressed={running && !reduced} onClick={() => { if (!running && time >= maximumTime) reset(); else { store.running[story.id] = !running; setRunning(!running); } }}>{running && !reduced ? "Ⅱ" : "▷"} {running && !reduced ? copy.pause : copy.play}</button><button type="button" onClick={reset}>↺ {copy.reset}</button></>}
        {story.visual === "rc" && <span data-model-time aria-live="off">{copy.realTime}: {formatNumber(language, time)} s</span>}
        {story.visual === "ac" && <span>{copy.slowed} ×{n(phase.frequency * 4)}</span>}
        {reduced && dynamic && <span>{copy.reduced}</span>}
      </div>
      <p className="lab-assumption">{assumptions[story.visual][language]}{story.visual === "dc" && ` ${copy.conventional}`}</p>
    </div>
    <div className="lab-results-panel">
      <div className="lab-panel-kicker"><span>02 / {copy.calculation}</span><span>{mesh ? "KVL" : story.visual === "rc" ? "uC(0) = 0 V" : "SI"}</span></div>
      <div className="lab-equations">
        {mesh ? <><CachedFormula>{String.raw`\begin{bmatrix}6&-2\\-2&8\end{bmatrix}\begin{bmatrix}I_1\\I_2\end{bmatrix}=\begin{bmatrix}24\\12\end{bmatrix}`}</CachedFormula><CachedFormula>{String.raw`I_1=\frac{54}{11}\,\mathrm A,\quad I_2=\frac{30}{11}\,\mathrm A`}</CachedFormula></> : <><CachedFormula>{localizeLatexNumbers(view.formula,language)}</CachedFormula><CachedFormula>{localizeLatexNumbers(view.substitution,language)}</CachedFormula></>}
      </div>
      <div className="lab-metrics">
        {(mesh ? [{ label: "I₁", value: 54 / 11, unit: "A", color: "orange" }, { label: "I₂", value: 30 / 11, unit: "A", color: "violet" }, { label: "I₃", value: 24 / 11, unit: "A", color: "green" }] : metrics).map(metric => <div key={metric.label} className={`lab-metric ${metric.color ?? ""}`}><span>{metric.label}</span><strong data-result={metric.label}>{formatNumber(language, metric.value, 3)} <small>{metric.unit}</small></strong></div>)}
      </div>
      {software ? <div className="lab-code"><span>{copy.code}</span><pre><code>{software.code}</code></pre><strong>{software.result}</strong><small>{copy.softwareNote}</small></div> : mesh ? <a className="lab-lesson-link" href={localePath(language, story.route)}>{copy.lesson} →</a> : <div className="lab-graph-panel">
        <div className="lab-panel-kicker"><span>03 / {copy.graphs}</span><span>{story.visual === "rc" ? "uC / E · i / i₀" : ""}</span></div>
        <ScenePlot plot={view.plot} kind={story.visual} parameters={parameters} time={time} language={language} />
        <div className="lab-legend">{view.plot.curves.map(curve => <span key={curve.label} style={{ color: `var(--${curve.color})` }}><i style={{ borderTopStyle: curve.dash ? "dashed" : "solid" }} />{curve.label}</span>)}</div>
      </div>}
      <div className="lab-result-footer"><a href={localePath(language, story.route)}>{copy.open} ↗</a>{bookingUrl && <a href={bookingUrl} rel="noreferrer" target="_blank">{copy.booking} ↗</a>}</div>
    </div>
  </div>;
}

export default function EngineeringShowcase({language,lessonHref,lessonLabel,bookingUrl}:{language:Language;lessonHref:string;lessonLabel:string;bookingUrl?:string}) {
 const [selectedStory,setSelectedStory]=useState<Story|undefined>();
 const sceneRegion=useRef<HTMLElement>(null),[storyMotion,setStoryMotion]=useState(false),[reduced,setReduced]=useState(true);
 const store=useRef<SceneState>({parameters:{},times:{},running:{}});
 useEffect(()=>{const sync=()=>{const id=new URLSearchParams(location.hash.slice(1)).get("micro");if(id&&/^[a-z0-9-]{1,64}$/.test(id)){void navigate(localePath(language,`/micro-labs/#micro=${id}`),{history:"replace"});return;}setSelectedStory(findStory(location.hash));};sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);},[language]);
 useEffect(()=>{if(!selectedStory||!sceneRegion.current)return;const media=matchMedia("(prefers-reduced-motion: reduce)");let visible=false;const sync=()=>{setReduced(media.matches);setStoryMotion(visible&&!document.hidden);};const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(sceneRegion.current);media.addEventListener("change",sync);document.addEventListener("visibilitychange",sync);sync();return()=>{observer.disconnect();media.removeEventListener("change",sync);document.removeEventListener("visibilitychange",sync);};},[selectedStory]);
 return <><PanoramicCarousel language={language}/>
 {selectedStory&&<section ref={sceneRegion} className="lab-showcase section" aria-label={selectedStory.title[language]}><h2 className="lab-scene-title">{selectedStory.title[language]}</h2><LiveScene key={selectedStory.id} story={selectedStory} language={language} store={store.current} motion={storyMotion} reduced={reduced} bookingUrl={bookingUrl}/></section>}
 <section className="section home-laboratories" aria-labelledby="home-laboratories-heading"><div className="lab-section-title"><h2 id="home-laboratories-heading">{language==="ru"?"Лаборатории":"Лабораторії"}</h2><a href={localePath(language,"/interactive/")}>{language==="ru"?"Весь каталог":"Увесь каталог"} ↗</a></div><LaboratoryCatalog language={language} limit={8} compact/></section>
 <section className="section home-textbook" aria-labelledby="home-textbook-heading"><div><h2 id="home-textbook-heading">{language==="ru"?"Учебник":"Підручник"}</h2><p>{language==="ru"?"Метод контурных токов: схема, расчёт, проверка ответа.":"Метод контурних струмів: схема, розрахунок, перевірка відповіді."}</p></div><a className="button primary" href={lessonHref}>{lessonLabel} ↗</a></section></>;
}
