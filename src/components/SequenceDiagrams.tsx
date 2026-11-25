import { useId, useState, type MouseEvent } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import { niceStep } from "../engineering/scale";
import { SourceGlyph } from "../engineering/symbols";
import { addComplex, type Complex } from "../models/circular-diagram";
import { absolutePosition, areas, phases, z, type Area, type Neutral, type Phase, type SectionReading,
  type SequenceDocument, type SequenceEdit, type SequenceSolution, type Triple } from "../sequence/contract";
import { sequencePhaseTerms } from "../sequence/solve";
import type { Language } from "../types";
import "./SequenceDiagrams.css";

const copy = {
  ru: {
    area: { generator: "Генератор", line: "Линия", load: "Нагрузка" },
    circuit: "Трёхфазная схема", choose: "Выберите место на фазных проводниках или участок кнопкой.",
    generatorNeutral: "Нейтраль генератора", loadNeutral: "Нейтраль нагрузки", isolated: "изолирована", grounded: "заземлена",
    series: "Последовательный импеданс", open: "Обрыв", shunt: "Поперечное соединение", ground: "земля",
    networks: "Схемы последовательностей", names: ["Нулевая", "Прямая", "Обратная"],
    openZeroPath: "Путь тока нулевой последовательности отсутствует.",
    coupled: "Пунктир показывает связанные уравнения последовательностей.",
    independent: "Уравнения последовательностей независимы.",
    voltage: "Напряжение", current: "Ток", scale: "Масштаб", zero: "Нулевой вектор",
    reading: "Показания выбранного участка", voltageAt: "Напряжение в конце участка. Ток в его ветви.",
    floating: "Отсчёт напряжения относительно выбранной плавающей опоры.",
    referenced: "Отсчёт напряжения относительно земли.",
    mixed: "Фазы отсчитываются от разных опор. Составляющие U₀, U₁, U₂ и их векторная сумма не определены. В таблице приведены доступные напряжения фаз относительно земли.",
    symbol: "Величина", magnitude: "Модуль", angle: "Аргумент", phase: "Сумма для фазы",
    phases: "Фазные векторы", sequences: "Составляющие", sum: "Векторное суммирование",
    source: "ЭДС прямой последовательности", error: "Невязка уравнений",
  },
  uk: {
    area: { generator: "Генератор", line: "Лінія", load: "Навантаження" },
    circuit: "Трифазна схема", choose: "Виберіть місце на фазних провідниках або ділянку кнопкою.",
    generatorNeutral: "Нейтраль генератора", loadNeutral: "Нейтраль навантаження", isolated: "ізольована", grounded: "заземлена",
    series: "Послідовний імпеданс", open: "Обрив", shunt: "Поперечне з’єднання", ground: "земля",
    networks: "Схеми послідовностей", names: ["Нульова", "Пряма", "Зворотна"],
    openZeroPath: "Шлях струму нульової послідовності відсутній.",
    coupled: "Пунктир показує пов’язані рівняння послідовностей.",
    independent: "Рівняння послідовностей незалежні.",
    voltage: "Напруга", current: "Струм", scale: "Масштаб", zero: "Нульовий вектор",
    reading: "Покази вибраної ділянки", voltageAt: "Напруга в кінці ділянки. Струм у її гілці.",
    floating: "Відлік напруги відносно вибраної плаваючої опори.",
    referenced: "Відлік напруги відносно землі.",
    mixed: "Фази відлічуються від різних опор. Складові U₀, U₁, U₂ та їхня векторна сума не визначені. У таблиці наведено доступні напруги фаз відносно землі.",
    symbol: "Величина", magnitude: "Модуль", angle: "Аргумент", phase: "Сума для фази",
    phases: "Фазні вектори", sequences: "Складові", sum: "Векторне підсумовування",
    source: "ЕРС прямої послідовності", error: "Нев’язка рівнянь",
  },
} as const;

