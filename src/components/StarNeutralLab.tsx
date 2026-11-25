import { formatEngineeringNumber } from "../engineering/format";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { subtractComplex, type Complex } from "../models/circular-diagram";
import {
  calculateStar, LINE_PAIRS, MAX_INPUT, PHASES, readThreePhaseDraft, polarToRectangular, rectangularToPolar,
  STAR_PRESETS, type Phase, type StarParameters,
} from "../models/star-neutral";
import { getLocale } from "../i18n";
import type { Language } from "../types";
import { ImpedancePlane, StarVectorDiagram } from "./StarNeutralPlots";
import "./StarNeutralLab.css";

type StarCopy = ReturnType<typeof getLocale>["star"];
type ImpedancePart = "re" | "im" | "magnitude" | "angle";

const displayInput = (value: number) => String(Number(value.toPrecision(6)));

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="star-field"><span>{label}</span><input type="number" inputMode="decimal"
    min={min} max={max} step="any" value={draft ?? displayInput(value)}
    onChange={event => {
      const raw = event.target.value;
      if (!raw.trim()) { setDraft(raw); return; }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) { setDraft(raw); return; }
      const bounded = Math.min(max, Math.max(min, parsed));
      setDraft(parsed === bounded ? raw : String(bounded));
      onChange(bounded);
    }}
    onBlur={() => setDraft(null)} /></label>;
}

function ImpedanceFields({ label, value, onChange, copy, disabled = false }: {
  label: string; value: Complex; onChange: (value: Complex) => void; copy: StarCopy; disabled?: boolean;
}) {
  const polar = rectangularToPolar(value);
  const update = (part: ImpedancePart, number: number) => {
    if (disabled) return;
    if (part === "re" || part === "im") onChange({ ...value, [part]: number });
    else onChange(polarToRectangular(part === "magnitude" ? number : polar.magnitude,
      part === "angle" ? number : polar.angle));
  };
  return <fieldset className="star-impedance-fields" disabled={disabled}>
    <legend>{label}</legend>
    <div className="star-form-pair">
      <div><strong>{copy.rectangular}</strong><div className="star-field-row">
        <NumberField label="R, Ω" value={value.re} min={0} max={MAX_INPUT} onChange={number => update("re", number)} />
        <NumberField label="X, Ω" value={value.im} min={-MAX_INPUT} max={MAX_INPUT} onChange={number => update("im", number)} />
      </div></div>
      <div><strong>{copy.polar}</strong><div className="star-field-row">
        <NumberField label="|Z|, Ω" value={polar.magnitude} min={0} max={MAX_INPUT} onChange={number => update("magnitude", number)} />
        <NumberField label="φ, °" value={polar.angle} min={-90} max={90} onChange={number => update("angle", number)} />
      </div></div>
    </div>
  </fieldset>;
}

const diagnostics = {
  ru: {
    inconsistent: "Идеальные соединения задают разные потенциалы одному узлу. Решения нет.",
    indeterminate: "У схемы несколько решений. Показаны однозначно определяемые величины.",
    unstable: "Система близка к вырожденной. Расчёт токов или напряжений численно неустойчив.",
  },
  uk: {
    inconsistent: "Ідеальні з’єднання задають різні потенціали одному вузлу. Розв’язку немає.",
    indeterminate: "Схема має кілька розв’язків. Показано однозначно визначені величини.",
    unstable: "Система близька до виродженої. Розрахунок струмів чи напруг чисельно нестійкий.",
  },
} as const;

function rectangularText(value: Complex, language: Language) {
  const display = (number: number) => formatEngineeringNumber(number, language);
  return `${display(value.re)} ${value.im < 0 ? "−" : "+"} j${display(Math.abs(value.im))}`;
}

function ComplexReadout({ label, value, unit, language }: { label: ReactNode; value?: Complex; unit: string; language: Language }) {
  if (!value) return <tr><th scope="row">{label}</th><td>—</td><td>—</td></tr>;
  const display = (number: number) => formatEngineeringNumber(number, language);
  const polar = rectangularToPolar(value);
  return <tr><th scope="row">{label}</th>
    <td>{display(polar.magnitude)} ∠ {display(polar.magnitude === 0 ? 0 : polar.angle)}° {unit}</td>
    <td>{rectangularText(value, language)} {unit}</td></tr>;
}

