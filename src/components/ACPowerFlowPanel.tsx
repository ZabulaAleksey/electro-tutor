import { useMemo, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import { solveACPowerFlow } from "../power-system/ac-power-flow";
import type { PowerConfiguration } from "../power-system/configuration";
import type { Language } from "../types";

export function ACPowerFlowPanel({ configuration, language }: { configuration: PowerConfiguration; language: Language }) {
  const [enabled, setEnabled] = useState(false);
  const calculation = useMemo(() => {
    if (!enabled) return null;
    try { return { result: solveACPowerFlow(configuration) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [configuration, enabled]);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const num = (value: number | null | undefined) => value == null ? "—" : formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  const issue = calculation?.error;
  const message = issue?.startsWith("power-flow-branch-parameters:")
    ? t("Укажите действующий тип ветви ", "Укажіть дійсний тип гілки ") + issue.split(":")[1] + "."
    : issue === "power-ac-reference-count" || issue === "power-ac-source-required"
      ? t("Для каждого питаемого участка задайте один опорный источник.", "Для кожної живленої ділянки задайте одне опорне джерело.")
      : t("Расчёт AC не сошёлся. Проверьте нагрузку, источники и параметры ветвей.",
        "Розрахунок AC не збігся. Перевірте навантаження, джерела й параметри гілок.");
  const result = calculation?.result;
  return <section className="power-panel power-flow" data-power-ac>
    <h2>{t("Общий расчёт AC", "Загальний розрахунок AC")}</h2>
    {!enabled && <button type="button" onClick={() => setEnabled(true)}>{t("Рассчитать по Ybus", "Розрахувати за Ybus")}</button>}
    {issue && <p role="status">{message}</p>}
    {result && <div data-ac-result data-ac-mismatch={result.maxMismatchMva} data-ac-balance={result.powerBalanceErrorMva}>
      {result.sources.map(source => <p key={source.id}>
        {t("Опорный источник", "Опорне джерело")} {source.id} · {num(source.powerMva.re)} MW · {num(source.powerMva.im)} MVAr
      </p>)}
      <p>{t("Итерации", "Ітерації")} {result.iterations} · {t("Узловая невязка", "Вузлова нев’язка")} {result.maxMismatchMva.toExponential(2)} MVA</p>
      {result.unpoweredBusIds.length > 0 && <p>{t("Шины без питания", "Шини без живлення")} · {result.unpoweredBusIds.join(", ")}</p>}
      {result.branches.some(branch => branch.fromCurrentKa === null) && <p>
        {t("В контуре идеальных аппаратов отдельные токи не определяются однозначно.",
          "У контурі ідеальних апаратів окремі струми не визначаються однозначно.")}
      </p>}
      <div className="power-flow-table" role="region" tabIndex={0} aria-label={t("Напряжения AC", "Напруги AC")}>
        <table>
          <thead><tr><th scope="col">{t("Шина", "Шина")}</th><th scope="col">U, kV</th><th scope="col">δ, °</th></tr></thead>
          <tbody>{result.nodes.map(bus => <tr key={bus.busId} data-ac-bus={bus.busId} data-ac-voltage={bus.voltageKv}>
            <th scope="row">{bus.busId}</th><td>{num(bus.voltageKv)}</td><td>{num(bus.angleDeg)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="power-flow-table" role="region" tabIndex={0} aria-label={t("Потоки AC", "Потоки AC")}>
        <table>
          <thead><tr><th scope="col">{t("Ветвь", "Гілка")}</th><th scope="col">P₁, MW</th><th scope="col">Q₁, MVAr</th>
            <th scope="col">P₂, MW</th><th scope="col">Q₂, MVAr</th><th scope="col">ΔP, MW</th></tr></thead>
          <tbody>{result.branches.map(branch => <tr key={branch.id} data-ac-branch={branch.id}>
            <th scope="row">{branch.id} · {branch.fromBusId} → {branch.toBusId}</th>
            <td>{num(branch.sendingPowerMva?.re)}</td><td>{num(branch.sendingPowerMva?.im)}</td>
            <td>{num(branch.receivingPowerMva?.re)}</td><td>{num(branch.receivingPowerMva?.im)}</td>
            <td>{num(branch.seriesLossesMva.re)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}
