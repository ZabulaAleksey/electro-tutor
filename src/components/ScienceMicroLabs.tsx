import { useEffect, useMemo, useState } from "react";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringNumber } from "../engineering/format";
import { getScienceDefinition, models, scienceCatalog, type Point, type ScienceId, type ScienceResult } from "../science/models";
import Formula from "./Formula";
import "./ScienceMicroLabs.css";

type Language = "ru" | "uk";
type Values = Record<ScienceId, number[]>;

const labels = {
  ru: { all: "Все", math: "Математика", mechanics: "Механика", fluids: "Жидкости", waves: "Волны", thermo: "Термодинамика", optics: "Оптика", search: "Поиск лабораторий", reset: "Сбросить", assumptions: "Допущения", result: "Результат", tir: "ПВО", noResults: "Ничего не найдено" },
  uk: { all: "Усі", math: "Математика", mechanics: "Механіка", fluids: "Рідини", waves: "Хвилі", thermo: "Термодинаміка", optics: "Оптика", search: "Пошук лабораторій", reset: "Скинути", assumptions: "Припущення", result: "Результат", tir: "ППВ", noResults: "Нічого не знайдено" },
} as const;

const categoryKeys = ["all", "math", "mechanics", "fluids", "waves", "thermo", "optics"] as const;
const initialValues = Object.fromEntries(scienceCatalog.map((definition) => [definition.id, definition.parameters.map((parameter) => parameter.initial)])) as Values;

const fmt = (value: number, language: Language, digits = 3) => formatEngineeringNumber(value, language, { significantDigits: 5, maximumFractionDigits: digits });
const finite = (value: number) => Number.isFinite(value);

function plotFor(id: ScienceId, result: ScienceResult, language: Language) {
  const plotPoints = result.points.filter((point) => finite(point.x) && finite(point.y)).map((point) => [point.x, point.y] as const);
  if (!plotPoints.length) return null;
  // Domains cover the declared parameter ranges, so a slider changes the curve rather than the coordinate frame.
  const fixedDomains: Partial<Record<ScienceId, { x: readonly [number, number]; y: readonly [number, number] }>> = {
    "derivative-tangent": { x: [-3, 3], y: [-1, 10] }, "definite-integral": { x: [0, 4], y: [0, 20] }, projectile: { x: [0, 170], y: [0, 85] }, pendulum: { x: [0, 7], y: [-0.25, 0.25] },
    bernoulli: { x: [0, 2], y: [0, 30] }, "pipe-loss": { x: [0, 50], y: [-18_000_000, 0] },
    "standing-wave": { x: [0, 1], y: [-1.1, 1.1] }, beats: { x: [0, 2], y: [-2.2, 2.2] },
    "ideal-gas": { x: [0.2, 3], y: [0, 26_000] }, "mass-spring": { x: [0, 5], y: [-0.55, 0.55] },
  };
  const domain = fixedDomains[id] ?? (() => { const xs = plotPoints.map(([x]) => x); const ys = plotPoints.map(([, y]) => y); const xMin = Math.min(...xs); const xMax = Math.max(...xs); const yMin = Math.min(...ys); const yMax = Math.max(...ys); return { x: [xMin - Math.max((xMax - xMin) * 0.04, 0.01), xMax + Math.max((xMax - xMin) * 0.04, 0.01)] as const, y: [Math.min(0, yMin - Math.max((yMax - yMin) * 0.12, 0.01)), yMax + Math.max((yMax - yMin) * 0.12, 0.01)] as const }; })();
  const axes: Record<ScienceId, [string, string]> = {
    "derivative-tangent": ["x, 1", "f(x), 1"], "definite-integral": ["x, 1", "f(x), 1"], "complex-vector": ["Re, 1", "Im, 1"], projectile: ["x, м", "y, м"], pendulum: ["t, с", "θ, рад"], bernoulli: ["section, 1", "v, м/с"], "pipe-loss": ["x, м", "p−p₀, Па"], "standing-wave": ["x, м", "ξ/ξ₀, 1"], beats: ["t, с", "A_env, 1"], "ideal-gas": ["V, м³", "p, Па"], "snell-refraction": ["ray, 1", "height, 1"], "mass-spring": ["t, с", "x, м"],
  };
  const [xLabel, yLabel] = axes[id];
  const curves = [{ label: getScienceDefinition(id).title[language], color: "blue", points: plotPoints }, ...(result.secondaryPoints ? [{ label: language === "ru" ? "Касательная" : "Дотична", color: "orange", dash: true, points: result.secondaryPoints.filter((point) => finite(point.x) && finite(point.y)).map((point) => [point.x, point.y] as const) }] : [])];
  return <EngineeringPlot language={language} label={getScienceDefinition(id).title[language]} compact plot={{ xLabel, yLabel, xMin: domain.x[0], xMax: domain.x[1], yMin: domain.y[0], yMax: domain.y[1], curves }} domains={domain} characteristic={result.characteristic ? { point: [result.characteristic.x, result.characteristic.y], label: "A" } : undefined} area={id === "definite-integral" ? { points: plotPoints, baseline: 0, color: "blue" } : undefined} />;
}