function StarSchematic({ language, parameters }: { language: Language; parameters: StarParameters }) {
  const ru = language === "ru";
  const title = ru ? "Схема несимметричной звезды" : "Схема несиметричної зірки";
  const connected = parameters.mode !== "open";
  const neutral = parameters.mode === "ideal" ? { re: 0, im: 0 } : parameters.neutral;
  const isWire = (value: Complex) => value.re === 0 && value.im === 0;
  const impedance = (value: Complex) => isWire(value) ? "0" : rectangularText(value, language);
  const index = (value: string) => <tspan baselineShift="sub" fontSize="9">{value}</tspan>;
  return <section className="star-card star-schematic">
    <h2>{title}</h2>
    <svg viewBox="0 -11 416 227" role="img" aria-label={title} data-star-schematic>
      <defs><marker id="star-schematic-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor"/>
      </marker></defs>
      <path className="star-schematic-wire" d="M31 130 V28 M383 28 V130"/>
      {PHASES.map((phase, position) => {
        const y = 28 + position * 51;
        const value = parameters.phases[phase];
        return <g key={phase} transform={`translate(0 ${y})`} data-star-branch={phase} data-ideal={isWire(value)}>
          <path className="star-schematic-wire" d={isWire(value) ? "M31 0 H61 M85 0 H383" : "M31 0 H61 M85 0 H255 M305 0 H383"}/>
          <circle className="star-schematic-wire" cx="73" r="12"/>
          <path className="star-schematic-wire" d="M65 0 q4 -7 8 0 t8 0"/>
          <circle cx="121" r="2.8"/><text x="119" y="-9" textAnchor="middle">{phase}</text>
          <path className="star-schematic-wire" d="M140 -10 H174" markerEnd="url(#star-schematic-arrow)"/>
          <text x="152" y="-17">I{index(phase)}</text>
          {!isWire(value) && <rect className="star-schematic-wire" x="255" y="-7" width="50" height="14"/>}
          <text x="280" y="-13" textAnchor="middle" data-star-impedance={phase}>Z{index(phase)} = {impedance(value)} Ω</text>
          <text x="89" y="17">U{index(phase)}</text>
          <text x="281" y="22" textAnchor="middle">U{index(phase.toLowerCase())}</text>
        </g>;
      })}
      <circle cx="31" cy="130" r="3"/><text x="18" y="134">N</text>
      <circle cx="383" cy="130" r="3"/><text x="391" y="134">n</text>
      {connected && <g data-star-neutral-branch data-ideal={isWire(neutral)}>
        <path className="star-schematic-wire" d={isWire(neutral) ? "M31 130 V167 H383 V130" : "M31 130 V167 H182 M234 167 H383 V130"}/>
        {!isWire(neutral) && <rect className="star-schematic-wire" x="182" y="160" width="52" height="14"/>}
        <path className="star-schematic-wire" d="M351 155 H318" markerEnd="url(#star-schematic-arrow)"/>
        <text x="332" y="149">I{index("N")}</text>
        <text x="208" y="155" textAnchor="middle" data-star-impedance="N">Z{index("N")} = {impedance(neutral)} Ω</text>
      </g>}
      <path className="star-schematic-wire" d="M31 185 H383" strokeDasharray="4 3" markerEnd="url(#star-schematic-arrow)"/>
      <text x="208" y="202" textAnchor="middle">U{index("nN")}</text>
    </svg>
  </section>;
}

