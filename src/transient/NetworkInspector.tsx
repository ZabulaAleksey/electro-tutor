import type { Language } from "../types";
import { formatEngineeringValue } from "../engineering/format";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { diodeCurrent, type DiodeParameters } from "./line-diode";
import { LoadEditor, NumberEdit } from "./NetworkEditor";
import { distributedParameters, findLoad, isDynamic, type Load, type Network } from "./network";
import { contactKind, loadReplacement, removeLoad, replaceLoad } from "./network-edit";
import type { Selection, Tool } from "./network-edit";

type Props = {
  selection: Exclude<Selection,{kind:"detached"}>;
  model: Network;
  load: Load;
  language: Language;
  onEdit: (model: Network) => void;
  onMove: (tool: Tool) => void;
  onDeleteLine: (index: number) => void;
  onChangeLoad: (load: Load) => void;
  onResistance: (id: string, value: number) => void;
  live: boolean;
  time: number;
  onMode: (mode: "live" | "recalculate") => void;
  diodePoint?: number;
  onDuration: (seconds: number) => void;
};

export default function NetworkInspector(props: Props) {
  const { selection, model, language, onEdit, onMove } = props;
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const moveLabel = t("Переподключить", "Перепід’єднати");
  const deleteLabel = t("Удалить", "Видалити");
  if (selection.kind === "line") {
    const index = model.sections.findIndex(section => section.id === selection.id);
    const section = model.sections[index];
    if (!section) return null;
    const distributed=distributedParameters(section);
    const edit = (next: Partial<typeof section>) => onEdit({ ...model, sections: model.sections.map((s, i) => i === index ? { ...s, ...next } : s) });
    return <div className="network-inspector" key={section.id}>
      <strong>{t("Линия", "Лінія")} {section.id}</strong>
      <div className="network-inspector-fields">
        <NumberEdit label="l, km" value={section.lengthM / 1000} min={.000001} max={1e6} onChange={v => edit({ lengthM: v * 1000 })} />
        <NumberEdit label={`${section.id} · Z₀, Ω`} value={section.impedanceOhm} min={.001} max={1e6} onChange={v => edit({ impedanceOhm: v })} />
        <details><summary>{t("Параметры распространения","Параметри поширення")}</summary><NumberEdit label="v, km/s" value={section.velocityMS / 1000} min={.001} max={300000} onChange={v => edit({ velocityMS: v * 1000 })} />
          <NumberEdit label="R′, Ω/km" value={distributed.r*1000} min={0} max={50000*section.impedanceOhm/section.lengthM}
            onChange={v=>edit({resistanceOhmM:v/1000})}/>
          <p>{t("Условие Хевисайда","Умова Гевісайда")} R′/L′ = G′/C′</p>
          <small>L′ = {formatEngineeringValue(distributed.l,"H/m",language)} · G′ = {formatEngineeringValue(distributed.g,"S/m",language)} · C′ = {formatEngineeringValue(distributed.c,"F/m",language)}</small>
        </details>
      </div>
      <small>τ = {formatEngineeringValue(section.lengthM / section.velocityMS, "s", language)}</small>
      <div className="network-buttons">
        <button type="button" disabled={model.sections.length < 2} onClick={() => onMove({ move: selection })}>{moveLabel}</button>
        <button type="button" disabled={model.sections.length < 2} onClick={() => props.onDeleteLine(index)}>{deleteLabel}</button>
      </div>
    </div>;
  }
  if (selection.kind === "source") {
    const source = model.source;
    const edit = (next: Partial<typeof source>) => onEdit({ ...model, source: { ...source, ...next } });
    return <div className="network-inspector">
      <strong>{t("Источник", "Джерело")} · {t("узел", "вузол")} {source.node}</strong>
      <div className="network-inspector-fields">
        <NumberEdit label="E, V" value={source.voltageV} min={-1e6} max={1e6} onChange={voltageV => edit({ voltageV })} />
        <NumberEdit label="Rₛ, Ω" value={source.resistanceOhm} min={0} max={1e9} onChange={resistanceOhm => edit({ resistanceOhm })} />
        <details><summary>{t("Импульс и длительность опыта","Імпульс і тривалість досліду")}</summary><NumberEdit label={t("Включение, ms", "Увімкнення, ms")} value={source.onS * 1000} min={0}
          max={(source.offS ?? model.durationS) * 1000} onChange={v => edit({ onS: v / 1000 })} />
        <label><input type="checkbox" checked={source.offS!==undefined} disabled={source.onS>=model.durationS}
          onChange={e=>edit({offS:e.target.checked?(source.onS+model.durationS)/2:undefined})}/>{t("Импульс","Імпульс")}</label>
        {source.offS!==undefined&&<NumberEdit label={t("Отключение, ms","Вимкнення, ms")} value={source.offS*1000}
          min={source.onS*1000+1e-9} max={model.durationS*1000} onChange={v=>edit({offS:v/1000})}/>}
        <NumberEdit label={t("Длительность опыта, ms","Тривалість досліду, ms")} value={model.durationS*1000}
          min={Math.max(1e-9,source.onS,source.offS??0,...model.events.map(event=>event.atS),
            ...[...model.series??[],...model.branches??[]].map(link=>link.switch?.atS??0))*1000}
          max={10000} onChange={v=>props.onDuration(v/1000)}/></details>
      </div>
      <div className="network-buttons">
        <button type="button" onClick={() => onMove({ move: selection })}>{moveLabel}</button>
        <button type="button" onClick={()=>edit({voltageV:-source.voltageV})}>{t("Развернуть ЭДС","Розвернути ЕРС")}</button>
      </div>
    </div>;
  }
  if (selection.kind === "shunt") {
    const shunt = model.shunts.find(item => item.node === selection.node);
    if (!shunt) return null;
    return <div className="network-inspector" key={shunt.node}>
      <strong>{t("Шунтирующий резистор", "Шунтувальний резистор")} · {t("узел", "вузол")} {shunt.node}</strong>
      <div className="network-inspector-fields">
        <NumberEdit label={t("Сопротивление R, Ω", "Опір R, Ω")} value={shunt.resistanceOhm} min={.001} max={1e9}
          onChange={resistanceOhm => onEdit({ ...model, shunts: model.shunts.map(item => item === shunt ? { ...item, resistanceOhm } : item) })} />
      </div>
      <div className="network-buttons">
        <button type="button" onClick={() => onMove({ move: selection })}>{moveLabel}</button>
        <button type="button" onClick={() => onEdit({ ...model, shunts: model.shunts.filter(item => item !== shunt) })}>{deleteLabel}</button>
      </div>
    </div>;
  }
  if(selection.kind==="contact"){
    const contact=[...model.series??[],...model.branches??[]].find(link=>link.id===selection.id);
    if(!contact)return null;
    const update=(next:typeof contact)=>onEdit({...model,
      series:model.series?.map(link=>link.id===contact.id?{...next,to:link.to}:link),
      branches:model.branches?.map(link=>link.id===contact.id?next:link)});
    const remove=()=>onEdit({...model,series:model.series?.filter(link=>link.id!==contact.id),branches:model.branches?.filter(link=>link.id!==contact.id)});
    const sw=contact.switch,component=contact.component;
    if(component?.kind==="diode")return <DiodeInspector title={contact.id+" · "+t("Диод","Діод")}
      language={language} parameters={component.diode} point={props.diodePoint}
      update={next=>update({...contact,component:{kind:"diode",diode:{...component.diode,...next}}})}
      move={()=>onMove({relocate:contact.id})} remove={remove}
      bridge={contact.to!=="reference"&&model.branches?.includes(contact)?()=>onMove({bridgeFrom:contact.from,id:contact.id}):undefined}/>;
    const name={r:t("Резистор","Резистор"),wire:t("Провод","Провід"),switch:t("Ключ","Ключ"),
      diode:t("Диод","Діод"),l:t("Индуктивность","Індуктивність"),c:t("Конденсатор","Конденсатор")};
    return <div className="network-inspector" key={contact.id}>
      <strong>{contact.id} · {name[contactKind(contact)]}</strong>
      {contact.resistanceOhm!==undefined&&<NumberEdit label={t("Сопротивление R, Ω","Опір R, Ω")} value={contact.resistanceOhm}
        min={.001} max={1e9} onChange={resistanceOhm=>update({...contact,resistanceOhm})}/>}
      {component&&<div className="network-inspector-fields">
        <NumberEdit label={component.kind==="l"?"L, mH":"C, µF"} value={component.value*(component.kind==="l"?1e3:1e6)}
          min={.001} max={1e8} onChange={v=>update({...contact,component:{...component,value:v/(component.kind==="l"?1e3:1e6)}})}/>
        <details><summary>{t("Начальное состояние","Початковий стан")}</summary>
          <NumberEdit label={component.kind==="l"?"I₀, A":"U₀, V"} value={component.initial??0}
            min={-1e6} max={1e6} onChange={initial=>update({...contact,component:{...component,initial}})}/>
        </details>
      </div>}
      {sw?<SwitchFields language={language} duration={model.durationS} closed={sw.closed} atS={sw.atS} closes={sw.closes}
        canSchedule={!isDynamic(model)} onChange={next=>update({...contact,switch:next})}/>:
        !component&&contact.to!=="reference"&&model.branches?.includes(contact)&&<button type="button" onClick={()=>update({...contact,switch:{closed:true}})}>{t("Добавить ключ в ветвь","Додати ключ у гілку")}</button>}
      <div className="network-buttons">
        <button type="button" onClick={()=>onMove({relocate:contact.id})}>{moveLabel}</button>
        {contact.to!=="reference"&&model.branches?.includes(contact)&&
          <button type="button" onClick={()=>onMove({bridgeFrom:contact.from,id:contact.id})}>{t("Сменить второй узел","Змінити другий вузол")}</button>}
        <button type="button" onClick={remove}>{deleteLabel}</button>
      </div>
    </div>;
  }
  const load = selection.id ? findLoad(props.load,selection.id) : props.load;
  const base = load&&findLoad(model.load,load.id);
  if(!load||!base)return null;
  if(base.kind==="diode")return <DiodeInspector title={t("Диод","Діод")}
    language={language} parameters={base.diode!} point={props.diodePoint}
    update={next=>onEdit({...model,load:{...base,diode:{...base.diode!,...next}}})}
    move={()=>onMove({moveLoad:base.id})} remove={()=>onEdit(loadReplacement(model,{id:base.id,kind:"open"}))}/>;
  if(base.kind==="switch"){
    const scheduled=model.events.find(event=>event.id==="switch-"+base.id);
    const toggleNow=props.live&&props.time>0;
    return <div className="network-inspector" key={base.id}>
      <strong>{base.id} · {t("Ключ","Ключ")}</strong>
      <SwitchFields language={language} duration={model.durationS} closed={base.closed??true}
        atS={scheduled?.atS} closes={scheduled?!!scheduled.value:undefined} canSchedule={!isDynamic(model)}
        onChange={next=>{
          const nextLoad=replaceLoad(model.load,base.id,{...base,closed:next.closed});
          const id="switch-"+base.id;
          const events=model.events.filter(event=>event.id!==id);
          if(next.atS!==undefined)events.push({id,atS:next.atS,target:base.id,kind:"switch",value:Number(next.closes),previous:Number(next.closed)});
          onEdit({...model,load:nextLoad,events});
        }}/>
      {toggleNow&&<button type="button" onClick={()=>props.onChangeLoad(replaceLoad(props.load,load.id,{...load,closed:!(load.closed??true)}))}>{t("Переключить сейчас","Перемкнути зараз")}</button>}
      <button type="button" onClick={()=>onEdit(loadReplacement(model,replaceLoad(model.load,base.id,base.children![0])))}>{deleteLabel}</button>
    </div>;
  }
  return <div className="network-inspector">
    <strong>{t("Концевая нагрузка", "Кінцеве навантаження")}{selection.id?" · "+load.id:""}</strong>
    <div className="network-buttons">
      {(base.kind==="r"||base.kind==="wire"||base.kind==="l"||base.kind==="c")&&!model.events.some(event=>event.target===base.id)&&
       <button type="button" onClick={()=>onMove({moveLoad:base.id})}>{moveLabel}</button>}
      {!selection.id&&<label className="network-field">{t("Заменить тип", "Замінити тип")}
        <select value="" onChange={event => { if (event.target.value) onMove(event.target.value as Tool); }}>
          <option value="">{t("Выберите тип", "Оберіть тип")}</option>
          <option value="diode">{t("Диод","Діод")}</option>
          <option value="r">R</option><option value="l">L</option><option value="c">C</option>
          <option value="wire">{t("Провод","Провід")}</option>
        </select>
      </label>}
      <button type="button" disabled={load.kind === "open"} onClick={() => {
        if (load.children?.length && !window.confirm(t("Удалить нагрузку и её вложенные элементы?", "Видалити навантаження та його вкладені елементи?"))) return;
        props.onChangeLoad(removeLoad(props.load,load.id));
      }}>{deleteLabel}</button>
    </div>
    {load.kind==="r"&&<details><summary>{t("Изменение во время опыта","Зміна під час досліду")}</summary>
      <label className="network-field">{t("Изменение параметров","Зміна параметрів")}
        <select value={props.live?"live":"recalculate"} onChange={e=>props.onMode(e.target.value as "live"|"recalculate")}>
          <option value="recalculate">{t("Пересчёт с начала","Перерахунок від початку")}</option>
          <option value="live">{t("Событие при текущем времени","Подія в поточний час")}</option>
        </select>
      </label></details>}
    <LoadEditor load={load} root={props.load} onChange={next=>props.onChangeLoad(replaceLoad(props.load,load.id,next))} language={language} live={props.live} timeS={props.time}
      onResistance={props.onResistance} compact />
  </div>;
}


