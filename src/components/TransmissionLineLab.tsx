import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Language } from "../types";
import { drawSpatial } from "../transient/canvas";
import { lineCopy } from "../transient/copy";
import { D, OPEN_PRESET, type LoadKind, type TransientConfig, type WorkerCommand, type WorkerReply } from "../transient/types";
import "./TransmissionLineLab.css";

type Snapshot = Extract<WorkerReply, { type: "snapshot" }>;
type Status = { time: number; step: number; sourceV: number; sourceI: number; loadV: number; loadI: number; energy: number;
  minV: number; maxV: number; minI: number; maxI: number; capV: number; indI: number;
  copyMs: number; transferMs: number; frameMs: number; stepsPerSecond: number };

const presets = {
  open: { ...OPEN_PRESET.load, kind: "open" },
  matched: { ...OPEN_PRESET.load, kind: "r", resistanceOhm: 50 },
  short: { ...OPEN_PRESET.load, kind: "short" },
  c: { ...OPEN_PRESET.load, kind: "c", capacitanceF: 1e-5 },
  l: { ...OPEN_PRESET.load, kind: "l", inductanceH: 0.02 },
} as const;

function field(label: string, value: number, set: (value: number) => void, min: number, max: number, step = "any") {
  return <label className="line-field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step}
    onChange={event => set(Number(event.currentTarget.value))} /></label>;
}

const fmt = (value: number, digits = 4) => Number.isFinite(value) ? Number(value.toPrecision(digits)).toString() : "—";