function linePath(points: Point[], width: number, height: number, minX: number, maxX: number, minY: number, maxY: number) {
  const sx = (x: number) => ((x - minX) / (maxX - minX || 1)) * width;
  const sy = (y: number) => height - ((y - minY) / (maxY - minY || 1)) * height;
  return points.map((point, index) => `${index ? "L" : "M"}${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`).join(" ");
}

function MeaningfulVisual({ id, result, language }: { id: ScienceId; result: ScienceResult; language: Language }) {
  const title = getScienceDefinition(id).title[language];
  if (id === "complex-vector") {
    const scale = 50 / 5; const x = 150 + result.values.real * scale; const y = 75 - result.values.imaginary * scale;
    return <svg className="science-visual science-visual--svg" viewBox="0 0 300 150" role="img" aria-label={title}><path className="science-axis" d="M22 75H278M150 140V10" /><line className="science-vector" x1="150" y1="75" x2={x} y2={y} /><circle className="science-point" cx={x} cy={y} r="4" /><text x="166" y="25">|z|={fmt(result.values.magnitude, language)}</text><text x="166" y="42">φ={fmt(result.values.angle, language)}°</text><text x="270" y="68">Re</text><text x="156" y="18">Im</text></svg>;
  }
  if (id === "snell-refraction") {
    const p = result.points; const incident = p[0]; const refracted = p[2];
    return <svg className="science-visual science-visual--svg" viewBox="0 0 300 150" role="img" aria-label={title}><rect className="science-medium" x="0" y="75" width="300" height="75" /><line className="science-normal" x1="150" y1="10" x2="150" y2="140" /><line className="science-interface" x1="10" y1="75" x2="290" y2="75" /><line className="science-vector" x1="150" y1="75" x2={150 + incident.x * 85} y2={75 - incident.y * 85} /><line className="science-vector science-vector--orange" x1="150" y1="75" x2={150 + refracted.x * 85} y2={75 - refracted.y * 85} /><text x="16" y="20">n₁</text><text x="16" y="95">n₂</text><text x="184" y="25">{finite(result.values.refractedAngle) ? `β=${fmt(result.values.refractedAngle, language)}°` : labels[language].tir}</text></svg>;
  }
  if (id === "beats") {
    const carrier = result.carrierPoints ?? [];
    return <div className="science-beats-visual"><div className="science-plot">{plotFor(id, result, language)}</div><svg className="science-visual science-visual--svg science-carrier-inset" viewBox="0 0 300 90" role="img" aria-label={language === "ru" ? "Несущая сумма синусоид" : "Несуча сума синусоїд"}><path className="science-axis" d="M18 45H286M18 12V78" /><path className="science-secondary" d={linePath(carrier, 268, 66, 0, 0.02, -2.1, 2.1)} /><text x="24" y="20">0–20 мс · f₁,f₂</text></svg></div>;
  }
  return <div className="science-plot">{plotFor(id, result, language)}</div>;
}

