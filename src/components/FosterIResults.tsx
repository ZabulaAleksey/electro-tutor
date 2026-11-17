import { useMemo, useState } from "react";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { fosterIReactance, synthesizeFosterI, type FosterITerm } from "../models/reactive-foster-i";
import { reactance, type Circuit } from "../models/reactive-two-port";
import type { Language } from "../types";
import { ReactiveCircuitSchematic } from "./ReactiveCircuitSchematic";

function asCircuit(term: FosterITerm): Circuit {
  if (term.kind === "series-l") return { kind: "l", value: term.henry * 1000 };
  if (term.kind === "series-c") return { kind: "c", value: term.farad * 1e6 };
  return { kind: "parallel", left: { kind: "l", value: term.henry * 1000 }, right: { kind: "c", value: term.farad * 1e6 } };
}

export function FosterIResults({ result, cursor, language }: {
  result: LcPortAnalysis;
  cursor: number | null;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const solution = useMemo(() => {
    if (!open || result.kind !== "finite") return null;
    try { return synthesizeFosterI(result.impedance); } catch { return null; }
  }, [open, result]);
  const number = (value: number) => formatEngineeringNumber(value, language, { significantDigits: 4, maximumFractionDigits: 3 });
  const value = (nominal: number, unit: string) => formatEngineeringValue(nominal, unit, language);
  const hasFiniteCursor = solution !== null && cursor !== null && !solution.terms.some(term =>
    term.kind === "parallel-lc" && Math.abs(cursor / term.omega - 1) < 1e-8);
  const atCursor = hasFiniteCursor && result.kind === "finite"
    ? [reactance(result.impedance, cursor), fosterIReactance(solution.terms, cursor)] as const : undefined;

  function formatTerm(term: FosterITerm): string {
    const coefficient = number(term.strength);
    if (term.kind === "series-c") return coefficient + "/q";
    if (term.kind === "series-l") return coefficient + "q";
    return coefficient + "q/(q² + " + number((term.omega / 1000) ** 2) + ")";
  }
  const circuit = solution?.terms.map(asCircuit).reduce<Circuit | null>((left, right) =>
    left ? { kind: "series", left, right } : right, null);

  return <details className="lc-panel lc-foster" data-foster-i onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Первая форма Фостера", "Перша форма Фостера")}</summary>
    {result.kind !== "finite" && <p>{t("Для разомкнутого или закороченного порта синтез не требуется.",
      "Для розімкненого або закороченого порту синтез не потрібен.")}</p>}
    {open && result.kind === "finite" && !solution && <p role="status">{t(
      "Точности вычисления недостаточно для проверки эквивалентности этой реализации.",
      "Точності обчислення недостатньо для перевірки еквівалентності цієї реалізації.")}</p>}
    {solution && circuit && <>
      <p>{t("Вычеты конечных полюсов задают параллельные LC-контуры. Все звенья соединены последовательно.",
        "Лишки скінченних полюсів задають паралельні LC-контури. Усі ланки з'єднано послідовно.")}</p>
      <p data-foster-formula>Z(s) ≈ {solution.terms.map(formatTerm).join(" + ")} Ω, q = s / (1000 rad/s)</p>
      <div className="lc-foster-schematic"><ReactiveCircuitSchematic circuit={circuit} language={language} engineeringUnits /></div>
      <table aria-label={t("Номиналы формы Фостера", "Номінали форми Фостера")}>
        <thead><tr><th scope="col">{t("Звено", "Ланка")}</th><th scope="col">L</th><th scope="col">C</th><th scope="col">ω₀, rad/s</th></tr></thead>
        <tbody>{solution.terms.map((term, i) =>
          <tr data-foster-term={term.kind} key={term.kind + i}>
            <th scope="row">{term.kind === "parallel-lc" ? "L ∥ C" : term.kind === "series-l" ? "L" : "C"}</th>
            <td data-foster-henry={"henry" in term ? term.henry : undefined}>{"henry" in term ? value(term.henry, "H") : "—"}</td>
            <td data-foster-farad={"farad" in term ? term.farad : undefined}>{"farad" in term ? value(term.farad, "F") : "—"}</td>
            <td>{"omega" in term ? number(term.omega) : "—"}</td>
          </tr>)}</tbody>
      </table>
      <p data-foster-equivalence={solution.error}>{t("Эквивалентность проверена по номиналам звеньев.",
        "Еквівалентність перевірено за номіналами ланок.")}</p>
      {atCursor?.every(Number.isFinite) && <p data-foster-at-cursor>{t("Исходная схема", "Початкове коло")} {value(atCursor[0], "Ω")} ·
        {t("Форма Фостера", "Форма Фостера")} {value(atCursor[1], "Ω")}</p>}
    </>}
  </details>;
}