export default function TransmissionLineLab({ language }: { language: Language }) {
  const t = lineCopy(language);
  const [draft, setDraft] = useState<TransientConfig>(OPEN_PRESET);
  const [applied, setApplied] = useState<TransientConfig>(OPEN_PRESET);
  const [stopMs, setStopMs] = useState(20);
  const [seekMs, setSeekMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [hover, setHover] = useState<{ x: number; v: number; i: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const voltageCanvas = useRef<HTMLCanvasElement>(null);
  const currentCanvas = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<Snapshot | null>(null);
  const latestRef = useRef<Snapshot | null>(null);
  const transferRef = useRef(0);
  const make = (command: WorkerCommand) => workerRef.current?.postMessage(command);

  useEffect(() => {
    const worker = new Worker(new URL("../transient/transient.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === "error") { setMessage(reply.message); setBusy(false); setRunning(false); return; }
      if (reply.type === "busy") { setBusy(reply.busy); return; }
      transferRef.current = performance.timeOrigin + performance.now() - reply.postedAt;
      pendingRef.current = reply;
      if (frameRef.current !== null) return;
      const paint = () => {
        frameRef.current = null;
        const frame = pendingRef.current;
        pendingRef.current = null;
        if (!frame) return;
        latestRef.current = frame;
        const styles = getComputedStyle(document.documentElement);
        const common = { zero: styles.getPropertyValue("--line-zero").trim() || "#9ca3af",
          grid: styles.getPropertyValue("--line-grid").trim() || "#d1d5db",
          ink: styles.getPropertyValue("--line-ink").trim() || "#22303a" };
        if (voltageCanvas.current) drawSpatial(voltageCanvas.current, frame.voltages,
          { ...common, title: t.scopeV, unit: "В", color: "#dc564e" });
        if (currentCanvas.current) drawSpatial(currentCanvas.current, frame.currents,
          { ...common, title: t.scopeI, unit: "А", color: "#167cbd" });
        const d = frame.diagnostics;
        setStatus({ time: d[D.time], step: d[D.step], sourceV: d[D.sourceVoltage], sourceI: d[D.sourceCurrent],
          loadV: d[D.loadVoltage], loadI: d[D.loadCurrent], energy: d[D.lineEnergy] + d[D.deviceEnergy],
          minV: d[D.minVoltage], maxV: d[D.maxVoltage], minI: d[D.minCurrent], maxI: d[D.maxCurrent],
          capV: d[D.capacitorVoltage], indI: d[D.inductorCurrent],
          copyMs: frame.copyMs, transferMs: transferRef.current,
          frameMs: performance.timeOrigin + performance.now() - frame.postedAt, stepsPerSecond: frame.stepsPerSecond });
        setRunning(frame.running);
        worker.postMessage({ type: "ack" } satisfies WorkerCommand);
      };
      frameRef.current = requestAnimationFrame(paint);
    };
    worker.postMessage({ type: "configure", config: OPEN_PRESET, stopTimeS: 0.02 } satisfies WorkerCommand);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); worker.terminate(); workerRef.current = null; };
  }, [t.scopeV, t.scopeI]);

  const edit = (section: keyof TransientConfig, key: string, value: number | string) => {
    setDraft(previous => ({ ...previous, [section]: { ...previous[section], [key]: value } }));
  };
  const hasR = (["r", "rl", "rc", "rlc"] as string[]).includes(draft.load.kind);
  const hasL = (["l", "rl", "rlc"] as string[]).includes(draft.load.kind);
  const hasC = (["c", "rc", "rlc"] as string[]).includes(draft.load.kind);
  const ready = Number.isFinite(draft.source.voltageV) && draft.source.voltageV >= 0
    && Number.isFinite(draft.source.resistanceOhm) && draft.source.resistanceOhm >= 0
    && Number.isFinite(draft.source.switchTimeS) && draft.source.switchTimeS >= 0
    && draft.line.lengthM > 0 && draft.line.lengthM <= 1e10
    && draft.line.velocityMS > 0 && draft.line.velocityMS <= 3e8
    && draft.line.impedanceOhm > 0 && draft.line.impedanceOhm <= 1e6
    && Number.isInteger(draft.line.cells) && draft.line.cells >= 20 && draft.line.cells <= 10000
    && draft.line.cfl > 0 && draft.line.cfl <= 0.95
    && (!hasR || draft.load.resistanceOhm > 0)
    && (!hasL || draft.load.inductanceH > 0)
    && (!hasC || draft.load.capacitanceF > 0)
    && Number.isFinite(stopMs) && stopMs > 0;
  const dx = draft.line.lengthM / draft.line.cells;
  const dt = draft.line.cfl * dx / draft.line.velocityMS;
  const lPrime = draft.line.impedanceOhm / draft.line.velocityMS;
  const cPrime = 1 / (draft.line.impedanceOhm * draft.line.velocityMS);
  const onPlotMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const snapshot = latestRef.current;
    if (!snapshot) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - 49) / Math.max(1, bounds.width - 66)));
    const v = snapshot.voltages[Math.round(fraction * (snapshot.voltages.length - 1))];
    const i = snapshot.currents[Math.round(fraction * (snapshot.currents.length - 1))];
    setHover({ x: fraction * applied.line.lengthM, v, i });
  };

  return <div className="line-lab">
    <p className="line-help">{t.help}</p>
    <div className="line-presets" aria-label={t.load}>
      {(["open", "matched", "short", "c", "l"] as const).map(key =>
        <button type="button" key={key} onClick={() => setDraft(previous => ({ ...previous, load: presets[key] }))}>{t[`preset${key[0].toUpperCase()}${key.slice(1)}` as keyof typeof t]}</button>)}
    </div>
    <section className="line-transport" aria-label={t.controls}>
      <h2>{t.controls}</h2>
      <div className="line-buttons">
        <button type="button" disabled={busy} onClick={() => make({ type: running ? "pause" : "play", speed, stopTimeS: stopMs / 1000 })}>{running ? t.pause : t.play}</button>
        <button type="button" disabled={busy} onClick={() => make({ type: "reset" })}>{t.reset}</button>
        <button type="button" disabled={busy} onClick={() => make({ type: "step" })}>{t.step}</button>
      </div>
      <div className="line-transport-fields">
        {field(t.stop, stopMs, setStopMs, 0.001, 1000)}
        <label className="line-field"><span>{t.speed}: {speed}×</span><input type="range" min="0.1" max="100" step="0.1" value={speed} onChange={event => setSpeed(Number(event.currentTarget.value))} /></label>
        {field(t.seek, seekMs, setSeekMs, 0, stopMs)}
        <button type="button" disabled={busy || !Number.isFinite(seekMs) || seekMs < 0} onClick={() => make({ type: "seek", targetS: seekMs / 1000 })}>{t.seek}</button>
      </div>
      <p aria-live="polite">{busy ? t.busy : message || t.valid}</p>
    </section>
    <section className="line-plots" aria-label={t.plots}><h2>{t.plots}</h2>
      <p className="line-schematic" aria-label={t.schematic}><span>{t.source}</span><span>→</span><span>{t.line}</span><span>→</span><span>{t.load}</span></p>
      <canvas ref={voltageCanvas} height="220" role="img" aria-label={t.scopeV} onPointerMove={onPlotMove} onPointerLeave={() => setHover(null)} />
      <canvas ref={currentCanvas} height="220" role="img" aria-label={t.scopeI} onPointerMove={onPlotMove} onPointerLeave={() => setHover(null)} />
      <p className="line-hover">{t.hover}: {hover ? `x=${fmt(hover.x / 1000)} км, U=${fmt(hover.v)} В, I=${fmt(hover.i)} А` : "—"}</p>
    </section>
    <div className="line-bottom">
      <section className="line-diagnostics"><h2>{t.diagnostics}</h2>
        <dl><div><dt>{t.time}</dt><dd>{fmt((status?.time ?? 0) * 1000)} мс</dd></div>
          <div><dt>{t.stepIndex}</dt><dd>{status?.step ?? 0}</dd></div>
          <div><dt>{t.sourcePort}</dt><dd>{fmt(status?.sourceV ?? 0)} В / {fmt(status?.sourceI ?? 0)} А</dd></div>
          <div><dt>{t.loadPort}</dt><dd>{fmt(status?.loadV ?? 0)} В / {fmt(status?.loadI ?? 0)} А</dd></div>
          <div><dt>{t.energy}</dt><dd>{fmt(status?.energy ?? 0)} Дж</dd></div></dl>
        <p>{t.extent}: {fmt(status?.minV ?? 0)}…{fmt(status?.maxV ?? 0)} В / {fmt(status?.minI ?? 0)}…{fmt(status?.maxI ?? 0)} А</p>
        <p>{t.loadState}: U_C={fmt(status?.capV ?? 0)} В, I_L={fmt(status?.indI ?? 0)} А</p>
      </section>
      <section className="line-derived"><h2>{t.derived}</h2>
        <dl><div><dt>L′ / C′</dt><dd>{fmt(lPrime)} Гн/м / {fmt(cPrime)} Ф/м</dd></div>
          <div><dt>{t.spacing}</dt><dd>{fmt(dx)} м</dd></div>
          <div><dt>{t.timeStep}</dt><dd>{fmt(dt * 1e6)} мкс</dd></div>
          <div><dt>CFL / {t.travel}</dt><dd>{fmt(draft.line.cfl)} / {fmt(draft.line.lengthM / draft.line.velocityMS * 1000)} мс</dd></div></dl>
      </section>
    </div>
    {import.meta.env.DEV && <details className="line-performance"><summary>{t.performance}</summary>
      <dl><div><dt>{t.memory}</dt><dd>{fmt((2 * applied.line.cells + 1) * 8 / 1024)} КиБ + сетка</dd></div>
        <div><dt>{t.compute}</dt><dd>{fmt(status?.stepsPerSecond ?? 0)} шаг/с</dd></div>
        <div><dt>{t.copy}</dt><dd>{fmt(status?.copyMs ?? 0)} мс</dd></div>
        <div><dt>{t.transfer}</dt><dd>{fmt(status?.transferMs ?? 0)} мс</dd></div>
        <div><dt>{t.frame}</dt><dd>{fmt(status?.frameMs ?? 0)} мс</dd></div></dl></details>}
    <section className="line-parameters"><h2>{t.source}, {t.line}, {t.load}</h2>
      <div className="line-groups">
        <fieldset><legend>{t.source}</legend>
          {field(t.voltage, draft.source.voltageV, v => edit("source", "voltageV", v), 0, 1e6)}
          {field(t.resistance, draft.source.resistanceOhm, v => edit("source", "resistanceOhm", v), 0, 1e9)}
          {field(t.switchTime, draft.source.switchTimeS * 1000, v => edit("source", "switchTimeS", v / 1000), 0, 1000)}
        </fieldset>
        <fieldset><legend>{t.line}</legend>
          {field(t.length, draft.line.lengthM / 1000, v => edit("line", "lengthM", v * 1000), 0.001, 1e6)}
          {field(t.velocity, draft.line.velocityMS / 1000, v => edit("line", "velocityMS", v * 1000), 0.001, 1e6)}
          {field(t.impedance, draft.line.impedanceOhm, v => edit("line", "impedanceOhm", v), 0.001, 1e6)}
          {field(t.cells, draft.line.cells, v => edit("line", "cells", v), 20, 10000, "1")}
          {field(t.cfl, draft.line.cfl, v => edit("line", "cfl", v), 0.01, 0.95, "0.01")}
        </fieldset>
        <fieldset><legend>{t.load}</legend>
          <label className="line-field"><span>{t.kind}</span><select value={draft.load.kind} onChange={event => edit("load", "kind", event.currentTarget.value as LoadKind)}>
            {(["open", "short", "r", "l", "c", "rl", "rc", "rlc"] as const).map(kind => <option key={kind} value={kind}>{({ open: t.openLoad, short: t.shortLoad, r: t.resistive, l: t.inductive, c: t.capacitive, rl: "RL", rc: "RC", rlc: "RLC" })[kind]}</option>)}
          </select></label>
          {(["rl", "rc", "rlc"] as string[]).includes(draft.load.kind) && <label className="line-field"><span>{t.topology}</span><select value={draft.load.topology} onChange={event => edit("load", "topology", event.currentTarget.value)}><option value="series">{t.series}</option><option value="parallel">{t.parallel}</option></select></label>}
          {hasR && field(t.r, draft.load.resistanceOhm, v => edit("load", "resistanceOhm", v), 0.001, 1e9)}
          {hasL && field(t.l, draft.load.inductanceH * 1000, v => edit("load", "inductanceH", v / 1000), 0.001, 1e9)}
          {hasC && field(t.c, draft.load.capacitanceF * 1e6, v => edit("load", "capacitanceF", v / 1e6), 0.001, 1e9)}
          {hasC && field(t.initialV, draft.load.initialVoltageV, v => edit("load", "initialVoltageV", v), -1e6, 1e6)}
          {hasL && field(t.initialI, draft.load.initialCurrentA, v => edit("load", "initialCurrentA", v), -1e6, 1e6)}
        </fieldset>
      </div>
      <button type="button" disabled={!ready || busy} onClick={() => { setMessage(""); setApplied(draft); make({ type: "configure", config: draft, stopTimeS: stopMs / 1000 }); }}>{t.apply}</button>
      {!ready && <p role="alert">{t.error}</p>}
    </section>
  </div>;
}
