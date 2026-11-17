import { useEffect, useMemo, useRef, useState } from "react";
import CircuitEditor from "../circuit/CircuitEditor";
import { maxCircuitFileBytes } from "../circuit/document";
import { formatEngineeringNumber } from "../engineering/format";
import { resolveEquipmentType } from "../power-system/catalogue";
import {
  applyPowerOverride, changePowerNetwork, clearPowerOverride, mergePowerCatalogue,
  powerVoltagePresetsKv, resolveEffectivePowerType, selectPowerType, type PowerConfiguration,
} from "../power-system/configuration";
import { examplePowerDiagram, examplePowerNetwork } from "../power-system/diagram";
import { normalizeLoad, normalizePowerSource } from "../power-system/injections";
import { readPowerNetwork, setPowerSwitch, type PowerCalculationCut, type PowerElement, type PowerSource } from "../power-system/network";
import { normallyOpenConfiguration, normallyOpenDiagram } from "../power-system/normally-open";
import { layoutPowerNetwork } from "../power-system/layout";
import { maxAcBuses, maxAcElements, solveACPowerFlow } from "../power-system/ac-power-flow";
import { exampleRingConfiguration, exampleRingDiagram } from "../power-system/ring-example";
import { appendPowerEquipment, removePowerEquipment } from "../power-system/author";
import { calculateOverlayReadings, defaultPowerOverlayLayers } from "../power-system/flow-overlay";
import type { Language } from "../types";
import { TransformerEquivalentPanel } from "./TransformerEquivalentPanel";
import { LineEquivalentPanel } from "./LineEquivalentPanel";
import { PowerLoadParameters } from "./PowerLoadParameters";
import { ACPowerFlowPanel } from "./ACPowerFlowPanel";
import { PowerSwitchPanel } from "./PowerSwitchPanel";
import { PowerFlowOverlay } from "./PowerFlowOverlay";
import { PowerNetworkAuthor } from "./PowerNetworkAuthor";
import { PowerOverlayControls } from "./PowerOverlayControls";
import { RingFlowPanel } from "./RingFlowPanel";
import { RadialFlowPanel } from "./RadialFlowPanel";
import PowerEquipmentParameters from "./PowerEquipmentParameters";
import "./PowerSystemLab.css";

