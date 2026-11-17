import { formatEngineeringNumber } from "../engineering/format";
import type { PowerOverlayReadings } from "../power-system/flow-overlay";
import type { Language } from "../types";

export function PowerMobileReadout({ language, selectedId, readings }: {
  language: Language; selectedId: string; readings?: PowerOverlayReadings;
}) {
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const n = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  const branch = readings?.branches.find(item => item.id === selectedId);
  return <section className="power-mobile-readout power-panel" data-power-mobile-readout>
    <h2>{t("Показания на схеме", "Покази на схемі")}</h2>
    {!readings && <p>{t("Запустите расчёт AC. На схеме можно выбрать ветвь касанием.", "Запустіть розрахунок AC. На схемі можна вибрати гілку дотиком.")}</p>}
    {readings && <>
      <ul className="power-mobile-badges" aria-label={t("Напряжения шин", "Напруги шин")}>
        {readings.nodes.map(bus => <li key={bus.busId} data-power-mobile-bus={bus.busId}>
          <strong>{bus.busId}</strong> {n(bus.voltageKv)} kV{bus.outOfRange ? " !" : ""}
        </li>)}
      </ul>
      {branch && <div className="power-mobile-detail" aria-live="polite" data-power-mobile-branch={branch.id}>
        <strong>{branch.id} · {branch.fromBusId} → {branch.toBusId}</strong>
        {branch.sendingPowerMva && <span>P {n(branch.sendingPowerMva.re)} MW · Q {n(branch.sendingPowerMva.im)} MVAr</span>}
        {branch.fromCurrentKa !== null && <span>I {n(branch.fromCurrentKa * 1000)} A · ΔP {n(branch.seriesLossesMva.re)} MW</span>}
        {branch.loadingPercent !== null && <span>{t("Загрузка", "Завантаження")} {n(branch.loadingPercent)}%</span>}
      </div>}
    </>}
  </section>;
}