const left = 84, span = 132, phaseY = [82, 114, 146], right = left + 3 * span;
const sourceX = 51, generatorNeutralX = 23, loadNeutralX = 514, groundY = 195;
const svgWidth = 536;
const sequenceOrder = [1, 2, 0] as const;
const phaseClass = (phase: Phase) => "seq-phase-" + phase.toLowerCase();
const sequenceClass = (sequence: number) => "seq-sequence-" + sequence;
const placement = (area: Area, at: number) => left + span * absolutePosition(area, at);
const isZero = (value: Complex) => value.re === 0 && value.im === 0;
// Retain small nonzero readings while keeping SSR and browser markup independent of last-bit Math differences.
const stableNumber = (value: number) => Number(value.toPrecision(12));
const magnitude = (value: Complex) => stableNumber(Math.hypot(value.re, value.im));
const phaseDegrees = (value: Complex) => stableNumber(Math.atan2(value.im, value.re) * 180 / Math.PI);
const subscript = ["₀", "₁", "₂"];

function clearRoundoff(abc: Triple, sequences: Triple) {
  const magnitudeOf = ({ re, im }: Complex) => Math.hypot(re, im);
  const tolerance = 64 * Number.EPSILON * Math.max(...abc.map(magnitudeOf), ...sequences.map(magnitudeOf));
  const visible = (value: Complex) => magnitudeOf(value) < tolerance ? z() : value;
  const normalized = ([a, b, c]: Triple): Triple => [visible(a), visible(b), visible(c)];
  return [normalized(abc), normalized(sequences)] as const;
}

function complexLabel(value: Complex, language: Language) {
  const number = (x: number) => formatEngineeringNumber(x, language);
  return number(value.re) + (value.im < 0 ? " − j" : " + j") + number(Math.abs(value.im));
}

function Ground({ x, y }: { x: number; y: number }) {
  return <path className="seq-ground" d={`M${x} ${y}v6m-7 0h14m-11 4h8m-6 4h4`} />;
}

function NeutralPath({ neutral, x, name, label, language }: {
  neutral: Neutral; x: number; name: "generator" | "load"; label: string; language: Language;
}) {
  const connected = neutral.mode === "grounded";
  const finite = connected && !isZero(neutral.impedance);
  const endY = 161;
  const xOffset = name === "generator" ? 12 : -12;
  const anchor = name === "generator" ? "start" : "end";
  return <g className="seq-neutral" data-seq-neutral={name} data-mode={neutral.mode}>
    <title>{`${label} · ${connected ? copy[language].grounded : copy[language].isolated}${finite
      ? ` · Zₙ = ${complexLabel(neutral.impedance, language)} Ω · 3Zₙ = ${complexLabel({
        re: 3 * neutral.impedance.re, im: 3 * neutral.impedance.im,
      }, language)} Ω` : ""}`}</title>
    <path d={`M${x} ${phaseY[0]}V${connected && !finite ? groundY : endY}`} />
    {connected ? <>
      {finite && <>
        <rect className="seq-impedance" x={x - 7} y={endY} width="14" height="14" rx="2" />
        <path d={`M${x} ${endY + 14}V${groundY}`} />
      </>}
      <Ground x={x} y={groundY} />
    </> : <circle className="seq-open-point" cx={x} cy={endY} r="3" />}
    <text x={x + xOffset} y="216" textAnchor={anchor}>
      {name === "generator" ? "Nᵍ" : "Nₗ"}
      {connected && <> · Zₙ = {finite ? complexLabel(neutral.impedance, language) : "0"} Ω</>}
    </text>
  </g>;
}

