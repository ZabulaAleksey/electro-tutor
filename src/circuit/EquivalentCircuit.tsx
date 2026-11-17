import { useMemo, useState, type ReactNode } from "react";
import type { Language } from "../types";
import type { Drawing } from "./drawing";
import type { CircuitEditorMode } from "./editor-mode";
import { deriveEquivalent, equivalentMode, type EquivalentFailure, type EquivalentMode, type ProvenanceNode } from "./equivalent-circuit";

function text(language: Language, ru: string, uk: string) { return language === "ru" ? ru : uk; }

function tree(node: ProvenanceNode): string {
  const polarity = node.polarity < 0 ? "−" : "+";
  return `${polarity}${node.id}${node.members?.length ? ` (${node.members.map(tree).join(", ")})` : ""}`;
}

function value(node: ProvenanceNode, language: Language) {
  if (node.value === undefined) return "—";
  const scales = node.kind === "r"
    ? [[1e6, 1e6, "MΩ"], [1e3, 1e3, "kΩ"], [1, 1, "Ω"], [1e-3, 1e-3, "mΩ"], [1e-6, 1e-6, "µΩ"]] as const
    : node.kind === "l"
      ? [[1, 1, "H"], [1e-3, 1e-3, "mH"], [1e-6, 1e-6, "µH"], [1e-9, 1e-9, "nH"]] as const
      : [[1, 1, "F"], [1e-3, 1e-3, "mF"], [1e-6, 1e-6, "µF"], [1e-9, 1e-9, "nF"], [1e-12, 1e-12, "pF"]] as const;
  const absolute = Math.abs(node.value);
  const scale = scales.find(([threshold]) => absolute >= threshold) ?? scales.at(-1)!;
  const scaled = node.value / scale[1];
  const formatted = absolute > 0 && Math.abs(scaled) < 0.0005
    ? scaled.toExponential(3)
    : new Intl.NumberFormat(language, { maximumFractionDigits: 3, useGrouping: false }).format(scaled);
  return `${formatted} ${scale[2]}`;
}

function failureText(language: Language, failure: EquivalentFailure) {
  const labels: Record<EquivalentFailure["reason"], [string, string]> = {
    "unsupported-mode": ["Для этого режима редукция недоступна.", "Для цього режиму редукція недоступна."],
    "mutual-coupling-unsupported": ["Взаимная связь отключает редукцию: модель не поддерживает её.", "Взаємний зв’язок вимикає редукцію: модель її не підтримує."],
    "no-reduction": ["Дальнейшее упрощение недоступно.", "Подальше спрощення недоступне."],
    "reduction-conflict": ["Начальное состояние реактивных элементов несовместимо.", "Початковий стан реактивних елементів несумісний."],
    "invalid-topology": ["Граф схемы некорректен.", "Граф схеми некоректний."],
    "layout-failed": ["Для остаточного графа не удалось построить безопасную раскладку.", "Для залишкового графа не вдалося побудувати безпечне компонування."],
  };
  return labels[failure.reason][language === "ru" ? 0 : 1];
}

export default function EquivalentCircuit({ drawing, language, modeId, renderCircuit }: {
  drawing: Drawing;
  language: Language;
  modeId: CircuitEditorMode["id"];
  renderCircuit: (document: string) => ReactNode;
}) {
  const [mutualCoupling, setMutualCoupling] = useState(false);
  const [calculationMode, setCalculationMode] = useState<EquivalentMode>(equivalentMode(modeId) ?? "transient");
  const [open, setOpen] = useState(false);
  const result = useMemo(() => open ? deriveEquivalent(drawing, modeId, mutualCoupling, calculationMode) : null,
    [open, drawing, modeId, mutualCoupling, calculationMode]);
  const mode = equivalentMode(modeId);
  const displayedMode = modeId === "free" ? calculationMode : mode;
  return <details className="circuit-equivalent" data-equivalent-circuit onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{text(language, "Эквивалентная RLC-модель", "Еквівалентна RLC-модель")}</summary>
    <div className="circuit-equivalent-panel">
      {modeId === "free" && <label>{text(language, "Модель расчёта", "Модель розрахунку")} <select aria-label={text(language, "Модель расчёта", "Модель розрахунку")} value={calculationMode} onChange={event => setCalculationMode(event.target.value as EquivalentMode)}>
        <option value="transient">{text(language, "Переходная: начальные состояния", "Перехідна: початкові стани")}</option>
        <option value="steady">{text(language, "Гармоническая: установившийся режим", "Гармонічна: усталений режим")}</option>
      </select></label>}
      <label><input type="checkbox" checked={mutualCoupling} onChange={event => setMutualCoupling(event.target.checked)} /> {text(language, "Есть взаимная связь", "Є взаємний зв’язок")}</label>
      <p>{displayedMode === "transient" ? text(language, "Идеальная RLC-модель сохраняет начальные состояния L/C.", "Ідеальна RLC-модель зберігає початкові стани L/C.") : displayedMode === "steady" ? text(language, "Идеальная RLC-модель рассматривается в гармоническом установившемся режиме; переходные начальные состояния исключены.", "Ідеальна RLC-модель розглядається в гармонічному усталеному режимі; перехідні початкові стани виключено.") : text(language, "Поддерживаются только RLC-режимы.", "Підтримуються лише RLC-режими.")}</p>
      {result && !result.ok && <>
        <p role="status" data-equivalent-diagnostic>{failureText(language, result)}</p>
        {result.nets.length > 0 && <table><caption>{text(language, "Остаточный граф", "Залишковий граф")}</caption><tbody>{result.nets.map((net, index) => <tr key={index}><th scope="row">N{index + 1}</th><td>{net.join(", ")}</td></tr>)}</tbody></table>}
      </>}
      {result?.ok && <>
        <p data-equivalent-assumptions>{result.mode === "transient" ? text(language, "Начальные состояния сохранены; только series/parallel.", "Початкові стани збережено; лише series/parallel.") : text(language, "Гармонический установившийся режим; только series/parallel.", "Гармонічний усталений режим; лише series/parallel.")}</p>
        {open && renderCircuit(result.document)}
        <table data-equivalent-provenance><caption>{text(language, "Происхождение эквивалентов", "Походження еквівалентів")}</caption><thead><tr><th>{text(language, "ID", "ID")}</th><th>{text(language, "Значение", "Значення")}</th><th>{text(language, "Связь", "З’єднання")}</th><th>{text(language, "Исходные элементы и полярность", "Вихідні елементи та полярність")}</th></tr></thead><tbody>{result.provenance.map(node => <tr key={node.id}><th scope="row">{node.id}</th><td>{value(node, language)}</td><td>{node.connection ? text(language, node.connection === "series" ? "последовательно" : "параллельно", node.connection === "series" ? "послідовно" : "паралельно") : "—"}</td><td>{tree(node)}</td></tr>)}</tbody></table>
      </>}
    </div>
  </details>;
}
