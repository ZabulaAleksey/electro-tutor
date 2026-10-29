import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import { parseBeam, serializeBeam, solveBeam, validateBeam, type BeamScheme, type BeamLoad, type BeamSupport } from "../models/beam";
import type { Language } from "../types";
import { beamCopy } from "./copy";
import { beamHistory, beamPreset, initialHistory, moveBeamItem, resizeBeam, reverseLoad, type BeamPreset } from "./state";
import { BeamDiagram, type BeamFactor } from "./BeamDiagram";
import { formatEngineeringNumber } from "../engineering/format";
import "./BeamLab.css";

const STORE = "electrotutor-beam-v1";
type AddKind = BeamLoad["kind"] | BeamSupport["kind"] | "uniform";
const presets: BeamPreset[] = ["simple", "left", "right", "fixed", "triangle", "continuous", "combined"];
function Numeric({ label, value, min = -1e9, max = 1e9, step = "any", onChange }: { label: string; value: number; min?: number; max?: number; step?: number | "any"; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(Number(value.toPrecision(10))));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(Number(value.toPrecision(10)))); setInvalid(false); }, [value]);
  return <label className="beam-number"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={draft} aria-invalid={invalid} onChange={e => { const text = e.target.value; setDraft(text); const n = Number(text); const bad = text.trim() === "" || !Number.isFinite(n) || n < min || n > max; setInvalid(bad); if (!bad) onChange(n); }} onBlur={() => { setDraft(String(Number(value.toPrecision(10)))); setInvalid(false); }} /></label>;
}