function PhaseWire({ phase, index, edits, language }: { phase: Phase; index: number; edits: readonly SequenceEdit[]; language: Language }) {
  const y = phaseY[index];
  const radius = 22 * .52;
  const inline = edits.filter(edit => edit.kind !== "shunt" && edit.phases.includes(phase))
    .toSorted((a, b) => absolutePosition(a.area, a.at) - absolutePosition(b.area, b.at) || a.id.localeCompare(b.id));
  const bySite = new Map<number, SequenceEdit[]>();
  for (const edit of inline) {
    const x = placement(edit.area, edit.at);
    const sameSite = bySite.get(x) ?? [];
    sameSite.push(edit);
    bySite.set(x, sameSite);
  }
  const sites = [...bySite.keys()];
  // Several edits may share a station. Fit their stamps within its own span.
  const stamps = [...bySite].flatMap(([x, atSite], i) => {
    const previous = sites[i - 1] ?? x - 24, next = sites[i + 1] ?? x + 24;
    const pitch = Math.min(18, (x - previous) / atSite.length, (next - x) / atSite.length);
    return atSite.map((edit, index) => ({
      edit, x: x + pitch * (index - (atSite.length - 1) / 2), half: Math.min(8, pitch * .44),
    }));
  });
  const color = phaseClass(phase);
  return <g className={color} data-seq-phase-wire={phase}>
    <path className="seq-conductor" d={`M${generatorNeutralX} ${y}H${sourceX - radius}M${sourceX + radius} ${y}H${left - 10}`} />
    <SourceGlyph x={sourceX} y={y} scale={.52} mode="thumbnail" ac />
    <text className="seq-phase-letter" x={left - 12} y={y - 8} textAnchor="middle">{phase}</text>
    {stamps.map(({ edit, x, half }, i) =>
      <g key={edit.id} data-seq-edit-kind={edit.kind} data-seq-edit-id={edit.id}>
        <title>{`${edit.id} · ${phase} · ${copy[language][edit.kind]}${edit.kind === "series"
          ? ` · ${complexLabel(edit.impedance, language)} Ом` : ""}`}</title>
        <path className="seq-conductor" d={`M${i ? stamps[i - 1].x + stamps[i - 1].half : left - 10} ${y}H${x - half}`} />
        {edit.kind === "open" ? <>
          <path className="seq-edit" d={`M${x - half} ${y}L${x + Math.max(3, half - 1)} ${y - 9}`} />
          <circle className="seq-open-point" cx={x - half} cy={y} r="2" />
          <circle className="seq-open-point" cx={x + half} cy={y} r="2" />
        </> : <rect className="seq-impedance" x={x - half} y={y - 5} width={2 * half} height="10" rx="1.5" />}
      </g>)}
    <path className="seq-conductor" d={`M${stamps.length ? stamps.at(-1)!.x + stamps.at(-1)!.half : left - 10} ${y}H${right + 12}M${right + 30} ${y}H${loadNeutralX}`} />
    <rect className="seq-impedance" x={right + 12} y={y - 5} width="18" height="10" rx="1.5" />
    {(index === 1 || index === 2) && <>
      <circle className="seq-node" cx={generatorNeutralX} cy={y} r="2.3" />
      <circle className="seq-node" cx={loadNeutralX} cy={y} r="2.3" />
    </>}
  </g>;
}

function ShuntPaths({ edit, language }: { edit: Extract<SequenceEdit, { kind: "shunt" }>; language: Language }) {
  const x = placement(edit.area, edit.at);
  const finite = !isZero(edit.impedance);
  const sharedGround = edit.target === "ground" && edit.phases.length > 1;
  const branchImpedance = finite && !sharedGround;
  const jointY = 159;
  const tapOffset = 11 * (edit.phases.length - 1) / 2;
  return <g className="seq-shunt" data-seq-edit-kind="shunt" data-seq-edit-id={edit.id}>
    <title>{`${edit.id} · ${edit.phases.join(", ")} → ${edit.target === "ground" ? copy[language].ground : edit.target}${finite
      ? ` · ${complexLabel(edit.impedance, language)} Ом` : ""}`}</title>
    {edit.phases.map((phase, index) => {
      if (phase === edit.target) return null;
      const from = phaseY[phases.indexOf(phase)];
      const to = edit.target === "ground" ? (sharedGround ? jointY : groundY) : phaseY[phases.indexOf(edit.target)];
      const tap = x - tapOffset + 11 * index;
      const upper = Math.min(from, to), lower = Math.max(from, to);
      const center = upper + 20;
      // A short interruption marks a crossing with a phase that is not a branch endpoint.
      const breaks = phaseY.filter(y => y > upper && y < lower).flatMap(y => [[y - 3, y + 3] as const]);
      if (branchImpedance) breaks.push([center - 7, center + 7]);
      const ordered = breaks.toSorted(([a], [b]) => a - b);
      const path = ordered.map(([start], i) => `M${tap} ${i ? ordered[i - 1][1] : upper}V${start}`).join("");
      return <g key={phase}>
        <path className="seq-edit" d={path + `M${tap} ${ordered.at(-1)?.[1] ?? upper}V${lower}`} />
        {branchImpedance && <rect className="seq-impedance" x={tap - 5} y={center - 7} width="10" height="14" rx="1.5" />}
        <circle className="seq-node" cx={tap} cy={from} r="2.7" />
        {!sharedGround && (edit.target === "ground"
          ? <Ground x={tap} y={to} /> : <circle className="seq-node" cx={tap} cy={to} r="2.7" />)}
      </g>;
    })}
    {sharedGround && <g data-seq-fault-junction>
      <path className="seq-edit" d={`M${x - tapOffset} ${jointY}H${x + tapOffset}M${x} ${jointY}V${finite ? 169 : groundY}`} />
      <circle className="seq-node" cx={x} cy={jointY} r="2.7" />
      {finite && <>
        <rect className="seq-impedance" x={x - 5} y="169" width="10" height="14" rx="1.5" />
        <path className="seq-edit" d={`M${x} 183V${groundY}`} />
        <text x={x + 8} y="181">Z<tspan baselineShift="sub" fontSize="10">f</tspan></text>
      </>}
      <Ground x={x} y={groundY} />
    </g>}
  </g>;
}

