export type EngineeringLocale = "ru" | "uk" | "en";
const locales = { ru: "ru-RU", uk: "uk-UA", en: "en-US" };
const names: Record<string, readonly [string, string, string]> = {
  V:["В","В","V"], A:["А","А","A"], Ω:["Ом","Ом","Ω"], F:["Ф","Ф","F"], H:["Гн","Гн","H"], s:["с","с","s"], Hz:["Гц","Гц","Hz"], W:["Вт","Вт","W"], var:["вар","вар","var"], VA:["В·А","В·А","V·A"], T:["Тл","Тл","T"], Wb:["Вб","Вб","Wb"], m:["м","м","m"], rad:["рад","рад","rad"], "°":["град.","град.","°"], "rad/s":["рад/с","рад/с","rad/s"], rpm:["об/мин","об/хв","rpm"], "N·m":["Н·м","Н·м","N·m"], dB:["дБ","дБ","dB"], "1":["1","1","1"]
};
const prefixable = new Set(["V","A","Ω","F","H","s","Hz","W","var","VA","T","Wb","m"]);
const prefixes = [{p:"p", ru:"п", exponent:-12},{p:"n",ru:"н",exponent:-9},{p:"µ",ru:"мк",exponent:-6},{p:"m",ru:"м",exponent:-3},{p:"",ru:"",exponent:0},{p:"k",ru:"к",exponent:3},{p:"M",ru:"М",exponent:6},{p:"G",ru:"Г",exponent:9}];
export type EngineeringUnit = { base: string; factor: number; symbol: string; inputFactor: number };
function decode(unit: string) {
  if (names[unit]) return {base:unit,factor:1};
  if (unit === "мкс") return {base:"s",factor:1e-6};
  for (const [key,v] of Object.entries(names)) if (v.includes(unit)) return {base:key,factor:1};
  for (const pre of prefixes.filter(p=>p.p)) for(const token of [pre.p,pre.ru,pre.p==="µ"?"u":pre.p]) if(unit.startsWith(token)) {
    const tail=unit.slice(token.length); const base=names[tail]?tail:Object.keys(names).find(k=>names[k].includes(tail));
    if(base && prefixable.has(base)) return {base,factor:10**pre.exponent};
  }
  return {base:unit,factor:1};
}
export function formatEngineeringNumber(value: number, language: EngineeringLocale, options: {significantDigits?: number; maximumFractionDigits?: number; zeroTolerance?: number} = {}) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0 || Math.abs(value) <= (options.zeroTolerance ?? 0)) return "0";
  const digits=options.significantDigits ?? 4, magnitude=Math.abs(value);
  const scientific=magnitude>=1e9 || magnitude<10**-(options.maximumFractionDigits ?? 4);
  const config:Intl.NumberFormatOptions = {useGrouping:false, ...(scientific ? {notation:"scientific",maximumSignificantDigits:digits} : options.maximumFractionDigits !== undefined ? {maximumFractionDigits:options.maximumFractionDigits} : {maximumSignificantDigits:digits})};
  return new Intl.NumberFormat(locales[language],config).format(value).replace(/^-0$/, "0");
}
export function chooseEngineeringUnit(unit: string, reference: number, language: EngineeringLocale, options: {previous?: EngineeringUnit; fixed?: boolean} = {}): EngineeringUnit {
  const decoded=decode(unit), absolute=Math.abs(reference*decoded.factor), index=language==="en"?2:language==="uk"?1:0;
  const previous=options.previous;
  if(previous?.base===decoded.base && absolute/previous.factor>=.1 && absolute/previous.factor<1500) return {...previous,inputFactor:decoded.factor};
  let exponent=0;
  if(prefixable.has(decoded.base)) exponent=options.fixed ? Math.log10(decoded.factor) : absolute>0 && Number.isFinite(absolute) ? Math.max(-12,Math.min(9,Math.floor(Math.log10(absolute)/3)*3)) : Math.log10(decoded.factor);
  const prefix=prefixes.find(p=>p.exponent===exponent) ?? prefixes[4];
  const baseName=names[decoded.base]?.[index] ?? decoded.base;
  return {base:decoded.base,factor:10**exponent,inputFactor:decoded.factor,symbol:(index===2?prefix.p:prefix.ru)+baseName};
}
export const inEngineeringUnit = (value: number, unit: EngineeringUnit) => value * (unit.inputFactor / unit.factor);
export function formatEngineeringValue(value: number, unit: string, language: EngineeringLocale, options: {reference?: number; choice?: EngineeringUnit; significantDigits?: number; fixed?: boolean} = {}) {
  const choice=options.choice ?? chooseEngineeringUnit(unit,options.reference ?? value,language,{fixed:options.fixed});
  return `${formatEngineeringNumber(inEngineeringUnit(value,choice),language,{significantDigits:options.significantDigits})}\u00a0${choice.symbol}`;
}
export function formatAxisLabel(quantity: string, unit: EngineeringUnit) { return `${quantity}, ${unit.symbol}`; }
export function parseAxisLabel(label: string) { const comma=label.lastIndexOf(","); return comma<0 ? {quantity:label,unit:"1"} : {quantity:label.slice(0,comma).trim(),unit:label.slice(comma+1).trim()}; }

/** Display adaptation only; the source formula and numeric model stay machine-readable. */
export const localizeLatexNumbers=(latex:string,language:EngineeringLocale)=>language==="en"?latex:latex.replace(/(\d)\.(?=\d)/g,"$1{,}");
