import { exactLcParameters, type LcKind, type LcTicks } from "../models/lc-nominal";
import type { CauerElement } from "../models/reactive-cauer-i";
import type { FosterITerm } from "../models/reactive-foster-i";
import type { FosterIITerm } from "../models/reactive-foster-ii";
import { lcNominalTicks } from "../models/reactive-lc-graph";
import { analyzeLcExperiment } from "./lc-experiment";
import { sameLcPortResponse } from "./reactive-lc-simplification";
import type { CircuitComponent, CircuitTopology, CircuitWire } from "./topology";
import { avoidReservedWireIds, parseTopologyLabDocument, type TopologyLabDocument } from "./topology-session";

export type LcForm = "i" | "ii";
export type FosterTerm = FosterITerm | FosterIITerm;
type NominalBranch = { kind: LcKind; ticks: LcTicks };
type SynthesisCircuit = NominalBranch | { kind: "series" | "parallel"; left: SynthesisCircuit; right: SynthesisCircuit };

function buildSynthesisDocument(document: TopologyLabDocument, circuit: SynthesisCircuit): TopologyLabDocument {
  const port = document.topology.components.find(part => part.kind === "port");
  if (!port || port.terminals.length !== 2) throw Error("invalid-lc-port");
  const used = new Set([
    ...document.topology.junctions,
    ...document.topology.wires.map(wire => wire.id), ...(document.brokenWires?.map(wire => wire.id) ?? []),
    ...document.topology.components.flatMap(part => [part.id, ...part.terminals]),
  ]);
  const counters = new Map<string, number>();
  const components: CircuitComponent[] = [port];
  const junctions: string[] = [];
  const wires: CircuitWire[] = [];

  function allocate(prefix: string, hasTerminals = false) {
    let n = counters.get(prefix) ?? 0;
    let id: string;
    do { id = prefix + ++n; }
    while (used.has(id) || hasTerminals && (used.has(id + ":a") || used.has(id + ":b")));
    counters.set(prefix, n);
    used.add(id);
    if (hasTerminals) { used.add(id + ":a"); used.add(id + ":b"); }
    return id;
  }

  function visit(node: SynthesisCircuit, from: string, to: string) {
    if ("ticks" in node) {
      const id = allocate(node.kind.toUpperCase(), true);
      const terminals = [id + ":a", id + ":b"];
      components.push({ id, kind: node.kind, terminals, parameters: exactLcParameters(node.kind, node.ticks) });
      wires.push({ id: allocate("W"), from, to: terminals[0] }, { id: allocate("W"), from: terminals[1], to });
    } else if (node.kind === "series") {
      const middle = allocate("J");
      junctions.push(middle);
      visit(node.left, from, middle);
      visit(node.right, middle, to);
    } else {
      visit(node.left, from, to);
      visit(node.right, from, to);
    }
  }

  visit(circuit, port.terminals[0], port.terminals[1]);
  return parseTopologyLabDocument(JSON.stringify({ kind: document.kind, schemaVersion: 1,
    topology: { components, junctions, wires }, observedEndpoints: port.terminals, attachmentSides: [] }));
}

export function applyExactLcTopology(
  document: TopologyLabDocument,
  topology: CircuitTopology,
  values: ReadonlyMap<string, LcTicks>,
): TopologyLabDocument {
  const previous = new Map(document.topology.components.map(part => [part.id, part]));
  const components = topology.components.map(part => {
    if (part.kind !== "l" && part.kind !== "c") return part;
    const ticks = values.get(part.id);
    if (!ticks) throw Error("missing-lc-transform-value");
    const existing = previous.get(part.id);
    if (existing && existing.kind === part.kind) {
      const old = lcNominalTicks(existing);
      if (old.numerator * ticks.denominator === ticks.numerator * old.denominator) return { ...part, parameters: existing.parameters };
    }
    return { ...part, parameters: exactLcParameters(part.kind, ticks) };
  });
  const cleaned = avoidReservedWireIds(document, { ...topology, components });
  const retained = new Set(components.map(part => part.id));
  const next = parseTopologyLabDocument(JSON.stringify({ ...document, topology: cleaned, geometry: undefined,
    attachmentSides: document.attachmentSides.filter(hint => retained.has(hint.componentId)) }));
  if (!sameLcPortResponse(analyzeLcExperiment(document), analyzeLcExperiment(next))) throw Error("lc-transform-equivalence");
  return next;
}

export function applyCauerTopology(document: TopologyLabDocument, form: LcForm, elements: readonly CauerElement[]): TopologyLabDocument {
  let tail: SynthesisCircuit | undefined;
  for (const element of [...elements].reverse()) {
    const { kind, coefficient, placement } = element;
    const n = form === "i" ? coefficient.numerator : coefficient.denominator;
    const d = form === "i" ? coefficient.denominator : coefficient.numerator;
    const ticks = { numerator: n * (kind === "l" ? 1_000n : 1_000_000n), denominator: d };
    const branch = { kind, ticks };
    tail = tail ? { kind: placement === "series" ? "series" : "parallel", left: branch, right: tail } : branch;
  }
  if (!tail) throw Error("empty-cauer-ladder");
  const next = buildSynthesisDocument(document, tail);
  if (!sameLcPortResponse(analyzeLcExperiment(document), analyzeLcExperiment(next))) throw Error("lc-synthesis-equivalence");
  return next;
}

/** Shared representation of the displayed Foster terms, before comparing their applied port function. */
export function fosterTopologyDraft(
  document: TopologyLabDocument,
  form: LcForm,
  terms: readonly FosterTerm[],
  witnesses: readonly { henry?: LcTicks; farad?: LcTicks }[],
): TopologyLabDocument {
  if (terms.length !== witnesses.length) throw Error("missing-lc-synthesis-witness");
  const termCircuits = terms.map<SynthesisCircuit>((term, index) => {
    const witness = witnesses[index];
    function branch(kind: LcKind): NominalBranch {
      const value = kind === "l" ? witness.henry : witness.farad;
      if (!value) throw Error("missing-lc-synthesis-witness");
      return { kind, ticks: { numerator: value.numerator * (kind === "l" ? 1_000_000n : 1_000_000_000n),
        denominator: value.denominator } };
    }
    if (term.kind === "parallel-lc" || term.kind === "series-lc") {
      return { kind: term.kind === "parallel-lc" ? "parallel" : "series", left: branch("l"), right: branch("c") };
    }
    return branch("henry" in term ? "l" : "c");
  });
  const circuit = termCircuits.reduce<SynthesisCircuit | undefined>((left, right) => left
    ? { kind: form === "i" ? "series" : "parallel", left, right } : right, undefined);
  if (!circuit) throw Error("empty-foster-form");
  return buildSynthesisDocument(document, circuit);
}
