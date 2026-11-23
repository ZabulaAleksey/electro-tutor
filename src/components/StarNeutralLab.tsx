import { formatEngineeringNumber } from "../engineering/format";
import { useMemo, useState, useEffect, useRef } from "react";
import {subtractComplex,type Complex} from "../models/circular-diagram";
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

function ComplexReadout({ label, value, unit, language }: { label: string; value: Complex; unit: string; language: Language }) {
  const display = (number: number) => formatEngineeringNumber(number, language);
  const polar = rectangularToPolar(value);
  const angle = polar.magnitude === 0 ? 0 : polar.angle;
  const sign = value.im < 0 ? "−" : "+";
  return <tr><th scope="row">{label}</th>
    <td>{display(polar.magnitude)} ∠ {display(angle)}° {unit}</td>
    <td>{display(value.re)} {sign} j{display(Math.abs(value.im))} {unit}</td></tr>;
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
  const changeNeutral = (neutral: Complex) => setParameters(current => ({
    ...current, neutral, mode: neutral.re === 0 && neutral.im === 0 ? "ideal" : "finite",
  }));
  const updatePhase = (phase: Phase, value: Complex) =>
    setParameters(current => ({ ...current, phases: { ...current.phases, [phase]: value } }));
  const selectPreset = (key: keyof typeof STAR_PRESETS) => setParameters(STAR_PRESETS[key]);

  return <fieldset disabled={!ready} aria-hidden={!ready} className="lab-hydration-guard"><div className="star-lab" data-three-phase="star">
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
          <p role="alert" className="star-error">{copy[calculation.reason === "phase-short" ? "phaseShort" : calculation.reason]}</p>
        </section>}
    </div>
    {calculation.ok && <section className="star-card star-results" aria-live="polite"><h2>{copy.results}</h2>
      <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
        <tbody>
          <ComplexReadout language={language} label="UₙN" value={calculation.result.displacement} unit="V" />
          {PHASES.map(phase => <ComplexReadout language={language} key={`U${phase}`} label={`U${phase.toLowerCase()}`} value={calculation.result.voltages[phase]} unit="V" />)}
          {PHASES.map(phase => <ComplexReadout language={language} key={`I${phase}`} label={`I${phase}`} value={calculation.result.currents[phase]} unit="A" />)}
          <ComplexReadout language={language} label="Iₙ" value={calculation.result.neutralCurrent} unit="A"/>
        </tbody></table></div>
    </section>}
    {calculation.ok&&<section className="star-card star-line-results"><h2>{t("Линейные напряжения","Лінійні напруги")}</h2>
      <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
        <tbody>{LINE_PAIRS.map(([name,from,to])=><ComplexReadout language={language} key={name} label={"U"+name}
          value={subtractComplex(calculation.result.sources[from],calculation.result.sources[to])} unit="V"/>)}</tbody>
      </table></div>
    </section>}
  </div></fieldset>;
}
