export type PowerBus = Readonly<{ id: string; nominalKv: number; name?: string }>;

type Identified = Readonly<{ id: string; name?: string }>;
type InService = Readonly<{ inService: boolean }>;
type AtBus = Readonly<{ busId: string }>;
type BetweenBuses = Readonly<{ fromBusId: string; toBusId: string }>;
type EquipmentType = Readonly<{ typeId?: string }>;

export type PowerSource = Identified & InService & AtBus & Readonly<{
  kind: "source"; voltageKv: number; angleDeg: number;
}>;
export type PowerLoad = Identified & InService & AtBus & Readonly<{
  kind: "load"; activeMw: number; reactiveMvar: number;
}>;
export type PowerLine = Identified & InService & BetweenBuses & EquipmentType & Readonly<{
  kind: "line"; lengthKm: number; parallelCircuits: number;
}>;
export type PowerTransformer = Identified & InService & EquipmentType & Readonly<{
  kind: "transformer"; highBusId: string; lowBusId: string; parallelUnits: number; tapPosition?: number;
}>;
export type PowerSwitch = Identified & BetweenBuses & Readonly<{ kind: "switch"; closed: boolean }>;
export type PowerElement = PowerSource | PowerLoad | PowerLine | PowerTransformer | PowerSwitch;
export type PowerBranch = PowerLine | PowerTransformer | PowerSwitch;

/** Physical equipment and connections, independent of any study or layout. */
export type PowerNetwork = Readonly<{
  schemaVersion: 1;
  buses: readonly PowerBus[];
  elements: readonly PowerElement[];
}>;

export type PowerCalculationCut = Readonly<{ busId: string; quantity: "p" | "q" }>;

export type PowerIsland = Readonly<{
  busIds: readonly string[];
  branchIds: readonly string[];
  sourceIds: readonly string[];
  loadIds: readonly string[];
  energized: boolean;
  topology: "isolated" | "radial" | "meshed";
}>;

export type PowerStudy = Readonly<{
  physical: PowerNetwork;
  islands: readonly PowerIsland[];
  calculationCuts: readonly PowerCalculationCut[];
}>;

const record = (raw: unknown): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw);
const id = (raw: unknown): raw is string => typeof raw === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(raw);
const finite = (raw: unknown): raw is number => typeof raw === "number" && Number.isFinite(raw);
const positive = (raw: unknown): raw is number => finite(raw) && raw > 0;
const count = (raw: unknown): raw is number => positive(raw) && Number.isSafeInteger(raw);

function identity(raw: Record<string, unknown>): Identified {
  if (!id(raw.id) || raw.name !== undefined && (typeof raw.name !== "string" || raw.name.length > 120)) throw Error("power-invalid-id");
  return raw.name === undefined ? { id: raw.id } : { id: raw.id, name: raw.name };
}

export function powerBranchEndpoints(branch: PowerBranch): readonly [string, string] {
  return branch.kind === "transformer" ? [branch.highBusId, branch.lowBusId] : [branch.fromBusId, branch.toBusId];
}

function readElement(raw: unknown, buses: ReadonlySet<string>): PowerElement {
  if (!record(raw)) throw Error("power-invalid-element");
  const item = identity(raw);
  const validBus = (value: unknown): value is string => id(value) && buses.has(value);
  const validType = (value: unknown): value is string | undefined => value === undefined || id(value);
  const fail = () => Error("power-invalid-element:" + item.id);
  if (raw.kind === "switch") {
    if (!validBus(raw.fromBusId) || !validBus(raw.toBusId) || raw.fromBusId === raw.toBusId || typeof raw.closed !== "boolean") throw fail();
    return { ...item, kind: raw.kind, fromBusId: raw.fromBusId, toBusId: raw.toBusId, closed: raw.closed };
  }
  if (typeof raw.inService !== "boolean") throw fail();
  const status = { ...item, inService: raw.inService };
  switch (raw.kind) {
    case "source":
      if (!validBus(raw.busId) || !positive(raw.voltageKv) || !finite(raw.angleDeg)) throw fail();
      return { ...status, kind: raw.kind, busId: raw.busId, voltageKv: raw.voltageKv, angleDeg: raw.angleDeg };
    case "load":
      if (!validBus(raw.busId) || !finite(raw.activeMw) || raw.activeMw < 0 || !finite(raw.reactiveMvar)) throw fail();
      return { ...status, kind: raw.kind, busId: raw.busId, activeMw: raw.activeMw, reactiveMvar: raw.reactiveMvar };
    case "line":
      if (!validBus(raw.fromBusId) || !validBus(raw.toBusId) || raw.fromBusId === raw.toBusId || !positive(raw.lengthKm) ||
          !count(raw.parallelCircuits) || !validType(raw.typeId)) throw fail();
      return { ...status, kind: raw.kind, fromBusId: raw.fromBusId, toBusId: raw.toBusId, lengthKm: raw.lengthKm,
        parallelCircuits: raw.parallelCircuits, ...(raw.typeId === undefined ? {} : { typeId: raw.typeId }) };
    case "transformer":
      if (!validBus(raw.highBusId) || !validBus(raw.lowBusId) || raw.highBusId === raw.lowBusId || !count(raw.parallelUnits) ||
          !validType(raw.typeId) || raw.tapPosition !== undefined && !(finite(raw.tapPosition) && Number.isSafeInteger(raw.tapPosition))) throw fail();
      return { ...status, kind: raw.kind, highBusId: raw.highBusId, lowBusId: raw.lowBusId, parallelUnits: raw.parallelUnits,
        ...(raw.typeId === undefined ? {} : { typeId: raw.typeId }),
        ...(raw.tapPosition === undefined ? {} : { tapPosition: raw.tapPosition }) };
    default:
      throw fail();
  }
}

export function readPowerNetwork(raw: unknown): PowerNetwork {
  if (!record(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.buses) || !Array.isArray(raw.elements)) throw Error("power-invalid-document");
  const ids = new Set<string>();
  const register = (value: string) => {
    if (ids.has(value)) throw Error("power-duplicate-id:" + value);
    ids.add(value);
  };
  const buses = Array.from(raw.buses, (item: unknown): PowerBus => {
    if (!record(item) || !positive(item.nominalKv)) throw Error("power-invalid-bus");
    const bus = identity(item);
    register(bus.id);
    return { ...bus, nominalKv: item.nominalKv };
  });
  const busIds = new Set(ids);
  const elements = Array.from(raw.elements, (item: unknown) => {
    const found = readElement(item, busIds);
    register(found.id);
    return found;
  });
  return { schemaVersion: 1, buses, elements };
}

export function setPowerSwitch(network: PowerNetwork, switchId: string, closed: boolean): PowerNetwork {
  const target = network.elements.find(element => element.id === switchId);
  if (target?.kind !== "switch") throw Error("power-unknown-switch:" + switchId);
  if (target.closed === closed) return network;
  return { ...network, elements: network.elements.map(element => element === target ? { ...target, closed } : element) };
}
