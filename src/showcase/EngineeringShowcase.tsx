import {navigate} from "astro:transitions/client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import { localePath } from "../site-path";
import { localizeLatexNumbers } from "../engineering/format";
import Formula from "../components/Formula";
import CircuitDiagram from "../components/CircuitDiagram";
import { categories, filterStories, findStory, stories, type Story } from "./catalog";
import { assumptions, categoryNames, formatDetails, formats, showcaseCopy, softwareExamples, steps } from "./copy";
import { INITIAL, ac, model, n, rc, type Parameters } from "./physics";
import { CircuitVisual, Phasors, ScenePlot } from "./SceneVisual";
import "./showcase.css";
import ToolCard,{ToolArt} from "../components/ToolCard";
import MicroLabs from "./MicroLabs";
import LineSurface, { type SurfaceState } from "./LineSurface";

import "./panoramic.css";
import { publicSurface } from "../public-surface";
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

const panoramaScenes = [
  { visual: "dc" as const, title: { ru: "Постоянный ток", uk: "Постійний струм" }, formula: "I = U / R", link: "/micro-labs/#micro=ohm-law" },
  { visual: "ac" as const, title: { ru: "Переменный ток", uk: "Змінний струм" }, formula: "Z = R + jX", link: "/micro-labs/#micro=rlc-resonance" },
  { visual: "rc" as const, title: { ru: "Переходный процесс", uk: "Перехідний процес" }, formula: "uC(t) = E(1 − e⁻ᵗ⧸ᵗᵃᵘ)", link: "/micro-labs/#micro=capacitor-charge" },
];

function IllustrativePanorama({ language }: { language: Language }) {
  return <div className="panorama-grid" aria-label={language === "ru" ? "Инженерные сюжеты" : "Інженерні сюжети"}>
    {panoramaScenes.map(scene => <a className="panorama-card tool-card" key={scene.visual} href={localePath(language, scene.link)}>
      <span className="section-kicker">{language === "ru" ? "МОДЕЛЬ" : "МОДЕЛЬ"}</span>
      <h2>{scene.title[language]}</h2>
      <CircuitVisual kind={scene.visual} parameters={INITIAL} time={0} mini language={language} />
      <strong className="panorama-formula">{scene.formula}</strong>
      <span className="tool-card-action">{language === "ru" ? "Открыть Micro Lab" : "Відкрити Micro Lab"} →</span>
    </a>)}
  </div>;
}

