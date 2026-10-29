import { useEffect, useMemo, useState } from "react";
import type { Language } from "../types";
import "./EngineeringCalculator.css";
import { calculateRc, calculateSeries } from "./EngineeringCalculatorModel";

const parse=(value:string)=>value.trim()?Number(value.trim().replace(",",".")):Number.NaN;

export default function EngineeringCalculator({ language }: { language: Language }) {
  const ru = language === "ru";
  const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
  const format = (value: number, digits: number) => new Intl.NumberFormat(ru ? "ru-RU" : "uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const [voltage, setVoltage] = useState("12");
  const [r1, setR1] = useState("10");
  const [r2, setR2] = useState("20");
  const [capVoltage, setCapVoltage] = useState("10");
  const [resistance, setResistance] = useState("1000");
  const [capacitance, setCapacitance] = useState("0.0001");
  const [time, setTime] = useState("0.1");
  const dc=useMemo(()=>{try{return calculateSeries(parse(voltage),parse(r1),parse(r2));}catch{return null;}},[voltage,r1,r2]);
  const rc=useMemo(()=>{try{return calculateRc(parse(capVoltage),parse(resistance),parse(capacitance),parse(time));}catch{return null;}},[capVoltage,resistance,capacitance,time]);
  const invalid=ru?"Введите конечные значения: U,t ≥ 0; R,C > 0.":"Введіть скінченні значення: U,t ≥ 0; R,C > 0.";
  const field = (label: string, value: string, set: (value: string) => void, unit: string) => <label><span>{label}</span><input inputMode="decimal" value={value} onChange={(event) => set(event.target.value)} /><small>{unit}</small></label>;
  return <fieldset disabled={!ready} className="lab-ready-guard"><div className="engineering-calculator"><article className="calculator-card"><header><span className="section-kicker">OHM</span><h2>{ru ? "Последовательная цепь" : "Послідовне коло"}</h2></header><div className="calculator-fields">{field("U", voltage, setVoltage, "В")}{field("R₁", r1, setR1, "Ом")}{field("R₂", r2, setR2, "Ом")}</div>{dc?<><p className="calculator-formula">I = U / (R₁ + R₂) = {format(dc.current, 3)} А</p><dl><div><dt>I</dt><dd>{format(dc.current, 3)} А</dd></div><div><dt>U₁</dt><dd>{format(dc.u1, 2)} В</dd></div><div><dt>U₂</dt><dd>{format(dc.u2, 2)} В</dd></div></dl></>:<p role="status">{invalid}</p>}</article><article className="calculator-card"><header><span className="section-kicker">RC</span><h2>{ru ? "Заряд конденсатора" : "Заряд конденсатора"}</h2></header><div className="calculator-fields">{field("U", capVoltage, setCapVoltage, "В")}{field("R", resistance, setResistance, "Ом")}{field("C", capacitance, setCapacitance, "Ф")}{field("t", time, setTime, "с")}</div>{rc?<><p className="calculator-formula">uC(t) = U · (1 − e<sup>−t/τ</sup>)</p><dl><div><dt>τ = RC</dt><dd>{format(rc.tau, 4)} с</dd></div><div><dt>uC(t)</dt><dd>{format(rc.value, 3)} В</dd></div></dl></>:<p role="status">{invalid}</p>}</article></div></fieldset>;
}
