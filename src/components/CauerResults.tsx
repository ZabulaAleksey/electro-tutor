import { useEffect, useMemo, useRef, useState } from "react";
import { formatEngineeringValue } from "../engineering/format";
import { cauerReactance, synthesizeCauerI, type CauerElement } from "../models/reactive-cauer-i";
import { synthesizeCauerII } from "../models/reactive-cauer-ii";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { reactance, resonances, type Circuit } from "../models/reactive-two-port";
import type { Language } from "../types";
import { ReactiveCircuitSchematic } from "./ReactiveCircuitSchematic";

function asCircuit(elements: readonly CauerElement[]): Circuit | null {
  let tail: Circuit | null = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const { kind, placement, valueSI } = elements[i];
    const element: Circuit = { kind, value: valueSI * (kind === "l" ? 1000 : 1e6) };
    tail = tail ? { kind: placement === "series" ? "series" : "parallel", left: element, right: tail } : element;
  }
  return tail;
}

function strength(element: CauerElement): string {
  const { numerator, denominator } = element.coefficient;
  return denominator === 1n ? String(numerator) : "(" + numerator + "/" + denominator + ")";
}

function fraction(elements: readonly CauerElement[], form: "i" | "ii"): string {
  const terms = elements.map(element => strength(element) + (form === "i" ? "q" : "/q"));
  const full = terms.reduceRight((tail, term) => tail ? term + " + 1/(" + tail + ")" : term, "");
  return elements[0].placement === "series" ? full : "1/(" + full + ")";
}

export function CauerResults({ result, cursor, language, form }: {
  result: LcPortAnalysis;
  cursor: number | null;
  language: Language;
  form: "i" | "ii";
}) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (disclosure.current?.open) setOpen(true);
  }, []);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const solution = useMemo(() => {
    if (!open || result.kind !== "finite") return null;
    try { return form === "i" ? synthesizeCauerI(result.impedance) : synthesizeCauerII(result.impedance); } catch { return null; }
  }, [form, open, result]);
  const poles = useMemo(() => open && result.kind === "finite"
    ? resonances(result.impedance).filter(point => point.kind === "pole").map(point => point.omega) : [], [open, result]);
  const circuit = solution && asCircuit(solution.elements);
  const cursorValues = cursor !== null && solution && result.kind === "finite" && !poles.some(omega => Math.abs(cursor / omega - 1) < 1e-8)
    ? [reactance(result.impedance, cursor), cauerReactance(solution.elements, cursor)] as const : null;
  return <details ref={disclosure} suppressHydrationWarning data-cauer-i={form === "i" ? "" : undefined} data-cauer-ii={form === "ii" ? "" : undefined} className="lc-panel lc-synthesis" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{form === "i" ? t("Первая форма Кауэра", "Перша форма Кауера") : t("Вторая форма Кауэра", "Друга форма Кауера")}</summary>
    {result.kind !== "finite" && <p>{t("Для разомкнутого или закороченного порта синтез не требуется.",
      "Для розімкненого або закороченого порту синтез не потрібен.")}</p>}
    {open && result.kind === "finite" && !solution && <p role="status">{t(
      "Не удалось построить эквивалентную LC-лестницу с конечными положительными номиналами.",
      "Не вдалося побудувати еквівалентну LC-драбину зі скінченними додатними номіналами.")}</p>}
    {solution && circuit && <>
      <p>{form === "i" ? t(
        "При извлечении старших степеней последовательно выделяются L и поперечно C.",
        "Під час виділення старших степенів L стоять послідовно, а C під’єднуються поперечно.") : t(
        "При извлечении членов около нуля конденсаторы стоят последовательно, а катушки подключаются поперечно.",
        "Під час виділення членів поблизу нуля конденсатори стоять послідовно, а котушки під’єднуються поперечно.")}</p>
      <p data-cauer-formula>Z(s) = {fraction(solution.elements, form)} Ω, q = s / (1000 rad/s)</p>
      <div className="lc-synthesis-schematic"><ReactiveCircuitSchematic circuit={circuit} language={language} engineeringUnits /></div>
      <table aria-label={t("Номиналы формы Кауэра", "Номінали форми Кауера")}>
        <thead><tr><th scope="col">{t("Звено", "Ланка")}</th><th scope="col">{t("Соединение", "З’єднання")}</th>
          <th scope="col">{t("Номинал", "Номінал")}</th></tr></thead>
        <tbody>{solution.elements.map((element, i) =>
          <tr data-cauer-term={element.kind} data-cauer-placement={element.placement} key={i}>
            <th scope="row">{element.kind.toUpperCase() + String(i + 1)}</th>
            <td>{element.placement === "series" ? t("В разрыв", "Послідовно") : t("Поперёк", "Поперечно")}</td>
            <td data-cauer-nominal={element.valueSI}>
              {formatEngineeringValue(element.valueSI, element.kind === "l" ? "H" : "F", language)}
            </td>
          </tr>)}</tbody>
      </table>
      <p data-cauer-exact>{t("Обратная сборка даёт исходную рациональную функцию Z(s).",
        "Зворотне складання дає початкову раціональну функцію Z(s).")}</p>
      {cursorValues?.every(Number.isFinite) && <p data-cauer-at-cursor>
        {t("Исходная схема", "Початкове коло")} {formatEngineeringValue(cursorValues[0], "Ω", language)} ·
        {t("Лестница Кауэра", "Драбина Кауера")} {formatEngineeringValue(cursorValues[1], "Ω", language)}
      </p>}
    </>}
  </details>;
}