export default function EngineeringShowcase({ language, lessonHref, lessonLabel, bookingUrl }: { language: Language; lessonHref: string; lessonLabel: string; bookingUrl?: string }) {
  const copy = showcaseCopy[language];
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(12);
  const [selectedStory,setSelectedStory]=useState<Story|undefined>();
  const sceneRegion=useRef<HTMLElement>(null),[storyMotion,setStoryMotion]=useState(false),[reduced,setReduced]=useState(true);
  const store=useRef<SceneState>({parameters:{},times:{},running:{}});
  useEffect(()=>{const sync=()=>{const id=new URLSearchParams(location.hash.slice(1)).get("micro");if(id&&/^[a-z0-9-]{1,64}$/.test(id)){void navigate(localePath(language,`/micro-labs/#micro=${id}`),{history:"replace"});return;}setSelectedStory(findStory(location.hash));};sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);},[language]);
  useEffect(()=>{if(!selectedStory||!sceneRegion.current)return;const media=matchMedia("(prefers-reduced-motion: reduce)");let visible=false;const sync=()=>{setReduced(media.matches);setStoryMotion(visible&&!document.hidden);};const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(sceneRegion.current);media.addEventListener("change",sync);document.addEventListener("visibilitychange",sync);sync();return()=>{observer.disconnect();media.removeEventListener("change",sync);document.removeEventListener("visibilitychange",sync);};},[selectedStory]);
  const matches = filterStories(category, query, language);
  const status = (story: Story) => copy[story.visual === "line" ? "dynamic" : story.interaction === "dynamic" ? "dynamic" : story.interaction === "static" ? "static" : story.interaction === "lesson" ? "lesson" : "illustration"];
  return <>
    <section className="hero lab-showcase panorama-hero" aria-labelledby="lab-heading">
      <div className="lab-heading"><div><span className="section-kicker">ELECTROTUTOR / ENGINEERING VISUALS</span><h1 id="lab-heading">{language === "ru" ? "Электротехника и модели" : "Електротехніка та моделі"}</h1></div><a href="#micro-labs">Micro Labs ↓</a></div>
      <p className="panorama-lead">{language === "ru" ? "Выберите эксперимент." : "Оберіть експеримент."}</p>
      <IllustrativePanorama language={language} />
      <div className="lab-home-links"><a className="button primary" href={lessonHref}>{lessonLabel} <span>→</span></a><a href={localePath(language, "/interactive/")}>{language === "ru" ? "Все лаборатории" : "Усі лабораторії"} ↗</a></div>
    </section>
    {selectedStory&&<section ref={sceneRegion} className="lab-showcase section" aria-label={selectedStory.title[language]}><h2 className="lab-scene-title">{selectedStory.title[language]}</h2><LiveScene story={selectedStory} language={language} store={store.current} motion={storyMotion} reduced={reduced}/></section>}
    <MicroLabs language={language} home />

    <section className="advanced-labs section" id="advanced-labs" aria-labelledby="advanced-heading"><div className="lab-section-title"><div><span className="section-kicker">02 / ADVANCED LABS</span><h2 id="advanced-heading">{language === "ru" ? "Лаборатории" : "Лабораторії"}</h2></div><a href={localePath(language,"/interactive/")}>{language === "ru" ? "Все лаборатории" : "Усі лабораторії"} ↗</a></div><div className="advanced-grid">{[
      {visual:"ac" as const,title:language==="ru"?"Круговая диаграмма":"Кругова діаграма",route:"/interactive/circular-diagram/",note:language==="ru"?"Комплексная плоскость · параметры цепи":"Комплексна площина · параметри кола"},
      {visual:"neutral" as const,title:language==="ru"?"Трёхфазная звезда":"Трифазна зірка",route:"/interactive/star-neutral/",note:language==="ru"?"Три режима нейтрали · фазоры":"Три режими нейтралі · фазори"},
      {visual:"line" as const,title:language==="ru"?"Длинная линия":"Довга лінія",route:"/interactive/transmission-line/",note:language==="ru"?"Переходный процесс · эпюры U / I":"Перехідний процес · епюри U / I"}
    ].map(item=><a className="advanced-card tool-card" href={localePath(language,item.route)} key={item.route}><span className="advanced-live">● {language==="ru"?"Рабочая лаборатория":"Робоча лабораторія"}</span><CircuitVisual kind={item.visual} parameters={INITIAL} mini language={language}/><h3>{item.title} ↗</h3><p>{item.note}</p></a>)}<a className="advanced-card tool-card" href={localePath(language,"/interactive/fourier/")}><span className="advanced-live">● {language==="ru"?"Рабочая лаборатория":"Робоча лабораторія"}</span><svg viewBox="0 0 400 185" aria-hidden="true" className="fourier-entry-art"><g fill="none" stroke="var(--grid-major)"><circle cx="150" cy="95" r="65"/><circle cx="215" cy="95" r="27"/></g><path d="M150 95H215L233 75" fill="none" stroke="var(--blue)" strokeWidth="2"/><circle cx="233" cy="75" r="4" fill="var(--green)"/><text x="140" y="179" fill="var(--muted)" fontSize="13">z(t) = Σ cₖ exp(i2πkt)</text></svg><h3>{language==="ru"?"Фурье и эпициклы":"Фур’є та епіцикли"} ↗</h3><p>{language==="ru"?"Контур · спектр · гармоники · базисы":"Контур · спектр · гармоніки · базиси"}</p></a></div></section>
    <section className="section" id="engineering-board"><h2>{language==="ru"?"Рабочие области":"Робочі області"}</h2><div className="catalog-card-grid"><ToolCard category={language==="ru"?"Расчёт":"Розрахунок"} title={language==="ru"?"Инженерная доска":"Інженерна дошка"} href={localePath(language,"/engineering-board/")} action={language==="ru"?"Открыть расчёт":"Відкрити розрахунок"}><ToolArt kind="circuit"/></ToolCard><ToolCard category={language==="ru"?"Рисование":"Малювання"} title={language==="ru"?"Интерактивная доска":"Інтерактивна дошка"} href={localePath(language,"/board/")} action={language==="ru"?"Открыть доску":"Відкрити дошку"}><ToolArt kind="science"/></ToolCard></div></section>

    <section id="engineering-software" className="lab-software section" aria-labelledby="software-heading"><div className="lab-section-title"><h2 id="software-heading">{copy.software}</h2><span>{copy.illustration}</span></div><p className="lab-assumption">{copy.softwareNote}</p><div className="lab-software-grid">{softwareExamples.map(example => <article key={example.name}><div className="lab-code"><span>{example.name}</span><pre><code>{example.code}</code></pre><strong>{example.result}</strong></div>{example.name.startsWith("NumPy") ? <CachedFormula>{String.raw`\mathbf R=\begin{bmatrix}6&-2\\-2&8\end{bmatrix}`}</CachedFormula> : <ScenePlot plot={model(example.kind, INITIAL).plot} kind={example.kind} parameters={INITIAL} time={1} language={language} />}</article>)}</div><p className="lab-software-index">{copy.softwareTools}: MATLAB / Simulink · Multisim / Electronics Workbench · Micro-CAP · Proteus · Qucs · TINA-TI · EasyEDA · OrCAD · VisSim · ASIMEC · Excel · Pandas / Matplotlib · Visio · КОМПАС-3D · VS Code · Git / GitHub</p></section>
    {publicSurface.showCommercial && <section id="learning-sessions" className="lab-sessions section" aria-labelledby="sessions-heading"><h2 id="sessions-heading">{copy.sessions}</h2><ol>{steps.map((step, k) => <li key={step.ru}><span>{String(k + 1).padStart(2, "0")}</span><svg viewBox="0 0 100 55" aria-hidden="true"><path d={k === 0 ? "M20 10 H80 V45 H20Z M30 22 H60 M30 33 H70" : k === 1 ? "M10 28 H30 V18 H60 V38 H30 V28 M60 28 H90" : k === 2 ? "M15 10 H85 M15 27 H65 M15 44 H85" : k === 3 ? "M15 10 V44 H85 M18 38 Q40 45 50 25 T85 15" : "M20 28 L40 45 L82 10"} fill="none" stroke="currentColor" strokeWidth="2.5" /></svg><strong>{step[language]}</strong></li>)}</ol></section>}
    {publicSurface.showCommercial && <section className="lab-formats section" aria-labelledby="formats-heading"><h2 id="formats-heading">{copy.formats}</h2><div className="lab-format-grid">{formats.map((format, k) => <article key={format.ru}><span>0{k + 1}</span><h3>{format[language]}</h3><p>{formatDetails[k][language]}</p></article>)}</div>{bookingUrl ? <a className="button primary" href={bookingUrl} target="_blank" rel="noreferrer">{copy.booking} ↗</a> : <p className="lab-unavailable">{copy.unavailable}</p>}<small>{copy.noPrice}</small></section>}
    <section className="lab-gallery section" id="engineering-gallery" aria-labelledby="gallery-heading"><div className="lab-section-title"><h2 id="gallery-heading">{copy.gallery}</h2><span>{matches.length} / {stories.length}</span></div><div className="lab-gallery-tools"><label><span>{copy.search}</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="RC, Python, RLC…" /></label><div className="lab-categories"><button type="button" aria-pressed={category === "all"} onClick={() => { setCategory("all"); setLimit(12); }}>{copy.all}</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(12); }}>{categoryNames[item][language]}</button>)}</div></div><div className="lab-gallery-grid">{matches.slice(0, limit).map(story => <a key={story.id} className="lab-story-card" href={localePath(language,story.template==="lesson"?story.route:`/#story=${story.id}`)}><CircuitVisual kind={story.visual} parameters={INITIAL} mini language={language} /><span>{status(story)}</span><h3>{story.title[language]}</h3><small>{categoryNames[story.category][language]} ↗</small></a>)}</div>{!matches.length && <p role="status">{copy.empty}</p>}{matches.length > limit && <button type="button" onClick={() => setLimit(value => value + 12)}>{copy.more}</button>}</section>
  </>;
}
