import type { Language } from "../types";
import { formatEngineeringValue } from "../engineering/format";
import { LoadCircuit, LoadEditor, NumberEdit } from "./NetworkEditor";
import type { Load, Network } from "./network";
import type { Selection, Tool } from "./network-edit";

type Props = {
  selection: Selection;
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
};

export default function NetworkInspector(props: Props) {
  const { selection, model, language, onEdit, onMove } = props;
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const moveLabel = t("Переместить", "Перемістити");
  const deleteLabel = t("Удалить", "Видалити");
  if (selection.kind === "line") {
    const index = model.sections.findIndex(section => section.id === selection.id);
    const section = model.sections[index];
    if (!section) return null;
    const edit = (next: Partial<typeof section>) => onEdit({ ...model, sections: model.sections.map((s, i) => i === index ? { ...s, ...next } : s) });
    return <div className="network-inspector" key={section.id}>
      <strong>{t("Линия", "Лінія")} {section.id}</strong>
      <div className="network-inspector-fields">
        <NumberEdit label="l, km" value={section.lengthM / 1000} min={.000001} max={1e6} onChange={v => edit({ lengthM: v * 1000 })} />
        <NumberEdit label="Z₀, Ω" value={section.impedanceOhm} min={.001} max={1e6} onChange={v => edit({ impedanceOhm: v })} />
        <NumberEdit label="v, km/s" value={section.velocityMS / 1000} min={.001} max={300000} onChange={v => edit({ velocityMS: v * 1000 })} />
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
        <NumberEdit label={t("Напряжение E, V", "Напруга E, V")} value={source.voltageV} min={-1e6} max={1e6} onChange={voltageV => edit({ voltageV })} />
        <NumberEdit label={t("Сопротивление Rₛ, Ω", "Опір Rₛ, Ω")} value={source.resistanceOhm} min={0} max={1e9} onChange={resistanceOhm => edit({ resistanceOhm })} />
        <NumberEdit label={t("Включение, ms", "Увімкнення, ms")} value={source.onS * 1000} min={0}
          max={(source.offS ?? model.durationS) * 1000} onChange={v => edit({ onS: v / 1000 })} />
      </div>
      <div className="network-buttons">
        <button type="button" onClick={() => onMove({ move: selection })}>{moveLabel}</button>
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
  const load = props.load;
  return <div className="network-inspector">
    <strong>{t("Концевая нагрузка", "Кінцеве навантаження")}</strong>
    <div className="network-buttons">
      <label className="network-field">{t("Заменить тип", "Замінити тип")}
        <select value="" onChange={event => { if (event.target.value) onMove(event.target.value as Tool); }}>
          <option value="">{t("Выберите тип", "Оберіть тип")}</option>
          <option value="matched">{t("Согласованная", "Узгоджена")}</option>
          <option value="r">R</option><option value="l">L</option><option value="c">C</option>
          <option value="wire">{t("Короткое замыкание", "Коротке замикання")}</option>
        </select>
      </label>
      <button type="button" disabled={load.kind === "open"} onClick={() => {
        if (load.children?.length && !window.confirm(t("Удалить нагрузку и её вложенные элементы?", "Видалити навантаження та його вкладені елементи?"))) return;
        props.onChangeLoad({ id: load.id, kind: "open" });
      }}>{deleteLabel}</button>
    </div>
    {load.children?.length ? <LoadCircuit load={load} language={language} /> : null}
    <LoadEditor load={load} onChange={props.onChangeLoad} language={language} live={props.live} timeS={props.time}
      onResistance={props.onResistance} compact />
  </div>;
}