function resultLabels(id: ScienceId, language: Language): Array<[string, string, string]> {
  const ru = language === "ru";
  const map: Record<ScienceId, Array<[string, string, string]>> = {
    "derivative-tangent": [[ru ? "f(x₀)" : "f(x₀)", "", "value"], [ru ? "Наклон" : "Нахил", "", "slope"]],
    "definite-integral": [[ru ? "Площадь" : "Площа", "1", "integral"]], "complex-vector": [["|z|", "1", "magnitude"], ["φ", "°", "angle"]],
    projectile: [[ru ? "Дальность" : "Дальність", "м", "range"], [ru ? "Высота" : "Висота", "м", "height"], [ru ? "Время полёта" : "Час польоту", "с", "flightTime"]],
    pendulum: [[ru ? "Период" : "Період", "с", "period"], [ru ? "Частота" : "Частота", "Гц", "frequency"]], bernoulli: [["v₁", "м/с", "inletVelocity"], ["v₂", "м/с", "outletVelocity"], [ru ? "Δp" : "Δp", "Па", "pressureDrop"]],
    "pipe-loss": [[ru ? "Скорость" : "Швидкість", "м/с", "velocity"], [ru ? "Потери напора" : "Втрати напору", "м", "headLoss"], [ru ? "Потери давления" : "Втрати тиску", "Па", "pressureLoss"]],
    "standing-wave": [[ru ? "Длина волны" : "Довжина хвилі", "м", "wavelength"]], beats: [[ru ? "Частота биений" : "Частота биттів", "Гц", "beatFrequency"], [ru ? "Средняя частота" : "Середня частота", "Гц", "averageFrequency"]],
    "ideal-gas": [["p", "Па", "pressure"]], "snell-refraction": [["β", "°", "refractedAngle"]], "mass-spring": [["ω", "рад/с", "angularFrequency"], [ru ? "Период" : "Період", "с", "period"]],
  };
  return map[id];
}

const equations: Record<ScienceId, string> = {
  "derivative-tangent": "f(x)=x^2,\\quad f'(x_0)=2x_0",
  "definite-integral": "\\int_0^a x^2\\,dx=\\frac{a^3}{3}",
  "complex-vector": "z=\\operatorname{Re}+j\\operatorname{Im},\\quad |z|=\\sqrt{\\operatorname{Re}^2+\\operatorname{Im}^2}",
  projectile: "x=v_0\\cos\\alpha\\,t,\\quad y=v_0\\sin\\alpha\\,t-\\frac{gt^2}{2}",
  pendulum: "T=2\\pi\\sqrt{\\frac{L}{g}}",
  bernoulli: "A_1v_1=A_2v_2,\\quad p+\\frac{\\rho v^2}{2}=const",
  "pipe-loss": "h_f=f\\frac{L}{D}\\frac{v^2}{2g},\\quad \\Delta p=\\rho g h_f",
  "standing-wave": "\\xi(x)/\\xi_0=\\sin\\left(\\frac{n\\pi x}{L}\\right)",
  beats: "A_{env}(t)=2\\left|\\cos(\\pi(f_2-f_1)t)\\right|",
  "ideal-gas": "pV=nRT",
  "snell-refraction": "n_1\\sin\\alpha=n_2\\sin\\beta",
  "mass-spring": "x(t)=A\\cos(\\omega t),\\quad \\omega=\\sqrt{\\frac{k}{m}}",
};