function DiodeInspector({language,title,parameters,point,update,move,remove,bridge}:{
 language:Language;title:string;parameters:DiodeParameters;point?:number;
 update:(next:Partial<DiodeParameters>)=>void;move:()=>void;remove:()=>void;bridge?:()=>void;
}){
 const t=(ru:string,uk:string)=>language==="ru"?ru:uk;
 const min=Math.min(-.2,point??0);
 const max=Math.max(.025852*parameters.ideality*Math.log1p(.01/parameters.saturationA),point??0);
 const points=Array.from({length:81},(_,i)=>{
  const x=i<21?min*(1-i/20):max*(i-20)/60;
  return [x,diodeCurrent(x,parameters)*1000] as [number,number];
 });
 return <div className="network-inspector">
  <strong>{title}</strong>
  <div className="network-inspector-fields">
   <NumberEdit label="Iₛ, nA" min={1e-9} max={1e6} value={parameters.saturationA*1e9} onChange={v=>update({saturationA:v/1e9})}/>
   <NumberEdit label="n" min={1} max={4} value={parameters.ideality} onChange={ideality=>update({ideality})}/>
  </div>
  <div className="network-buttons">
   <button type="button" onClick={()=>update({reversed:!parameters.reversed})}>{t("Развернуть диод","Розвернути діод")}</button>
   <button type="button" onClick={move}>{t("Переподключить","Перепід’єднати")}</button>
   {bridge&&<button type="button" onClick={bridge}>{t("Сменить второй узел","Змінити другий вузол")}</button>}
   <button type="button" onClick={remove}>{t("Удалить","Видалити")}</button>
  </div>
  <details><summary>{t("Вольт-амперная характеристика","Вольт-амперна характеристика")}</summary>
   <EngineeringPlot language={language} label={t("ВАХ диода","ВАХ діода")}
    plot={{xLabel:"Uᴅ, V",yLabel:"Iᴅ, mA",xMax:max,yMin:points[0][1],yMax:points.at(-1)![1],
      curves:[{label:"Iᴅ(Uᴅ)",color:"blue",points}]}}
    domains={{x:[min,max],y:[points[0][1],Math.max(10,points.at(-1)![1])]}}
    selected={point!==undefined?[point,diodeCurrent(point,parameters)*1000]:undefined}/>
   {point!==undefined&&<output data-diode-point data-diode-voltage={point} data-diode-current={diodeCurrent(point,parameters)}>Uᴅ = {point.toPrecision(4)} V · Iᴅ = {(diodeCurrent(point,parameters)*1000).toPrecision(4)} mA</output>}
   <small>{t("300 K. Модель учитывает статическую ВАХ.","300 K. Модель враховує статичну ВАХ.")}</small>
  </details>
 </div>;
}

