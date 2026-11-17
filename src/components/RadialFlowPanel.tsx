import { useMemo, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerConfiguration } from "../power-system/configuration";
import { solveRadialFlow } from "../power-system/radial-flow";
import type { Language } from "../types";

export function RadialFlowPanel({ configuration, language }: { configuration: PowerConfiguration; language: Language }) {
  const [enabled, setEnabled] = useState(false);
  const calculation = useMemo(() => {
    if (!enabled) return null;
    try { return { result: solveRadialFlow(configuration) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [configuration, enabled]);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const number = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  const error = calculation?.error;
  const branch = error?.startsWith("power-flow-branch-parameters:") && error.split(":")[1];
  const message = branch ? t("Проверьте заданный тип и параметры ветви ", "Перевірте заданий тип і параметри гілки ") + branch + "."
    : error === "power-flow-mesh" ? t("Модель содержит замкнутый контур.", "Модель містить замкнений контур.")
    : error === "power-flow-source-count" ? t("Для расчёта подключите один питающий источник.", "Для розрахунку під’єднайте одне джерело живлення.")
    : t("Расчёт не сошёлся. Проверьте нагрузку, напряжения и параметры ветвей.",
      "Розрахунок не збігся. Перевірте навантаження, напруги й параметри гілок.");
  const result = calculation?.result;
  return <section className="power-panel power-flow" data-power-radial>
    <h2>{t("Режим радиальной сети", "Режим радіальної мережі")}</h2>
    {!enabled && <button type="button" onClick={() => setEnabled(true)}>{t("Рассчитать радиальную сеть", "Розрахувати радіальну мережу")}</button>}
    {error && <p role="status">{message}</p>}
    {result && <div data-radial-iterations={result.iterations} data-radial-balance={result.powerBalanceErrorMva}>
      <p>{t("Источник", "Джерело")} {result.referenceBusId} · {number(result.sourceMva.re)} MW · {number(result.sourceMva.im)} MVAr</p>
      <p>{t("Поглощение ветвей", "Споживання гілок")} · {number(result.totalAbsorptionMva.re)} MW · {number(result.totalAbsorptionMva.im)} MVAr</p>
      <p>{t("Итерации", "Ітерації")} {result.iterations} · {t("Невязка баланса", "Нев’язка балансу")} {result.powerBalanceErrorMva.toExponential(2)} MVA</p>
      {result.unpoweredBusIds.length > 0 &&
        <p>{t("Шины без питания", "Шини без живлення")} · {result.unpoweredBusIds.join(", ")}</p>}
      <div className="power-flow-table" tabIndex={0} role="region" aria-label={t("Напряжения шин", "Напруги шин")}>
        <table>
          <caption>{t("Напряжения шин", "Напруги шин")}</caption>
          <thead><tr><th scope="col">{t("Шина", "Шина")}</th><th scope="col">U, kV</th><th scope="col">δ, °</th></tr></thead>
          <tbody>{result.nodes.map(node => <tr key={node.busId} data-radial-bus={node.busId} data-radial-voltage={node.voltageKv}>
            <th scope="row">{node.busId}</th><td>{number(node.voltageKv)}</td><td>{number(node.angleDeg)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="power-flow-table" tabIndex={0} role="region" aria-label={t("Потоки по ветвям", "Потоки в гілках")}>
        <table>
          <caption>{t("Потоки по ветвям", "Потоки в гілках")}</caption>
          <thead><tr><th scope="col">{t("Ветвь", "Гілка")}</th><th scope="col">{t("Выводы", "Виводи")}</th>
            <th scope="col">P, MW</th><th scope="col">Q, MVAr</th><th scope="col">I₁ / I₂, A</th>
            <th scope="col">ΔP, MW</th><th scope="col">ΔQ, MVAr</th></tr></thead>
          <tbody>{result.branches.map(branch => <tr key={branch.id} data-radial-branch={branch.id} data-radial-series-loss={branch.seriesLossesMva.re}>
            <th scope="row">{branch.id}</th><td>{branch.fromBusId} → {branch.toBusId}</td>
            <td>{number(branch.sendingPowerMva.re)}</td><td>{number(branch.sendingPowerMva.im)}</td>
            <td>{number(1000 * branch.fromCurrentKa)} / {number(1000 * branch.toCurrentKa)}</td>
            <td>{number(branch.seriesLossesMva.re)}</td><td>{number(branch.seriesLossesMva.im)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}
