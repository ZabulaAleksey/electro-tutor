import type { LaboratoryAdapter } from "../circuit/adapter";
import { netlist, type CircuitComponent } from "../circuit/topology";
import { DEFAULT_NETWORK, MAX_SECTIONS, validateNetwork, type Load, type Network, type Section } from "./network";

function numeric(component: CircuitComponent, name: string): number {
  const value = component.parameters[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error("invalid-line-parameter");
  return value;
}

export const transmissionCircuitAdapter: LaboratoryAdapter<Network> = {
  convert(topology) {
    const nets = netlist(topology);
    const membership = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
    const sources = topology.components.filter(item => item.kind === "voltage");
    const lines = topology.components.filter(item => item.kind === "line");
    const loads = topology.components.filter(item => ["r", "l", "c"].includes(item.kind));
    if (sources.length !== 1 || !lines.length || lines.length > MAX_SECTIONS || loads.length > 1 ||
        sources.length + lines.length + loads.length !== topology.components.length ||
        topology.components.some(item => item.terminals.length !== 2)) throw Error("unsupported-line-circuit");

    const terminals = (item: CircuitComponent) => item.terminals.map(id => membership.get(id)!);
    const source = sources[0];
    const [input, reference] = terminals(source);
    if (input === reference) throw Error("shorted-line-source");
    const usedNets = new Set([input, reference]);
    const sections: Section[] = [];
    let current = input;
    const remaining = new Set(lines);
    while (remaining.size) {
      const choices = [...remaining].filter(item => terminals(item).includes(current));
      if (choices.length !== 1) throw Error("unsupported-line-chain");
      const part = choices[0];
      const [a, b] = terminals(part);
      const next = a === current ? b : a;
      if (usedNets.has(next)) throw Error("unsupported-line-chain");
      remaining.delete(part);
      usedNets.add(next);
      sections.push({
        id: part.id,
        lengthM: numeric(part, "lengthM"),
        impedanceOhm: numeric(part, "impedanceOhm"),
        velocityMS: numeric(part, "velocityMS"),
      });
      current = next;
    }
    const connectedComponents = new Set(topology.components.flatMap(item => item.terminals));
    if (nets.some(net => !net.some(id => connectedComponents.has(id)))) throw Error("unattached-line-net");
    const loadPart = loads[0];
    let load: Load = { id: "openLoad", kind: "open" };
    if (loadPart) {
      const pair = terminals(loadPart);
      if (!pair.includes(current) || !pair.includes(reference)) throw Error("unsupported-line-load");
      const kind = loadPart.kind as "r" | "l" | "c";
      load = { id: loadPart.id, kind, value: numeric(loadPart, { r: "ohm", l: "henry", c: "farad" }[kind]) };
    }
    const model: Network = {
      ...DEFAULT_NETWORK, sections, load, events: [], shunts: [],
      source: { voltageV: numeric(source, "voltageV"), resistanceOhm: 0, onS: 0, node: 0 },
    };
    const errors = validateNetwork(model);
    if (errors.length) throw Error(errors.join("; "));
    const resultIds = new Map(sections.map(section => [section.id, section.id]));
    if (loadPart) resultIds.set(loadPart.id, model.load.id);
    return { model, resultIds };
  },
};
