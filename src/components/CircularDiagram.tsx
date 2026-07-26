import { useEffect, useMemo, useState } from "react";

type C = { re: number; im: number };
const polar = (m: number, d: number): C => ({ re: m * Math.cos(d * Math.PI / 180), im: m * Math.sin(d * Math.PI / 180) });
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: C, b: C): C => {
  const d = b.re ** 2 + b.im ** 2;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const abs = (z: C) => Math.hypot(z.re, z.im);
const arg = (z: C) => Math.atan2(z.im, z.re) * 180 / Math.PI;
const fmt = (n: number, d = 2) => Number(n.toFixed(d)).toString();

export default function CircularDiagram({ language }: { language: "ru" | "uk" }) {
  const ru = language === "ru";
  const [i0m, setI0m] = useState(1.5), [i0a, setI0a] = useState(-18);
  const [ikm, setIkm] = useState(8), [ika, setIka] = useState(-55);
  const [zm, setZm] = useState(4), [za, setZa] = useState(35);
  const [phi, setPhi] = useState(25), [position, setPosition] = useState(43);

  const model = useMemo(() => {
    const i0 = polar(i0m, i0a), ik = polar(ikm, ika), zout = polar(zm, za);
    const at = (r: number): C | null => {
      if (!Number.isFinite(r)) return i0;
      const denominator = add(zout, polar(r, phi));
      if (abs(denominator) < Math.max(1, abs(zout)) * 1e-9) return null;
      return add(i0, mul(sub(ik, i0), div(zout, denominator)));
    };
    const points: Array<C | null> = [at(0)];
    for (let n = 0; n <= 180; n++) points.push(at(zm * 10 ** (-3 + n / 30)));
    points.push(i0);
    const resistance = position >= 100 ? Infinity : zm * 10 ** (-3 + position / 100 * 6);
    const current = at(resistance);
    const plotLimit = Math.max(1, abs(i0), abs(ik)) * 12;
    const visible = points.filter((p): p is C => p !== null && abs(p) <= plotLimit);
    const extent = Math.max(1, ...visible.flatMap(p => [Math.abs(p.re), Math.abs(p.im)]), abs(ik)) * 1.18;
    const scale = Math.min(612 / (extent * 2), 412 / (extent * 2));
    const xy = (p: C) => ({ x: 360 + p.re * scale, y: 260 - p.im * scale });
    let drawing = false;
    const path = points.map((p) => {
      if (p === null || abs(p) > plotLimit) { drawing = false; return ""; }
      const q = xy(p), command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
    }).join(" ");
    return { i0, ik, current, resistance, extent, xy, path };
  }, [i0m, i0a, ikm, ika, zm, za, phi, position]);

  const vectors = [
    { id: "idle", label: "I₀", value: model.i0 },
    { id: "short", label: "Iк", value: model.ik },
    ...(model.current ? [{ id: "active", label: "I(R)", value: model.current }] : []),
  ];
  const step = model.extent <= 3 ? 1 : model.extent <= 8 ? 2 : 5, ticks: number[] = [];
  for (let n = -Math.floor(model.extent / step) * step; n <= model.extent; n += step) ticks.push(n);

  return <section className="circle-lab">
    <div className="circle-lab-heading">
      <div><span className="section-kicker">{ru ? "КРУГОВАЯ ДИАГРАММА" : "КОЛОВА ДІАГРАМА"}</span><h2>{ru ? "Годограф тока четырёхполюсника" : "Годограф струму чотириполюсника"}</h2></div>
      <p>{ru ? "Конец вектора тока движется по дуге от Iк к I₀." : "Кінець вектора струму рухається дугою від Iк до I₀."}</p>
    </div>
    <div className="circle-lab-layout">
      <div className="circle-controls">
        <Group title={ru ? "Ток холостого хода I₀" : "Струм холостого ходу I₀"}><Field label="Модуль, А" value={i0m} min={0} step={.1} set={setI0m}/><Field label={ru ? "Угол, °" : "Кут, °"} value={i0a} step={1} set={setI0a}/></Group>
        <Group title={ru ? "Ток короткого замыкания Iк" : "Струм короткого замикання Iк"}><Field label="Модуль, А" value={ikm} min={0} step={.1} set={setIkm}/><Field label={ru ? "Угол, °" : "Кут, °"} value={ika} step={1} set={setIka}/></Group>
        <Group title={ru ? "Выход и нагрузка" : "Вихід і навантаження"}><Field label={ru ? "|Zвых|, Ом" : "|Zвих|, Ом"} value={zm} min={.01} step={.1} set={setZm}/><Field label={ru ? "∠Zвых, °" : "∠Zвих, °"} value={za} min={-90} max={90} step={1} set={setZa}/><Field label={ru ? "Угол нагрузки φ, °" : "Кут навантаження φ, °"} value={phi} min={-90} max={90} step={1} set={setPhi}/></Group>
        <label className="resistance-control"><span>{ru ? "Сопротивление нагрузки R" : "Опір навантаження R"}<strong>{Number.isFinite(model.resistance) ? `${fmt(model.resistance)} Ом` : "∞"}</strong></span><input type="range" min="0" max="100" step=".2" value={position} onChange={e => setPosition(Number(e.target.value))}/><small><span>0</span><span>|Z|</span><span>∞</span></small></label>
      </div>
      <div className="circle-plot">
        <svg viewBox="0 0 720 520" role="img" aria-label={ru ? "Круговая диаграмма токов" : "Колова діаграма струмів"}>
          <defs>{vectors.map(v => <marker id={`arrow-${v.id}`} key={v.id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" className={`arrow-head ${v.id}`}/></marker>)}</defs>
          <g className="plot-grid">{ticks.map(t => { const x = model.xy({ re: t, im: 0 }).x, y = model.xy({ re: 0, im: t }).y; return <g key={t}><line x1={x} y1="25" x2={x} y2="495"/><line x1="25" y1={y} x2="695" y2={y}/>{t !== 0 && <><text x={x + 5} y="277">{t}</text><text x="367" y={y - 6}>{t}</text></>}</g>; })}</g>
          <g className="plot-axes"><line x1="25" y1="260" x2="695" y2="260"/><line x1="360" y1="25" x2="360" y2="495"/><text x="640" y="247">Re I, A</text><text x="370" y="38">Im I, A</text></g>
          <path d={model.path} className="current-locus"/>
          {vectors.map(v => { const p = model.xy(v.value); return <g className={`current-vector ${v.id}`} key={v.id}><line x1="360" y1="260" x2={p.x} y2={p.y} markerEnd={`url(#arrow-${v.id})`}/><circle cx={p.x} cy={p.y} r={v.id === "active" ? 6 : 4}/><text x={p.x + 10} y={p.y - 10}>{v.label}</text></g>; })}
        </svg>
        <div className="circle-readout" aria-live="polite">
          {vectors.map(v => <span key={v.id}><b>{v.label}</b> = {fmt(abs(v.value))}∠{fmt(arg(v.value), 1)}° A</span>)}
          {!model.current && <span className="singularity-note"><b>I(R) → ∞</b> — {ru ? "идеальная резонансная точка: Zвых + Zн = 0" : "ідеальна резонансна точка: Zвих + Zн = 0"}</span>}
        </div>
      </div>
    </div>
  </section>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset><legend>{title}</legend>{children}</fieldset>;
}

function Field({ label, value, min, max, step, set }: { label: string; value: number; min?: number; max?: number; step: number; set: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const update = (raw: string) => {
    setDraft(raw);
    if (raw === "" || raw === "-" || raw === "+" || raw === "." || raw === "-.") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const limited = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    set(limited);
    if (limited !== parsed) setDraft(String(limited));
  };
  const restoreIfIncomplete = () => {
    if (draft === "" || draft === "-" || !Number.isFinite(Number(draft))) setDraft(String(value));
  };
  return <label><span>{label}</span><input type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} onChange={e => update(e.target.value)} onBlur={restoreIfIncomplete}/></label>;
}
