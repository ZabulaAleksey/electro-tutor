import { type CSSProperties, memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import { localePath } from "../site-path";
import ToolCard from "../components/ToolCard";
import Formula from "../components/Formula";
import { microLabs } from "./catalog";
import { microCopy, microGroups, type LiveParameterSpec, type MicroGroup, type MicroLab } from "./micro-catalog";
import { microModel } from "./micro-models";
import { formatEngineeringNumber, localizeLatexNumbers } from "../engineering/format";
import BodeView from "../engineering/BodeView";
import { CircuitView, LivePlot } from "./MicroVisual";
import "./micro-labs.css";
const CachedFormula = memo(Formula);
type CardState = { a: number; b: number; time: number };
const initial = (lab: MicroLab): CardState => ({ a: lab.parameters[0].initial, b: lab.parameters[1].initial, time: 1 });

export function LiveParameter({ spec, value, language, onChange }: { spec: LiveParameterSpec; value: number; language: Language; onChange: (value: number) => void }) {
  const label = `${spec.symbol}, ${spec.unit}`;
  return <label className="micro-parameter"><span>{label}<span className="micro-value">{formatNumber(language, value, 3)}</span></span><input style={{"--fill":`${(value-spec.min)/(spec.max-spec.min)*100}%`} as CSSProperties} type="range" aria-label={label} min={spec.min} max={spec.max} step={spec.step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}
export function TimeController({ time, max, language, onChange }: { time: number; max: number; language: Language; onChange: (value: number) => void }) {
  return <label className="micro-time"><span>{microCopy[language].time}<span className="micro-value" data-micro-time>{formatNumber(language, time, 3)}</span></span><input style={{"--fill":`${time/max*100}%`} as CSSProperties} aria-label={microCopy[language].time} type="range" min={0} max={max} step={max / 100} value={time} onChange={event => onChange(Number(event.target.value))} /></label>;
}
const MicroLabCard = memo(function MicroLabCard({ lab, state, language, selected, update }: { lab: MicroLab; state: CardState; language: Language; selected: boolean; update: (id: string, state: CardState) => void }) {
  const [expanded, setExpanded] = useState(false), [paper,setPaper] = useState(false);
  const copy = microCopy[language], view = useMemo(() => microModel(lab.model, state.a, state.b, state.time), [lab.model, state.a, state.b, state.time]);
  function parameter(key: "a" | "b", value: number) {
    const next = { ...state, [key]: value }, nextModel = microModel(lab.model, next.a, next.b, next.time);
    update(lab.id, { ...next, time: nextModel.timeMax === undefined ? next.time : nextModel.time });
  }
  return <article className="micro-card tool-card" id={`micro-${lab.id}`} data-expanded={expanded ? "true" : "false"} data-micro={lab.id} data-micro-model={lab.model} data-selected={selected ? "true" : "false"} aria-labelledby={`micro-title-${lab.id}`}>
    <header><span className="micro-badge">{String(microLabs.indexOf(lab) + 1).padStart(2,"0")}</span><span>{microGroups[lab.category][language]}</span><a href={`#micro=${lab.id}`} aria-label={`${copy.link}: ${lab.title[language]}`}>↗</a></header>
    <h3 id={`micro-title-${lab.id}`}>{lab.title[language]}</h3>
    <div className="micro-visual-pair"><CircuitView lab={lab} a={state.a} b={state.b} language={language} /><LivePlot view={view} language={language} paper={paper} /></div>
    <div className="micro-console"><div className="micro-parameters">{lab.parameters.map((spec, k) => <LiveParameter key={spec.symbol} spec={spec} value={k === 0 ? state.a : state.b} language={language} onChange={value => parameter(k === 0 ? "a" : "b", value)} />)}</div>
    <div className="micro-results" aria-live="off">{view.metrics.map(m => <span key={m.label} data-micro-result={m.label}><span>{m.label}</span><strong>{formatEngineeringNumber(m.value,language,{maximumFractionDigits:3})} <small>{m.unit}</small></strong></span>)}</div></div>
    {view.timeMax !== undefined && <TimeController time={view.time} max={view.timeMax} language={language} onChange={time => update(lab.id, { ...state, time })} />}
    <div className="micro-formula"><CachedFormula>{localizeLatexNumbers(view.formula,language)}</CachedFormula></div>
    <details className="micro-assumption"><summary>{copy.reference}</summary><p>{lab.assumption[language]}</p></details>
    <footer><button type="button" onClick={() => update(lab.id, initial(lab))}>{copy.reset} ↺</button><button type="button" className="micro-explore" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded ? (language==="ru"?"Свернуть":"Згорнути") : (language==="ru"?"Исследовать":"Дослідити")} {expanded ? "↑" : "→"}</button></footer>
    {expanded && <button type="button" className="engineering-grid-toggle" aria-pressed={paper} onClick={()=>setPaper(v=>!v)}>{language==="ru"?"Миллиметровая сетка · экранный режим":"Міліметрова сітка · екранний режим"}</button>}
    {expanded && lab.model === "filter" && <BodeView tau={state.b/1000} language={language} />}
    {expanded && lab.route && <a className="micro-material" href={localePath(language,lab.route)}>{copy.material} ↗</a>}
  </article>;
});

const homeLabIds = ["ohm-law", "rlc-resonance", "capacitor-charge", "three-phase-star", "diode-operating-point", "first-order-step"];

function HomeMicroLabCard({ lab, language }: { lab: MicroLab; language: Language }) {
  const state = initial(lab);
  const view = useMemo(() => microModel(lab.model, state.a, state.b, state.time), [lab.model, state.a, state.b, state.time]);
  return <ToolCard title={lab.title[language]} category={microGroups[lab.category][language]} href={localePath(language,`/micro-labs/#micro=${lab.id}`)} action={language==="ru"?"Открыть эксперимент":"Відкрити експеримент"} className="micro-card micro-preview-card" id={lab.id}><div className="micro-visual-pair"><CircuitView lab={lab} a={state.a} b={state.b} language={language}/><LivePlot view={view} language={language}/></div></ToolCard>;
}

function randomHomeLabs(previous: string | null): string[] {
  const pool = [...microLabs];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const picked = pool.slice(0, 6).map(lab => lab.id);
  if (previous && picked.join(",") === previous) picked[5] = pool[6].id;
  return picked;
}

export default memo(function MicroLabs({ language, home = false, focusSelected=false }: { language: Language; home?: boolean; focusSelected?: boolean }) {
  const [homeSelection, setHomeSelection] = useState(homeLabIds);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    if (!home) return;
    let previous: string | null = null;
    try { previous = sessionStorage.getItem("electrotutor-home-microlabs"); } catch { /* Storage is optional for a home selection. */ }
    const next = randomHomeLabs(previous);
    setHomeSelection(next);
    try { sessionStorage.setItem("electrotutor-home-microlabs", next.join(",")); } catch { /* Storage is optional for a home selection. */ }
  }, [home]);
  const copy = microCopy[language], [category, setCategory] = useState<MicroGroup | "all">("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(14), [selected, setSelected] = useState("");
  const [states, setStates] = useState<Record<string, CardState>>(() => Object.fromEntries(microLabs.map(lab => [lab.id, initial(lab)])));
  const update = useCallback((id: string, state: CardState) => setStates(previous => ({ ...previous, [id]: state })), []);
  const order = ["ohm-law","voltage-divider","rlc-resonance","capacitor-charge","three-phase-star","diode-operating-point","dc-motor-start","first-order-step"];
  const visible = microLabs.filter(lab => (category === "all" || lab.category === category) && `${lab.title[language]} ${lab.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):99)-(order.includes(b.id)?order.indexOf(b.id):99));
  useEffect(() => {
    let frame = 0;
    function fromHash() {
      const id = new URLSearchParams(location.hash.slice(1)).get("micro");
      if (!id || !microLabs.some(lab => lab.id === id)) {setSelected("");return;}
      setSelected(id); setCategory("all"); setQuery(""); setLimit(Math.max(14, microLabs.findIndex(lab => lab.id === id) + 1));
      const link = document.querySelector<HTMLAnchorElement>("a[data-language-link]");
      if (link) link.href = `${localePath(language === "ru" ? "uk" : "ru",focusSelected?"/micro-labs/":"/")}#micro=${id}`;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => document.getElementById(`micro-${id}`)?.scrollIntoView({ block: "center" }));
    }
    fromHash(); window.addEventListener("hashchange", fromHash);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", fromHash); };
  }, [language,focusSelected]);
  if (home) {
    const selectedLabs = homeSelection.map(id => microLabs.find(lab => lab.id === id)).filter((lab): lab is MicroLab => Boolean(lab));
    return <section className="micro-labs section micro-labs-home" data-home-ready={ready} aria-busy={!ready} id="micro-labs" aria-labelledby="micro-heading"><div className="micro-heading"><div><span className="section-kicker">01 / MICRO LABS</span><h2 id="micro-heading">{language === "ru" ? "Мини-эксперименты" : "Мініексперименти"}</h2><p>{language === "ru" ? "Выберите модель и сразу перейдите к рабочему инструменту." : "Оберіть модель і одразу перейдіть до робочого інструмента."}</p></div><a className="micro-home-all" href={localePath(language, "/micro-labs/")}>{language === "ru" ? "Все Micro Labs" : "Усі Micro Labs"} ↗</a></div><div className="micro-grid" style={{visibility:ready?"visible":"hidden"}}>{selectedLabs.map(lab => <HomeMicroLabCard key={lab.id} lab={lab} language={language} />)}</div></section>;
  }
  const groups: (MicroGroup | "all")[] = ["all", ...Object.keys(microGroups) as MicroGroup[]];
  return <fieldset disabled={!ready} aria-hidden={!ready} className="lab-hydration-guard"><section className="micro-labs section" id="micro-labs" aria-labelledby="micro-heading">
    <div className="micro-heading"><div><span className="section-kicker">01 / INTERACTIVE MODELS</span><h2 id="micro-heading">{language === "ru" ? "Микролаборатории" : "Мікролабораторії"}</h2><p>{copy.intro}</p></div><span>{visible.length} / {microLabs.length}</span></div>
    {focusSelected&&selected&&<a href="#" className="button">{language==="ru"?"Все MicroLabs":"Усі MicroLabs"} ←</a>}<div className="micro-toolbar" hidden={focusSelected&&!!selected}><label className="micro-search">{copy.search}<input type="text" placeholder={copy.search} value={query} onChange={event => { setQuery(event.target.value); setLimit(14); }} /></label><div className="micro-categories" role="tablist" aria-label="Micro Labs">{groups.map(group => <button type="button" role="tab" aria-selected={category === group} tabIndex={category === group ? 0 : -1} key={group} onClick={() => { setCategory(group); setLimit(14); }} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const index = groups.indexOf(group), next = event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + groups.length) % groups.length; setCategory(groups[next]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus(); }}>{group === "all" ? copy.all : microGroups[group][language]}</button>)}</div></div>
    <div className="micro-grid">{(focusSelected&&selected?visible.filter(lab=>lab.id===selected):visible.slice(0, limit)).map(lab => <MicroLabCard key={lab.id} lab={lab} state={states[lab.id]} language={language} selected={selected === lab.id} update={update} />)}</div>
    {!visible.length && <p role="status">{copy.empty}</p>}{visible.length > limit && <button type="button" className="micro-more" onClick={() => setLimit(value => value + 12)}>{copy.more}</button>}
    <aside className="micro-advanced"><div><h3>{copy.advanced}</h3><p>{copy.existing}</p></div><a className="button" href={localePath(language, "/interactive/")}>{language === "ru" ? "Открыть лаборатории" : "Відкрити лабораторії"} →</a></aside>
  </section></fieldset>;
});
