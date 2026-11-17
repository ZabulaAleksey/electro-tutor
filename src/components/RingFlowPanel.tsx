import { useMemo, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerConfiguration } from "../power-system/configuration";
import type { PowerCalculationCut } from "../power-system/network";
import { solvePreliminaryRing, type RingBranch, type RingMethod } from "../power-system/ring-preliminary";
import type { Language } from "../types";
import { RingAgreementPanel } from "./RingAgreementPanel";
import { RingLossPanel } from "./RingLossPanel";

export function RingFlowPanel({ configuration, language, cuts, onCutsChange }: {
  configuration: PowerConfiguration; language: Language; cuts: readonly PowerCalculationCut[];
  onCutsChange: (next: readonly PowerCalculationCut[]) => void;
}) {
  const [method, setMethod] = useState<RingMethod>("lengths");
  const calculation = useMemo(() => {
    try { return { result: solvePreliminaryRing(configuration, method, cuts) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [configuration, method, cuts]);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const methodLabel = t("Метод предварительного расчёта", "Метод попереднього розрахунку");
  const direction = (branch: RingBranch, value: number) => Math.abs(value) < 1e-10 ? "—"
    : value > 0 ? branch.fromBusId + " → " + branch.toBusId : branch.toBusId + " → " + branch.fromBusId;
  const number = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  const result = calculation.result;
  const diagnostic = calculation.error === "power-ring-inhomogeneous"
    ? t("Для неоднородной сети выберите комплексные сопротивления.", "Для неоднорідної мережі виберіть комплексні опори.")
    : t("Проверьте питающий источник, типы линий и замкнутое кольцо.", "Перевірте джерело живлення, типи ліній і замкнене кільце.");
  return <section className="power-panel power-flow" data-power-ring>
    <h2>{t("Предварительные потоки в кольце", "Попередні потоки в кільці")}</h2>
    <label>{methodLabel}<select aria-label={methodLabel} value={method}
      onChange={event => setMethod(event.target.value === "lengths" ? "lengths" : "impedances")}>
      <option value="lengths">{t("По длинам", "За довжинами")}</option>
      <option value="impedances">{t("По комплексным сопротивлениям", "За комплексними опорами")}</option>
    </select></label>
    {calculation.error && <p role="status">{diagnostic}</p>}
    {result && <>
      <p>{t("Кольцо развёрнуто от источника", "Кільце розгорнуто від джерела")} {result.referenceBusId} → {result.referenceBusId}.
        {" "}{t("Мощности рассчитаны без потерь.", "Потужності розраховано без втрат.")}</p>
      <p data-ring-split-p={result.split.p.join(",")} data-ring-split-q={result.split.q.join(",")}>
        {t("Потокораздел", "Потокорозподіл")} P · {result.split.p.join(", ") || "—"} · Q · {result.split.q.join(", ") || "—"}
      </p>
      <div className="power-fields">
        {(["p", "q"] as const).map(quantity => {
          const title = t("Условный разрез ", "Умовний розріз ") + quantity.toUpperCase();
          return <label key={quantity}>{title}<select value={cuts.find(item => item.quantity === quantity)?.busId ?? ""} aria-label={title}
            onChange={event => {
              const busId = event.target.value;
              onCutsChange([...cuts.filter(item => item.quantity !== quantity), ...(busId ? [{ busId, quantity }] : [])]);
            }}>
            <option value="">—</option>{result.branches.filter(line => line.toBusId !== result.referenceBusId)
              .map(line => <option value={line.toBusId} key={line.toBusId}>{line.toBusId}</option>)}
          </select></label>;
        })}
      </div>
      <p>{t("Условные разрезы отмечают точки расчёта. Кольцо остаётся замкнутым.",
        "Умовні розрізи позначають точки розрахунку. Кільце залишається замкненим.")}</p>
      <div className="power-flow-table" tabIndex={0} role="region" aria-label={t("Потоки и направления", "Потоки й напрямки")}>
        <table>
          <thead><tr><th scope="col">{t("Ветвь", "Гілка")}</th><th scope="col">P, MW</th><th scope="col">Q, MVAr</th></tr></thead>
          <tbody>{result.branches.map(line => <tr key={line.id} data-ring-branch={line.id}
            data-ring-p={line.preliminaryMva.re} data-ring-q={line.preliminaryMva.im}>
            <th scope="row">{line.id}</th>
            <td>{number(Math.abs(line.preliminaryMva.re))} · {direction(line, line.preliminaryMva.re)}</td>
            <td>{number(Math.abs(line.preliminaryMva.im))} · {direction(line, line.preliminaryMva.im)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <RingLossPanel configuration={configuration} method={method} cuts={cuts} language={language} />
      <RingAgreementPanel configuration={configuration} method={method} cuts={cuts} language={language} />
    </>}
  </section>;
}