export function SequenceCircuit({ document, language, selectedArea, selectedAt, onSelect, controls }: {
  document: SequenceDocument; language: Language; selectedArea: Area; selectedAt: number;
  onSelect: (area: Area, at: number) => void;
  controls?: import("react").ReactNode;
}) {
  const t = copy[language];
  const key = useId();
  const selectedX = placement(selectedArea, selectedAt);

  function selectPoint(event: MouseEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (point.x < left || point.x > right || point.y < 8 || point.y > 160) return;
    const normalized = (point.x - left) / span;
    const index = Math.min(areas.length - 1, Math.floor(normalized));
    onSelect(areas[index], Math.round((normalized - index) * 1000) / 1000);
  }

  return <figure className="seq-card seq-circuit-card">
    <figcaption id={key}>{t.circuit}</figcaption>
    <svg className="seq-svg seq-schematic" viewBox={`0 0 ${svgWidth} 224`} role="img"
      aria-labelledby={key} data-seq-schematic onClick={selectPoint}>
      {areas.map(area => <g key={area} data-seq-zone={area}>
        <rect className="seq-zone" x={placement(area, 0) + 2} y="5" width={span - 4} height="155" rx="8"
          data-selected={area === selectedArea} />
        <text className="seq-zone-name" x={placement(area, .5)} y="21" textAnchor="middle">{t.area[area]}</text>
        {document.sections[area].map((value, sequence) => {
          const label = `Z${subscript[sequence]} = ${complexLabel(value, language)} Ω`;
          return <text className="seq-zone-impedance" key={sequence} x={placement(area, .5)} y={37 + 13 * sequence}
            textAnchor="middle" textLength={label.length > 17 ? 116 : undefined} lengthAdjust="spacingAndGlyphs"
            data-seq-zone-impedance={sequence}>{label}</text>;
        })}
      </g>)}
      <path className="seq-station" d={`M${selectedX} 68V160`} />
      <NeutralPath x={generatorNeutralX} neutral={document.generatorNeutral} name="generator" label={t.generatorNeutral} language={language} />
      <NeutralPath x={loadNeutralX} neutral={document.loadNeutral} name="load" label={t.loadNeutral} language={language} />
      {phases.map((phase, index) => <PhaseWire key={phase} phase={phase} index={index} edits={document.edits} language={language} />)}
      {document.edits.map(edit => edit.kind === "shunt" && <ShuntPaths key={edit.id} edit={edit} language={language} />)}
    </svg>
    <div className="seq-choice" role="group" aria-label={t.choose}>
      {areas.map(area => <button type="button" key={area} data-seq-pick-area={area} aria-pressed={area === selectedArea}
        onClick={() => onSelect(area, area === selectedArea ? selectedAt : .5)}>{t.area[area]}</button>)}
    </div>
    <p className="seq-hint">{t.choose}</p>
    {controls}
  </figure>;
}

type Solved = Extract<SequenceSolution, { ok: true }>;

