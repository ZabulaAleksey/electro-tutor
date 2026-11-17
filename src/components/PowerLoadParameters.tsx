import { useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import { normalizeLoad, type LoadInput } from "../power-system/injections";
import type { PowerLoad } from "../power-system/network";
import type { Language } from "../types";

export function PowerLoadParameters({ language, load, onApply }: {
  language: Language; load: PowerLoad; onApply: (input: LoadInput) => boolean;
}) {
  const [mode, setMode] = useState<LoadInput["kind"]>("pq");
  const [power, setPower] = useState(String(load.activeMw));
  const [reactive, setReactive] = useState(String(load.reactiveMvar));
  const [factor, setFactor] = useState(String(load.activeMw / Math.hypot(load.activeMw, load.reactiveMvar) || 1));
  const [sign, setSign] = useState<"inductive" | "capacitive">(load.reactiveMvar < 0 ? "capacitive" : "inductive");
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const labels = { mode: t("Способ задания нагрузки", "Спосіб задання навантаження"),
    sign: t("Характер нагрузки", "Характер навантаження") };
  const read = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
  const input: LoadInput = mode === "pq"
    ? { kind: mode, activeMw: read(power), reactiveMvar: read(reactive) }
    : { kind: mode, activeMw: read(power), cosPhi: read(factor), sign };
  let proposed: number | undefined;
  try { proposed = normalizeLoad(input).reactiveMvar; } catch { /* Invalid draft stays outside the network. */ }
  return <form onSubmit={event => { event.preventDefault(); onApply(input); }}>
    <div className="power-fields">
      <label>{labels.mode}<select aria-label={labels.mode} value={mode} onChange={event => setMode(event.target.value === "pq" ? "pq" : "power-factor")}>
        <option value="pq">P + Q</option><option value="power-factor">P + cos φ</option>
      </select></label>
      <label>P, MW<input aria-label="P, MW" type="number" inputMode="decimal" required step="any" min="0" value={power} onChange={event => setPower(event.target.value)} /></label>
      {mode === "pq" ? <label>Q, MVAr<input aria-label="Q, MVAr" type="number" inputMode="decimal" required step="any" value={reactive}
        onChange={event => setReactive(event.target.value)} /></label> : <>
        <label>cos φ<input aria-label="cos φ" type="number" inputMode="decimal" required step="any" min="0" max="1" value={factor}
          onChange={event => setFactor(event.target.value)} /></label>
        <label>{labels.sign}<select aria-label={labels.sign} value={sign} onChange={event => setSign(event.target.value === "inductive" ? "inductive" : "capacitive")}>
          <option value="inductive">{t("Индуктивная", "Індуктивне")}</option><option value="capacitive">{t("Ёмкостная", "Ємнісне")}</option>
        </select></label>
        {proposed !== undefined && <output data-power-load-preview-q={proposed}>Q = {formatEngineeringNumber(proposed, language)} MVAr</output>}
      </>}
    </div>
    <button type="submit" disabled={proposed === undefined}>{t("Применить нагрузку", "Застосувати навантаження")}</button>
    <p data-power-load-p={load.activeMw} data-power-load-q={load.reactiveMvar}>
      P = {formatEngineeringNumber(load.activeMw, language)} MW · Q = {formatEngineeringNumber(load.reactiveMvar, language)} MVAr
    </p>
  </form>;
}
