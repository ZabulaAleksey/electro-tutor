import { useEffect, useMemo, useRef, useState } from "react";
import { chooseEngineeringUnit, formatEngineeringNumber, inEngineeringUnit } from "../engineering/format";
import type { Complex } from "../models/circular-diagram";
import type { PowerConfiguration } from "../power-system/configuration";
import { configuredLineEquivalent } from "../power-system/line-equivalent";
import type { Language } from "../types";

function displayComplex(value: Complex, unit: string, language: Language) {
  const scale = chooseEngineeringUnit(unit, Math.max(Math.abs(value.re), Math.abs(value.im)), language);
  const n = (part: number) => formatEngineeringNumber(inEngineeringUnit(part, scale), language, { maximumFractionDigits: 3 });
  const number = value.im === 0 ? n(value.re) : value.re === 0 ? "j" + n(value.im) : n(value.re) + " + j" + n(value.im);
  return number + " " + scale.symbol;
}

export function LineEquivalentPanel({ configuration, lineId, language }: {
  configuration: PowerConfiguration; lineId: string; language: Language;
}) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (disclosure.current?.open) setOpen(true);
  }, []);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const calculation = useMemo(() => {
    if (!open) return null;
    try { return { equivalent: configuredLineEquivalent(configuration, lineId) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [configuration, lineId, open]);
  const eq = calculation?.equivalent;
  const message = calculation?.error === "power-line-type-required"
    ? t("Выберите тип линии, чтобы получить П-схему.", "Виберіть тип лінії, щоб отримати П-схему.")
    : calculation?.error === "power-line-ambiguous-voltage"
      ? t("Укажите номинал типа или согласуйте номиналы шин.", "Укажіть номінал типу або узгодьте номінали шин.")
      : t("Проверьте параметры линии.", "Перевірте параметри лінії.");
  return <details className="power-advanced power-line-equivalent" data-line-equivalent ref={disclosure}
    suppressHydrationWarning onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Показать схему замещения", "Показати схему заміщення")}</summary>
    {calculation?.error && <p role="status">{message}</p>}
    {eq && <>
      <svg viewBox="0 0 400 156" role="img" aria-label={t("П-схема линии", "П-схема лінії")}>
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M24 45H157M243 45H376M90 45V74M90 107V132H310V107M310 74V45" />
          <rect x="157" y="30" width="86" height="30" rx="2" />
          <rect x="67" y="74" width="46" height="33" rx="2" />
          <rect x="287" y="74" width="46" height="33" rx="2" />
          <circle cx="22" cy="45" r="2" /><circle cx="378" cy="45" r="2" />
          <circle cx="90" cy="45" r="2.6" fill="currentColor" /><circle cx="310" cy="45" r="2.6" fill="currentColor" />
        </g>
        <g fill="currentColor" textAnchor="middle" fontSize="14">
          <text x="200" y="50">Z</text><text x="90" y="95">Y/2</text><text x="310" y="95">Y/2</text>
        </g>
      </svg>
      <p>{t("На фазу", "На фазу")} · {formatEngineeringNumber(eq.frequencyHz, language)} Hz ·
        {" "}{formatEngineeringNumber(eq.nominalKv, language)} kV</p>
      <p data-line-pi-r={eq.seriesOhm.re} data-line-pi-x={eq.seriesOhm.im}>
        Z = (R′ + jX′)ℓ/n = {displayComplex(eq.seriesOhm, "Ω", language)}
      </p>
      <p data-line-pi-g={eq.shuntPerEndSiemens.re} data-line-pi-b={eq.shuntPerEndSiemens.im}>
        Y/2 = (G′ + jB′)ℓn/2 = {displayComplex(eq.shuntPerEndSiemens, "S", language)}
      </p>
      <p>{t("Ёмкостная ветвь отдаёт реактивную мощность в узел.", "Ємнісна гілка віддає реактивну потужність у вузол.")}</p>
    </>}
  </details>;
}
