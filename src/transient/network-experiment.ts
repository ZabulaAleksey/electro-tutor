import { formatEngineeringNumber } from "../engineering/format";
import type { Language } from "../types";
import { fullTimeTrace, type WaveRun } from "./network";

export function parseExperimentDuration(text: string) {
  const match = /^\s*(\d+(?:[.,]\d+)?|[.,]\d+)\s*(\u00b5s|\u03bcs|us|\u043c\u043a\u0441|ms|\u043c\u0441|s|\u0441)\s*$/i.exec(text);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const divisor = unit === "s" || unit === "\u0441" ? 1 : unit === "ms" || unit === "\u043c\u0441" ? 1e3 : 1e6;
  const seconds = Number(match[1].replace(",", "."))/divisor;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function experimentTimeLabel(seconds: number, language: Language, editable = false) {
  const [value, unit] = seconds >= 1 ? [seconds,"s"] : seconds >= .001 || seconds === 0
    ? [seconds*1e3,"ms"] : [seconds*1e6,"\u00b5s"];
  const raw = editable ? value.toLocaleString("en-US",{useGrouping:false,maximumFractionDigits:20})
    : formatEngineeringNumber(value, language);
  return raw.replace(".",",")+" "+unit;
}

export function* experimentRows(run: WaveRun, probe: number) {
  const currents=fullTimeTrace(run,probe,"i");
  for(const [time,voltage] of fullTimeTrace(run,probe,"u")){
    yield [time,voltage,currents.next().value![1]] as const;
  }
}