const initial: PowerConfiguration = { network: examplePowerNetwork, catalogue: { schemaVersion: 1, types: [] }, overrides: new Map() };
type Study = "radial" | "ring" | "normally-open" | "custom";
const copy = {
  ru: {
    study: "Учебная сеть", radial: "Радиальная сеть", ring: "Кольцевая сеть", normallyOpen: "Кольцо с нормально открытым аппаратом", customStudy: "Своя сеть", importNetwork: "Импорт сети JSON", createNetwork: "Создать свою сеть", openNetwork: "Открыть свою сеть", networkError: "Проверьте документ сети.", device: "Оборудование", type: "Тип оборудования", unassigned: "Тип не выбран", import: "Импорт типов JSON",
    advanced: "Дополнительно", length: "Длина, km", circuits: "Параллельные цепи", units: "Параллельные трансформаторы",
    tap: "Позиция отпайки", voltages: "Напряжение", target: "Узел или источник", preset: "Уровень напряжения",
    custom: "Своё значение", value: "Напряжение, kV", base: "Каталожные параметры", override: "Переопределено в этой схеме",
    importError: "Проверьте формат каталога, происхождение и ревизии типов.", error: "Проверьте параметры. Сохранено предыдущее значение.",
    angle: "Угол источника, °", source: "Питающий источник", transformer: "Трансформатор", line: "Линия", load: "Нагрузка", switch: "Коммутационный аппарат",
  },
  uk: {
    study: "Навчальна мережа", radial: "Радіальна мережа", ring: "Кільцева мережа", normallyOpen: "Кільце з нормально розімкненим апаратом", customStudy: "Власна мережа", importNetwork: "Імпорт мережі JSON", createNetwork: "Створити власну мережу", openNetwork: "Відкрити власну мережу", networkError: "Перевірте документ мережі.", device: "Обладнання", type: "Тип обладнання", unassigned: "Тип не вибрано", import: "Імпорт типів JSON",
    advanced: "Додатково", length: "Довжина, km", circuits: "Паралельні ланцюги", units: "Паралельні трансформатори",
    tap: "Позиція відгалуження", voltages: "Напруга", target: "Вузол або джерело", preset: "Рівень напруги",
    custom: "Власне значення", value: "Напруга, kV", base: "Каталожні параметри", override: "Перевизначено в цій схемі",
    importError: "Перевірте формат каталогу, походження та ревізії типів.", error: "Перевірте параметри. Збережено попереднє значення.",
    angle: "Кут джерела, °", source: "Джерело живлення", transformer: "Трансформатор", line: "Лінія", load: "Навантаження", switch: "Комутаційний апарат",
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
  const [study, setStudy] = useState<Study>("radial");
  const saved = useRef<Record<Study, PowerConfiguration>>({ radial: initial, ring: exampleRingConfiguration, "normally-open": normallyOpenConfiguration, custom: initial });
  const [customDiagram, setCustomDiagram] = useState<string | null>(null);
  const [acRequested, setAcRequested] = useState(false);
  const [cuts, setCuts] = useState<readonly PowerCalculationCut[]>([]);
  const [layers, setLayers] = useState(() => new Set(defaultPowerOverlayLayers));
  const acCalculation = useMemo(() => {
    if (!acRequested) return null;
    try { return { result: solveACPowerFlow(configuration) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "" }; }
  }, [acRequested, configuration]);
  const overlayReadings = useMemo(() => acCalculation?.result && calculateOverlayReadings(configuration, acCalculation.result),
    [acCalculation, configuration]);
  const [ready, setReady] = useState(false);
  const [equipmentId, setEquipmentId] = useState("L1");
  const [voltageTarget, setVoltageTarget] = useState("bus:B1");
  const [customVoltage, setCustomVoltage] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const networkInput = useRef<HTMLInputElement>(null);
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

  function openStudy(next: Study, nextConfiguration: PowerConfiguration) {
    saved.current[study] = current.current;
    current.current = nextConfiguration;
    setConfiguration(nextConfiguration);
    setEquipmentId(nextConfiguration.network.elements.find(element => element.kind === "line" || element.kind === "transformer")?.id ?? "");
    const firstBus = nextConfiguration.network.buses[0];
    setVoltageTarget(firstBus ? "bus:" + firstBus.id : "");
    setCustomVoltage(false);
    setError("");
    setAcRequested(false);
    setStudy(next);
  }

  function openCustom() {
    if (customDiagram) {
      openStudy("custom", saved.current.custom);
      return;
    }
    const network = readPowerNetwork({ schemaVersion: 1, buses: [{ id: "B1", nominalKv: 110 }], elements: [] });
    setCustomDiagram(layoutPowerNetwork(network));
    openStudy("custom", { ...current.current, network, overrides: new Map() });
  }

  function editCustom(change: (network: PowerConfiguration["network"]) => PowerConfiguration["network"]) {
    return update(previous => {
      const network = change(previous.network);
      const next = changePowerNetwork(previous, network);
      setCustomDiagram(layoutPowerNetwork(network));
      const firstEquipment = network.elements.find(item => item.kind === "line" || item.kind === "transformer");
      if (firstEquipment && !network.elements.some(item => item.id === equipmentId)) setEquipmentId(firstEquipment.id);
      if (!network.buses.some(bus => "bus:" + bus.id === voltageTarget) &&
          !network.elements.some(item => item.kind === "source" && "source:" + item.id === voltageTarget)) {
        setVoltageTarget(network.buses[0] ? "bus:" + network.buses[0].id : "");
      }
      return next;
    }, words.networkError);
  }

  const network = configuration.network;
  const devices = network.elements.filter(element => element.kind === "line" || element.kind === "transformer");
  const device = devices.find(part => part.id === equipmentId) ?? devices[0];
  const base = device && resolveEquipmentType(configuration.catalogue, device);
  const effective = device && resolveEffectivePowerType(configuration, device.id);
  const overridden = configuration.overrides.has(equipmentId);
  const source = network.elements.find((element): element is PowerSource =>
    element.kind === "source" && "source:" + element.id === voltageTarget);
  const loads = network.elements.filter(element => element.kind === "load");
  const bus = network.buses.find(candidate => "bus:" + candidate.id === voltageTarget);
  const displayedVoltage = source?.voltageKv ?? bus?.nominalKv ?? 110;
  const knownVoltage = powerVoltagePresetsKv.some(value => value === displayedVoltage);

  function changeElement(id: string, adjust: (element: PowerElement) => PowerElement): boolean {
    return update(previous => changePowerNetwork(previous, {
      ...previous.network, elements: previous.network.elements.map(element => element.id === id ? adjust(element) : element),
    }));
  }

  function changeVoltage(voltageKv: number): boolean {
    if (source) {
      const presetKv = powerVoltagePresetsKv.find(value => value === voltageKv);
      return changeElement(source.id, element => element.kind === "source"
        ? normalizePowerSource({ id: element.id, busId: element.busId, inService: element.inService, angleDeg: element.angleDeg,
          ...(presetKv === undefined ? { voltageKv } : { presetKv }) }) : element);
    }
    if (!bus) return false;
    return update(previous => changePowerNetwork(previous, {
      ...previous.network, buses: previous.network.buses.map(entry => entry.id === bus.id ? { ...entry, nominalKv: voltageKv } : entry),
    }));
  }

  return <fieldset className="lab-hydration-guard" disabled={!ready}>
    <div className="power-workspace" data-power-ready={ready} data-power-device={device?.id ?? ""}>
      <section className="power-panel">
        <label>{words.study}<select aria-label={words.study} value={study}
          onChange={event => {
            const next = event.currentTarget.value as Study;
            if (next !== study) openStudy(next, saved.current[next]);
          }}>
          <option value="radial">{words.radial}</option><option value="ring">{words.ring}</option>
          <option value="normally-open">{words.normallyOpen}</option>
          {customDiagram && <option value="custom">{words.customStudy}</option>}
        </select></label>
        {study !== "custom" && <button type="button" onClick={openCustom}>{customDiagram ? words.openNetwork : words.createNetwork}</button>}
        <button type="button" onClick={() => networkInput.current?.click()}>{words.importNetwork}</button>
        <input ref={networkInput} type="file" hidden aria-label={words.importNetwork} accept=".json,application/json"
          onChange={async event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            try {
              if (file.size > maxCircuitFileBytes) throw Error("file-limit");
              const physical = readPowerNetwork(JSON.parse(await file.text()));
              if (physical.buses.length > maxAcBuses || physical.elements.length > maxAcElements) throw Error("power-ac-network-limit");
              const diagram = layoutPowerNetwork(physical);
              const imported = { ...current.current, network: physical, overrides: new Map() };
              setCustomDiagram(diagram);
              openStudy("custom", imported);
            } catch { setError(words.networkError); }
          }} />
      </section>
      {study === "custom" && <PowerNetworkAuthor network={network} language={language}
        onAppend={input => editCustom(network => appendPowerEquipment(network, input))}
        onRemove={id => editCustom(network => removePowerEquipment(network, id))} />}
      <CircuitEditor language={language} embedded inspectOnly initial={examplePowerDiagram}
        activeDocument={study === "custom" ? customDiagram ?? examplePowerDiagram : study === "ring" ? exampleRingDiagram
          : study === "normally-open" ? normallyOpenDiagram : examplePowerDiagram}
        selectedComponentId={equipmentId}
        extension={{
          onSelect(id) {
            if (id && devices.some(part => part.id === id)) setEquipmentId(id);
            if (network.elements.some(element => element.kind === "source" && element.id === id)) {
              setVoltageTarget("source:" + id); setCustomVoltage(false);
            }
          },
          partClosed(id) {
            const item = network.elements.find(element => element.id === id);
            return item?.kind === "switch" ? item.closed : undefined;
          },
          describePart(id) {
            const element = network.elements.find(item => item.id === id);
            return element ? { "aria-label": words[element.kind] + " " + element.id } : {};
          },
          overlay(drawing) {
            return <>
              {network.buses.map(({ id, nominalKv }) => {
                const point = drawing.junctionPositions[id];
                if (!point) return null;
                const nominal = !overlayReadings || !layers.has("voltage") || overlayReadings.unpowered.has(id);
                return <g key={id} data-power-bus={id} data-nominal-kv={nominalKv}>
                  <text x={point.x} y={point.y - 19} textAnchor="middle">{id}</text>
                  {nominal && <text x={point.x} y={point.y + 23} textAnchor="middle">{formatEngineeringNumber(nominalKv, language) + " kV"}</text>}
                </g>;
              })}
              {study === "ring" && cuts.map(({ busId, quantity }) => {
                const point = drawing.junctionPositions[busId];
                if (!point) return null;
                const y = point.y + (quantity === "p" ? -37 : -52);
                return <g key={quantity} className="power-calculation-cut" data-power-calculation-cut={quantity + ":" + busId}
                  pointerEvents="none" aria-hidden="true">
                  <path d={`M${point.x - 19} ${y + 5}H${point.x + 19}`} />
                  <text x={point.x} y={y} textAnchor="middle">{quantity.toUpperCase()}</text>
                </g>;
              })}
              {overlayReadings && <PowerFlowOverlay drawing={drawing} readings={overlayReadings} layers={layers} language={language} />}
            </>;
          },
        }} />
      <div className="power-inspectors">
        <section className="power-panel">
          <h2>{words.device}</h2>
          {device && <div className="power-fields">
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
          </div>}
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
          {effective && device && <details key={equipmentId} className="power-advanced">
            <summary>{words.advanced}</summary>
            <p data-power-override={overridden}>{overridden ? words.override : words.base}</p>
            <PowerEquipmentParameters language={language} type={effective} key={JSON.stringify(effective)} overridden={overridden}
              onApply={candidate => update(previous => applyPowerOverride(previous, device.id, candidate))}
              onReset={() => update(previous => clearPowerOverride(previous, device.id))} />
          </details>}
          {device?.kind === "line" && <LineEquivalentPanel configuration={configuration} lineId={device.id} language={language} />}
          {device?.kind === "transformer" && <TransformerEquivalentPanel configuration={configuration} transformerId={device.id} language={language} />}
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
            {source && <NumberField key={source.id + "-angle"} label={words.angle} value={source.angleDeg}
              onCommit={angleDeg => changeElement(source.id, element => element.kind === "source"
                ? normalizePowerSource({ ...element, angleDeg }) : element)} />}
          </div>
          {source && <p data-power-source-angle={source.angleDeg}>{words.angle} {formatEngineeringNumber(source.angleDeg, language)}°</p>}
          <output data-power-voltage={displayedVoltage}>{formatEngineeringNumber(displayedVoltage, language)} kV</output>
        </section>
      </div>
      {loads.map(load => <section className="power-panel power-load" key={load.id}>
        <h2>{words.load} {load.id}</h2>
        <PowerLoadParameters load={load} language={language} onApply={input => changeElement(load.id,
          element => element.kind === "load" ? { ...element, ...normalizeLoad(input) } : element)} />
      </section>)}
      {study === "ring" && <RingFlowPanel configuration={configuration} language={language} cuts={cuts} onCutsChange={setCuts} />}
      {network.elements.some(item => item.kind === "switch") && <PowerSwitchPanel network={network} language={language}
        onSwitch={(id, closed) => update(previous => changePowerNetwork(previous, setPowerSwitch(previous.network, id, closed)))} />}
      {study === "radial" && <RadialFlowPanel configuration={configuration} language={language} />}
      <ACPowerFlowPanel result={acCalculation?.result} issue={acCalculation?.error}
        enabled={acRequested} onCalculate={() => setAcRequested(true)} language={language} />
      {overlayReadings && <PowerOverlayControls language={language} readings={overlayReadings} layers={layers} selectedId={equipmentId}
        onToggle={layer => setLayers(previous => {
          const next = new Set(previous);
          if (next.has(layer)) next.delete(layer); else next.add(layer);
          return next;
        })} />}
      {error && <p role="alert">{error}</p>}
    </div>
  </fieldset>;
}
