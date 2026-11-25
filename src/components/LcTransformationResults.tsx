import { useMemo, useState } from "react";
import { planLcTransforms, type LcTransformStep } from "../circuit/lc-rule-registry";
import type { CircuitTopology } from "../circuit/topology";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import { CapacitorGlyph, InductorGlyph } from "../engineering/symbols";
import { lcNominalSI } from "../models/lc-nominal";
import type { Fraction } from "../models/lc-polynomial";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import type { Language } from "../types";
import { layoutLineExperiment } from "./line-experiment-layout";
import "./LcTransformationResults.css";

type Plan = ReturnType<typeof planLcTransforms>;
export type AppliedLcSynthesis = {
  name: string;
  before: TopologyLabDocument;
  after: TopologyLabDocument;
  sourceImpedance: Fraction;
  coefficientError: number;
  coefficientTolerance: number;
};

const copy = {
  ru: {
    title: "Пошаговое преобразование схемы", local: "Локальные правила", before: "Исходная схема", after: "Полученная схема",
    boundary: "Граничные выводы", input: "Исходные номиналы", output: "Полученные номиналы", count: "Число элементов",
    substitution: "Подстановка с L в мГн и C в мкФ",
    proof: "Равенство доказано перекрёстным умножением полиномов.", apply: "Применить локальные шаги",
    noChange: "В проверенных вариантах сокращение локальными правилами не найдено. Можно использовать одну из канонических форм.",
    exhausted: "Достигнут предел поиска. Показаны подтверждённые шаги из проверенных вариантов.",
    failed: "Проверка локального преобразования недоступна для этого графа.",
    global: "Канонический синтез", normalized: "Исходная портовая функция при q = s / (1000 рад/с)",
    canonical: "Разложения Z и Y, извлечённые звенья и способы проверки приведены в формах Фостера и Кауэра выше.",
    changed: "Выбранная форма применена. Исходная схема доступна через отмену.",
    tolerance: "Погрешность коэффициентов перекрёстного произведения", bound: "допуск",
    application: "Для численной реализации допуски относятся к коэффициентам и проверенным частотным отсчётам. Внутренние токи и начальные состояния относятся к каждой схеме отдельно.",
  },
  uk: {
    title: "Покрокове перетворення схеми", local: "Локальні правила", before: "Початкова схема", after: "Отримана схема",
    boundary: "Граничні виводи", input: "Початкові номінали", output: "Отримані номінали", count: "Кількість елементів",
    substitution: "Підстановка з L у мГн і C у мкФ",
    proof: "Рівність доведено перехресним множенням поліномів.", apply: "Застосувати локальні кроки",
    noChange: "У перевірених варіантах скорочення за локальними правилами не знайдено. Можна використати одну з канонічних форм.",
    exhausted: "Досягнуто межі пошуку. Показано підтверджені кроки з перевірених варіантів.",
    failed: "Перевірка локального перетворення недоступна для цього графа.",
    global: "Канонічний синтез", normalized: "Початкова портова функція при q = s / (1000 рад/с)",
    canonical: "Розклади Z і Y, виділені ланки та способи перевірки наведено у формах Фостера й Кауера вище.",
    changed: "Вибрану форму застосовано. Початкова схема доступна через скасування.",
    tolerance: "Похибка коефіцієнтів перехресного добутку", bound: "допуск",
    application: "Для числової реалізації допуски стосуються коефіцієнтів і перевірених частотних відліків. Внутрішні струми та початкові стани належать до кожної схеми окремо.",
  },
} as const;

const rules = {
  "l-series": ["Последовательное соединение L", "Послідовне з’єднання L"],
  "l-parallel": ["Параллельное соединение L", "Паралельне з’єднання L"],
  "c-series": ["Последовательное соединение C", "Послідовне з’єднання C"],
  "c-parallel": ["Параллельное соединение C", "Паралельне з’єднання C"],
  "l-y-to-delta": ["Звезда → треугольник L", "Зірка → трикутник L"],
  "l-delta-to-y": ["Треугольник → звезда L", "Трикутник → зірка L"],
  "c-y-to-delta": ["Звезда → треугольник C", "Зірка → трикутник C"],
  "c-delta-to-y": ["Треугольник → звезда C", "Трикутник → зірка C"],
  "lc-capacitive-forward": ["Ёмкостное LC-преобразование", "Ємнісне LC-перетворення"],
  "lc-capacitive-inverse": ["Обратное ёмкостное LC-преобразование", "Обернене ємнісне LC-перетворення"],
  "lc-inductive-forward": ["Индуктивное LC-преобразование", "Індуктивне LC-перетворення"],
  "lc-inductive-inverse": ["Обратное индуктивное LC-преобразование", "Обернене індуктивне LC-перетворення"],
} as const;

