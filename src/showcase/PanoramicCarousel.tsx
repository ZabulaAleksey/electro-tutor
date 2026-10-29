import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { localePath, withBasePath } from "../site-path";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringValue,formatEngineeringNumber } from "../engineering/format";
import {dc,rc} from "./physics";
import {lineStep} from "./line-surface";
import {panoramas,panoramaPlots,type PanoramaId} from "./panorama-model";
const d=dc(),r=rc(1);
import "./panorama-carousel.css";

function PanoramaPlot({ id, language }: { id: PanoramaId; language: Language }) {
  const value = (n: number, unit: string) => formatEngineeringValue(n,unit,language,{significantDigits:3});
  const description = id === "dc" ? `E = ${value(24,"V")} · R₁ + R₂ = ${value(100,"Ω")} · I = ${value(d.i,"A")}` : id === "transient" ? `uC(0) = ${value(0,"V")} · τ = ${value(1,"s")} · uC(τ) = ${value(r.uc,"V")}` : id === "machines" ? "iA + iB + iC = 0 · Δφ = 120°" : `Z₀ = ${value(50,"Ω")} · Rн = ${value(100,"Ω")} · Γ = ${formatEngineeringNumber(lineStep(0,0).gamma,language,{significantDigits:3})}`;
  return <div className="panorama-analysis" aria-label={language === "ru" ? "Аналитический пример" : "Аналітичний приклад"}>
    <span>{language === "ru" ? "Расчётная модель" : "Розрахункова модель"}</span>
    <EngineeringPlot plot={panoramaPlots[id]} language={language} compact label={panoramas.find(p => p.id === id)!.title[language]} />
    <p>{description}</p>
    {id === "lines" && <small>{language === "ru" ? "Идеальная линия · согласованный источник" : "Ідеальна лінія · узгоджене джерело"}</small>}
  </div>;
}
export default function PanoramicCarousel({ language, interval = 8000 }: { language: Language; interval?: number }) {
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(true), [hover, setHover] = useState(false), [focus, setFocus] = useState(false);
  const [reduced, setReduced] = useState(true), [visible, setVisible] = useState(false), [hidden, setHidden] = useState(false);
  const region = useRef<HTMLElement>(null), touch = useRef<{ x: number; y: number; pointer: number } | null>(null);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(media.matches); setHidden(document.hidden); };
    sync(); media.addEventListener("change", sync); document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { threshold: .2 });
    if (region.current) observer.observe(region.current);
    return () => { observer.disconnect(); media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const automatic = playing && !hover && !focus && !reduced && visible && !hidden;
  useEffect(() => {
    if (!automatic) return;
    const timer = setTimeout(() => setIndex(i => (i + 1) % panoramas.length), Number.isFinite(interval) ? Math.max(1000, interval) : 8000);
    return () => clearTimeout(timer);
  }, [automatic, index, interval]);
  const adjacent = (k: number) => k === index || k === (index + 1) % panoramas.length || k === (index + panoramas.length - 1) % panoramas.length;
  const move = (step: number) => setIndex(i => (i + step + panoramas.length) % panoramas.length);
  const ru = language === "ru";
  return <section ref={region} className="panorama-showroom" aria-roledescription={ru ? "карусель" : "карусель"} aria-label={ru ? "Инженерная панорама" : "Інженерна панорама"} data-panorama-index={index} data-autoplay={automatic}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setFocus(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false); }}
    onPointerDown={e => { if (e.pointerType === "touch" && e.isPrimary && !(e.target as Element).closest("button,a")) touch.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId }; }}
    onPointerUp={e => { const start = touch.current; touch.current = null; if (start?.pointer !== e.pointerId) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx > 0 ? -1 : 1); }} onPointerCancel={() => { touch.current = null; }}>
    <div className="panorama-slides">
      {panoramas.map((slide, k) => <article key={slide.id} className="panorama-slide" data-active={k === index} aria-hidden={k !== index} inert={k !== index}>
        <img src={adjacent(k) ? withBasePath(`/panoramas/${slide.id}-1280.webp`) : undefined}
          srcSet={adjacent(k) ? [640, 1280, 1920].map(w => `${withBasePath(`/panoramas/${slide.id}-${w}.webp`)} ${w}w`).join(",") : undefined}
          sizes="(max-width: 680px) 100vw, 96vw" width="1916" height="821" alt="" loading={adjacent(k) ? "eager" : "lazy"} fetchPriority={k === index ? "high" : "auto"} decoding="async" />
        {k === index && <PanoramaPlot id={slide.id} language={language} />}
        <div className="panorama-caption"><span>ElectroTutor / {String(k + 1).padStart(2, "0")}</span><h1>{slide.title[language]}</h1><p>{slide.note[language]}</p><a href={localePath(language, slide.route)}>{ru ? "Открыть лабораторию" : "Відкрити лабораторію"} <span aria-hidden="true">↗</span></a></div>
        <small className="panorama-art-note">{ru ? "Художественная иллюстрация оборудования" : "Художня ілюстрація обладнання"}</small>
      </article>)}
    </div>
    <div className="panorama-controls"><div><button type="button" onClick={() => move(-1)} aria-label={ru ? "Предыдущая панорама" : "Попередня панорама"}>←</button><span aria-live="off">{String(index + 1).padStart(2, "0")} / {String(panoramas.length).padStart(2, "0")}</span><button type="button" onClick={() => move(1)} aria-label={ru ? "Следующая панорама" : "Наступна панорама"}>→</button></div><div className="panorama-dots">{panoramas.map((slide, k) => <button key={slide.id} type="button" onClick={() => setIndex(k)} aria-label={slide.title[language]} aria-pressed={index === k}><span /></button>)}</div><button type="button" disabled={reduced} aria-pressed={playing && !reduced} onClick={() => setPlaying(p => !p)}>{reduced ? (ru ? "Без автосмены" : "Без автозміни") : playing ? (ru ? "Пауза" : "Пауза") : (ru ? "Автосмена" : "Автозміна")}</button></div>
  </section>;
}