function SequenceNetworks({ document, solution, reading, language }: {
  document: SequenceDocument; solution: Solved; reading: SectionReading; language: Language;
}) {
  const t = copy[language];
  const number = (x: number) => formatEngineeringNumber(x, language);
  const rows = { 1: 61, 2: 113, 0: 165 };
  const key = useId();
  const links = solution.couplings.filter(coupling => coupling.sequences.length > 1);
  return <section className="seq-card seq-networks" aria-labelledby={key}>
    <h3 id={key}>{t.networks}</h3>
    <svg className="seq-svg" viewBox={`0 0 ${svgWidth} 195`} role="img" aria-labelledby={key}>
      {areas.map(area => <text className="seq-zone-name" key={area} x={placement(area, .5)} y="22" textAnchor="middle">{t.area[area]}</text>)}
      {sequenceOrder.map(sequence => {
        const y = rows[sequence], inactive = sequence === 0 && !reading.zeroPath;
        return <g className={sequenceClass(sequence)} key={sequence} data-seq-network={sequence} data-open={inactive}>
          <text x="10" y={y - 2}>{t.names[sequence]}</text>
          <text className="seq-index" x="10" y={y + 15}>E{subscript[sequence]}{sequence === 1 ? "" : " = 0"}</text>
          <path className="seq-network-line" d={`M${left - 3} ${y}H${right}`} />
          {inactive && <g className="seq-network-open">
            <rect x={right - 9} y={y - 6} width="18" height="12" />
            <circle className="seq-open-point" cx={right - 8} cy={y} r="2.5" />
            <circle className="seq-open-point" cx={right + 8} cy={y} r="2.5" />
          </g>}
        </g>;
      })}
      {links.map(coupling => {
        const x = placement(coupling.area, coupling.at);
        const positions = coupling.sequences.map(sequence => rows[sequence]);
        return <g key={coupling.id} className="seq-coupling" data-seq-coupling-link={coupling.id}>
          <title>{`${coupling.id} · ${t.area[coupling.area]} · ${number(100 * coupling.at)} %`}</title>
          <path d={`M${x} ${Math.min(...positions)}V${Math.max(...positions)}`} />
          {positions.map(y => <circle key={y} cx={x} cy={y} r="3" />)}
        </g>;
      })}
    </svg>
    <p className="seq-hint">{t.source} E₁ = {number(document.sourceVolts)} В · {number(document.frequencyHz)} Гц</p>
    {!reading.zeroPath && <p className="seq-hint" data-seq-zero-path-note>{t.openZeroPath}</p>}
    <p className="seq-hint">{links.length ? t.coupled : t.independent}</p>
    {links.length > 0 && <ul className="seq-coupling-list">
      {links.map(coupling => <li key={coupling.id} data-seq-coupling={coupling.id}>
        <strong>{coupling.id}</strong> · {t.area[coupling.area]} {number(coupling.at * 100)} % · {coupling.sequences.join(" ↔ ")}
      </li>)}
    </ul>}
  </section>;
}

function partialSums(components: Triple, phase: Phase) {
  const [zero, direct, reverse] = sequencePhaseTerms(components, phase);
  const intermediate = addComplex(zero, direct);
  return [z(), zero, intermediate, addComplex(intermediate, reverse)] as const;
}

type Vector = { id: string; label: string; className: string; from: Complex; to: Complex };

const sumOrder = [0, 1, 2] as const;
const sumFactors = { A: ["", "", ""], B: ["", "a²", "a"], C: ["", "a", "a²"] } as const;
const isZeroVector = ({ from, to }: Vector) => from.re === to.re && from.im === to.im;

function Arrow({ vector, max }: { vector: Vector; max: number }) {
  const point = (value: Complex) => [
    stableNumber(66 + 46 * (value.re / max)),
    stableNumber(62 - 46 * (value.im / max)),
  ] as const;
  const [x, y] = point(vector.from), [endX, endY] = point(vector.to);
  const dx = endX - x, dy = endY - y;
  const length = stableNumber(Math.hypot(dx, dy));
  const head = Math.min(5, length / 3);
  const ux = length ? dx / length : 0, uy = length ? dy / length : 0;
  const headA = `${stableNumber(endX - head * ux + .6 * head * uy)} ${stableNumber(endY - head * uy - .6 * head * ux)}`;
  const headB = `${stableNumber(endX - head * ux - .6 * head * uy)} ${stableNumber(endY - head * uy + .6 * head * ux)}`;
  return <g className={vector.className} data-seq-vector={vector.id} data-zero={isZeroVector(vector)}>
    {length > .1 && <>
      <line x1={x} y1={y} x2={endX} y2={endY} />
      <path d={`M${endX} ${endY}L${headA}L${headB}Z`} />
    </>}
  </g>;
}