function SwitchFields({language,duration,closed,atS,closes,canSchedule,onChange}:{
 language:Language;duration:number;closed:boolean;atS?:number;closes?:boolean;canSchedule:boolean;
 onChange:(next:{closed:boolean;atS?:number;closes?:boolean})=>void;
}){
 const t=(ru:string,uk:string)=>language==="ru"?ru:uk;
 return <div className="network-inspector-fields">
  <label className="network-field">{t("Начальное состояние","Початковий стан")}
   <select value={String(closed)} onChange={e=>onChange({closed:e.target.value==="true",atS,closes})}>
    <option value="false">{t("Разомкнут","Розімкнений")}</option><option value="true">{t("Замкнут","Замкнений")}</option>
   </select></label>
  <label><input type="checkbox" checked={atS!==undefined} disabled={!canSchedule}
    onChange={e=>onChange({closed,atS:e.target.checked?duration/2:undefined,closes:!closed})}/>{t("Коммутация","Комутація")}</label>
  {!canSchedule&&<small>{t("Коммутация доступна для резистивных цепей.","Комутація доступна для резистивних кіл.")}</small>}
  {atS!==undefined&&<>
   <NumberEdit label={t("Время коммутации, мс","Час комутації, мс")} value={atS*1000} min={0} max={duration*1000}
     onChange={ms=>onChange({closed,atS:ms/1000,closes})}/>
   <label className="network-field">{t("Действие","Дія")}
    <select value={String(closes)} onChange={e=>onChange({closed,atS,closes:e.target.value==="true"})}>
      <option value="true">{t("Замкнуть","Замкнути")}</option><option value="false">{t("Разомкнуть","Розімкнути")}</option>
    </select></label>
  </>}
 </div>;
}
