import { useEffect, useMemo, useRef, useState } from "react";
import {
  CIRCULAR_DIAGRAM_DEFAULTS,
  CIRCULAR_DIAGRAM_LIMITS,
  canonicalizeCircularDiagramState,
  normalizeCircularDiagramState,
  parseCircularDiagramSearch,
  type CircularDiagramParseStatus,
  type CircularDiagramState,
} from "../models/circular-diagram-state";
import {
  buildCircularDiagramModel,
  complexArgumentDegrees,
  complexMagnitude,
} from "../models/circular-diagram";
import { getLocale } from "../i18n";
import type { Language } from "../types";

export default function CircularDiagram({ language }: { language: Language }) {
  const copy = getLocale(language);
  const fmt = (value: number, digits = 2) => Number(value.toFixed(digits)).toString();
  const [parameters, setParameters] = useState<CircularDiagramState>({
    ...CIRCULAR_DIAGRAM_DEFAULTS,
  });
  const [urlStatus, setUrlStatus] = useState<CircularDiagramParseStatus>("valid");

  const writeUrl = (state: CircularDiagramState, mode: "push" | "replace") => {
    const url = `${location.pathname}${canonicalizeCircularDiagramState(state)}${location.hash}`;
    history[mode === "push" ? "pushState" : "replaceState"](history.state, "", url);
  };

  useEffect(() => {
    const restoreFromLocation = () => {
      const parsed = parseCircularDiagramSearch(location.search);
      setParameters(parsed.state);
      setUrlStatus(parsed.status);
      if (location.search !== parsed.canonicalSearch) {
        const url = `${location.pathname}${parsed.canonicalSearch}${location.hash}`;
        history.replaceState(history.state, "", url);
      }
    };

    restoreFromLocation();
    addEventListener("popstate", restoreFromLocation);
    return () => removeEventListener("popstate", restoreFromLocation);
  }, []);

  const updateParameter = (key: keyof CircularDiagramState, value: number) => {
    setParameters((current) => normalizeCircularDiagramState({ ...current, [key]: value }));
  };

  const commitParameter = (
    key: keyof CircularDiagramState,
    value: number,
    mode: "push" | "replace",
  ) => {
    const next = normalizeCircularDiagramState({ ...parameters, [key]: value });
    setParameters(next);
    setUrlStatus("valid");
    writeUrl(next, mode);
  };

  const model = useMemo(() => buildCircularDiagramModel({
    i0Magnitude: parameters.i0m,
    i0Angle: parameters.i0a,
    ikMagnitude: parameters.ikm,
    ikAngle: parameters.ika,
    outputImpedanceMagnitude: parameters.zm,
    outputImpedanceAngle: parameters.za,
    loadAngle: parameters.phi,
    position: parameters.r,
  }), [parameters]);

  const vectors = [
    { id: "idle", label: "I₀", value: model.i0 },
    { id: "short", label: "Iк", value: model.ik },
    ...(model.current ? [{ id: "active", label: "I(R)", value: model.current }] : []),
  ];
  const step = model.extent <= 3 ? 1 : model.extent <= 8 ? 2 : 5, ticks: number[] = [];
  for (let n = -Math.floor(model.extent / step) * step; n <= model.extent; n += step) ticks.push(n);

  const field = (key: keyof CircularDiagramState) => ({
    value: parameters[key],
    min: CIRCULAR_DIAGRAM_LIMITS[key].min,
    max: CIRCULAR_DIAGRAM_LIMITS[key].max,
    set: (value: number) => updateParameter(key, value),
    commit: (value: number) => commitParameter(key, value, "push"),
  });

  return <section className="circle-lab">
    <div className="circle-lab-heading">
      <div><span className="section-kicker">{copy.diagram.kicker}</span><h2>{copy.diagram.title}</h2></div>
      <p>{copy.diagram.lead}</p>
    </div>
    {urlStatus === "recovered" && <p className="circle-state-notice" role="status">
      {copy.diagram.recovered}
    </p>}
    <div className="circle-lab-layout">
      <div className="circle-controls">
        <Group title={copy.diagram.idle}><Field label={copy.diagram.magnitude} {...field("i0m")} step={.1}/><Field label={copy.diagram.angle} {...field("i0a")} step={1}/></Group>
        <Group title={copy.diagram.short}><Field label={copy.diagram.magnitude} {...field("ikm")} step={.1}/><Field label={copy.diagram.angle} {...field("ika")} step={1}/></Group>
        <Group title={copy.diagram.output}><Field label={copy.diagram.outputMagnitude} {...field("zm")} step={.1}/><Field label={copy.diagram.outputAngle} {...field("za")} step={1}/><Field label={copy.diagram.loadAngle} {...field("phi")} step={1}/></Group>
        <label className="resistance-control"><span>{copy.diagram.resistance}<strong>{Number.isFinite(model.resistance) ? `${fmt(model.resistance)} ${copy.units.ohm}` : "∞"}</strong></span><input type="range" min={CIRCULAR_DIAGRAM_LIMITS.r.min} max={CIRCULAR_DIAGRAM_LIMITS.r.max} step=".2" value={parameters.r} onChange={event => commitParameter("r", Number(event.target.value), "replace")}/><small><span>0</span><span>|Z|</span><span>∞</span></small></label>
      </div>
      <div className="circle-plot">
        <svg viewBox="0 0 720 520" role="img" aria-label={copy.diagram.aria}>
          <defs>{vectors.map(v => <marker id={`arrow-${v.id}`} key={v.id} markerWidth="12" markerHeight="7" refX="10.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0.5,.8 L11,3.5 L.5,6.2 L3,3.5 Z" className={`math-arrow arrow-head ${v.id}`}/></marker>)}</defs>
          <g className="plot-grid">{ticks.map(t => { const x = model.xy({ re: t, im: 0 }).x, y = model.xy({ re: 0, im: t }).y; return <g key={t}><line x1={x} y1="25" x2={x} y2="495"/><line x1="25" y1={y} x2="695" y2={y}/>{t !== 0 && <><text x={x + 5} y="277">{t}</text><text x="367" y={y - 6}>{t}</text></>}</g>; })}</g>
          <g className="plot-axes"><line x1="25" y1="260" x2="695" y2="260"/><line x1="360" y1="25" x2="360" y2="495"/><text x="640" y="247">Re I, A</text><text x="370" y="38">Im I, A</text></g>
          <path d={model.path} className="current-locus"/>
          {vectors.map(v => { const p = model.xy(v.value); return <g className={`current-vector ${v.id}`} key={v.id}><line x1="360" y1="260" x2={p.x} y2={p.y} markerEnd={`url(#arrow-${v.id})`}/><circle cx={p.x} cy={p.y} r={v.id === "active" ? 6 : 4}/><text x={p.x + 10} y={p.y - 10}>{v.label}</text></g>; })}
        </svg>
        <div className="circle-readout" aria-live="polite">
          {vectors.map(v => <span key={v.id}><b>{v.label}</b> = {fmt(complexMagnitude(v.value))}∠{fmt(complexArgumentDegrees(v.value), 1)}° A</span>)}
          {!model.current && <span className="singularity-note"><b>I(R) → ∞</b> — {copy.diagram.singularity}</span>}
        </div>
      </div>
    </div>
  </section>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend>{title}</legend>{children}</fieldset>;
}

function Field({ label, value, min, max, step, set, commit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  set: (value: number) => void;
  commit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const valueOnFocus = useRef(value);
  useEffect(() => setDraft(String(value)), [value]);

  const parseDraft = (raw: string): number | null => {
    if (raw === "" || raw === "-" || raw === "+" || raw === "." || raw === "-.") return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(max, Math.max(min, parsed));
  };
  const update = (raw: string) => {
    setDraft(raw);
    const limited = parseDraft(raw);
    if (limited === null) return;
    set(limited);
    if (limited !== Number(raw)) setDraft(String(limited));
  };
  const finish = () => {
    const limited = parseDraft(draft);
    if (limited === null) {
      setDraft(String(value));
      return;
    }
    setDraft(String(limited));
    if (limited !== valueOnFocus.current) commit(limited);
  };

  return <label><span>{label}</span><input type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} onFocus={() => { valueOnFocus.current = value; }} onChange={event => update(event.target.value)} onBlur={finish} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label>;
}
