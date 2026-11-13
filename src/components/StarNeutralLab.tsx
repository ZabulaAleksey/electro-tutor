import { useMemo, useRef, useState, useEffect } from "react";
import {subtractComplex,type Complex} from "../models/circular-diagram";
import {
  calculateDelta, calculateStar, LINE_PAIRS, MAX_INPUT, PHASES, readThreePhaseDraft, polarToRectangular, rectangularToPolar,
  STAR_PRESETS, type NeutralMode, type Phase, type StarParameters,
} from "../models/star-neutral";
import { getLocale } from "../i18n";
import type { Language } from "../types";
import { ImpedancePlane, StarVectorDiagram } from "./StarNeutralPlots";
import "./StarNeutralLab.css";

type StarCopy = ReturnType<typeof getLocale>["star"];
type ImpedancePart = "re" | "im" | "magnitude" | "angle";

function display(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString();
}

function inputDisplay(value: number): string {
  return Number(value.toPrecision(8)).toString();
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => inputDisplay(value));
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(inputDisplay(value));
  }, [value]);
  return <label className="star-field"><span>{label}</span><input ref={input} type="number" inputMode="decimal"
    min={min} max={max} step="any" value={draft}
    onChange={event => {
      const raw = event.target.value;
      if (!raw.trim()) { setDraft(raw); return; }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) { setDraft(raw); return; }
      const bounded = Math.min(max, Math.max(min, parsed));
      setDraft(parsed === bounded ? raw : inputDisplay(bounded));
      onChange(bounded);
    }}
    onBlur={() => setDraft(inputDisplay(value))} /></label>;
}

