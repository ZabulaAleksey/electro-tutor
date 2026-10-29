import { useMemo } from "react";
import type { Language } from "../types";
import Formula from "../components/Formula";
import EngineeringPlot from "./EngineeringPlot";
import { firstOrderBode } from "./bode";
import { formatEngineeringNumber, formatEngineeringValue } from "./format";

export default function BodeView({ tau, language }: {tau:number;language:Language}) {
  const view=useMemo(()=>firstOrderBode(tau),[tau]), ru=language==="ru";
  return <section className="engineering-bode" aria-label={ru?"ЛАЧХ и ЛФЧХ RC-фильтра":"ЛАЧХ і ЛФЧХ RC-фільтра"}>
    <h4>{ru?"ЛАЧХ / ЛФЧХ · одно апериодическое звено":"ЛАЧХ / ЛФЧХ · одна аперіодична ланка"}</h4>
    <Formula>{String.raw`W(p)=\frac{1}{1+\tau p},\quad \tau=RC,\quad \omega_c=1/\tau`}</Formula>
    <p>τ = {formatEngineeringValue(tau,"s",language)} · ωc = {formatEngineeringValue(view.omegaC,"rad/s",language)} · K = 1</p>
    <div className="bode-factor">{ru?"Множитель":"Множник"}: 1/(1 + τp) · {ru?"наклон":"нахил"}: 0 → −20 {ru?"дБ/дек":"дБ/дек"} · φ(ωc) = −45°</div>
    <div className="bode-panels"><EngineeringPlot plot={view.amplitude} language={language} svgClass="bode-plot" legendClass="micro-legend" characteristic={{point:[view.omegaC,view.exact(view.omegaC).magnitude],label:"ωc / −3,01 dB"}} label={ru?"ЛАЧХ: точная кривая и асимптота":"ЛАЧХ: точна крива й асимптота"}/><EngineeringPlot plot={view.phase} language={language} svgClass="bode-plot" legendClass="micro-legend" characteristic={{point:[view.omegaC,-45],label:"ωc / −45°"}} label={ru?"ЛФЧХ: точная фаза":"ЛФЧХ: точна фаза"}/></div>
    <small>{ru?"Общая логарифмическая шкала ω > 0; ω = 2πf. Поправка в частоте сопряжения":"Спільна логарифмічна шкала ω > 0; ω = 2πf. Поправка на частоті спряження"}: {formatEngineeringNumber(view.exact(view.omegaC).magnitude,language,{significantDigits:6})} {ru?"дБ":"дБ"}.</small>
  </section>;
}
