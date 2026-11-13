import {useEffect,useMemo,useState} from "react";
import EngineeringPlot from "../engineering/EngineeringPlot";
import {formatEngineeringNumber} from "../engineering/format";
import {fitBasis,parseBasis} from "../fourier/custom-basis";
import type {Complex} from "../fourier/math";
import type {Language} from "../types";

const storageKey="electrotutor-custom-basis-v1";
const initial={text:"1\nx\nsin(6.283185*x)",start:"0",end:"1",weighted:false,normalize:true,imaginary:false};
function loadSettings(){
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)??"null");
  if(saved&&typeof saved.text==="string"&&saved.text.length<=1000&&typeof saved.start==="string"&&saved.start.length<32&&
    typeof saved.end==="string"&&saved.end.length<32&&[saved.weighted,saved.normalize,saved.imaginary].every(v=>typeof v==="boolean")){
   return {text:saved.text,start:saved.start,end:saved.end,weighted:saved.weighted,normalize:saved.normalize,imaginary:saved.imaginary} as typeof initial;
  }
 }catch{/* Local storage is optional. */}
 return initial;
}

export default function CustomBasisExperiment({samples,language}:{samples:Complex[];language:Language}){
 const ru=language==="ru",t=(r:string,u:string)=>ru?r:u;
 const [settings,setSettings]=useState(loadSettings);
 const {text,start,end,weighted,normalize,imaginary}=settings;
 const update=(next:Partial<typeof initial>)=>setSettings(prior=>({...prior,...next}));
 useEffect(()=>{
  try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{/* Local storage is optional. */}
 },[settings]);
 const parsed=useMemo(()=>parseBasis(text),[text]);
 const low=start.trim()?Number(start):NaN,high=end.trim()?Number(end):NaN;
 const validInterval=Math.abs(low)<=100&&Math.abs(high)<=100&&high>low;
 const fit=useMemo(()=>parsed&&validInterval?fitBasis(samples,parsed,[low,high],weighted,normalize):null,
  [samples,parsed,validInterval,low,high,weighted,normalize]);
 const format=(v:number)=>formatEngineeringNumber(v,language,{significantDigits:5});
 const colors=["green","orange","violet","muted"] as const;
 const label=t("Сумма компонент","Сума компонентів");
 return <div className="fourier-custom">
  <p>{t("Одна функция на строку. Допустимы суммы и разности членов, например 1, x^2, 2*sin(3*x), cos(3*x), step(0.5).",
    "Одна функція на рядок. Допустимі суми й різниці членів, наприклад 1, x^2, 2*sin(3*x), cos(3*x), step(0.5).")}</p>
  <label>{t("Функции базиса","Функції базису")}<textarea rows={4} maxLength={1000} value={text} onChange={e=>update({text:e.target.value})}/></label>
  <div className="fourier-toolbar">
   <label>{t("Начало интервала","Початок інтервалу")} <input type="number" min="-100" max="100" value={start} onChange={e=>update({start:e.target.value})}/></label>
   <label>{t("Конец интервала","Кінець інтервалу")} <input type="number" min="-100" max="100" value={end} onChange={e=>update({end:e.target.value})}/></label>
   <label>{t("Скалярное произведение","Скалярний добуток")} <select value={weighted?"trapezoid":"uniform"} onChange={e=>update({weighted:e.target.value==="trapezoid"})}>
    <option value="uniform">{t("Равномерные веса","Рівномірні ваги")}</option><option value="trapezoid">{t("Трапеции","Трапеції")}</option>
   </select></label>
   <label><input type="checkbox" checked={normalize} onChange={e=>update({normalize:e.target.checked})}/>{t("Нормировать функции","Нормувати функції")}</label>
   <label><input type="checkbox" checked={imaginary} onChange={e=>update({imaginary:e.target.checked})}/>{t("Мнимая координата","Уявна координата")}</label>
  </div>
  {fit?<div data-custom-basis>
   <p role="status">{fit.orthogonal?t("Ортогональный базис","Ортогональний базис"):t("Неортогональный базис","Неортогональний базис")} · κ∞(R) = {format(fit.condition)} · RMS = {format(fit.rms)}</p>
   <EngineeringPlot plot={{xLabel:"x, 1",yLabel:(imaginary?"Im":"Re")+", 1",xMin:low,xMax:high,yMin:0,yMax:0,
    curves:[{label:t("Исходный сигнал","Початковий сигнал"),color:"muted",dash:true,points:samples.map((p,i)=>[low+(high-low)*i/(samples.length-1),imaginary?p.im:p.re])},
     {label,color:"blue",points:fit.reconstruction.map((p,i)=>[low+(high-low)*i/(samples.length-1),imaginary?p.im:p.re])},
     ...fit.components.map((values,j)=>({label:`c${j+1}φ${j+1}`,color:colors[j%colors.length],points:values.map((p,i)=>[low+(high-low)*i/(samples.length-1),imaginary?p.im:p.re] as const)}))]}}
     language={language} label={label} legendClass="fourier-custom-legend"/>
  </div>:<p role="status">{!parsed?t("Проверьте синтаксис функций.","Перевірте синтаксис функцій."):
   !validInterval?t("Задайте возрастающий интервал в пределах от −100 до 100.","Задайте зростаючий інтервал у межах від −100 до 100."):
   samples.length<2?t("Выберите или нарисуйте исходный сигнал.","Оберіть або намалюйте початковий сигнал."):
   t("Функции линейно зависимы или плохо обусловлены на этих отсчётах.","Функції лінійно залежні або погано обумовлені на цих відліках.")}</p>}
 </div>;
}
