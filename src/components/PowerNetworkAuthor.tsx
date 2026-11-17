import { useState } from "react";
import type { AppendPowerEquipment } from "../power-system/author";
import type { PowerNetwork } from "../power-system/network";
import type { Language } from "../types";

export function PowerNetworkAuthor({ language, network, onAppend, onRemove }: {
  language: Language; network: PowerNetwork; onAppend: (input: AppendPowerEquipment) => boolean; onRemove: (id: string) => boolean;
}) {
  const [kind, setKind] = useState<AppendPowerEquipment["kind"]>("bus");
  const [firstSelection, setFirst] = useState("");
  const [secondSelection, setSecond] = useState("");
  const [removeSelection, setRemove] = useState("");
  const [nominalKv, setNominalKv] = useState("110");
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const labels = { bus: t("Шина", "Шина"), source: t("Источник", "Джерело"), load: t("Нагрузка", "Навантаження"),
    line: t("Линия", "Лінія"), transformer: t("Двухобмоточный трансформатор", "Двообмотковий трансформатор"),
    switch: t("Коммутационный аппарат", "Комутаційний апарат") };
  const typeLabel = t("Добавляемый элемент", "Доданий елемент");
  const branch = kind === "line" || kind === "transformer" || kind === "switch";
  const candidates = [...network.buses, ...network.elements];
  const first = network.buses.find(bus => bus.id === firstSelection)?.id ?? network.buses[0]?.id ?? "";
  const alternatives = network.buses.filter(bus => bus.id !== first);
  const second = alternatives.find(bus => bus.id === secondSelection)?.id ?? alternatives[0]?.id ?? "";
  const removed = candidates.find(item => item.id === removeSelection)?.id ?? candidates.at(-1)?.id ?? "";
  return <details className="power-panel power-author" data-power-author>
    <summary>{t("Собрать схему", "Зібрати схему")}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      if (kind === "bus") onAppend({ kind, nominalKv: Number(nominalKv) });
      else if (kind === "source" || kind === "load") onAppend({ kind, firstBusId: first });
      else onAppend({ kind, firstBusId: first, secondBusId: second });
    }}>
      <div className="power-fields">
        <label>{typeLabel}<select aria-label={typeLabel} value={kind} onChange={event => setKind(event.currentTarget.value as AppendPowerEquipment["kind"])}>
          {(Object.keys(labels) as (keyof typeof labels)[]).map(option => <option value={option} key={option}>{labels[option]}</option>)}
        </select></label>
        {kind === "bus" ? <label>U, kV<input type="number" required step="any" value={nominalKv} onChange={event => setNominalKv(event.currentTarget.value)} /></label>
          : <label>{kind === "transformer" ? t("Шина ВН", "Шина ВН") : t("Первая шина", "Перша шина")}
            <select value={first} required onChange={event => setFirst(event.currentTarget.value)}>
              {network.buses.map(bus => <option value={bus.id} key={bus.id}>{bus.id}</option>)}
            </select>
          </label>}
        {branch && <label>{kind === "transformer" ? t("Шина НН", "Шина НН") : t("Вторая шина", "Друга шина")}
          <select value={second} required onChange={event => setSecond(event.currentTarget.value)}>
            {alternatives.map(bus => <option value={bus.id} key={bus.id}>{bus.id}</option>)}
          </select>
        </label>}
      </div>
      <button type="submit" disabled={kind !== "bus" && (!first || branch && !second)}>{t("Добавить на схему", "Додати на схему")}</button>
    </form>
    <div className="power-fields">
      <label>{t("Удаляемый элемент", "Елемент для видалення")}<select value={removed} onChange={event => setRemove(event.currentTarget.value)}>
        {candidates.map(item => <option value={item.id} key={item.id}>{item.id}</option>)}
      </select></label>
      <button type="button" disabled={!removed} onClick={() => onRemove(removed)}>{t("Удалить со схемы", "Видалити зі схеми")}</button>
    </div>
  </details>;
}
