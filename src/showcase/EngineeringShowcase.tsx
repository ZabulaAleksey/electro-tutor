import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import { localePath } from "../site-path";
import { localizeLatexNumbers } from "../engineering/format";
import Formula from "../components/Formula";
import CircuitDiagram from "../components/CircuitDiagram";
import { categories, featured, filterStories, findStory, stories, type Story } from "./catalog";
import { assumptions, categoryNames, formatDetails, formats, showcaseCopy, softwareExamples, steps } from "./copy";
import { INITIAL, ac, model, n, rc, type Parameters } from "./physics";
import { CircuitVisual, Phasors, ScenePlot } from "./SceneVisual";
import "./showcase.css";
import ScienceMicroLabs from "../components/ScienceMicroLabs";
import MicroLabs from "./MicroLabs";
import LineSurface, { type SurfaceState } from "./LineSurface";
import EngineeringBoard from "./EngineeringBoard";
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

export default function EngineeringShowcase({ language, lessonHref, lessonLabel, bookingUrl }: { language: Language; lessonHref: string; lessonLabel: string; bookingUrl?: string }) {
  const copy = showcaseCopy[language];
  const [selected, setSelected] = useState(featured[0].id), [auto, setAuto] = useState(true), [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false), [foreground, setForeground] = useState(true), [hover, setHover] = useState(false), [focused, setFocused] = useState(false);
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(12);
  const panel = useRef<HTMLDivElement>(null), swipe = useRef<{ x: number; y: number } | null>(null);
  const store = useRef<SceneState>({ parameters: {}, times: {}, running: {} });
  const selectedStory = stories.find(story => story.id === selected) ?? featured[0];
  const matches = filterStories(category, query, language);
  const index = featured.findIndex(story => story.id === selected);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches), visibility = () => setForeground(!document.hidden);
    update(); visibility();
    preference.addEventListener("change", update); document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { threshold: 0.12 });
    if (panel.current) observer.observe(panel.current);
    function fromHash() { const story = findStory(location.hash); if (story) { setSelected(story.id); setAuto(false); } }
    fromHash(); window.addEventListener("hashchange", fromHash);
    return () => { observer.disconnect(); preference.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("hashchange", fromHash); };
  }, []);
  useEffect(() => {
    if (!auto || reduced || !visible || !foreground || hover || focused) return;
    const timer = setInterval(() => setSelected(previous => featured[(featured.findIndex(story => story.id === previous) + 1) % featured.length].id), 9000);
    return () => clearInterval(timer);
  }, [auto, reduced, visible, foreground, hover, focused]);
  useEffect(() => {
    const link = document.querySelector<HTMLAnchorElement>("a[data-language-link]");
    if (!link || !location.hash.startsWith("#story=")) return;
    const original = link.getAttribute("href") ?? "";
    const url = new URL(original, location.href); url.hash = `story=${selected}`;
    link.href = url.href;
    return () => { link.setAttribute("href", original); };
  }, [selected, auto]);
  function choose(id: string) {
    setSelected(id); setAuto(false);
    history.replaceState(history.state, "", `${location.pathname}${location.search}#story=${encodeURIComponent(id)}`);
  }
  function move(direction: number) { choose(featured[(Math.max(index, 0) + direction + featured.length) % featured.length].id); }
  const status = (story: Story) => copy[story.visual === "line" ? "dynamic" : story.interaction === "dynamic" ? "dynamic" : story.interaction === "static" ? "static" : story.interaction === "lesson" ? "lesson" : "illustration"];
  return <>
    <section className="hero lab-showcase" aria-labelledby="lab-heading">
      <header className="lab-heading"><div><span className="section-kicker">ELECTROTUTOR / ENGINEERING IN MOTION</span><h1 id="lab-heading">{language === "ru" ? "Электротехника в действии" : "Електротехніка в дії"}</h1></div><a href="#micro-labs">Micro Labs ↓</a></header>
      <div className="lab-scene-title"><div><span className={`lab-status ${selectedStory.interaction}`}>{status(selectedStory)}</span><h2 id="lab-story-title" aria-live={auto ? "off" : "polite"}>{selectedStory.title[language]}</h2></div><div className="lab-carousel-controls"><span data-slide-index>{index >= 0 ? `${String(index + 1).padStart(2, "0")} / 08` : "↗"}</span><button type="button" aria-label={copy.previous} onClick={() => move(-1)}>←</button><button type="button" aria-label={copy.next} onClick={() => move(1)}>→</button><button type="button" data-autoplay aria-label={auto && !reduced ? copy.stop : copy.resume} aria-pressed={auto && !reduced} disabled={reduced} onClick={() => setAuto(value => !value)}>{auto && !reduced ? "Ⅱ" : "▷"} <span>{copy.autoplay}</span></button></div></div>
      <div ref={panel} className="lab-scene-frame" role="region" aria-roledescription="carousel" aria-labelledby="lab-story-title" tabIndex={0}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onInputCapture={() => setAuto(false)}
        onPointerDown={event => { setAuto(false); if (!(event.target as Element).closest("input,button,a")) swipe.current = { x: event.clientX, y: event.clientY }; }}
        onPointerCancel={() => { swipe.current = null; }}
        onPointerUp={event => { const start = swipe.current; swipe.current = null; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); }}
        onKeyDown={event => { if ((event.target as Element).closest("input,select,textarea,button,a")) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}>
        <LiveScene key={selectedStory.id} story={selectedStory} language={language} store={store.current} motion={visible && foreground} reduced={reduced} />
      </div>
      <div className="lab-thumbnails" aria-label={copy.select}>{featured.map((story, k) => <button key={story.id} type="button" aria-label={`${copy.select}: ${story.title[language]}`} aria-pressed={story.id === selected} onClick={() => choose(story.id)}><span className="lab-thumb-number">{String(k + 1).padStart(2, "0")}</span><svg viewBox="0 0 100 35" aria-hidden="true"><path d={story.visual === "dc" ? "M5 28 H20 V8 H40 V28 H62 V8 H92" : story.visual === "rc" ? "M5 30 C25 10 40 5 95 5" : story.visual === "ac" || story.visual === "three" ? "M5 18 Q16 -8 28 18 T51 18 T74 18 T97 18" : story.visual === "magnet" ? "M25 5 H75 V30 H25Z M36 12 V23 H64 V12Z" : "M5 28 L24 9 L42 26 L67 6 L95 17"} fill="none" stroke="currentColor" strokeWidth="2" /></svg><strong>{story.title[language]}</strong></button>)}</div>
      <div className="lab-home-links"><a className="button primary" href={lessonHref}>{lessonLabel} <span>→</span></a><a href={`#story=${selectedStory.id}`} aria-label={copy.linkCopied}>{copy.linkCopied} ↗</a><span>{reduced ? copy.reduced : "9 s / " + copy.autoplay}</span></div>
    </section>
    <MicroLabs language={language} />
    <section className="science-home section" id="science-labs"><div className="lab-section-title"><h2>{language==="ru"?"Научные Micro Labs":"Наукові Micro Labs"}</h2><a href={localePath(language,"/micro-labs/")}>{language==="ru"?"Все 12 экспериментов":"Усі 12 експериментів"} ↗</a></div><ScienceMicroLabs language={language} featured/></section>
    <section className="advanced-labs section" id="advanced-labs" aria-labelledby="advanced-heading"><div className="lab-section-title"><div><span className="section-kicker">02 / ADVANCED LABS</span><h2 id="advanced-heading">{language === "ru" ? "От эксперимента к исследованию" : "Від експерименту до дослідження"}</h2></div><a href={localePath(language,"/interactive/")}>{language === "ru" ? "Все лаборатории" : "Усі лабораторії"} ↗</a></div><div className="advanced-grid">{[
      {visual:"ac" as const,title:language==="ru"?"Круговая диаграмма":"Кругова діаграма",route:"/interactive/circular-diagram/",note:language==="ru"?"Комплексная плоскость · параметры цепи":"Комплексна площина · параметри кола"},
      {visual:"neutral" as const,title:language==="ru"?"Трёхфазная звезда":"Трифазна зірка",route:"/interactive/star-neutral/",note:language==="ru"?"Три режима нейтрали · фазоры":"Три режими нейтралі · фазори"},
      {visual:"line" as const,title:language==="ru"?"Длинная линия":"Довга лінія",route:"/interactive/transmission-line/",note:language==="ru"?"Переходный процесс · эпюры U / I":"Перехідний процес · епюри U / I"}
    ].map(item=><a className="advanced-card" href={localePath(language,item.route)} key={item.route}><span className="advanced-live">● {language==="ru"?"Рабочая лаборатория":"Робоча лабораторія"}</span><CircuitVisual kind={item.visual} parameters={INITIAL} mini language={language}/><h3>{item.title} ↗</h3><p>{item.note}</p></a>)}<a className="advanced-card" href={localePath(language,"/interactive/fourier/")}><span className="advanced-live">● {language==="ru"?"Рабочая лаборатория":"Робоча лабораторія"}</span><svg viewBox="0 0 400 185" aria-hidden="true" className="fourier-entry-art"><g fill="none" stroke="var(--grid-major)"><circle cx="150" cy="95" r="65"/><circle cx="215" cy="95" r="27"/></g><path d="M150 95H215L233 75" fill="none" stroke="var(--blue)" strokeWidth="2"/><circle cx="233" cy="75" r="4" fill="var(--green)"/><text x="140" y="179" fill="var(--muted)" fontSize="13">z(t) = Σ cₖ exp(i2πkt)</text></svg><h3>{language==="ru"?"Фурье и эпициклы":"Фур’є та епіцикли"} ↗</h3><p>{language==="ru"?"Контур · спектр · гармоники · базисы":"Контур · спектр · гармоніки · базиси"}</p></a></div></section>
    <EngineeringBoard language={language} />

    <section id="engineering-software" className="lab-software section" aria-labelledby="software-heading"><div className="lab-section-title"><h2 id="software-heading">{copy.software}</h2><span>{copy.illustration}</span></div><p className="lab-assumption">{copy.softwareNote}</p><div className="lab-software-grid">{softwareExamples.map(example => <article key={example.name}><div className="lab-code"><span>{example.name}</span><pre><code>{example.code}</code></pre><strong>{example.result}</strong></div>{example.name.startsWith("NumPy") ? <CachedFormula>{String.raw`\mathbf R=\begin{bmatrix}6&-2\\-2&8\end{bmatrix}`}</CachedFormula> : <ScenePlot plot={model(example.kind, INITIAL).plot} kind={example.kind} parameters={INITIAL} time={1} language={language} />}</article>)}</div><p className="lab-software-index">{copy.softwareTools}: MATLAB / Simulink · Multisim / Electronics Workbench · Micro-CAP · Proteus · Qucs · TINA-TI · EasyEDA · OrCAD · VisSim · ASIMEC · Excel · Pandas / Matplotlib · Visio · КОМПАС-3D · VS Code · Git / GitHub</p></section>
    <section id="learning-sessions" className="lab-sessions section" aria-labelledby="sessions-heading"><h2 id="sessions-heading">{copy.sessions}</h2><ol>{steps.map((step, k) => <li key={step.ru}><span>{String(k + 1).padStart(2, "0")}</span><svg viewBox="0 0 100 55" aria-hidden="true"><path d={k === 0 ? "M20 10 H80 V45 H20Z M30 22 H60 M30 33 H70" : k === 1 ? "M10 28 H30 V18 H60 V38 H30 V28 M60 28 H90" : k === 2 ? "M15 10 H85 M15 27 H65 M15 44 H85" : k === 3 ? "M15 10 V44 H85 M18 38 Q40 45 50 25 T85 15" : "M20 28 L40 45 L82 10"} fill="none" stroke="currentColor" strokeWidth="2.5" /></svg><strong>{step[language]}</strong></li>)}</ol></section>
    <section className="lab-formats section" aria-labelledby="formats-heading"><h2 id="formats-heading">{copy.formats}</h2><div className="lab-format-grid">{formats.map((format, k) => <article key={format.ru}><span>0{k + 1}</span><h3>{format[language]}</h3><p>{formatDetails[k][language]}</p></article>)}</div>{bookingUrl ? <a className="button primary" href={bookingUrl} target="_blank" rel="noreferrer">{copy.booking} ↗</a> : <p className="lab-unavailable">{copy.unavailable}</p>}<small>{copy.noPrice}</small></section>
    <section className="lab-gallery section" id="engineering-gallery" aria-labelledby="gallery-heading"><div className="lab-section-title"><h2 id="gallery-heading">{copy.gallery}</h2><span>{matches.length} / {stories.length}</span></div><div className="lab-gallery-tools"><label><span>{copy.search}</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="RC, Python, RLC…" /></label><div className="lab-categories"><button type="button" aria-pressed={category === "all"} onClick={() => { setCategory("all"); setLimit(12); }}>{copy.all}</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(12); }}>{categoryNames[item][language]}</button>)}</div></div><div className="lab-gallery-grid">{matches.slice(0, limit).map(story => <a key={story.id} className="lab-story-card" href={`#story=${story.id}`} onClick={event => { event.preventDefault(); choose(story.id); panel.current?.scrollIntoView({ block: "start", behavior: reduced ? "instant" : "smooth" }); }}><CircuitVisual kind={story.visual} parameters={INITIAL} mini language={language} /><span>{status(story)}</span><h3>{story.title[language]}</h3><small>{categoryNames[story.category][language]} ↗</small></a>)}</div>{!matches.length && <p role="status">{copy.empty}</p>}{matches.length > limit && <button type="button" onClick={() => setLimit(value => value + 12)}>{copy.more}</button>}</section>
  </>;
}
