import { formatEngineeringNumber } from "../engineering/format";
import { teachingVoltageLimitsPu, type PowerOverlayLayer, type PowerOverlayReadings } from "../power-system/flow-overlay";
import type { Language } from "../types";

export function PowerOverlayControls({ language, layers, onToggle, readings, selectedId }: {
  language: Language; layers: ReadonlySet<PowerOverlayLayer>; onToggle: (key: PowerOverlayLayer) => void;
  readings: PowerOverlayReadings; selectedId: string;
}) {
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const text = { voltage: t("Напряжения", "Напруги"), angle: t("Углы", "Кути"), active: "P", reactive: "Q",
    current: t("Токи", "Струми"), losses: t("Потери", "Втрати"), loading: t("Загрузка", "Завантаження"),
    warnings: t("Предупреждения", "Попередження") };
  const branch = readings.branches.find(item => item.id === selectedId);
  const n = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  return <section className="power-panel power-overlay-controls" data-power-overlay-controls>
    <h2>{t("Отображение режима на схеме", "Відображення режиму на схемі")}</h2>
    <div className="power-overlay-layers">
      {(Object.keys(text) as PowerOverlayLayer[]).map(key => <label key={key}>
        <input type="checkbox" checked={layers.has(key)} onChange={() => onToggle(key)} />{text[key]}
      </label>)}
    </div>
    {layers.has("warnings") && <p>{t("Учебный диапазон напряжения", "Навчальний діапазон напруги")} ·
      {" "}{n(teachingVoltageLimitsPu.low)}–{n(teachingVoltageLimitsPu.high)} p.u.</p>}
    {branch && <div className="power-overlay-details" data-power-selected-reading={branch.id}>
      <p>{branch.id} · {branch.fromBusId} → {branch.toBusId}</p>
      {branch.sendingPowerMva && <p>{branch.fromBusId} · {n(branch.sendingPowerMva.re)} MW · {n(branch.sendingPowerMva.im)} MVAr</p>}
      {branch.receivingPowerMva && <p>{branch.toBusId} · {n(branch.receivingPowerMva.re)} MW · {n(branch.receivingPowerMva.im)} MVAr</p>}
      {branch.loadingPercent !== null && <p>{text.loading} · {n(branch.loadingPercent)}%</p>}
    </div>}
  </section>;
}