export default function ScienceMicroLabs({ language = "ru", featured = false }: { language: Language; featured?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [query, setQuery] = useState(""); const [category, setCategory] = useState<(typeof categoryKeys)[number]>("all"); const [values, setValues] = useState<Values>(initialValues); const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const update = () => setSelected(new URLSearchParams(window.location.hash.slice(1)).get("science")); update(); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  const cards = useMemo(() => {
    const filtered = scienceCatalog.filter((definition) => (category === "all" || definition.category === category) && `${definition.title[language]} ${definition.description[language]}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    if (!featured) return filtered.slice(0, 12);
    const featuredIds: ScienceId[] = ["derivative-tangent", "projectile", "bernoulli", "standing-wave", "ideal-gas", "snell-refraction"];
    const selectedDefinition = selected ? scienceCatalog.find((definition) => definition.id === selected) : undefined;
    const curated = featuredIds.map((id) => filtered.find((definition) => definition.id === id)).filter((definition): definition is (typeof scienceCatalog)[number] => Boolean(definition));
    if (selectedDefinition && !curated.some((definition) => definition.id === selectedDefinition.id) && filtered.some((definition) => definition.id === selectedDefinition.id)) return [...curated.slice(0, 5), selectedDefinition].slice(0, 6);
    return curated.slice(0, 6);
  }, [category, featured, language, query, selected]);
  const setParameter = (id: ScienceId, index: number, value: number) => setValues((current) => ({ ...current, [id]: current[id].map((entry, itemIndex) => itemIndex === index ? value : entry) }));
  return <section className="science-labs" aria-label={language === "ru" ? "Научные микролаборатории" : "Наукові мікролабораторії"}><fieldset className="lab-ready-guard" disabled={!ready} aria-hidden={!ready}>
    <div className="science-toolbar"><input aria-label={labels[language].search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${labels[language].search}…`} /><div className="science-categories" role="tablist">{categoryKeys.map((key) => <button key={key} type="button" className={category === key ? "active" : ""} aria-selected={category === key} onClick={() => setCategory(key)}>{labels[language][key]}</button>)}</div></div>
    {cards.length === 0 ? <p className="science-empty">{labels[language].noResults}</p> : <div className="science-grid">{cards.map((definition) => { const id = definition.id; const current = values[id]; const result = models[id](...current); return <article className="science-card tool-card" key={id} id={`science-${id}`} data-science-id={id} data-selected={selected === id} onClick={(event) => { const target = event.target as HTMLElement; if (!target.closest("input,button,a,summary")) window.location.hash = `science=${id}`; }}>
      <div className="science-card-heading"><span className="science-card-index">{String(scienceCatalog.indexOf(definition) + 1).padStart(2, "0")}</span><span className="science-card-category">{labels[language][definition.category]}</span><a href={`#science=${id}`} aria-label={definition.title[language]} className="science-card-link">↗</a></div><h2>{definition.title[language]}</h2><p className="science-description">{definition.description[language]}</p><Formula block={false}>{equations[id]}</Formula><details><summary>{labels[language].assumptions}</summary><p>{definition.assumptions[language]}</p></details>
      <MeaningfulVisual id={id} result={result} language={language} />
      <div className="science-controls">{definition.parameters.map((parameter, index) => <label key={parameter.key}><span>{parameter.symbol} <small>({parameter.unit})</small><span className="science-parameter-value">{fmt(current[index], language)}</span></span><input data-science-param={parameter.key} aria-label={`${parameter.symbol} (${parameter.unit})`} type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={current[index]} onChange={(event) => { setParameter(id, index, Number(event.target.value)); window.location.hash = `science=${id}`; }} /></label>)}</div>
      <div className="science-results" data-science-result><strong>{labels[language].result}</strong>{resultLabels(id, language).map(([label, unit, key]) => <span key={key}><b>{label}</b> {finite(result.values[key]) ? fmt(result.values[key], language) : labels[language].tir}{unit ? ` ${unit}` : ""}</span>)}</div><button type="button" className="science-reset" onClick={() => setValues((currentValues) => ({ ...currentValues, [id]: definition.parameters.map((parameter) => parameter.initial) }))}>{labels[language].reset}</button>
    </article>; })}</div>}
  </fieldset></section>;
}
