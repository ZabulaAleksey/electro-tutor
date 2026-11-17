import { useEffect, useRef, useState } from "react";
import CircuitEditor from "../circuit/CircuitEditor";
import { maxCircuitFileBytes } from "../circuit/document";
import { formatEngineeringNumber } from "../engineering/format";
import { resolveEquipmentType } from "../power-system/catalogue";
import {
  applyPowerOverride, changePowerNetwork, clearPowerOverride, mergePowerCatalogue, powerEquipment,
  powerVoltagePresetsKv, resolveEffectivePowerType, selectPowerType, type PowerConfiguration,
} from "../power-system/configuration";
import { examplePowerDiagram, examplePowerNetwork } from "../power-system/diagram";
import type { PowerElement, PowerSource } from "../power-system/network";
import type { Language } from "../types";
import { LineEquivalentPanel } from "./LineEquivalentPanel";
import PowerEquipmentParameters from "./PowerEquipmentParameters";
import "./PowerSystemLab.css";

const initial: PowerConfiguration = { network: examplePowerNetwork, catalogue: { schemaVersion: 1, types: [] }, overrides: new Map() };
const copy = {
  ru: {
    device: "Оборудование", type: "Тип оборудования", unassigned: "Тип не выбран", import: "Импорт типов JSON",
    advanced: "Дополнительно", length: "Длина, km", circuits: "Параллельные цепи", units: "Параллельные трансформаторы",
    tap: "Позиция отпайки", voltages: "Напряжение", target: "Узел или источник", preset: "Уровень напряжения",
    custom: "Своё значение", value: "Напряжение, kV", base: "Каталожные параметры", override: "Переопределено в этой схеме",
    importError: "Проверьте формат каталога, происхождение и ревизии типов.", error: "Проверьте параметры. Сохранено предыдущее значение.",
    source: "Питающий источник", transformer: "Трансформатор", line: "Линия", load: "Нагрузка", switch: "Коммутационный аппарат",
  },
  uk: {
    device: "Обладнання", type: "Тип обладнання", unassigned: "Тип не вибрано", import: "Імпорт типів JSON",
    advanced: "Додатково", length: "Довжина, km", circuits: "Паралельні ланцюги", units: "Паралельні трансформатори",
    tap: "Позиція відгалуження", voltages: "Напруга", target: "Вузол або джерело", preset: "Рівень напруги",
    custom: "Власне значення", value: "Напруга, kV", base: "Каталожні параметри", override: "Перевизначено в цій схемі",
    importError: "Перевірте формат каталогу, походження та ревізії типів.", error: "Перевірте параметри. Збережено попереднє значення.",
    source: "Джерело живлення", transformer: "Трансформатор", line: "Лінія", load: "Навантаження", switch: "Комутаційний апарат",
  },
};

function NumberField({ label, value, step = "any", min, max, onCommit }: {
  label: string; value: number; step?: "any" | number; min?: number; max?: number; onCommit: (value: number) => boolean;
}) {
  return <label>{label}<input type="number" inputMode="decimal" key={value} defaultValue={value} step={step} min={min} max={max}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
    onBlur={event => {
      const field = event.currentTarget;
      if (field.valueAsNumber === value) return;
      if (!field.checkValidity() || !Number.isFinite(field.valueAsNumber) || !onCommit(field.valueAsNumber)) {
        field.value = String(value);
      }
    }} /></label>;
}

