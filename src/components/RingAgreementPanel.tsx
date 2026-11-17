import { useMemo, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerConfiguration } from "../power-system/configuration";
import type { PowerCalculationCut } from "../power-system/network";
import { compareRingSolvers, ringAgreementTolerances } from "../power-system/ring-agreement";
import type { RingMethod } from "../power-system/ring-preliminary";
import type { Language } from "../types";

export function RingAgreementPanel({ configuration, method, cuts, language }: {
  configuration: PowerConfiguration; method: RingMethod; cuts: readonly PowerCalculationCut[]; language: Language;
}) {
  const [enabled, setEnabled] = useState(false);
  const calculation = useMemo(() => {
    if (!enabled) return null;
    try { return { result: compareRingSolvers(configuration, method, cuts) }; }
    catch { return { error: true }; }
  }, [configuration, method, cuts, enabled]);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const names = { voltageKv: "U, kV", angleDeg: "δ, °", activeMw: "P, MW", reactiveMvar: "Q, MVAr" };
  const result = calculation?.result;
  return <section className="power-panel" data-ring-agreement>
    <h3>{t("Сравнение с узловым расчётом", "Порівняння з вузловим розрахунком")}</h3>
    {!enabled && <button type="button" onClick={() => setEnabled(true)}>{t("Сравнить с Ybus", "Порівняти з Ybus")}</button>}
    {calculation?.error && <p role="status">{t("Один из расчётов не сошёлся.", "Один із розрахунків не збігся.")}</p>}
    {result && <>
      <p data-ring-agreement-pass={result.pass}>
        {result.pass ? t("Результаты совпадают в пределах допусков.", "Результати збігаються в межах допусків.")
          : t("Расхождение выше допуска.", "Розбіжність перевищує допуск.") + " " + result.mismatchedIds.join(", ")}
      </p>
      <div className="power-flow-table" role="region" tabIndex={0} aria-label={t("Максимальные расхождения", "Максимальні розбіжності")}>
        <table>
          <thead><tr><th scope="col">{t("Величина", "Величина")}</th><th scope="col">{t("Расхождение", "Розбіжність")}</th>
            <th scope="col">{t("Допуск", "Допуск")}</th></tr></thead>
          <tbody>{(Object.keys(names) as (keyof typeof names)[]).map(key => <tr key={key} data-agreement-metric={key}
            data-agreement-delta={result.maximum[key]}><th scope="row">{names[key]}</th>
            <td>{result.maximum[key].toExponential(3)}</td><td>{formatEngineeringNumber(ringAgreementTolerances[key], language)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
