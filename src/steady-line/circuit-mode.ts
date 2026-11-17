import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "../circuit/document";
import { lineDemoDrawing, type PartKind } from "../circuit/drawing";
import type { CircuitLaboratoryMode } from "../circuit/editor-mode";
import { addComplex, divideComplex, type Complex } from "../models/circular-diagram";
import { transmissionCircuitAdapter } from "../transient/circuit-adapter";
import type { Contact, Load, Network } from "../transient/network";
import type { CascadeElement } from "./cascade";
import type { LineTermination } from "./line";

const allowed: readonly PartKind[] = ["voltage", "line", "r", "l", "c"];
const zero = (): Complex => ({ re: 0, im: 0 });
const one: Complex = { re: 1, im: 0 };
const isZero = (value: Complex) => value.re === 0 && value.im === 0;

export const steadyCircuitMode: CircuitLaboratoryMode<Network> = {
  id: "steady-line",
  createDefaultDocument() {
    const drawing = lineDemoDrawing();
    return serializeCircuit({ ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(part => {
      if (part.kind === "voltage") return { ...part, parameters: { ...part.parameters, voltageV: 100, resistanceOhm: 50 } };
      if (part.kind === "r") return { ...part, parameters: { ...part.parameters, ohm: 100 } };
      return part;
    }) } }, defaultCircuitSettings);
  },
  availableParts: () => allowed,
  readModel(text) {
    const { drawing } = parseCircuit(text);
    if (drawing.topology.components.some(part => !allowed.includes(part.kind as PartKind))) {
      throw Error("unsupported-steady-circuit");
    }
    const { model } = transmissionCircuitAdapter.convert(drawing.topology);
    if (model.events.length || model.source.onS !== 0 || model.source.offS !== undefined ||
      model.branches?.some(contact => contact.to !== "reference")) {
      throw Error("unsupported-steady-circuit");
    }
    return model;
  },
};

function contactImpedance(contact: Contact, omega: number): Complex {
  const component = contact.component;
  if (!component && contact.resistanceOhm !== undefined) return { re: contact.resistanceOhm, im: 0 };
  if (component?.kind === "l") return { re: 0, im: omega * component.value };
  if (component?.kind === "c") return { re: 0, im: -1 / (omega * component.value) };
  throw Error("unsupported-steady-circuit");
}

function loadImpedance(load: Load, omega: number): Complex | "open" {
  switch (load.kind) {
    case "open": return "open";
    case "wire": return zero();
    case "r": return { re: load.value!, im: 0 };
    case "l": return { re: 0, im: omega * load.value! };
    case "c": return { re: 0, im: -1 / (omega * load.value!) };
    case "series": {
      let sum = zero();
      for (const child of load.children!) {
        const part = loadImpedance(child, omega);
        if (part === "open") return "open";
        sum = addComplex(sum, part);
      }
      return sum;
    }
    case "parallel": {
      let admittance = zero();
      for (const child of load.children!) {
        const part = loadImpedance(child, omega);
        if (part === "open") continue;
        if (isZero(part)) return zero();
        admittance = addComplex(admittance, divideComplex(one, part));
      }
      return isZero(admittance) ? "open" : divideComplex(one, admittance);
    }
    default: throw Error("unsupported-steady-circuit");
  }
}

export function evaluateSteadyCircuit(model: Network, frequencyHz: number, ending: "circuit" | "matched" | "open" | "short") {
  const omega = 2 * Math.PI * frequencyHz;
  const elements: CascadeElement[] = [];
  for (let node = 0; node <= model.sections.length; node++) {
    for (const contact of model.branches ?? []) {
      if (contact.from !== node) continue;
      elements.push({ kind: "shunt", admittanceSiemens: divideComplex(one, contactImpedance(contact, omega)) });
    }
    for (const contact of model.series ?? []) {
      if (contact.from === node) elements.push({ kind: "series", impedanceOhm: contactImpedance(contact, omega) });
    }
    const section = model.sections[node];
    if (!section) continue;
    const { lengthM, impedanceOhm: z, velocityMS: v, resistanceOhmM: r = 0 } = section;
    elements.push({ kind: "line", section: {
      lengthM, rOhmM: r, lHenryM: z / v, gSiemensM: r / (z * z), cFaradM: 1 / (z * v),
    } });
  }
  let termination: LineTermination = ending === "circuit" ? "open" : ending;
  if (ending === "circuit") {
    const impedanceOhm = loadImpedance(model.load, omega);
    if (impedanceOhm !== "open") termination = { impedanceOhm };
  }
  return { elements, termination, source: {
    voltage: { re: model.source.voltageV, im: 0 },
    impedanceOhm: { re: model.source.resistanceOhm, im: 0 },
  } };
}
