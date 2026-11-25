import { useEffect, useMemo, useRef, useState } from "react";
import { formatEngineeringLatexNumber, formatEngineeringValue } from "../engineering/format";
import { bigintRatio } from "../models/lc-polynomial";
import { cauerReactance, synthesizeCauerI, type CauerElement } from "../models/reactive-cauer-i";
import { synthesizeCauerII } from "../models/reactive-cauer-ii";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { reactance, resonances } from "../models/reactive-two-port";
import type { Language } from "../types";
import Formula from "./Formula";
import { LcSynthesisNominal, LcSynthesisSchematic } from "./LcSynthesisSchematic";

function strength(element: CauerElement): string {
  const { numerator, denominator } = element.coefficient;
  return denominator === 1n ? String(numerator) : "(" + numerator + "/" + denominator + ")";
}

function fraction(elements: readonly CauerElement[], form: "i" | "ii"): string {
  const terms = elements.map(element => strength(element) + (form === "i" ? "q" : "/q"));
  const full = terms.reduceRight((tail, term) => tail ? term + " + 1/(" + tail + ")" : term, "");
  return elements[0].placement === "series" ? full : "1/(" + full + ")";
}

function displayCoefficient({ numerator, denominator }: CauerElement["coefficient"], language: Language) {
  const n = String(numerator), d = String(denominator);
  const rounded = n.length > 6 || d.length > 6;
  const latex = rounded ? formatEngineeringLatexNumber(bigintRatio(numerator, denominator), language)
    : denominator === 1n ? n : "\\frac{" + n + "}{" + d + "}";
  return { latex, rounded };
}

function cauerTerm(coefficient: string, form: "i" | "ii") {
  return form === "i" ? coefficient + "q" : "\\frac{" + coefficient + "}{q}";
}

function cauerFormula(elements: readonly CauerElement[], form: "i" | "ii",
  coefficients: readonly ReturnType<typeof displayCoefficient>[]): string {
  const terms = coefficients.map(({ latex }) => cauerTerm(latex, form));
  const tail = terms.reduceRight((rest, term) => rest ? term + " + \\cfrac{1}{" + rest + "}" : term, "");
  const expansion = elements[0].placement === "series" ? tail : "\\cfrac{1}{" + tail + "}";
  return "\\frac{Z(s)}{\\Omega}" + (coefficients.some(({ rounded }) => rounded) ? "\\approx" : "=") + expansion;
}

function cauerRecurrence(elements: readonly CauerElement[], form: "i" | "ii"): string {
  const count = elements.length;
  const root = elements[0].placement === "series" ? "T_1" : "\\frac{1}{T_1}";
  const rows = ["\\frac{Z(s)}{\\Omega}&=" + root];
  if (count > 1) rows.push("T_k&=" + cauerTerm("a_k", form) + "+\\frac{1}{T_{k+1}},\\quad 1\\le k<" + count);
  rows.push("T_{" + count + "}&=" + cauerTerm("a_{" + count + "}", form));
  return "\\begin{aligned}" + rows.join("\\\\") + "\\end{aligned}";
}

