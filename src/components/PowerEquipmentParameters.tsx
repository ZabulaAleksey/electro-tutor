import type { Language } from "../types";
import type { EquipmentType } from "../power-system/catalogue";

type Props = {
  language: Language;
  type: EquipmentType;
  overridden: boolean;
  onApply: (candidate: EquipmentType) => boolean;
  onReset: () => void;
};

function valueOf(data: FormData, name: string): number | undefined {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? Number(value) : undefined;
}

function readEquipmentParameters(data: FormData, type: EquipmentType): EquipmentType {
  const optional = (name: string) => valueOf(data, name);
  const number = (name: string) => optional(name) ?? NaN;
  if (type.kind === "line") {
    return {
      ...type, ratedFrequencyHz: number("ratedFrequencyHz"), ratedKv: optional("ratedKv"),
      rOhmPerKm: number("rOhmPerKm"), xOhmPerKm: number("xOhmPerKm"),
      shunt: type.shunt.kind === "capacitance"
        ? { kind: "capacitance", faradPerKm: number("shunt") }
        : { kind: "susceptance", siemensPerKm: number("shunt") },
      gSiemensPerKm: optional("gSiemensPerKm"), maxCurrentA: optional("maxCurrentA"), sectionMm2: optional("sectionMm2"),
    };
  }
  return {
    ...type, ratedMva: number("ratedMva"), highKv: number("highKv"), lowKv: number("lowKv"),
    shortCircuitPct: number("shortCircuitPct"), noLoadLossKw: number("noLoadLossKw"),
    noLoadCurrentPct: number("noLoadCurrentPct"), phaseShiftDeg: optional("phaseShiftDeg"),
    resistance: type.resistance.kind === "load-loss"
      ? { kind: "load-loss", kw: number("resistance") }
      : { kind: "resistance-percent", percent: number("resistance") },
  };
}

function Field({ label, name, value, optional = false, signed = false }: {
  label: string; name: string; value?: number; optional?: boolean; signed?: boolean;
}) {
  return <label>{label}
    <input name={name} type="number" inputMode="decimal" min={signed ? undefined : 0}
      step="any" defaultValue={value ?? ""} required={!optional} />
  </label>;
}

export default function PowerEquipmentParameters({ language, type, overridden, onApply, onReset }: Props) {
  const t = (r: string, u: string) => language === "ru" ? r : u;
  return <form className="power-equipment-parameters" onSubmit={event => {
    event.preventDefault();
    onApply(readEquipmentParameters(new FormData(event.currentTarget), type));
  }}>
    <fieldset>
      <legend>{t("Параметры типа", "Параметри типу")}</legend>
      {type.kind === "line" ? <>
        <Field label={t("Частота, Hz", "Частота, Hz")} name="ratedFrequencyHz" value={type.ratedFrequencyHz} />
        <Field label="R, Ω/km" name="rOhmPerKm" value={type.rOhmPerKm} />
        <Field label="X, Ω/km" name="xOhmPerKm" value={type.xOhmPerKm} />
        <Field label={type.shunt.kind === "capacitance" ? "C, F/km" : "B, S/km"} name="shunt"
          value={type.shunt.kind === "capacitance" ? type.shunt.faradPerKm : type.shunt.siemensPerKm} />
        <Field label={t("Номинальное напряжение, kV", "Номінальна напруга, kV")} name="ratedKv" value={type.ratedKv} optional />
        <Field label={t("Проводимость G, S/km", "Провідність G, S/km")} name="gSiemensPerKm" value={type.gSiemensPerKm} optional />
        <Field label={t("Максимальный ток, A", "Максимальний струм, A")} name="maxCurrentA" value={type.maxCurrentA} optional />
        <Field label={t("Сечение, mm²", "Переріз, mm²")} name="sectionMm2" value={type.sectionMm2} optional />
      </> : <>
        <Field label={t("Мощность, MVA", "Потужність, MVA")} name="ratedMva" value={type.ratedMva} />
        <Field label={t("Высшее напряжение, kV", "Вища напруга, kV")} name="highKv" value={type.highKv} />
        <Field label={t("Низшее напряжение, kV", "Нижча напруга, kV")} name="lowKv" value={type.lowKv} />
        <Field label="uk, %" name="shortCircuitPct" value={type.shortCircuitPct} />
        <Field label={type.resistance.kind === "load-loss" ? t("Потери короткого замыкания, kW", "Втрати короткого замикання, kW")
          : t("Активное сопротивление, %", "Активний опір, %")} name="resistance"
          value={type.resistance.kind === "load-loss" ? type.resistance.kw : type.resistance.percent} />
        <Field label={t("Потери холостого хода, kW", "Втрати холостого ходу, kW")} name="noLoadLossKw" value={type.noLoadLossKw} />
        <Field label={t("Ток холостого хода, %", "Струм холостого ходу, %")} name="noLoadCurrentPct" value={type.noLoadCurrentPct} />
        <Field label={t("Фазовый сдвиг, °", "Фазовий зсув, °")} name="phaseShiftDeg" value={type.phaseShiftDeg} optional signed />
      </>}
      <div className="power-equipment-parameters-actions">
        <button type="submit">{t("Применить параметры", "Застосувати параметри")}</button>
        <button type="button" disabled={!overridden} onClick={onReset}>{t("Вернуть параметры типа", "Повернути параметри типу")}</button>
      </div>
    </fieldset>
  </form>;
}
