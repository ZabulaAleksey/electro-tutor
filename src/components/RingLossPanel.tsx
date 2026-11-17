import { useMemo, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerConfiguration } from "../power-system/configuration";
import type { PowerCalculationCut } from "../power-system/network";
import type { RingMethod } from "../power-system/ring-preliminary";
import { refineRingWithLosses } from "../power-system/ring-refinement";
import type { Language } from "../types";

export function RingLossPanel({ configuration, method, cuts, language }: {
  configuration: PowerConfiguration; method: RingMethod; cuts: readonly PowerCalculationCut[]; language: Language;
}) {
  const [enabled, setEnabled] = useState(false);
  const calculation = useMemo(() => {
    if (!enabled) return null;
    try { return { result: refineRingWithLosses(configuration, method, cuts) }; }
    catch { return { error: true }; }
  }, [configuration, method, cuts, enabled]);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const number = (v: number) => formatEngineeringNumber(v, language, { maximumFractionDigits: 3 });
  const result = calculation?.result;
  return <section data-ring-refinement className="power-panel">
    <h3>{t("Уточнение потерь и напряжений", "Уточнення втрат і напруг")}</h3>
    {!enabled && <button type="button" onClick={() => setEnabled(true)}>{t("Уточнить режим кольца", "Уточнити режим кільця")}</button>}
    {calculation?.error && <p role="status">{t("Уточнение не сошлось. Проверьте параметры кольца и нагрузку.",
      "Уточнення не збіглося. Перевірте параметри кільця й навантаження.")}</p>}
    {result && <div data-ring-refinement-result data-ring-loss={result.totalAbsorptionMva.re} data-ring-balance={result.powerBalanceErrorMva}>
      <p data-ring-refinement-cut={result.cutBusId}>{t("Две питающие ветви сходятся на шине", "Дві живильні гілки сходяться на шині")} {result.cutBusId}.</p>
      <p>{t("Доли P от двух сторон", "Частки P від двох боків")} · {number(result.leftDeliveryMva.re)} / {number(result.rightDeliveryMva.re)} MW</p>
      <p>{t("Доли Q от двух сторон", "Частки Q від двох боків")} · {number(result.leftDeliveryMva.im)} / {number(result.rightDeliveryMva.im)} MVAr</p>
      <p>{t("Поглощение ветвей", "Споживання гілок")} · {number(result.totalAbsorptionMva.re)} MW · {number(result.totalAbsorptionMva.im)} MVAr</p>
      <p>{t("Итерации", "Ітерації")} {result.iterations} · {t("Невязка баланса", "Нев’язка балансу")} {result.powerBalanceErrorMva.toExponential(2)} MVA</p>
      <div className="power-flow-table" tabIndex={0} role="region" aria-label={t("Уточнённые напряжения", "Уточнені напруги")}>
        <table>
          <thead><tr><th scope="col">{t("Шина", "Шина")}</th><th scope="col">U, kV</th><th scope="col">δ, °</th></tr></thead>
          <tbody>{result.nodes.map(bus => <tr key={bus.busId} data-ring-refined-bus={bus.busId} data-ring-refined-voltage={bus.voltageKv}>
            <th scope="row">{bus.busId}</th><td>{number(bus.voltageKv)}</td><td>{number(bus.angleDeg)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="power-flow-table" tabIndex={0} role="region" aria-label={t("Уточнённые потоки", "Уточнені потоки")}>
        <table>
          <thead><tr><th scope="col">{t("Ветвь", "Гілка")}</th><th scope="col">P, MW</th><th scope="col">Q, MVAr</th>
            <th scope="col">ΔP, MW</th><th scope="col">ΔQ, MVAr</th></tr></thead>
          <tbody>{result.branches.map(line => <tr key={line.id}>
            <th scope="row">{line.id} · {line.fromBusId} → {line.toBusId}</th>
            <td>{number(line.sendingMva.re)}</td><td>{number(line.sendingMva.im)}</td>
            <td>{number(line.seriesLossMva.re)}</td><td>{number(line.seriesLossMva.im)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}