function VectorPlot({ vectors, max, label }: { vectors: readonly Vector[]; max: number; label: string }) {
  return <svg className="seq-svg seq-vectors" viewBox="0 0 132 124" role="img" aria-label={label}>
    <circle className="seq-vectors-ring" cx="66" cy="62" r="46" />
    <path className="seq-vectors-axis" d="M12 62H120M66 8V115" />
    <text x="107" y="73">Re</text><text x="70" y="13">Im</text>
    {vectors.map(vector => <Arrow key={vector.id} vector={vector} max={max} />)}
    <circle className="seq-vectors-origin" cx="66" cy="62" r="1.7" />
  </svg>;
}

function Phasors({ phaseValues, symmetric, quantity, phase, language }: {
  phaseValues: Triple; symmetric: Triple; quantity: "voltage" | "current"; phase: Phase; language: Language;
}) {
  const t = copy[language];
  const bound = Math.max(...[...phaseValues, ...symmetric, ...phases.flatMap(key => partialSums(symmetric, key))].map(magnitude));
  const max = bound > 0 ? stableNumber(niceStep(bound)) : 1;
  const unit = quantity === "voltage" ? "В" : "А";
  const prefix = quantity === "voltage" ? "U" : "I";
  const byPhase = phases.map((key, index) => ({
    id: prefix + key, label: prefix + key, className: phaseClass(key), from: z(), to: phaseValues[index],
  }));
  const bySequence = sequenceOrder.map(index => ({
    id: prefix + index, label: prefix + subscript[index], className: sequenceClass(index), from: z(), to: symmetric[index],
  }));
  const sums = partialSums(symmetric, phase);
  const parts = sumOrder.map(index => ({
    id: prefix + phase + index, label: sumFactors[phase][index] + prefix + subscript[index],
    className: sequenceClass(index), from: sums[index], to: sums[index + 1],
  }));
  const resultant: Vector = {
    id: prefix + phase + "-sum", label: prefix + phase, className: "seq-result-vector", from: sums[0], to: sums[3],
  };
  const legend = (vectors: Vector[], showZero = true) => vectors.map(vector => <li key={vector.id} className={vector.className}>
    <i aria-hidden="true" />{vector.label}{showZero && isZeroVector(vector) && <span title={t.zero}> = 0</span>}
  </li>);
  return <figure className="seq-card seq-phasors" data-seq-phasors={quantity} data-seq-scale={max}>
    <figcaption>{t[quantity]} · {unit}</figcaption>
    <p className="seq-hint">{t.scale} ±{formatEngineeringNumber(max, language)} {unit}</p>
    <div className="seq-plot-columns">
      <div><h4>{t.phases}</h4><VectorPlot vectors={byPhase} max={max} label={t.phases + " · " + t[quantity]} />
        <ul className="seq-vector-legend">{legend(byPhase)}</ul></div>
      <div><h4>{t.sequences}</h4><VectorPlot vectors={bySequence} max={max} label={t.sequences + " · " + t[quantity]} />
        <ul className="seq-vector-legend">{legend(bySequence)}</ul></div>
      <div className="seq-sum-plot" data-seq-sum={phase}><h4>{t.sum} {phase}</h4>
        <VectorPlot vectors={[...parts, resultant]} max={max} label={t.sum + " " + phase + " · " + t[quantity]} />
        <ul className="seq-vector-legend">
          {legend(parts, false)}
          <li className={resultant.className}><i aria-hidden="true" />{prefix}<sub>{phase}</sub></li>
        </ul>
      </div>
    </div>
  </figure>;
}

