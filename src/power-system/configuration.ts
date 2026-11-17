import { pinEquipmentType, readEquipmentCatalogue, resolveEquipmentType, type EquipmentCatalogue, type EquipmentType } from "./catalogue";
import { readPowerNetwork, type PowerLine, type PowerNetwork, type PowerTransformer } from "./network";

export const powerVoltagePresetsKv = [0.4, 6, 10, 20, 35, 110, 220] as const;
export type ConfigurableEquipment = PowerLine | PowerTransformer;

export type PowerConfiguration = Readonly<{
  network: PowerNetwork;
  catalogue: EquipmentCatalogue;
  overrides: ReadonlyMap<string, EquipmentType>;
}>;

export function powerEquipment(configuration: PowerConfiguration, id: string): ConfigurableEquipment {
  const device = configuration.network.elements.find(element => element.id === id);
  if (device?.kind !== "line" && device?.kind !== "transformer") throw Error("power-unknown-equipment:" + id);
  return device;
}

function compatibleOverride(candidate: EquipmentType | undefined, base: EquipmentType | undefined): candidate is EquipmentType {
  return !!candidate && !!base && candidate.kind === base.kind && candidate.id === base.id && candidate.revision === base.revision;
}

export function changePowerNetwork(configuration: PowerConfiguration, raw: unknown): PowerConfiguration {
  const network = readPowerNetwork(raw);
  const overrides = new Map<string, EquipmentType>();
  for (const device of network.elements) {
    if (device.kind !== "line" && device.kind !== "transformer") continue;
    const previous = configuration.overrides.get(device.id);
    const base = resolveEquipmentType(configuration.catalogue, device);
    if (base?.kind === device.kind && compatibleOverride(previous, base)) overrides.set(device.id, previous);
  }
  return { ...configuration, network, overrides };
}

export function mergePowerCatalogue(configuration: PowerConfiguration, input: unknown): PowerConfiguration {
  const imported = readEquipmentCatalogue(input);
  const key = (type: EquipmentType) => type.id + "@" + type.revision;
  const stored = new Map(configuration.catalogue.types.map(type => [key(type), type]));
  for (const type of imported.types) {
    const existing = stored.get(key(type));
    if (existing && JSON.stringify(existing) !== JSON.stringify(type)) throw Error("power-conflicting-catalogue-revision");
    stored.set(key(type), type);
  }
  const catalogue = readEquipmentCatalogue({ schemaVersion: 1, types: [...stored.values()] });
  return { ...configuration, catalogue };
}

export function clearPowerOverride(configuration: PowerConfiguration, id: string): PowerConfiguration {
  if (!configuration.overrides.has(id)) return configuration;
  const overrides = new Map(configuration.overrides);
  overrides.delete(id);
  return { ...configuration, overrides };
}

export function selectPowerType(configuration: PowerConfiguration, id: string, type: EquipmentType | undefined): PowerConfiguration {
  const device = powerEquipment(configuration, id);
  const physical = { ...device };
  delete physical.typeId;
  delete physical.typeRevision;
  const pinned = type ? resolveEquipmentType(configuration.catalogue, { typeId: type.id, typeRevision: type.revision }) : undefined;
  if (type && !pinned) throw Error("power-unknown-equipment-type");
  const next = pinned ? pinEquipmentType(physical, pinned) : physical;
  const network = { ...configuration.network, elements: configuration.network.elements.map(element => element.id === id ? next : element) };
  return clearPowerOverride({ ...configuration, network }, id);
}

export function resolveEffectivePowerType(configuration: PowerConfiguration, id: string): EquipmentType | undefined {
  const device = powerEquipment(configuration, id);
  const base = resolveEquipmentType(configuration.catalogue, device);
  if (base?.kind !== device.kind) return undefined;
  const override = configuration.overrides.get(id);
  return compatibleOverride(override, base) ? override : base;
}

export function applyPowerOverride(configuration: PowerConfiguration, id: string, candidate: EquipmentType): PowerConfiguration {
  const device = powerEquipment(configuration, id);
  const base = resolveEquipmentType(configuration.catalogue, device);
  if (!base || candidate.kind !== device.kind || base.kind !== device.kind) throw Error("power-equipment-type-mismatch:" + id);
  const { types } = readEquipmentCatalogue({ schemaVersion: 1, types: [
    { ...candidate, id: base.id, revision: base.revision, name: base.name, provenance: base.provenance },
  ] });
  return { ...configuration, overrides: new Map(configuration.overrides).set(id, types[0]) };
}
