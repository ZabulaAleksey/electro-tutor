import { useMemo, useState } from "react";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { fosterIReactance, synthesizeFosterI, type FosterITerm } from "../models/reactive-foster-i";
import { fosterIIReactance, synthesizeFosterII, type FosterIITerm } from "../models/reactive-foster-ii";
import { reactance, resonances, type Circuit } from "../models/reactive-two-port";
import type { Language } from "../types";
import { ReactiveCircuitSchematic } from "./ReactiveCircuitSchematic";

type FosterTerm = FosterITerm | FosterIITerm;
type FosterForm = "i" | "ii";

function asCircuit(term: FosterTerm): Circuit {
  if (term.kind === "parallel-lc" || term.kind === "series-lc") {
    return {
      kind: term.kind === "parallel-lc" ? "parallel" : "series",
      left: { kind: "l", value: term.henry * 1000 },
      right: { kind: "c", value: term.farad * 1e6 },
    };
  }
  return "henry" in term ? { kind: "l", value: term.henry * 1000 } : { kind: "c", value: term.farad * 1e6 };
}

export function FosterResults({ result, cursor, language, form }: {
  result: LcPortAnalysis;
  cursor: number | null;
  language: Language;
  form: FosterForm;
}) {
  const [open, setOpen] = useState(false);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const solution = useMemo(() => {
    if (!open || result.kind !== "finite") return null;
    try {
      return form === "i"
        ? { ...synthesizeFosterI(result.impedance), form }
        : { ...synthesizeFosterII(result.impedance), form };
    } catch { return null; }
  }, [form, open, result]);
  const poles = useMemo(() => open && result.kind === "finite"
    ? resonances(result.impedance).filter(point => point.kind === "pole").map(point => point.omega) : [], [open, result]);
  const number = (value: number) => formatEngineeringNumber(value, language, { significantDigits: 4, maximumFractionDigits: 3 });
  const value = (nominal: number, unit: string) => formatEngineeringValue(nominal, unit, language);
  const hasFiniteCursor = solution !== null && cursor !== null &&
    !poles.some(omega => Math.abs(cursor / omega - 1) < 1e-8);
  const atCursor = hasFiniteCursor && result.kind === "finite"
    ? [reactance(result.impedance, cursor), solution.form === "i"
      ? fosterIReactance(solution.terms, cursor) : fosterIIReactance(solution.terms, cursor)] as const : undefined;

  function formatTerm(term: FosterTerm): string {
    const coefficient = number(term.strength);
    if (term.kind === "series-c" || term.kind === "shunt-l") return coefficient + "/q";
    if (term.kind === "series-l" || term.kind === "shunt-c") return coefficient + "q";
    return coefficient + "q/(q² + " + number((term.omega / 1000) ** 2) + ")";
  }
  const circuit = solution?.terms.map(asCircuit).reduce<Circuit | null>((left, right) =>
    left ? { kind: form === "i" ? "series" : "parallel", left, right } : right, null);

  return <details className="lc-panel lc-foster" data-foster-i={form === "i" ? "" : undefined} data-foster-ii={form === "ii" ? "" : undefined} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{form === "i" ? t("Первая форма Фостера", "Перша форма Фостера") : t("Вторая форма Фостера", "Друга форма Фостера")}</summary>
    {result.kind !== "finite" && <p>{t("Для разомкнутого или закороченного порта синтез не требуется.",
      "Для розімкненого або закороченого порту синтез не потрібен.")}</p>}
    {open && result.kind === "finite" && !solution && <p role="status">{t(
      "Точности вычисления недостаточно для проверки эквивалентности этой реализации.",
      "Точності обчислення недостатньо для перевірки еквівалентності цієї реалізації.")}</p>}
    {solution && circuit && <>
      <p>{form === "i" ? t(
        "Вычеты конечных полюсов задают параллельные LC-контуры. Все звенья соединены последовательно.",
        "Лишки скінченних полюсів задають паралельні LC-контури. Усі ланки з'єднано послідовно.") : t(
        "Разложение Y(s) = 1/Z(s) даёт последовательные LC-контуры. Все ветви соединены параллельно.",
        "Розклад Y(s) = 1/Z(s) дає послідовні LC-контури. Усі гілки з'єднано паралельно.")}</p>
      <p data-foster-formula>{form === "i" ? "Z(s)" : "Y(s)"} ≈ {solution.terms.map(formatTerm).join(" + ")} {form === "i" ? "Ω" : "S"}, q = s / (1000 rad/s)</p>
      <div className="lc-foster-schematic"><ReactiveCircuitSchematic circuit={circuit} language={language} engineeringUnits /></div>
      <table aria-label={t("Номиналы формы Фостера", "Номінали форми Фостера")}>
        <thead><tr><th scope="col">{t("Звено", "Ланка")}</th><th scope="col">L</th><th scope="col">C</th><th scope="col">ω₀, rad/s</th></tr></thead>
        <tbody>{solution.terms.map((term, i) =>
          <tr data-foster-term={term.kind} key={term.kind + i}>
            <th scope="row">{term.kind === "parallel-lc" ? "L ∥ C" : term.kind === "series-lc" ? "L + C" : "henry" in term ? "L" : "C"}</th>
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