export default function BeamLab({ language = "ru" }: { language: Language }) {
  const c = beamCopy[language], [history, dispatch] = useReducer(beamHistory, undefined, () => initialHistory());
  const s = history.current, [ready, setReady] = useState(false), [selected, setSelected] = useState<string | null>("F1"), [unit, setUnit] = useState<"m" | "cm" | "mm">("m"), [cursor, setCursor] = useState(2), [side, setSide] = useState<"left" | "right">("right"), [visible, setVisible] = useState<Record<BeamFactor, boolean>>({ N: true, Q: true, M: true }), [reactions, setReactions] = useState(true), [values, setValues] = useState(true), [zoom, setZoom] = useState(1), [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null), drawingViewport = useRef<HTMLDivElement>(null);
  const pendingZoom = useRef<{left:number;top:number;scrollY:boolean}|null>(null);
  useLayoutEffect(() => {
    const pending = pendingZoom.current, viewport = drawingViewport.current?.querySelector<HTMLElement>(".beam-scroll");
    if (pending && viewport) { viewport.scrollLeft = pending.left; if (pending.scrollY) window.scrollBy({top:pending.top,behavior:"instant"}); pendingZoom.current = null; }
  }, [zoom]);
  const factor = unit === "m" ? 1 : unit === "cm" ? 100 : 1000;
  useEffect(() => setReady(true), []);
  const result = useMemo(() => solveBeam(s), [s]), solution = result.status === "ok" ? result : null;
  const num = (n: number) => formatEngineeringNumber(n, language, { maximumFractionDigits: 4 });
  const at = Math.min(s.length, cursor), load = s.loads.find(l => l.id === selected), support = s.supports.find(a => a.id === selected);
  function commit(next: BeamScheme) { try { dispatch({ type: "commit", value: validateBeam(next) }); setMessage(""); } catch { setMessage(c.invalid); } }
  function updateLoad(next: BeamLoad) { commit({ ...s, loads: s.loads.map(l => l.id === next.id ? next : l) }); }
  function remove(id: string) { commit({ ...s, supports: s.supports.filter(a => a.id !== id), loads: s.loads.filter(l => l.id !== id) }); setSelected(null); }
  function add(kind: string, x = s.length / 2) {
    const id = `${kind === "force" ? "F" : kind === "axial" ? "N" : kind === "moment" ? "M" : kind === "distributed" || kind === "uniform" ? "q" : "A"}${crypto.randomUUID().slice(0, 6)}`;
    if (["fixed", "pin", "roller"].includes(kind)) {
      if (s.supports.length >= 12) { setMessage(c.limits); return; }
      const place = s.supports.some(a => Math.abs(a.x - x) < s.length * 1e-7) ? Math.min(s.length, x + s.length / 12) : x;
      commit({ ...s, supports: [...s.supports, { id, kind: kind as BeamSupport["kind"], x: place }] });
    } else {
      if (s.loads.length >= 32) { setMessage(c.limits); return; }
      let next: BeamLoad;
      if (kind === "distributed" || kind === "uniform") { const start = Math.min(x, s.length * .8); next = { id, kind: "distributed", start, end: Math.min(s.length, start + s.length / 3), q0: kind === "uniform" ? -3000 : 0, q1: -3000 }; }
      else if (["force", "axial", "moment"].includes(kind)) next = { id, kind: kind as "force" | "axial" | "moment", x, value: kind === "force" ? -10000 : 5000 };
      else return;
      commit({ ...s, loads: [...s.loads, next] });
    }
    setSelected(id);
  }
  function save() {
    const text = serializeBeam(s), url = URL.createObjectURL(new Blob([text], { type: "application/json" })), link = document.createElement("a"); link.href = url; link.download = "ElectroTutor-beam.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { localStorage.setItem(STORE, text); setMessage(c.saved); } catch { setMessage(c.savedFile); }
  }
  function applyImport(text: string) { try { const next = parseBeam(text); commit(next); setSelected(null); setCursor(Math.min(cursor, next.length)); setMessage(c.loaded); } catch { setMessage(c.importError); } }
  async function importFile(e: ChangeEvent<HTMLInputElement>) { const chosen = e.target.files?.[0]; e.target.value = ""; if (!chosen) return; if (chosen.size > 200000) { setMessage(c.importError); return; } try { applyImport(await chosen.text()); } catch { setMessage(c.importError); } }
  function restore() { try { const text = localStorage.getItem(STORE); if (!text) setMessage(c.storageError); else applyImport(text); } catch { setMessage(c.storageError); } }
  function zoomBy(multiplier: number, anchor?: {x:number;y:number}) {
    const next = Math.max(.75, Math.min(3, zoom * multiplier)), ratio = next / zoom;
    const viewport = drawingViewport.current?.querySelector<HTMLElement>(".beam-scroll"), svg = viewport?.querySelector("svg"), rect = svg?.getBoundingClientRect();
    const oldScroll = viewport?.scrollLeft ?? 0, px = rect && anchor ? anchor.x / 1000 * rect.width : oldScroll + (viewport?.clientWidth ?? 0) / 2, py = svg && rect && anchor ? anchor.y / svg.viewBox.baseVal.height * rect.height : 0;
    if (next === zoom) return;
    pendingZoom.current = {left:oldScroll + px * (ratio - 1),top:py * (ratio - 1),scrollY:!!anchor};
    setZoom(next);
  }
  function preset(name: BeamPreset) { const next = beamPreset(name); commit(next); setSelected(next.loads[0]?.id ?? null); setCursor(next.length / 2); setZoom(1); }
  const kindLabel: Record<AddKind, string> = { force: c.force, axial: c.axial, moment: c.moment, distributed: c.distributed, uniform: c.uniform, fixed: c.clamp, pin: c.pin, roller: c.roller };
  const inline = <><strong>{selected}</strong>{load ? <>
    {load.kind === "distributed" ? <div className="beam-inline-row"><Numeric label="q₀, kN/m" value={load.q0 / 1000} max={1e6} min={-1e6} onChange={v => updateLoad({ ...load, q0: v * 1000 })} /><Numeric label="q₁, kN/m" value={load.q1 / 1000} max={1e6} min={-1e6} onChange={v => updateLoad({ ...load, q1: v * 1000 })} /></div> : <Numeric label={`${load.kind === "moment" ? "M₀, kN·m" : load.kind === "axial" ? "Fx, kN" : "Fy, kN"}`} value={load.value / 1000} max={1e6} min={-1e6} onChange={v => updateLoad({ ...load, value: v * 1000 })} />}
    <div className="beam-inline-actions"><button type="button" aria-label={c.reverse} title={c.reverse} onClick={() => updateLoad(reverseLoad(load))}>⇅</button><button type="button" aria-label={`${c.remove} ${load.id}`} onClick={() => remove(load.id)}>×</button></div>
  </> : support ? <><Numeric label={`${c.coordinate}, ${unit}`} value={support.x * factor} min={0} max={s.length * factor} onChange={v => commit(moveBeamItem(s, support.id, v / factor))} /><div className="beam-inline-actions"><button type="button" aria-label={`${c.remove} ${support.id}`} onClick={() => remove(support.id)}>×</button></div></> : null}</>;
  const quantities = solution?.sample(at, side);
  return <section className="beam-lab" data-beam-lab data-ready={ready} data-solver-status={result.status}>
    <fieldset className="beam-ready" disabled={!ready}>
      <div className="beam-toolbar"><Numeric label={`${c.length}, ${unit}`} value={s.length * factor} min={.01 * factor} max={10000 * factor} onChange={v => commit(resizeBeam(s, v / factor))} /><label>{c.unit}<select aria-label={c.unit} value={unit} onChange={e => setUnit(e.target.value as typeof unit)}><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select></label><label>{c.preset}<select aria-label={c.preset} value="" onChange={e => { if (e.target.value) preset(e.target.value as BeamPreset); }}><option value="">—</option>{presets.map(key => <option key={key} value={key}>{c[key]}</option>)}</select></label>
        <button type="button" onClick={() => preset("simple")}>{c.reset}</button><button type="button" disabled={!history.past.length || !!history.origin} onClick={() => dispatch({ type: "undo" })}>{c.undo}</button><button type="button" disabled={!history.future.length || !!history.origin} onClick={() => dispatch({ type: "redo" })}>{c.redo}</button>
      </div>
      <div className="beam-palette" aria-label={c.add}>{(["force", "moment", "uniform", "distributed", "axial", "pin", "roller", "fixed"] as AddKind[]).map(kind => <button key={kind} type="button" draggable onDragStart={e => { e.dataTransfer.setData("application/x-electrotutor-beam", kind); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => add(kind)}>{kindLabel[kind]} +</button>)}</div>
      <p className="beam-help">{c.instructions}</p>
      <div className="beam-view-controls">{(["N", "Q", "M"] as BeamFactor[]).map(f => <label key={f}><input type="checkbox" checked={visible[f]} onChange={e => setVisible(v => ({ ...v, [f]: e.target.checked }))} />{f}(x)</label>)}<label><input type="checkbox" checked={reactions} onChange={e => setReactions(e.target.checked)} />{c.reactions}</label><label><input type="checkbox" checked={values} onChange={e => setValues(e.target.checked)} />{c.values}</label><button type="button" aria-label={c.zoomOut} onClick={() => zoomBy(.8)}>−</button><output data-beam-zoom>{num(zoom * 100)}%</output><button type="button" aria-label={c.zoomIn} onClick={() => zoomBy(1.25)}>+</button><button type="button" onClick={() => { setZoom(1); drawingViewport.current?.querySelector(".beam-scroll")?.scrollTo({ left: 0 }); }}>{c.auto}</button></div>
      {result.status !== "ok" && <p role="alert" className="beam-error">{result.status === "unstable" ? c.unstable : c.invalid}</p>}
      {!s.loads.length && <p role="status">{c.noLoad}</p>}
      <div ref={drawingViewport}><BeamDiagram scheme={s} result={solution} language={language} copy={c} selected={selected} onSelect={setSelected} onDragStart={() => dispatch({ type: "start" })} onDrag={(id, x, end) => { try { dispatch({ type: "preview", value: validateBeam(moveBeamItem(s, id, x, end)) }); } catch { /* Invalid coincident support is retained only as a visible error, never solved with guessed reactions. */ } }} onDragFinish={() => dispatch({ type: "finish" })} onDragCancel={() => dispatch({ type: "cancel" })} cursor={at} onCursor={setCursor} side={side} factors={(["N", "Q", "M"] as BeamFactor[]).filter(f => visible[f])} reactions={reactions} values={values} zoom={zoom} onZoom={zoomBy} onDrop={add} editor={inline} /></div>
      <div className="beam-section-values" aria-label={c.sectionValues}><Numeric label={`${c.cursor} x, ${unit}`} value={at * factor} min={0} max={s.length * factor} onChange={v => setCursor(v / factor)} /><label>{c.side}<select aria-label={c.side} value={side} onChange={e => setSide(e.target.value as typeof side)}><option value="left">{c.leftLimit}</option><option value="right">{c.rightLimit}</option></select></label>{quantities && (["N", "Q", "M"] as BeamFactor[]).map(f => <output key={f} data-beam-value={f}>{f} = {num(quantities[f] / 1000)} {f === "M" ? "kN·m" : "kN"}</output>)}</div>
      <div className="beam-detail-grid"><div className="beam-properties"><h2>{c.editProperties}</h2><div className="beam-element-list">{[...s.supports, ...s.loads].map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.id} · {kindLabel[item.kind]}</button>)}</div>
        {!load && !support && <p>{c.choose}</p>}
        {load && <div className="beam-property-fields"><strong>{load.id} · {kindLabel[load.kind]}</strong>{load.kind === "distributed" ? <><Numeric label={`${c.start}, ${unit}`} value={load.start * factor} min={0} max={(load.end - s.length * 1e-5) * factor} onChange={v => commit(moveBeamItem(s, load.id, v / factor))} /><Numeric label={`${c.end}, ${unit}`} value={load.end * factor} min={(load.start + s.length * 1e-5) * factor} max={s.length * factor} onChange={v => commit(moveBeamItem(s, load.id, v / factor, true))} /></> : <><Numeric label={`${c.coordinate}, ${unit}`} value={load.x * factor} min={0} max={s.length * factor} onChange={v => updateLoad({ ...load, x: v / factor })} /></>}<button type="button" onClick={() => updateLoad(reverseLoad(load))}>{c.reverse}</button><button type="button" onClick={() => remove(load.id)}>{c.remove}</button></div>}
        {support && <div className="beam-property-fields"><strong>{support.id}</strong><label>{c.supportType}<select aria-label={c.supportType} value={support.kind} onChange={e => commit({ ...s, supports: s.supports.map(a => a.id === support.id ? { ...a, kind: e.target.value as BeamSupport["kind"] } : a) })}><option value="fixed">{c.clamp}</option><option value="pin">{c.pin}</option><option value="roller">{c.roller}</option></select></label><button type="button" onClick={() => remove(support.id)}>{c.remove}</button></div>}
        <div className="beam-end-conditions">{[0, s.length].map((end, i) => { const a = s.supports.find(p => p.x === end); return <label key={i}>{c.endCondition} {i ? "L" : "0"}<select aria-label={`${c.endCondition} ${i ? "L" : "0"}`} value={a?.kind ?? "free"} onChange={e => { const remaining = s.supports.filter(p => p.x !== end); commit({ ...s, supports: e.target.value === "free" ? remaining : [...remaining, { id: a?.id ?? `end-${i}`, kind: e.target.value as BeamSupport["kind"], x: end }] }); }}><option value="free">{c.free}</option><option value="fixed">{c.clamp}</option><option value="pin">{c.pin}</option><option value="roller">{c.roller}</option></select></label>; })}</div>
      </div><div className="beam-segments"><h2>{c.segments}</h2>{s.segments.map((g, i) => <div key={i} className="beam-segment-editor"><strong>{num(g.start * factor)}–{num(g.end * factor)} {unit}</strong><Numeric label={`EI${i + 1}, MN·m²`} value={g.EI / 1e6} min={.000001} max={1e6} onChange={v => commit({ ...s, segments: s.segments.map((p, k) => k === i ? { ...p, EI: v * 1e6 } : p) })} /><Numeric label={`EA${i + 1}, MN`} value={g.EA / 1e6} min={.000001} max={1e9} onChange={v => commit({ ...s, segments: s.segments.map((p, k) => k === i ? { ...p, EA: v * 1e6 } : p) })} />{i < s.segments.length - 1 && <Numeric label={`x${i + 1}, ${unit}`} value={g.end * factor} min={(g.start + s.length * 1e-5) * factor} max={(s.segments[i + 1].end - s.length * 1e-5) * factor} onChange={v => commit({ ...s, segments: s.segments.map((p, k) => k === i ? { ...p, end: v / factor } : k === i + 1 ? { ...p, start: v / factor } : p) })} />}<button type="button" disabled={s.segments.length >= 16} onClick={() => { const mid = (g.start + g.end) / 2; commit({ ...s, segments: [...s.segments.slice(0, i), { ...g, end: mid }, { ...g, start: mid }, ...s.segments.slice(i + 1)] }); }}>{c.split}</button>{i > 0 && <button type="button" onClick={() => commit({ ...s, segments: [...s.segments.slice(0, i - 1), { ...s.segments[i - 1], end: g.end }, ...s.segments.slice(i + 1)] })}>{c.join}</button>}</div>)}</div></div>
      {solution && <><div className="beam-reaction-table" hidden={!reactions}><table><caption>{c.reactions}</caption><thead><tr><th>{c.supports}</th><th>x, m</th><th>Rx, kN</th><th>Ry, kN</th><th>M, kN·m</th></tr></thead><tbody>{solution.reactions.map(r => <tr key={r.id}><th>{r.id}</th><td>{num(r.x)}</td><td data-reaction={`${r.id}-Fx`}>{num(r.Fx / 1000)}</td><td data-reaction={`${r.id}-Fy`}>{num(r.Fy / 1000)}</td><td data-reaction={`${r.id}-M`}>{num(r.M / 1000)}</td></tr>)}</tbody></table></div>
        <details className="beam-diagnostics"><summary>{c.zero} / {c.extrema} / {c.residual}</summary>{(["N", "Q", "M"] as BeamFactor[]).map(f => <p key={f}><strong>{f}: </strong>{c.zero}: {solution.zeros[f].length ? solution.zeros[f].map(n => `${num(n)} m`).join("; ") : c.noZeros}. {c.extrema}: {solution.extrema[f].slice(0, 30).map(p => `x=${num(p.x)} m → ${num(p.value / 1000)} ${f === "M" ? "kN·m" : "kN"}`).join("; ")}</p>)}<p>{c.residual}: Fx={num(solution.residuals.Fx)} N; Fy={num(solution.residuals.Fy)} N; M={num(solution.residuals.M)} N·m. {c.compatibility}: {num(solution.residuals.compatibility)}</p></details></>}
      <div className="beam-file-actions"><button type="button" onClick={save}>{c.save}</button><button type="button" onClick={() => file.current?.click()}>{c.load}</button><button type="button" onClick={restore}>{c.restore}</button><input ref={file} type="file" accept="application/json,.json" aria-label={c.load} hidden onChange={importFile} /></div>
      <p role="status" className="beam-message">{message}</p><p className="beam-help">{c.exportNote}</p><details className="beam-theory"><summary>Euler–Bernoulli · SI · N/Q/M</summary><p>{c.sign}</p><p>{c.theory}</p></details>
    </fieldset>
  </section>;
}
