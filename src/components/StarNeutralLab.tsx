import { useMemo, useRef, useState, useEffect } from "react";
import type { Complex } from "../models/circular-diagram";
import {
  calculateStar, MAX_INPUT, PHASES, polarToRectangular, rectangularToPolar,
  STAR_PRESETS, type NeutralMode, type Phase, type StarParameters,
} from "../models/star-neutral";
import { getLocale } from "../i18n";
import type { Language } from "../types";
import { ImpedancePlane, PhasorPlot, type PhasorVector } from "./StarNeutralPlots";
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
      setDraft(raw);
      if (!raw.trim()) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
    }}
    onBlur={() => setDraft(inputDisplay(value))} /></label>;
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
        <NumberField label="R, Ω" value={value.re} min={-MAX_INPUT} max={MAX_INPUT} onChange={number => update("re", number)} />
        <NumberField label="X, Ω" value={value.im} min={-MAX_INPUT} max={MAX_INPUT} onChange={number => update("im", number)} />
      </div></div>
      <div><strong>{copy.polar}</strong><div className="star-field-row">
        <NumberField label="|Z|, Ω" value={polar.magnitude} min={0} max={MAX_INPUT} onChange={number => update("magnitude", number)} />
        <NumberField label="φ, °" value={polar.angle} min={-180} max={180} onChange={number => update("angle", number)} />
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
  const copy = getLocale(language).star;
  const [parameters, setParameters] = useState<StarParameters>(STAR_PRESETS.unbalanced);
  const calculation = useMemo(() => calculateStar(parameters), [parameters]);
  const updatePhase = (phase: Phase, value: Complex) =>
    setParameters(current => ({ ...current, phases: { ...current.phases, [phase]: value } }));
  const selectPreset = (key: keyof typeof STAR_PRESETS) => setParameters(STAR_PRESETS[key]);

  const voltageVectors: PhasorVector[] = calculation.ok ? [
    ...PHASES.map(phase => ({ id: `E${phase}`, label: `E${phase}`, value: calculation.result.sources[phase], kind: "source" as const })),
    ...PHASES.map(phase => ({ id: `U${phase}`, label: `U${phase}`, value: calculation.result.voltages[phase], kind: "load" as const })),
    { id: "UnN", label: "UₙN", value: calculation.result.displacement, kind: "neutral" },
  ] : [];
  const currentVectors: PhasorVector[] = calculation.ok ? [
    ...PHASES.map(phase => ({ id: `I${phase}`, label: `I${phase}`, value: calculation.result.currents[phase], kind: "load" as const })),
    { id: "IN", label: "Iₙ", value: calculation.result.neutralCurrent, kind: "neutral" },
  ] : [];

  return <div className="star-lab">
    <div className="star-presets"><h2>{copy.presets}</h2><div>
      <button type="button" onClick={() => selectPreset("balanced")}>{copy.balanced}</button>
      <button type="button" onClick={() => selectPreset("unbalanced")}>{copy.unbalanced}</button>
      <button type="button" onClick={() => selectPreset("open")}>{copy.openPreset}</button>
      <button type="button" onClick={() => selectPreset("rlc")}>{copy.rlc}</button>
    </div></div>
    <div className="star-top-grid">
      <section className="star-card star-controls">
        <h2>{copy.source}</h2>
        <NumberField label={copy.phaseVoltage} value={parameters.uPhase} min={0} max={MAX_INPUT}
          onChange={uPhase => setParameters(current => ({ ...current, uPhase }))} />
        <label className="star-mode"><span>{copy.neutralMode}</span><select value={parameters.mode}
          onChange={event => setParameters(current => ({ ...current, mode: event.target.value as NeutralMode }))}>
          <option value="ideal">{copy.ideal}</option><option value="finite">{copy.finite}</option><option value="open">{copy.openMode}</option>
        </select></label>
        <h2>{copy.impedances}</h2>
        <p className="star-hint">{copy.reactanceHint}</p>
        {PHASES.map(phase => <ImpedanceFields key={phase} label={`${copy.phase} ${phase} — Z${phase}`}
          value={parameters.phases[phase]} onChange={value => updatePhase(phase, value)} copy={copy} />)}
        <ImpedanceFields label={`${copy.neutral} — ZN`} value={parameters.neutral} copy={copy}
          disabled={parameters.mode !== "finite"}
          onChange={neutral => setParameters(current => ({ ...current, neutral }))} />
      </section>
      <ImpedancePlane phases={parameters.phases} onChange={updatePhase} copy={copy} />
    </div>
    {!calculation.ok && <p role="alert" className="star-error">{copy[calculation.reason === "phase-short" ? "phaseShort" : calculation.reason]}</p>}
    {calculation.ok && <>
      <div className="star-diagrams">
        <PhasorPlot title={copy.voltagePlot} ariaLabel={copy.voltagePlot} unit="V" vectors={voltageVectors} />
        <PhasorPlot title={copy.currentPlot} ariaLabel={copy.currentPlot} unit="A" vectors={currentVectors} />
      </div>
      <section className="star-card star-results" aria-live="polite"><h2>{copy.results}</h2>
        <div className="star-table-scroll"><table><thead><tr><th scope="col">{copy.quantity}</th><th scope="col">{copy.polarValue}</th><th scope="col">{copy.rectangularValue}</th></tr></thead>
          <tbody>
            <ComplexReadout label="UₙN" value={calculation.result.displacement} unit="V" />
            {PHASES.map(phase => <ComplexReadout key={`U${phase}`} label={`U${phase}`} value={calculation.result.voltages[phase]} unit="V" />)}
            {PHASES.map(phase => <ComplexReadout key={`I${phase}`} label={`I${phase}`} value={calculation.result.currents[phase]} unit="A" />)}
            <ComplexReadout label="Iₙ" value={calculation.result.neutralCurrent} unit="A" />
          </tbody></table></div>
      </section>
    </>}
  </div>;
}
