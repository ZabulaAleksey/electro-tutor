import { useEffect, useMemo, useRef, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { PowerConfiguration } from "../power-system/configuration";
import { configuredTransformerEquivalent } from "../power-system/transformer-equivalent";
import type { Language } from "../types";

export function TransformerEquivalentPanel({ configuration, transformerId, language }: {
  configuration: PowerConfiguration; transformerId: string; language: Language;
}) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (disclosure.current?.open) setOpen(true);
  }, []);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const number = (value: number) => formatEngineeringNumber(value, language, { maximumFractionDigits: 3 });
  const calculation = useMemo(() => {
    if (!open) return null;
    try { return { result: configuredTransformerEquivalent(configuration, transformerId) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [configuration, transformerId, open]);
  const eq = calculation?.result;
  return <details className="power-advanced power-line-equivalent" ref={disclosure} data-transformer-equivalent
    suppressHydrationWarning onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Показать схему замещения", "Показати схему заміщення")}</summary>
    {calculation?.error && <p role="status">{calculation.error === "power-transformer-type-required"
      ? t("Выберите каталожный тип трансформатора.", "Виберіть каталожний тип трансформатора.")
      : t("Проверьте паспортные данные и отпайку.", "Перевірте паспортні дані та відпайку.")}</p>}
    {eq && <>
      <svg viewBox="0 0 400 150" role="img" aria-label={t("Схема замещения трансформатора", "Схема заміщення трансформатора")}>
        <g stroke="currentColor" strokeWidth="1.6" fill="none">
          <path d="M24 45H142M226 45H285M319 45H376M75 45V74M24 129H285M75 107V129M319 129H376M285 45V57a8 9 0 0 1 0 18a8 9 0 0 1 0 18a8 9 0 0 1 0 18V129M319 45V57a8 9 0 0 0 0 18a8 9 0 0 0 0 18a8 9 0 0 0 0 18V129M299 54V114M305 54V114" />
          <rect x="142" y="30" width="84" height="30" rx="2" />
          <rect x="52" y="74" width="46" height="33" rx="2" />
          <circle cx="22" cy="45" r="2" /><circle cx="378" cy="45" r="2" />
          <circle cx="75" cy="45" r="2.6" fill="currentColor" /><circle cx="22" cy="129" r="2" /><circle cx="378" cy="129" r="2" />
        </g>
        <g fill="currentColor" textAnchor="middle" fontSize="14">
          <text x="184" y="50">Z</text><text x="75" y="95">Y₀</text><text x="301" y="28">a</text>
          <text x="24" y="29">{t("ВН", "ВН")}</text><text x="372" y="29">{t("НН", "НН")}</text>
        </g>
      </svg>
      <p>{t("Пофазные параметры, приведённые к стороне ВН", "Пофазні параметри, зведені до сторони ВН")} · {number(eq.highKv)} kV</p>
      <p data-transformer-equivalent-r={eq.seriesOhm.re} data-transformer-equivalent-x={eq.seriesOhm.im}>
        R = {number(eq.seriesOhm.re)} Ω · X = {number(eq.seriesOhm.im)} Ω
      </p>
      <p>G₀ = {number(eq.shuntSiemens.re * 1e6)} µS · B₀ = {number(eq.shuntSiemens.im * 1e6)} µS</p>
      <p data-transformer-ratio={eq.tapRatioHvSide}>|a| = {number(eq.tapRatioHvSide)} ·
        {" "}{t("Сдвиг НН относительно ВН", "Зсув НН відносно ВН")} = {number(eq.phaseShiftDeg)}°</p>
      <p data-transformer-no-load-kw={eq.nominalLosses.noLoadActiveKw}>
        {t("Холостой ход", "Неробочий хід")} · P₀ = {number(eq.nominalLosses.noLoadActiveKw)} kW · Q₀ = {number(eq.nominalLosses.noLoadReactiveKvar)} kvar
      </p>
      <p data-transformer-rated-series-kw={eq.nominalLosses.ratedSeriesActiveKw}>
        {t("Номинальный ток", "Номінальний струм")} · ΔP = {number(eq.nominalLosses.ratedSeriesActiveKw)} kW · ΔQ = {number(eq.nominalLosses.ratedSeriesReactiveKvar)} kvar
      </p>
    </>}
  </details>;
}