function Snapshot({ topology, active, caption }: { topology: CircuitTopology; active: readonly string[]; caption: string }) {
  const layout = layoutLineExperiment({ kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology, observedEndpoints: [], attachmentSides: [] });
  const byId = new Map(topology.components.map(part => [part.id, part]));
  return <figure className="lc-transform-snapshot">
    <figcaption>{caption}</figcaption>
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={caption}>
      {layout.wires.map(wire => <polyline key={wire.id} points={wire.points.map(({ x, y }) => `${x},${y}`).join(" ")} />)}
      {layout.components.map(({ id, x, y }) => {
        const part = byId.get(id);
        if (!part) return null;
        if (part.kind === "port") return <g key={id}>{part.terminals.map((terminal, index) => {
          const pin = layout.endpoints.get(terminal);
          return pin && <g key={terminal}><circle cx={pin.x} cy={pin.y} r={5} />
            <text x={pin.x} y={pin.y - 9} textAnchor="middle">{index === 0 ? "a" : "b"}</text></g>;
        })}</g>;
        return <g key={id} transform={`translate(${x} ${y})`} className={active.includes(id) ? "lc-transform-highlight" : undefined}>
          <g transform={`rotate(${layout.rotations.get(id) ?? 0})`}>
            {part.kind === "l" ? <><path d="M-52 0H-27M27 0H52" /><InductorGlyph x={-27} y={0} /></>
              : <CapacitorGlyph x={0} y={0} orientation="horizontal" terminalSpan={104} />}
          </g>
          <text x={0} y={-22} textAnchor="middle">{id}</text>
        </g>;
      })}
    </svg>
  </figure>;
}

function polynomialTerms(values: readonly bigint[]) {
  return values.map((coefficient, exponent) => coefficient === 0n ? "" : `${coefficient}${exponent ? `q^${exponent}` : ""}`)
    .filter(Boolean).reverse().join(" + ") || "0";
}

function numericSubstitution(step: LcTransformStep, language: Language) {
  const format = (value: number) => formatEngineeringNumber(value, language, { significantDigits: 6 });
  const nominal = (row: LcTransformStep["removed"][number]) => lcNominalSI(row.kind, row.ticks) * (row.kind === "l" ? 1e3 : 1e6);
  const values = new Map([...step.removed, ...step.added].map(row => [row.role, format(nominal(row))]));
  if (!step.ruleId.includes("delta")) {
    return step.formula.map(line => line.replace("=", "≈").replace(/\b[A-Za-z][A-Za-z0-9]*\b/g,
      role => values.has(role) ? `(${values.get(role)})` : role));
  }
  const capacitive = step.ruleId.startsWith("c-");
  const converted = new Map(step.removed.map(row => [row.role, format(capacitive ? 1 / nominal(row) : nominal(row))]));
  const star = step.ruleId.endsWith("y-to-delta");
  return step.added.map(row => {
    const v = (role: string) => `(${converted.get(role)})`;
    let top: string, bottom: string;
    if (star) {
      top = `${v("a")}·${v("b")} + ${v("a")}·${v("c")} + ${v("b")}·${v("c")}`;
      bottom = v(["a", "b", "c"].find(role => !row.role.includes(role))!);
    } else {
      top = [...converted.keys()].filter(role => role.includes(row.role)).map(v).join("·");
      bottom = `${v("ab")} + ${v("ac")} + ${v("bc")}`;
    }
    return capacitive ? `(${bottom}) / (${top}) ≈ ${values.get(row.role)}`
      : `(${top}) / (${bottom}) ≈ ${values.get(row.role)}`;
  });
}