export default function StarNeutralLab({ language }: { language: Language }) {
  const [ready,setReady] = useState(false);
  const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
  const initialParameters = useRef<StarParameters>(STAR_PRESETS.open);
  const copy = getLocale(language).star;
  const [parameters, setParameters] = useState<StarParameters>(STAR_PRESETS.open);
  const calculation = useMemo(() => calculateStar(parameters), [parameters]);
  useEffect(() => {
    try {
      const serialized = localStorage.getItem("electrotutor-star-v1") ?? localStorage.getItem("electrotutor-three-phase-v1");
      const saved = serialized && readThreePhaseDraft(JSON.parse(serialized));
      if (saved && saved.topology === "star") {
        const restored = saved.parameters;
        initialParameters.current = restored.mode === "ideal" ? { ...restored, neutral: { re: 0, im: 0 } } : restored;
        setParameters(initialParameters.current);
      }
    } catch { /* The original draft remains available in its own storage slot. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || !calculation.ok || parameters === initialParameters.current) return;
    try {
      localStorage.setItem("electrotutor-star-v1", JSON.stringify({ version: 1, topology: "star", parameters }));
      initialParameters.current = parameters;
    } catch { /* Local storage is optional. */ }
  }, [ready, calculation, parameters]);
  const source=parameters.source;
  const updateSource=(phase:Phase,field:"magnitude"|"angle",value:number)=>{
    if(source)setParameters({...parameters,source:{...source,[phase]:{...source[phase],[field]:value}}});
  };
  const connected = parameters.mode !== "open";
  const result = calculation.ok ? calculation.result : calculation.partial;
  const reason = calculation.ok ? null : calculation.reason;
  const message = reason === "inconsistent" || reason === "indeterminate" || reason === "unstable"
    ? diagnostics[language][reason] : reason && copy[reason === "phase-short" ? "phaseShort" : reason];
  const angles = source && [source.B.angle - source.A.angle, source.C.angle - source.A.angle]
    .map(angle => (angle + 360) % 360).sort((a, b) => a - b);
  const balancedSource = !source || (source.A.magnitude === source.B.magnitude &&
    source.A.magnitude === source.C.magnitude && (source.A.magnitude === 0 || angles?.[0] === 120 && angles[1] === 240));
  const balanced = balancedSource && PHASES.every(phase =>
    parameters.phases[phase].re === parameters.phases.A.re &&
    parameters.phases[phase].im === parameters.phases.A.im);
  const displayNeutral = calculation.ok && balanced ? { re: 0, im: 0 } : result?.neutralCurrent;
  const changeNeutral = (neutral: Complex) => setParameters(current => ({
    ...current, neutral, mode: neutral.re === 0 && neutral.im === 0 ? "ideal" : "finite",
  }));
  const updatePhase = (phase: Phase, value: Complex) =>
    setParameters(current => ({ ...current, phases: { ...current.phases, [phase]: value } }));
  const selectPreset = (key: keyof typeof STAR_PRESETS) => setParameters(STAR_PRESETS[key]);

  return <fieldset disabled={!ready} aria-hidden={!ready} className="lab-hydration-guard"><div className="star-lab" data-three-phase="star">
    <StarSchematic language={language} parameters={parameters} />
    <section className="star-card star-controls">
      <h2>{copy.source}</h2>
      <label><input type="checkbox" checked={!!source} onChange={event=>setParameters({...parameters,source:event.target.checked?
        {A:{magnitude:parameters.uPhase,angle:0},B:{magnitude:parameters.uPhase,angle:-120},C:{magnitude:parameters.uPhase,angle:120}}:undefined})}/>
        {t("Независимые фазоры источника","Незалежні фазори джерела")}</label>
      {source?<div className="star-source-fields">{PHASES.map(phase=><div key={phase} className="star-field-row">
        <NumberField label={`|U${phase}|, V`} value={source[phase].magnitude} min={0} max={MAX_INPUT} onChange={value=>updateSource(phase,"magnitude",value)}/>
        <NumberField label={`φ${phase}, °`} value={source[phase].angle} min={-180} max={180} onChange={value=>updateSource(phase,"angle",value)}/>
      </div>)}</div>:<NumberField label={copy.phaseVoltage} value={parameters.uPhase} min={0} max={MAX_INPUT}
        onChange={uPhase => setParameters(current => ({ ...current, uPhase }))} />}
    </section>
    <div className="star-presets"><h2>{copy.presets}</h2><div>
      <button type="button" onClick={() => selectPreset("balanced")}>{copy.balanced}</button>
      <button type="button" onClick={() => selectPreset("unbalanced")}>{copy.unbalanced}</button>
      <button type="button" onClick={() => selectPreset("open")}>{copy.openPreset}</button>
      <button type="button" onClick={() => selectPreset("rlc")}>{copy.rlc}</button>
    </div></div>
    <div className="star-top-grid">
      <ImpedancePlane language={language} phases={parameters.phases} neutral={connected ? parameters.neutral : null}
        onChange={(point, value) => point === "N" ? changeNeutral(value) : updatePhase(point, value)} copy={copy}
        toggle={<label className="star-neutral-toggle"><input type="checkbox" role="switch" checked={connected}
          onChange={event => event.target.checked ? changeNeutral(parameters.neutral) :
            setParameters(current => ({ ...current, mode: "open" }))} />{copy.neutral}</label>}>
        <p className="star-hint">{copy.reactanceHint}</p>
        {PHASES.map(phase => <ImpedanceFields key={phase} label={`${copy.phase} ${phase} — Z${phase}`}
          value={parameters.phases[phase]} onChange={value => updatePhase(phase, value)} copy={copy} />)}
        {connected && <ImpedanceFields label={`${copy.neutral} — ZN`} value={parameters.neutral} onChange={changeNeutral} copy={copy} />}
      </ImpedancePlane>
      {calculation.ok ? <StarVectorDiagram language={language} result={calculation.result} copy={copy}/> :
        <section className="star-card star-phasors"><h2>{copy.combinedPlot}</h2>
          <p role="alert" className="star-error">{message}</p>
        </section>}
    </div>
    {result && <section className="star-card star-results" aria-live="polite"><h2>{copy.results}</h2>
      <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
        <tbody>
          <ComplexReadout language={language} label={<>U<sub>nN</sub></>}
            value={calculation.ok && balanced ? { re: 0, im: 0 } : result.displacement} unit="V" />
          {PHASES.map(phase => <ComplexReadout language={language} key={`U${phase}`} label={<>U<sub>{phase.toLowerCase()}</sub></>} value={result.voltages?.[phase]} unit="V" />)}
          {PHASES.map(phase => <ComplexReadout language={language} key={`I${phase}`} label={<>I<sub>{phase}</sub></>} value={result.currents?.[phase]} unit="A" />)}
          <ComplexReadout language={language} label={<>I<sub>N</sub></>} value={displayNeutral} unit="A" />
          {LINE_PAIRS.map(([name, from, to]) => <ComplexReadout language={language} key={name}
            label={<>U<sub>{name}</sub></>} value={subtractComplex(result.sources[from], result.sources[to])} unit="V" />)}
        </tbody></table></div>
    </section>}
  </div></fieldset>;
}
