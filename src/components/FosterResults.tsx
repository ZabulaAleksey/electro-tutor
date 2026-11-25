import { useEffect, useMemo, useRef, useState } from "react";
import { formatEngineeringLatexNumber, formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { FosterVerification } from "../models/lc-synthesis-equivalence";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { fosterIReactance, synthesizeFosterI, type FosterITerm } from "../models/reactive-foster-i";
import { fosterIIReactance, synthesizeFosterII, type FosterIITerm } from "../models/reactive-foster-ii";
import { reactance, resonances } from "../models/reactive-two-port";
import type { Language } from "../types";
import Formula from "./Formula";
import { LcSynthesisNominal, LcSynthesisSchematic } from "./LcSynthesisSchematic";

type FosterTerm = FosterITerm | FosterIITerm;
type FosterForm = "i" | "ii";

function fosterFormula(terms: readonly FosterTerm[], form: FosterForm, language: Language): string {
  const number = (value: number) => formatEngineeringLatexNumber(value, language);
  const rendered = terms.map(term => {
    const coefficient = number(term.strength);
    if (term.kind === "series-c" || term.kind === "shunt-l") return "\\frac{" + coefficient + "}{q}";
    if (term.kind === "series-l" || term.kind === "shunt-c") return coefficient + "q";
    return "\\frac{" + coefficient + "q}{q^2+" + number((term.omega / 1000) ** 2) + "}";
  });
  const quantity = form === "i" ? "\\frac{Z(s)}{\\Omega}" : "\\frac{Y(s)}{\\mathrm S}";
  const lines: string[] = [];
  for (let index = 0; index < rendered.length; index += 2) {
    const continuation = index === 0 ? quantity + "&\\approx " : "&\\quad +";
    lines.push(continuation + rendered.slice(index, index + 2).join(" + "));
  }
  return "\\begin{aligned}" + lines.join("\\\\") + "\\end{aligned}";
}

export function FosterResults({ result, cursor, language, form, onApply }: {
  result: LcPortAnalysis;
  cursor: number | null;
  language: Language;
  form: FosterForm;
  onApply?: (terms: readonly FosterTerm[], verification: FosterVerification) => void;
}) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (disclosure.current?.open) setOpen(true);
  }, []);
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
  return <details ref={disclosure} suppressHydrationWarning className="lc-panel lc-synthesis" data-foster-i={form === "i" ? "" : undefined} data-foster-ii={form === "ii" ? "" : undefined} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{form === "i" ? t("Первая форма Фостера", "Перша форма Фостера") : t("Вторая форма Фостера", "Друга форма Фостера")}</summary>
    {result.kind !== "finite" && <p>{t("Для разомкнутого или закороченного порта синтез не требуется.",
      "Для розімкненого або закороченого порту синтез не потрібен.")}</p>}
    {open && result.kind === "finite" && !solution && <p role="status">{t(
      "Точности вычисления недостаточно для проверки эквивалентности этой реализации.",
      "Точності обчислення недостатньо для перевірки еквівалентності цієї реалізації.")}</p>}
    {solution && <>
      <p>{form === "i" ? t(
        "Вычеты конечных полюсов задают параллельные LC-контуры. Все звенья соединены последовательно.",
        "Лишки скінченних полюсів задають паралельні LC-контури. Усі ланки з'єднано послідовно.") : t(
        "Разложение Y(s) = 1/Z(s) даёт последовательные LC-контуры. Все ветви соединены параллельно.",
        "Розклад Y(s) = 1/Z(s) дає послідовні LC-контури. Усі гілки з'єднано паралельно.")}</p>
      <div className="lc-synthesis-formula" data-foster-formula>
        <span aria-hidden="true" className="sr-only">{form === "i" ? "Z(s)" : "Y(s)"} ≈ {solution.terms.map(formatTerm).join(" + ")} {form === "i" ? "Ω" : "S"}, q = s / (1000 rad/s)</span>
        <Formula>{fosterFormula(solution.terms, form, language)}</Formula>
        <Formula block={false}>{"q=\\frac{s}{1000\\,\\mathrm{rad/s}}"}</Formula>
      </div>
      <LcSynthesisSchematic synthesis={{ form: `foster-${form}`, terms: solution.terms }} language={language} />
      <table aria-label={t("Номиналы формы Фостера", "Номінали форми Фостера")}>
        <thead><tr><th scope="col">{t("Звено", "Ланка")}</th><th scope="col">L</th><th scope="col">C</th><th scope="col">ω₀, <span className="lc-synthesis-unit">рад/с</span></th></tr></thead>
        <tbody>{solution.terms.map((term, i) =>
          <tr data-foster-term={term.kind} key={term.kind + i}>
            <th scope="row">{"henry" in term ? "L" + (i + 1) : null}
              {"henry" in term && "farad" in term ? term.kind === "parallel-lc" ? " ∥ " : " + " : null}
              {"farad" in term ? "C" + (i + 1) : null}</th>
            <td data-foster-henry={"henry" in term ? term.henry : undefined}>{"henry" in term
              ? <LcSynthesisNominal value={term.henry} unit="H" language={language} /> : "—"}</td>
            <td data-foster-farad={"farad" in term ? term.farad : undefined}>{"farad" in term
              ? <LcSynthesisNominal value={term.farad} unit="F" language={language} /> : "—"}</td>
            <td>{"omega" in term ? <>{number(term.omega)}
              <small className="lc-synthesis-frequency">f₀ = {number(term.omega / (2 * Math.PI))} <span className="lc-synthesis-unit">Гц</span></small></> : "—"}</td>
          </tr>)}</tbody>
      </table>
      <p data-foster-equivalence={solution.error} data-foster-proof={solution.verification.method}>
        {solution.verification.method === "exact-rational"
          ? t("Рациональная функция совпадает точно по номиналам звеньев.", "Раціональна функція точно збігається за номіналами ланок.")
          : t("Расхождения рациональных функций проверены по коэффициентам и частотным отсчётам.",
            "Розбіжності раціональних функцій перевірено за коефіцієнтами та частотними відліками.")}
      </p>
      <p className="lc-synthesis-verification">
        {t("Расхождение коэффициентов", "Розбіжність коефіцієнтів")} {number(solution.verification.coefficientError)}
        {" "}({t("допуск", "допуск")} {number(solution.verification.coefficientTolerance)}).
        {" "}{t("Расхождение по частотам", "Розбіжність за частотами")} {number(solution.verification.sweepError)}
        {" "}({t("допуск", "допуск")} {number(solution.verification.sweepTolerance)}).
      </p>
      {onApply && <button type="button" className="lc-synthesis-action" data-lc-apply-form={`foster-${form}`}
        onClick={() => onApply(solution.terms, solution.verification)}>
        {t("Перенести в редактор", "Перенести до редактора")}
      </button>}
      {atCursor?.every(Number.isFinite) && <p data-foster-at-cursor>{t("Исходная схема", "Початкове коло")} {value(atCursor[0], "Ω")} ·
        {t("Форма Фостера", "Форма Фостера")} {value(atCursor[1], "Ω")}</p>}
    </>}
  </details>;
}