function Step({ step, language }: { step: LcTransformStep; language: Language }) {
  const t = copy[language];
  const label = rules[step.ruleId as keyof typeof rules]?.[language === "ru" ? 0 : 1] ?? step.ruleId;
  const values = (rows: LcTransformStep["removed"]) => rows.map(row =>
    `${row.role} (${row.id}) = ${formatEngineeringValue(lcNominalSI(row.kind, row.ticks), row.kind === "l" ? "H" : "F", language)}`).join(" · ");
  return <article data-lc-transform-step={step.ruleId}>
    <h4>{label}</h4>
    <p>{t.count} {step.cost.before} → {step.cost.after} · {t.boundary} {step.boundaryEndpoints.join(" / ")}</p>
    <div className="lc-transform-pair">
      <Snapshot topology={step.before} active={step.removed.map(row => row.id)} caption={t.before} />
      <Snapshot topology={step.after} active={step.added.map(row => row.id)} caption={t.after} />
    </div>
    <p>{t.input} · {values(step.removed)}</p>
    <ul className="lc-transform-equations">{step.formula.map(formula => <li key={formula}>{formula}</li>)}</ul>
    <p>{t.substitution}</p>
    <ul className="lc-transform-equations" data-lc-numeric-substitution>{numericSubstitution(step, language).map((line, index) =>
      <li key={`${index}-${line}`}>{line}</li>)}</ul>
    <p>{t.output} · {values(step.added)}</p>
    <p data-lc-proof="exact-rational">{t.proof} ({step.proofs.length})</p>
  </article>;
}

export function LcTransformationResults({ document, analysis, language, onApply, applied }: {
  document: TopologyLabDocument; analysis: LcPortAnalysis; language: Language;
  onApply: (plan: Plan) => TopologyLabDocument | undefined; applied?: AppliedLcSynthesis;
}) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<{ after: TopologyLabDocument; plan: Plan }>();
  const local = useMemo(() => {
    if (!open || analysis.kind !== "finite") return {};
    try {
      const observed = [...document.observedEndpoints, ...(document.brokenWires?.flatMap(wire => [wire.from, wire.to]) ?? [])];
      return { plan: planLcTransforms(document.topology, observed, undefined, {
        reservedIds: document.brokenWires?.map(wire => wire.id),
      }) };
    } catch { return { failed: true }; }
  }, [analysis.kind, document, open]);
  const remembered = record?.after === document;
  const plan = remembered ? record.plan : local.plan;
  const sourceImpedance = applied?.sourceImpedance ?? (analysis.kind === "finite" ? analysis.impedance : undefined);
  return <details data-lc-transformations className="lc-panel lc-transformations" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t.title}</summary>
    {open && <>
      <h3>{t.local}</h3>
      {local.failed && <p role="status">{t.failed}</p>}
      {plan?.steps.map((step, index) => <Step key={`${step.ruleId}-${index}`} step={step} language={language} />)}
      {plan && plan.steps.length === 0 && <p>{t.noChange}</p>}
      {plan?.exhausted && <p role="status">{t.exhausted} ({plan.explored})</p>}
      {!remembered && !!plan?.steps.length && <button type="button" data-lc-apply-local onClick={() => {
        const after = onApply(plan);
        if (after) setRecord({ after, plan });
      }}>{t.apply}</button>}
      {sourceImpedance && <>
        <h3>{t.global}</h3>
        <p>{t.normalized}</p>
        <div className="lc-transform-fraction" data-lc-global-port-function>
          <span>Z(q) =</span>
          <span><span>{polynomialTerms(sourceImpedance.numerator)}</span><span>{polynomialTerms(sourceImpedance.denominator)}</span></span>
        </div>
        <p>{t.canonical}</p>
        <p>{t.application}</p>
      </>}
      {applied && <article data-lc-applied-synthesis>
        <h4>{applied.name}</h4>
        <p>{t.changed}</p>
        <p>{t.count} {applied.before.topology.components.length - 1} → {applied.after.topology.components.length - 1}</p>
        <div className="lc-transform-pair">
          <Snapshot topology={applied.before.topology} active={[]} caption={t.before} />
          <Snapshot topology={applied.after.topology} active={[]} caption={t.after} />
        </div>
        {applied.coefficientError === 0 ? <p data-lc-proof="exact-rational">{t.proof}</p>
          : <p data-lc-proof="bounded-rational">{t.tolerance} {formatEngineeringNumber(applied.coefficientError, language)} ·
            {" "}{t.bound} {formatEngineeringNumber(applied.coefficientTolerance, language)}</p>}
      </article>}
    </>}
  </details>;
}