export default function PowerSystemLab({ language }: { language: Language }) {
  const words = copy[language];
  const [configuration, setConfiguration] = useState(initial);
  const current = useRef(initial);
  const [ready, setReady] = useState(false);
  const [equipmentId, setEquipmentId] = useState("L1");
  const [voltageTarget, setVoltageTarget] = useState("bus:B1");
  const [customVoltage, setCustomVoltage] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setReady(true), []);

  function update(change: (previous: PowerConfiguration) => PowerConfiguration, message = words.error): boolean {
    try {
      const next = change(current.current);
      current.current = next;
      setConfiguration(next);
      setError("");
      return true;
    } catch {
      setError(message);
      return false;
    }
  }

  const network = configuration.network;
  const devices = network.elements.filter(element => element.kind === "line" || element.kind === "transformer");
  const device = powerEquipment(configuration, equipmentId);
  const base = resolveEquipmentType(configuration.catalogue, device);
  const effective = resolveEffectivePowerType(configuration, equipmentId);
  const overridden = configuration.overrides.has(equipmentId);
  const source = network.elements.find((element): element is PowerSource =>
    element.kind === "source" && "source:" + element.id === voltageTarget);
  const bus = network.buses.find(candidate => "bus:" + candidate.id === voltageTarget);
  const displayedVoltage = source?.voltageKv ?? bus?.nominalKv ?? 110;
  const knownVoltage = powerVoltagePresetsKv.some(value => value === displayedVoltage);

  function changeElement(id: string, adjust: (element: PowerElement) => PowerElement): boolean {
    return update(previous => changePowerNetwork(previous, {
      ...previous.network, elements: previous.network.elements.map(element => element.id === id ? adjust(element) : element),
    }));
  }

  function changeVoltage(voltageKv: number): boolean {
    if (source) return changeElement(source.id, element => element.kind === "source" ? { ...element, voltageKv } : element);
    if (!bus) return false;
    return update(previous => changePowerNetwork(previous, {
      ...previous.network, buses: previous.network.buses.map(entry => entry.id === bus.id ? { ...entry, nominalKv: voltageKv } : entry),
    }));
  }

  return <fieldset className="lab-hydration-guard" disabled={!ready}>
    <div className="power-workspace" data-power-ready={ready} data-power-device={device.id}>
      <CircuitEditor language={language} embedded inspectOnly initial={examplePowerDiagram} selectedComponentId={equipmentId}
        extension={{
          onSelect(id) {
            if (id && devices.some(part => part.id === id)) setEquipmentId(id);
            if (network.elements.some(element => element.kind === "source" && element.id === id)) {
              setVoltageTarget("source:" + id); setCustomVoltage(false);
            }
          },
          describePart(id) {
            const element = network.elements.find(item => item.id === id);
            return element ? { "aria-label": words[element.kind] + " " + element.id } : {};
          },
          overlay(drawing) {
            return network.buses.map(({ id, nominalKv }) => {
              const point = drawing.junctionPositions[id];
              return <g key={id} data-power-bus={id} data-nominal-kv={nominalKv}>
                <text x={point.x} y={point.y - 19} textAnchor="middle">{id}</text>
                <text x={point.x} y={point.y + 23} textAnchor="middle">{formatEngineeringNumber(nominalKv, language) + " kV"}</text>
              </g>;
            });
          },
        }} />
      <div className="power-inspectors">
        <section className="power-panel">
          <h2>{words.device}</h2>
          <div className="power-fields">
            <label>{words.device}<select aria-label={words.device} value={equipmentId} onChange={event => setEquipmentId(event.target.value)}>
              {devices.map(item => <option value={item.id} key={item.id}>{words[item.kind]} {item.id}</option>)}
            </select></label>
            <label>{words.type}<select aria-label={words.type} value={base ? base.id + "@" + base.revision : ""}
              onChange={event => update(previous => selectPowerType(previous, device.id,
                previous.catalogue.types.find(type => type.id + "@" + type.revision === event.target.value)))}>
              <option value="">{words.unassigned}</option>
              {configuration.catalogue.types.filter(type => type.kind === device.kind).map(type => {
                const key = type.id + "@" + type.revision;
                return <option value={key} key={key}>{type.name} · r{type.revision}</option>;
              })}
            </select></label>
            {device.kind === "line" && <>
              <NumberField label={words.length} value={device.lengthKm} onCommit={lengthKm => changeElement(device.id,
                element => element.kind === "line" ? { ...element, lengthKm } : element)} />
              <NumberField label={words.circuits} value={device.parallelCircuits} step={1} min={1} onCommit={parallelCircuits => changeElement(device.id,
                element => element.kind === "line" ? { ...element, parallelCircuits } : element)} />
            </>}
            {device.kind === "transformer" && <>
              <NumberField label={words.units} value={device.parallelUnits} step={1} min={1} onCommit={parallelUnits => changeElement(device.id,
                element => element.kind === "transformer" ? { ...element, parallelUnits } : element)} />
              {effective?.kind === "transformer" && effective.tap && <NumberField label={words.tap} value={device.tapPosition ?? effective.tap.neutral}
                step={1} min={effective.tap.min} max={effective.tap.max} onCommit={tapPosition => changeElement(device.id,
                  element => element.kind === "transformer" ? { ...element, tapPosition } : element)} />}
            </>}
          </div>
          <button type="button" onClick={() => fileInput.current?.click()}>{words.import}</button>
          <input ref={fileInput} type="file" hidden aria-label={words.import} accept=".json,application/json"
            onChange={async event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              try {
                if (file.size > maxCircuitFileBytes) throw Error("file-limit");
                const raw: unknown = JSON.parse(await file.text());
                update(previous => mergePowerCatalogue(previous, raw), words.importError);
              } catch { setError(words.importError); }
            }} />
          {base && <p data-power-type-revision={base.revision}>
            {base.provenance.kind === "reference"
              ? [base.provenance.publisher, base.provenance.document, base.provenance.locator].join(" · ")
              : language === "ru" ? "Пользовательский тип" : "Користувацький тип"}
          </p>}
          {effective && <details key={equipmentId} className="power-advanced">
            <summary>{words.advanced}</summary>
            <p data-power-override={overridden}>{overridden ? words.override : words.base}</p>
            <PowerEquipmentParameters language={language} type={effective} key={JSON.stringify(effective)} overridden={overridden}
              onApply={candidate => update(previous => applyPowerOverride(previous, device.id, candidate))}
              onReset={() => update(previous => clearPowerOverride(previous, device.id))} />
          </details>}
          {device.kind === "line" && <LineEquivalentPanel configuration={configuration} lineId={device.id} language={language} />}
        </section>
        <section className="power-panel power-voltage">
          <h2>{words.voltages}</h2>
          <div className="power-fields">
            <label>{words.target}<select aria-label={words.target} value={voltageTarget} onChange={event => {
              setVoltageTarget(event.target.value); setCustomVoltage(false);
            }}>
              {network.buses.map(entry => <option value={"bus:" + entry.id} key={entry.id}>{entry.id}</option>)}
              {network.elements.filter(item => item.kind === "source").map(item =>
                <option value={"source:" + item.id} key={item.id}>{words.source} {item.id}</option>)}
            </select></label>
            <label>{words.preset}<select aria-label={words.preset} value={!customVoltage && knownVoltage ? String(displayedVoltage) : "custom"} onChange={event => {
              if (event.target.value === "custom") setCustomVoltage(true);
              else if (changeVoltage(Number(event.target.value))) setCustomVoltage(false);
            }}>
              {powerVoltagePresetsKv.map(value => <option value={value} key={value}>{formatEngineeringNumber(value, language)} kV</option>)}
              <option value="custom">{words.custom}</option>
            </select></label>
            {(customVoltage || !knownVoltage) && <NumberField key={voltageTarget} label={words.value}
              value={displayedVoltage} onCommit={changeVoltage} />}
          </div>
          <output data-power-voltage={displayedVoltage}>{formatEngineeringNumber(displayedVoltage, language)} kV</output>
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </fieldset>;
}
