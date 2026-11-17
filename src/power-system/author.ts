import { maxAcBuses, maxAcElements } from "./ac-power-flow";
import { powerBranchEndpoints, readPowerNetwork, type PowerElement, type PowerNetwork } from "./network";

export type AppendPowerEquipment =
  | { kind: "bus"; nominalKv: number }
  | { kind: "source" | "load"; firstBusId: string }
  | { kind: "line" | "transformer" | "switch"; firstBusId: string; secondBusId: string };

export function appendPowerEquipment(network: PowerNetwork, input: AppendPowerEquipment): PowerNetwork {
  const prefixes = { bus: "B", source: "S", load: "D", line: "L", transformer: "T", switch: "Q" } as const;
  const ids = new Set([...network.buses, ...network.elements].map(item => item.id));
  let counter = 1;
  while (ids.has(prefixes[input.kind] + counter)) counter++;
  const id = prefixes[input.kind] + counter;
  if (input.kind === "bus") {
    if (network.buses.length >= maxAcBuses) throw Error("power-ac-network-limit");
    return readPowerNetwork({ ...network, buses: [...network.buses, { id, nominalKv: input.nominalKv }] });
  }
  if (network.elements.length >= maxAcElements) throw Error("power-ac-network-limit");
  const first = network.buses.find(bus => bus.id === input.firstBusId);
  const neutral = { id, inService: true } as const;
  if (!first) throw Error("power-author-first-bus");
  let next: PowerElement;
  switch (input.kind) {
    case "source": next = { ...neutral, kind: input.kind, busId: first.id, voltageKv: first.nominalKv, angleDeg: 0 }; break;
    case "load": next = { ...neutral, kind: input.kind, busId: first.id, activeMw: 0, reactiveMvar: 0 }; break;
    case "line": next = { ...neutral, kind: input.kind, fromBusId: first.id, toBusId: input.secondBusId, lengthKm: 1, parallelCircuits: 1 }; break;
    case "transformer": next = { ...neutral, kind: input.kind, highBusId: first.id, lowBusId: input.secondBusId, parallelUnits: 1 }; break;
    case "switch": next = { id, kind: input.kind, fromBusId: first.id, toBusId: input.secondBusId, closed: false }; break;
  }
  return readPowerNetwork({ ...network, elements: [...network.elements, next] });
}

export function removePowerEquipment(network: PowerNetwork, id: string): PowerNetwork {
  const bus = network.buses.some(item => item.id === id);
  if (bus && network.elements.some(element => element.kind === "source" || element.kind === "load"
    ? element.busId === id : powerBranchEndpoints(element).includes(id))) throw Error("power-author-bus-in-use");
  return readPowerNetwork({ ...network, buses: network.buses.filter(item => item.id !== id),
    elements: network.elements.filter(item => item.id !== id) });
}