function PhasorPractice({voltage,current,language}:{voltage:Complex;current:Complex;language:Language}){
  const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
  const [quantity,setQuantity]=useState<"voltage"|"current">("voltage");
  const [magnitude,setMagnitude]=useState(0),[angle,setAngle]=useState(0),[message,setMessage]=useState("");
  const target=quantity==="voltage"?voltage:current;
  const unit=quantity==="voltage"?"V":"A";
  const scale=Math.max(1,rectangularToPolar(target).magnitude*1.5,magnitude);
  const guess=polarToRectangular(magnitude,angle);
  useEffect(()=>setMessage(""),[voltage.re,voltage.im,current.re,current.im,quantity]);
  return <details className="star-card">
    <summary>{t("Самостоятельное построение","Самостійна побудова")}</summary>
    <div className="star-source-fields">
      <label>{t("Постройте вектор","Побудуйте вектор")} <select value={quantity} onChange={e=>setQuantity(e.target.value as typeof quantity)}>
        <option value="voltage">UAB</option><option value="current">IA</option>
      </select></label>
      <div className="star-field-row">
        <NumberField label={t("Модуль","Модуль")+", "+unit} value={magnitude} min={0} max={1e13} onChange={n=>{setMagnitude(n);setMessage("");}}/>
        <NumberField label={t("Угол, °","Кут, °")} value={angle} min={-180} max={180} onChange={n=>{setAngle(n);setMessage("");}}/>
      </div>
      <svg className="star-practice-plane" viewBox="0 0 240 180" role="img" aria-label={t("Поле построения фазора","Поле побудови фазора")}
        onPointerDown={e=>{
          const matrix=e.currentTarget.getScreenCTM();
          if(!matrix)return;
          const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
          const picked=rectangularToPolar({re:(p.x-120)*scale/75,im:(90-p.y)*scale/75});
          setMagnitude(picked.magnitude);setAngle(picked.angle);setMessage("");
        }}>
        <path d="M16 90H224 M120 8V172" stroke="var(--muted)" fill="none"/>
        <text x="216" y="83" fill="var(--ink)" fontSize="12">Re</text><text x="125" y="16" fill="var(--ink)" fontSize="12">Im</text>
        <line x1="120" y1="90" x2={120+75*guess.re/scale} y2={90-75*guess.im/scale} stroke="var(--blue)" strokeWidth="2"/>
        <circle cx={120+75*guess.re/scale} cy={90-75*guess.im/scale} r="4" fill="var(--blue)"/>
      </svg>
      <button type="button" onClick={()=>{
        const error=rectangularToPolar(subtractComplex(guess,target)).magnitude;
        const threshold=.03*Math.max(1e-6,rectangularToPolar(target).magnitude);
        setMessage(error<=threshold?t("Вектор построен верно.","Вектор побудовано правильно."):
          t("Проверьте модуль и направление вектора.","Перевірте модуль і напрямок вектора."));
      }}>{t("Проверить вектор","Перевірити вектор")}</button>
      {message&&<output role="status">{message}</output>}
    </div>
  </details>;
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

function ComplexReadout({ label, value, unit }: { label: string; value: Complex; unit: string }) {
  const polar = rectangularToPolar(value);
  const angle = polar.magnitude < 1e-9 ? 0 : polar.angle;
  const sign = value.im < 0 && display(value.im) !== "0" ? "−" : "+";
  return <tr><th scope="row">{label}</th>
    <td>{display(polar.magnitude)} ∠ {display(angle, 1)}° {unit}</td>
    <td>{display(value.re)} {sign} j{display(Math.abs(value.im))} {unit}</td></tr>;
}

export default function StarNeutralLab({ language }: { language: Language }) {
  const [ready,setReady] = useState(false);
  const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
  const storageKey="electrotutor-three-phase-v1";
  const [topology,setTopology]=useState<"star"|"delta">("star");
  const copy = getLocale(language).star;
  const [parameters, setParameters] = useState<StarParameters>(STAR_PRESETS.unbalanced);
  const calculation = useMemo(() => topology==="delta"?calculateDelta(parameters):calculateStar(parameters), [parameters,topology]);
  useEffect(()=>{
    try{
      const saved=readThreePhaseDraft(JSON.parse(localStorage.getItem(storageKey)??"null"));
      if(saved){setParameters(saved.parameters);setTopology(saved.topology);}
    }catch{/* A fresh experiment is still available. */}
    setReady(true);
  },[storageKey]);
  useEffect(()=>{
    if(ready&&calculation.ok)try{localStorage.setItem(storageKey,JSON.stringify({version:1,topology,parameters}));}
    catch{/* Local storage is optional. */}
  },[ready,calculation,topology,parameters,storageKey]);
  const source=parameters.source;
  const updateSource=(phase:Phase,field:"magnitude"|"angle",value:number)=>{
    if(source)setParameters({...parameters,source:{...source,[phase]:{...source[phase],[field]:value}}});
  };
  const delta=topology==="delta";
  const updatePhase = (phase: Phase, value: Complex) =>
    setParameters(current => ({ ...current, phases: { ...current.phases, [phase]: value } }));
  const selectPreset = (key: keyof typeof STAR_PRESETS) => setParameters(STAR_PRESETS[key]);

  return <fieldset disabled={!ready} aria-hidden={!ready} className="lab-hydration-guard"><div className="star-lab" data-three-phase={topology}>
    <label className="star-mode star-topology"><span>{t("Соединение нагрузки","З’єднання навантаження")}</span>
      <select value={topology} onChange={event=>setTopology(event.target.value as "star"|"delta")}>
        <option value="star">{t("Звезда Y","Зірка Y")}</option><option value="delta">{t("Треугольник Δ","Трикутник Δ")}</option>
      </select>
    </label>
    <div className="star-presets"><h2>{copy.presets}</h2><div>
      <button type="button" onClick={() => selectPreset("balanced")}>{copy.balanced}</button>
      <button type="button" onClick={() => selectPreset("unbalanced")}>{copy.unbalanced}</button>
      <button type="button" onClick={() => selectPreset("open")}>{copy.openPreset}</button>
      <button type="button" onClick={() => selectPreset("rlc")}>{copy.rlc}</button>
    </div></div>
    <div className="star-top-grid">
      <ImpedancePlane language={language} phases={parameters.phases} onChange={updatePhase} copy={copy} />
      {calculation.ok ? <StarVectorDiagram language={language} result={calculation.result} copy={copy} delta={delta}/> :
        <section className="star-card star-phasors"><h2>{copy.combinedPlot}</h2>
          <p role="alert" className="star-error">{copy[calculation.reason === "phase-short" ? "phaseShort" : calculation.reason]}</p>
        </section>}
    </div>
    {calculation.ok && <section className="star-card star-results" aria-live="polite"><h2>{copy.results}</h2>
      <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
        <tbody>
          {!delta&&<ComplexReadout label="UₙN" value={calculation.result.displacement} unit="V" />}
          {PHASES.map(phase => <ComplexReadout key={`U${phase}`} label={delta?`UΔ,${LINE_PAIRS[PHASES.indexOf(phase)][0]}`:`U${phase.toLowerCase()}`} value={calculation.result.voltages[phase]} unit="V" />)}
          {PHASES.map(phase => <ComplexReadout key={`I${phase}`} label={delta?`I${LINE_PAIRS[PHASES.indexOf(phase)][0]}`:`I${phase}`} value={calculation.result.currents[phase]} unit="A" />)}
          {calculation.result.lineCurrents?PHASES.map(phase=><ComplexReadout key={phase} label={`I${phase}`}
            value={calculation.result.lineCurrents![phase]} unit="A"/>):<ComplexReadout label="Iₙ" value={calculation.result.neutralCurrent} unit="A"/>}
        </tbody></table></div>
    </section>}
    {calculation.ok&&<section className="star-card star-line-results"><h2>{t("Линейные напряжения","Лінійні напруги")}</h2>
      <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
        <tbody>{LINE_PAIRS.map(([name,from,to])=><ComplexReadout key={name} label={"U"+name}
          value={subtractComplex(calculation.result.sources[from],calculation.result.sources[to])} unit="V"/>)}</tbody>
      </table></div>
    </section>}
    {calculation.ok&&<PhasorPractice language={language} voltage={subtractComplex(calculation.result.sources.A,calculation.result.sources.B)}
      current={(calculation.result.lineCurrents??calculation.result.currents).A}/>}
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
      {!delta&&<label className="star-mode"><span>{copy.neutralMode}</span><select value={parameters.mode}
        onChange={event => setParameters(current => ({ ...current, mode: event.target.value as NeutralMode }))}>
        <option value="ideal">{copy.ideal}</option><option value="finite">{copy.finite}</option><option value="open">{copy.openMode}</option>
      </select></label>}
      <h2>{copy.impedances}</h2>
      <p className="star-hint">{copy.reactanceHint}</p>
      {PHASES.map(phase => <ImpedanceFields key={phase} label={delta?`Z${LINE_PAIRS[PHASES.indexOf(phase)][0]}`:`${copy.phase} ${phase} — Z${phase}`}
        value={parameters.phases[phase]} onChange={value => updatePhase(phase, value)} copy={copy} />)}
      {!delta&&<ImpedanceFields label={`${copy.neutral} — ZN`} value={parameters.neutral} copy={copy}
        disabled={parameters.mode !== "finite"}
        onChange={neutral => setParameters(current => ({ ...current, neutral }))} />}
    </section>
  </div></fieldset>;
}