export function CauerResults({ result, cursor, language, form, onApply }: {
  result: LcPortAnalysis;
  cursor: number | null;
  language: Language;
  form: "i" | "ii";
  onApply?: (elements: readonly CauerElement[]) => void;
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
  const coefficients = solution?.elements.map(element => displayCoefficient(element.coefficient, language));
  const cursorValues = cursor !== null && solution && result.kind === "finite" && !poles.some(omega => Math.abs(cursor / omega - 1) < 1e-8)
    ? [reactance(result.impedance, cursor), cauerReactance(solution.elements, cursor)] as const : null;
  return <details ref={disclosure} suppressHydrationWarning data-cauer-i={form === "i" ? "" : undefined} data-cauer-ii={form === "ii" ? "" : undefined} className="lc-panel lc-synthesis lc-cauer-result" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{form === "i" ? t("Первая форма Кауэра", "Перша форма Кауера") : t("Вторая форма Кауэра", "Друга форма Кауера")}</summary>
    {result.kind !== "finite" && <p>{t("Для разомкнутого или закороченного порта синтез не требуется.",
      "Для розімкненого або закороченого порту синтез не потрібен.")}</p>}
    {open && result.kind === "finite" && !solution && <p role="status">{t(
      "Не удалось построить эквивалентную LC-лестницу с конечными положительными номиналами.",
      "Не вдалося побудувати еквівалентну LC-драбину зі скінченними додатними номіналами.")}</p>}
    {solution && coefficients && <>
      <p>{form === "i" ? t(
        "При извлечении старших степеней последовательно выделяются L и поперечно C.",
        "Під час виділення старших степенів L стоять послідовно, а C під’єднуються поперечно.") : t(
        "При извлечении членов около нуля конденсаторы стоят последовательно, а катушки подключаются поперечно.",
        "Під час виділення членів поблизу нуля конденсатори стоять послідовно, а котушки під’єднуються поперечно.")}</p>
      <div className="lc-synthesis-formula" data-cauer-formula>
        <span aria-hidden="true" className="sr-only">Z(s) = {fraction(solution.elements, form)} Ω, q = s / (1000 rad/s)</span>
        <div className="lc-cauer-expanded"><Formula>{cauerFormula(solution.elements, form, coefficients)}</Formula></div>
        <div className="lc-cauer-recursive"><Formula>{cauerRecurrence(solution.elements, form)}</Formula></div>
        <Formula block={false}>{"q=\\frac{s}{1000\\,\\mathrm{rad/s}}"}</Formula>
      </div>
      <LcSynthesisSchematic synthesis={{ form: `cauer-${form}`, elements: solution.elements }} language={language} />
      <table aria-label={t("Номиналы формы Кауэра", "Номінали форми Кауера")}>
        <thead><tr><th scope="col">{t("Звено", "Ланка")}</th><th scope="col">{t("Соединение", "З’єднання")}</th>
          <th scope="col">{t("Номинал", "Номінал")}</th>
          <th scope="col" className="lc-cauer-coefficient"><Formula block={false}>{"a_k"}</Formula></th></tr></thead>
        <tbody>{solution.elements.map((element, i) =>
          <tr data-cauer-term={element.kind} data-cauer-placement={element.placement} key={i}>
            <th scope="row">{element.kind.toUpperCase() + String(i + 1)}</th>
            <td>{element.placement === "series" ? t("В разрыв", "Послідовно") : t("Поперёк", "Поперечно")}</td>
            <td data-cauer-nominal={element.valueSI}>
              <LcSynthesisNominal value={element.valueSI} unit={element.kind === "l" ? "H" : "F"} language={language} />
            </td>
            <td className="lc-cauer-coefficient">
              <Formula block={false}>{(coefficients[i].rounded ? "\\approx " : "") + coefficients[i].latex}</Formula>
            </td>
          </tr>)}</tbody>
      </table>
      <p data-cauer-exact>{t("Обратная сборка даёт исходную рациональную функцию Z(s).",
        "Зворотне складання дає початкову раціональну функцію Z(s).")}</p>
      {onApply && <button type="button" className="lc-synthesis-action" data-lc-apply-form={`cauer-${form}`}
        onClick={() => onApply(solution.elements)}>
        {t("Перенести в редактор", "Перенести до редактора")}
      </button>}
      {cursorValues?.every(Number.isFinite) && <p data-cauer-at-cursor>
        {t("Исходная схема", "Початкове коло")} {formatEngineeringValue(cursorValues[0], "Ω", language)} ·
        {t("Лестница Кауэра", "Драбина Кауера")} {formatEngineeringValue(cursorValues[1], "Ω", language)}
      </p>}
    </>}
  </details>;
}