function ReadingTable({ reading, language }: { reading: SectionReading; language: Language }) {
  const t = copy[language];
  const number = (value: number) => formatEngineeringNumber(value, language);
  const mixed = reading.reference === "mixed-reference";
  const rows = [
    ...sequenceOrder.map(index => ({ name: "U", key: index, unit: "В", value: mixed ? undefined : reading.voltage012[index] })),
    ...phases.map((key, index) => ({ name: "U", key, unit: "В",
      value: !mixed || reading.phaseGrounded?.[index] ? reading.voltageABC[index] : undefined })),
    ...sequenceOrder.map(index => ({ name: "I", key: index, unit: "А", value: reading.current012[index] })),
    ...phases.map((key, index) => ({ name: "I", key, unit: "А", value: reading.currentABC[index] })),
  ];
  return <section className="seq-card seq-reading-table" data-seq-reference={reading.reference}>
    <h3>{t.reading}</h3>
    <p className="seq-hint">{t.area[reading.area]} · {number(100 * reading.from)}–{number(100 * reading.to)} %. {t.voltageAt}</p>
    {!mixed && <p className="seq-hint">{reading.reference === "ground" ? t.referenced : t.floating}</p>}
    <table aria-label={t.reading}>
      <thead><tr><th scope="col">{t.symbol}</th><th scope="col">Re</th><th scope="col">Im</th>
        <th scope="col">{t.magnitude}</th><th scope="col">{t.angle}, °</th></tr></thead>
      <tbody>{rows.map(row => {
        const value = row.value;
        const length = value ? magnitude(value) : undefined;
        const angle = value && length ? phaseDegrees(value) : undefined;
        const re = value && stableNumber(value.re), im = value && stableNumber(value.im);
        const id = row.name + row.key;
        return <tr key={id} data-seq-reading={id} data-re={re} data-im={im}
          data-magnitude={length} data-angle={angle}>
          <th scope="row" className={typeof row.key === "number" ? sequenceClass(row.key) : phaseClass(row.key)}>
            <i aria-hidden="true" />{row.name}<sub>{row.key}</sub><small>{row.unit}</small>
          </th>
          <td>{re === undefined ? "—" : number(re)}</td><td>{im === undefined ? "—" : number(im)}</td>
          <td>{length === undefined ? "—" : number(length)}</td>
          <td>{angle !== undefined ? number(angle) : value ? <span title={t.zero}>—</span> : "—"}</td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

export function SequenceResults({ document, solution, reading, language }: {
  document: SequenceDocument; solution: Solved; reading: SectionReading; language: Language;
}) {
  const t = copy[language];
  const [phase, setPhase] = useState<Phase>("A");
  const mixed = reading.reference === "mixed-reference";
  const [rawA, rawB, rawC] = reading.voltageABC;
  const [groundA, groundB, groundC] = reading.phaseGrounded ?? [];
  const [voltageABC, voltage012] = clearRoundoff(
    mixed ? [groundA ? rawA : z(), groundB ? rawB : z(), groundC ? rawC : z()] : reading.voltageABC,
    mixed ? [z(), z(), z()] : reading.voltage012,
  );
  const [currentABC, current012] = clearRoundoff(reading.currentABC, reading.current012);
  return <div className="seq-results" data-seq-zero-path={String(reading.zeroPath)}>
    <SequenceNetworks document={document} solution={solution} reading={reading} language={language} />
    <div className="seq-choice seq-phase-choice" role="group" aria-label={t.phase}>
      <span>{t.phase}</span>
      {phases.map(key => <button type="button" key={key} className={phaseClass(key)}
        aria-pressed={phase === key} onClick={() => setPhase(key)}>{key}</button>)}
    </div>
    <div className="seq-phasor-layout">
      {mixed ? <section className="seq-card">
        <h3>{t.voltage}</h3><p className="seq-hint" data-seq-mixed-reference>{t.mixed}</p>
      </section> : <Phasors phaseValues={voltageABC} symmetric={voltage012} quantity="voltage" phase={phase} language={language} />}
      <Phasors phaseValues={currentABC} symmetric={current012} quantity="current" phase={phase} language={language} />
    </div>
    <ReadingTable reading={{ ...reading, voltageABC, voltage012, currentABC, current012 }} language={language} />
    <p className="seq-hint">{t.error} {formatEngineeringNumber(stableNumber(solution.maxResidual), language)}</p>
  </div>;
}
