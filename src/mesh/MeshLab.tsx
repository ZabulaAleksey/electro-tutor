import { LAB_CONTEXT_KEY, parseLabContext } from "./lab-context";
import { useEffect, useState } from "react";
import Formula from "../components/Formula";
import { meshPreset, solveMesh, type MeshExample } from "../models/mesh-current";
import { localePath } from "../site-path";
import MeshLabScheme from "./MeshLabScheme";
import { copy, errors } from "./ru";
import { formatMeshReading, makeDraft, meshLatex, parameterKeys, parameters, parseValue, unitFor } from "./presentation";
import "./mesh-lab.css";
const base = "/topics/dc/mesh-current-method/";
export default function MeshLab({persistContext=false,showMaterialLinks=true}: {persistContext?:boolean;showMaterialLinks?:boolean}) {
  const [example, setExample] = useState<MeshExample>(1), [draft, setDraft] = useState(makeDraft(meshPreset(1))), [active, setActive] = useState("R1"), [loop, setLoop] = useState(1), [ready, setReady] = useState(false), [unknown, setUnknown] = useState(false);
  useEffect(() => {
    const values = new URL(location.href).searchParams.getAll("example"), valid = values.length === 1 && /^[1-4]$/.test(values[0]);
    const initial = valid ? Number(values[0]) as MeshExample : 1;

    let saved=null;
    if(persistContext && !new URL(location.href).searchParams.has('reset'))try{saved=parseLabContext(sessionStorage.getItem(LAB_CONTEXT_KEY));}catch{/* Storage is optional. */}
    if(saved&&(values.length===0||(valid&&saved.example===initial))){setExample(saved.example);setDraft(saved.draft);setActive(saved.active);setLoop(saved.loop);}
    else {setExample(initial);setDraft(makeDraft(meshPreset(initial)));}
    if(persistContext){const url=new URL(location.href);url.searchParams.delete('reset');url.searchParams.set('example',String(saved&&(values.length===0||(valid&&saved.example===initial))?saved.example:initial));history.replaceState(history.state,'',url);}
    setUnknown(values.length > 0 && !valid); setReady(true);
  }, [persistContext]);
  useEffect(()=>{if(!persistContext||!ready)return;try{sessionStorage.setItem(LAB_CONTEXT_KEY,JSON.stringify({version:1,example,draft,active,loop}));}catch{/* Recalculation remains available. */}},[persistContext,ready,example,draft,active,loop]);
  const p = parameters(example, draft), result = solveMesh(p), ok = result.status === "ok" ? result : null, keys = parameterKeys(p), math = ok ? meshLatex(ok) : null;
  const choose = (id: MeshExample) => { setExample(id); setDraft(makeDraft(meshPreset(id))); setActive("R1"); setLoop(1); setUnknown(false); const url = new URL(location.href); url.searchParams.set("example", String(id)); history.replaceState(history.state, "", url); };
  const reset = () => { setDraft(makeDraft(meshPreset(example))); setActive("R1"); setLoop(1); };
  const reading = (v: number | undefined, unit: string) => v === undefined ? "—" : `${formatMeshReading(v)} ${unit}`;
  return <div className="mesh-lab" data-ready={ready}>
    {showMaterialLinks && <nav className="mesh-lab-links" aria-label={copy.navigation}><a href={localePath("ru", base)}>{copy.textbook}</a><a href={`${localePath("ru", `${base}examples/`)}#example-${example}`}>{copy.examples}</a></nav>}
    <h1 tabIndex={persistContext ? -1 : undefined}>{copy.title}</h1><p className="mesh-lab-intro">{copy.staticHint}</p>
    {unknown && <p role="status">{copy.unknown}</p>}
    <section className="mesh-workbench" aria-label={copy.workbench} data-testid="workbench">
      <div className="mesh-lab-controls">
        <div className="mesh-preset-row"><label htmlFor="mesh-preset">{copy.example}</label><select id="mesh-preset" data-testid="preset" disabled={!ready} value={example} onChange={e => choose(Number(e.target.value) as MeshExample)}>{copy.presets.map((s, k) => <option key={s} value={k + 1}>{s}</option>)}</select><button type="button" onClick={reset} disabled={!ready} title={copy.reset} aria-label={copy.reset}>↺</button></div>
        <div className="mesh-parameter-row"><label className="mesh-sr-only" htmlFor="mesh-parameter">{copy.parameter}</label><select id="mesh-parameter" data-testid="parameter" disabled={!ready} value={active} onChange={e => setActive(e.target.value)}>{keys.map(key => <option key={key} value={key}>{key} = {draft[key]} {unitFor(key)}</option>)}</select><label className="mesh-sr-only" htmlFor="mesh-value">{`${copy.value} ${active}, ${unitFor(active)}`}</label><input id="mesh-value" data-testid="parameter-value" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={32} disabled={!ready} value={draft[active]} aria-invalid={result.status === "error" ? true : undefined} aria-describedby="mesh-input-hint" onChange={e => setDraft({ ...draft, [active]: e.target.value })} /><span className="mesh-param-unit">{unitFor(active)}</span><button type="button" data-testid="reverse" aria-label={copy.reverse} title={copy.reverse} disabled={!ready || active.startsWith("R") || !Number.isFinite(parseValue(draft[active])) || parseValue(draft[active]) === 0} onClick={() => setDraft({ ...draft, [active]: String(-parseValue(draft[active])) })}>±</button></div>
      </div>
      <div className="mesh-workbench-body"><MeshLabScheme p={p} active={active} loop={loop} />
        <div className="mesh-live-readings" data-testid="live-readings">
          <p className="mesh-live-status" role="status" aria-live="polite">{ok ? `${ready ? copy.auto : copy.initial} · ${copy.verified}` : copy.unavailable}</p>
          {result.status === "error" && <p className="mesh-lab-error" role="alert" data-code={result.code}>{errors[result.code]}</p>}
          <div className="mesh-reading-group"><p>{copy.mesh}</p><div className="mesh-reading-grid">{Array.from({ length: example === 3 ? 3 : 2 }, (_, k) => <button type="button" className="mesh-loop-reading" data-loop={k + 1} aria-pressed={loop === k + 1} aria-label={`${copy.highlight} I${k + 1}`} disabled={!ready} key={k} onClick={() => setLoop(k + 1)}><span>I<sub>{k + 1}</sub></span><strong data-testid={`mesh-${k + 1}`}>{reading(ok?.mesh[k], "A")}</strong></button>)}</div></div>
          <div className="mesh-reading-group"><p>{copy.branches}</p><div className="mesh-reading-grid" data-testid="branches">{Array.from({ length: example === 3 ? 4 : 3 }, (_, k) => <div key={k}><span>i<sub>{k + 1}</sub></span><strong data-testid={`branch-${k + 1}`}>{reading(ok?.branch[k], "A")}</strong></div>)}</div></div>
          <div className="mesh-reading-group"><p>{copy.voltages}</p><div className="mesh-reading-grid">{p.r.map((_, k) => <div key={k}><span>U<sub>R{k + 1}</sub></span><strong data-testid={`voltage-${k + 1}`}>{reading(ok?.voltages[k], "V")}</strong></div>)}</div></div>
          <div className="mesh-summary"><span>{copy.balance}</span><strong data-testid="power-summary">{reading(ok?.generated, "W")} / {reading(ok?.absorbed, "W")}</strong><span>{copy.residual}</span><strong data-testid="residual-summary">{reading(ok ? ok.residuals.kcl : undefined, "A")} / {reading(ok?.residuals.kvl, "V")} / {reading(ok?.residuals.power, "W")}</strong>{example === 4 && <span>{copy.constraint}: <strong>{reading(ok?.residuals.constraint, "A")}</strong></span>}</div>
        </div>
      </div>
      <p className="mesh-direction-note">{ok?.branch.some(v => v < 0) ? copy.negative : copy.positive} <a href={`${localePath("ru", `${base}examples/`)}#example-${example}`}>{copy.original} №{example} ↗</a></p>
    </section>
    <p id="mesh-input-hint" className="mesh-input-hint">{copy.inputHint}</p>
    {!ready && <p className="mesh-nojs">{copy.noJS}</p>}
    <details className="mesh-lab-details" open><summary>{copy.details}</summary>{ok && math ? <>
      <h2>{copy.matrix}</h2><p>{copy.matrixHint}</p>
      <div className="mesh-math-scroll" tabIndex={0} aria-label={copy.matrixScroll}><Formula>{math.matrix}</Formula></div><div className="mesh-math-scroll"><Formula>{math.rhs}</Formula></div>
      {math.rows.map((row, k) => <div key={k} className="mesh-equation-row"><div className="mesh-math-scroll"><Formula>{row}</Formula></div><span>{ok.rowUnits[k]}</span></div>)}
      <p>{copy.nodalHint}</p><p>{copy.ohm}: {reading(ok.residuals.ohm, "A")}</p>
      <h2>{copy.power}</h2><p>{copy.powerHint}</p><table><thead><tr><th>{copy.element}</th><th>{copy.voltage}</th><th>{copy.absorbedPower}</th></tr></thead><tbody>{ok.resistorPower.map((power, k) => <tr key={`R${k}`}><th>R{k + 1}</th><td>{formatMeshReading(ok.voltages[k])}</td><td>{formatMeshReading(power)}</td></tr>)}{ok.sources.map(source => <tr key={source.id} data-source={source.id}><th>{source.id}</th><td>{formatMeshReading(source.voltage)}</td><td>{formatMeshReading(source.power)}</td></tr>)}</tbody></table>
      <p>{copy.sources}; V<sub>A</sub> = {reading(ok.nodeVoltage, "V")}{example === 4 && <>; {copy.sourceJ}: {reading(ok.nodeVoltage, "V")}; {copy.constraint}: {formatMeshReading(ok.residuals.constraint)}</>}.</p>
    </> : <p>{copy.unavailable}</p>}</details>
  </div>;
}
