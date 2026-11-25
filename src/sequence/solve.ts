import {
  addComplex, complexMagnitude, multiplyComplex, type Complex,
} from "../models/circular-diagram";
import {
  absolutePosition, areas, phases, z, type Area, type Matrix3, type Neutral, type SectionReading,
  type SequenceCoupling, type SequenceDocument, type SequenceEdit, type SequenceSolution, type Triple,
} from "./contract";
import { validateSequenceDocument } from "./document";
import { matrixVector, SequenceMna } from "./matrix";

type Phases = readonly [number, number, number];
type PhaseMask = readonly [boolean, boolean, boolean];
type PhysicalLink = { from: number; to: number; owner: number };
type Probe = Pick<SectionReading, "id" | "area" | "from" | "to"> & { before: Phases; after: Phases; currents: Phases };

const indices = [0, 1, 2] as const;
const a = z(-0.5, Math.sqrt(3) / 2), a2 = z(a.re, -a.im);
const one = z(1), minusOne = z(-1), ground = -1;
const phaseTransform: Matrix3 = [[one, one, one], [one, a2, a], [one, a, a2]];
const allClosed: PhaseMask = [false, false, false];
const zeroImpedance: Matrix3 = [[z(), z(), z()], [z(), z(), z()], [z(), z(), z()]];

const scaled = (value: Complex, factor: number) => z(value.re * factor, value.im * factor);
const isZero = (value: Complex) => value.re === 0 && value.im === 0;

function madeMatrix(get: (row: 0 | 1 | 2, column: 0 | 1 | 2) => Complex): Matrix3 {
  const row = (index: 0 | 1 | 2): Triple => [get(index, 0), get(index, 1), get(index, 2)];
  return [row(0), row(1), row(2)];
}

const sequenceTransform = madeMatrix((row, column) => {
  const value = phaseTransform[column][row];
  return z(value.re / 3, -value.im / 3);
});

function matrixProduct(left: Matrix3, right: Matrix3): Matrix3 {
  return madeMatrix((row, column) => indices.reduce((sum, k) => addComplex(sum, multiplyComplex(left[row][k], right[k][column])), z()));
}

function diagonal(values: Triple): Matrix3 {
  return madeMatrix((row, column) => row === column ? values[row] : z());
}

export const abcTo012 = (values: Triple): Triple => matrixVector(sequenceTransform, values);
export const sequenceToAbc = (values: Triple): Triple => matrixVector(phaseTransform, values);

const sequenceMatrix = (values: Matrix3) => matrixProduct(matrixProduct(sequenceTransform, values), phaseTransform);
const phaseMatrix = (values: Matrix3) => matrixProduct(matrixProduct(phaseTransform, values), sequenceTransform);

function phaseMask(edit: SequenceEdit): PhaseMask {
  return [edit.phases.includes("A"), edit.phases.includes("B"), edit.phases.includes("C")];
}

function matrixForMask(mask: PhaseMask, value: Complex) {
  return diagonal([mask[0] ? value : z(), mask[1] ? value : z(), mask[2] ? value : z()]);
}

function sequenceInteractions(values: Matrix3) {
  const scale = Math.max(...values.flatMap(row => row.map(complexMagnitude)));
  const active = new Set<0 | 1 | 2>();
  for (const row of indices) for (const column of indices) {
    if (row === column || complexMagnitude(values[row][column]) <= scale * 1e-12) continue;
    active.add(row);
    active.add(column);
  }
  return [...active].sort((a, b) => a - b);
}

function finiteAdmittance(impedance: Complex): Complex | undefined {
  const magnitude = Math.max(impedance.re, Math.abs(impedance.im));
  if (!magnitude) return;
  const re = impedance.re / magnitude, im = impedance.im / magnitude;
  const denominator = (re * re + im * im) * magnitude;
  const value = z(re / denominator, -im / denominator);
  if (complexMagnitude(value) < Number.MAX_VALUE / 16) return value;
}

function describeCoupling(edits: readonly SequenceEdit[], original: Matrix3, showMatrix: boolean): SequenceCoupling | undefined {
  const [first] = edits;
  if (!first) return;
  const matrix = sequenceMatrix(original);
  const sequences = sequenceInteractions(matrix);
  if (!sequences.length) return;
  return { id: edits.map(edit => edit.id).join("+"), area: first.area, at: first.at, sequences, ...(showMatrix ? { matrix } : {}) };
}

function shuntCoupling(edit: Extract<SequenceEdit, { kind: "shunt" }>): SequenceCoupling | undefined {
  const mask = phaseMask(edit);
  const selected = indices.filter(index => mask[index]);
  const admittance = finiteAdmittance(edit.impedance);
  if (edit.target === "ground") {
    // A shared finite ground point adds an equipotential constraint across
    // selected phases. Its total coupling has the selected-phase support.
    const scale = selected.length === 1 ? admittance : undefined;
    return describeCoupling([edit], matrixForMask(mask, scale ?? one), scale !== undefined);
  }
  const target = phases.indexOf(edit.target);
  const original = madeMatrix((row, column) => selected.reduce((sum, phase) => {
    const left = Number(row === phase) - Number(row === target);
    const right = Number(column === phase) - Number(column === target);
    return addComplex(sum, scaled(admittance ?? one, left * right));
  }, z()));
  return describeCoupling([edit], original, admittance !== undefined);
}

class CircuitEquations {
  readonly matrix = new SequenceMna();
  readonly links: PhysicalLink[] = [];
  readonly nodes: number[] = [];

  node() {
    const node = this.matrix.allocate();
    this.nodes.push(node);
    return node;
  }

  phaseNodes(): Phases {
    const block = this.matrix.allocatePhases();
    this.nodes.push(...block);
    return block;
  }

  private currentBranch(from: number, to: number, current: number, owner: number) {
    this.matrix.stamp(from, current, one);
    this.matrix.stamp(to, current, minusOne);
    this.matrix.stamp(current, from, one);
    this.matrix.stamp(current, to, minusOne);
    this.links.push({ from, to, owner });
  }

  scalarBranch(from: number, to: number, impedance: Complex) {
    const current = this.matrix.allocate();
    this.currentBranch(from, to, current, current);
    this.matrix.stamp(current, current, scaled(impedance, -1));
    return current;
  }

  phaseBranch(from: Phases, to: Phases, impedance: Matrix3, open: PhaseMask, emf?: Triple): Phases {
    const currents = this.matrix.allocatePhases();
    for (const phase of indices) {
      const current = currents[phase];
      if (open[phase]) {
        this.matrix.stamp(current, current, one);
      } else {
        this.currentBranch(from[phase], to[phase], current, currents[0]);
        for (const column of indices) {
          this.matrix.stamp(current, currents[column], scaled(impedance[phase][column], -1));
        }
      }
      if (emf) this.matrix.setRhs(current, emf[phase]);
    }
    return currents;
  }

  shunt(nodes: Phases, edit: Extract<SequenceEdit, { kind: "shunt" }>): readonly (number | undefined)[] {
    const mask = phaseMask(edit);
    if (edit.target === "ground") {
      if (edit.phases.length === 1 || isZero(edit.impedance)) {
        return indices.map(index => mask[index] ? this.scalarBranch(nodes[index], ground, edit.impedance) : undefined);
      }
      const faultPoint = this.node();
      this.scalarBranch(faultPoint, ground, edit.impedance);
      return indices.map(index => mask[index] ? this.scalarBranch(nodes[index], faultPoint, z()) : undefined);
    }
    const target = nodes[phases.indexOf(edit.target)];
    return indices.map(index => mask[index] ? this.scalarBranch(nodes[index], target, edit.impedance) : undefined);
  }

  neutral(node: number, model: Neutral) {
    if (model.mode === "grounded") this.scalarBranch(node, ground, model.impedance);
  }

  private adjacency(excludedOwner?: number) {
    const adjacency = new Map<number, number[]>();
    for (const { from, to, owner } of this.links) {
      if (owner === excludedOwner) continue;
      for (const [left, right] of [[from, to], [to, from]]) {
        const neighbors = adjacency.get(left) ?? [];
        neighbors.push(right);
        adjacency.set(left, neighbors);
      }
    }
    return adjacency;
  }

  private connected(adjacency: ReadonlyMap<number, number[]>, start: number) {
    const seen = new Set([start]);
    for (const node of seen) for (const target of adjacency.get(node) ?? []) seen.add(target);
    return seen;
  }

  references() {
    const adjacency = this.adjacency();
    const grounded = this.connected(adjacency, ground);
    const referenceByNode = new Map([...grounded].map(node => [node, ground]));
    const gauges: number[] = [];
    // With no ground link the component's absolute voltage floats. Its KCL
    // sum is redundant and can be replaced by one deterministic datum.
    for (const node of this.nodes) {
      if (referenceByNode.has(node)) continue;
      gauges.push(node);
      this.connected(adjacency, node).forEach(id => referenceByNode.set(id, node));
    }
    return { referenceByNode, gauges };
  }

  zeroPath(probe: Probe) {
    // A common-mode current can cross the section only with a ground return
    // around the phase conduits of this same section, regardless of I0 now.
    const grounded = this.connected(this.adjacency(probe.currents[0]), ground);
    return indices.some(index => grounded.has(probe.before[index]) && grounded.has(probe.after[index]));
  }
}

type Station = { position: number; relative: Partial<Record<Area, number>>; edits: SequenceEdit[] };

function stations(document: SequenceDocument) {
  const all = new Map<number, Station>();
  function at(position: number) {
    const node = all.get(position) ?? { position, relative: {}, edits: [] };
    all.set(position, node);
    return node;
  }
  for (const [index, area] of areas.entries()) {
    at(index).relative[area] = 0;
    at(index + 1).relative[area] = 1;
  }
  for (const edit of document.edits) {
    const target = at(absolutePosition(edit.area, edit.at));
    target.relative[edit.area] = edit.at;
    target.edits.push(edit);
  }
  return [...all.values()].sort((left, right) => left.position - right.position);
}

function readBlock(values: Complex[], positions: Phases): Triple {
  return [values[positions[0]], values[positions[1]], values[positions[2]]];
}

function readSelected(values: Complex[], positions: readonly (number | undefined)[]): Triple {
  const read = (index: number) => positions[index] === undefined ? z() : values[positions[index]!];
  return [read(0), read(1), read(2)];
}

function longitudinalStamp(edits: readonly SequenceEdit[]) {
  const open: [boolean, boolean, boolean] = [false, false, false];
  const drop: [Complex, Complex, Complex] = [z(), z(), z()];
  for (const edit of edits) {
    if (edit.kind === "shunt") continue;
    const selected = phaseMask(edit);
    for (const phase of indices) {
      if (!selected[phase]) continue;
      if (edit.kind === "open") open[phase] = true;
      else drop[phase] = addComplex(drop[phase], edit.impedance);
    }
  }
  const effective: Triple = [open[0] ? z() : drop[0], open[1] ? z() : drop[1], open[2] ? z() : drop[2]];
  return { open, impedance: diagonal(effective) };
}

function longitudinalCouplings(edits: readonly SequenceEdit[], open: PhaseMask, impedance: Matrix3) {
  const opened = describeCoupling(edits.filter(edit => edit.kind === "open"), matrixForMask(open, one), false);
  const series = describeCoupling(edits.filter(edit => edit.kind === "series" && !isZero(edit.impedance)
    && indices.some(index => !open[index] && edit.phases.includes(phases[index]))), impedance, true);
  return [opened, series].filter(coupling => coupling !== undefined);
}

/** Solve the connected sequence-component system; all values are RMS phasors. */
export function solveSequence(input: SequenceDocument): SequenceSolution {
  let document: SequenceDocument;
  try { document = validateSequenceDocument(input); }
  catch { return { ok: false, reason: "range" }; }
  const circuit = new CircuitEquations();
  const generator = circuit.node(), load = circuit.node();
  circuit.neutral(generator, document.generatorNeutral);
  circuit.neutral(load, document.loadNeutral);

  let current = circuit.phaseNodes();
  circuit.phaseBranch(current, [generator, generator, generator], zeroImpedance, allClosed,
    sequenceToAbc([z(), z(document.sourceVolts), z()]));
  const positions = stations(document);
  const probes: Probe[] = [];
  const faultIndices = new Map<string, readonly (number | undefined)[]>();
  const couplings: SequenceCoupling[] = [];
  for (const [index, station] of positions.entries()) {
    const previous = positions[index - 1];
    if (previous) {
      const areaIndex = Math.min(2, Math.floor(previous.position));
      const area = areas[areaIndex];
      const from = previous.relative[area] ?? previous.position - areaIndex;
      const to = station.relative[area] ?? station.position - areaIndex;
      const fraction = station.position - previous.position;
      const after = circuit.phaseNodes();
      const impedance: Triple = [
        scaled(document.sections[area][0], fraction), scaled(document.sections[area][1], fraction), scaled(document.sections[area][2], fraction),
      ];
      const currents = circuit.phaseBranch(current, after, phaseMatrix(diagonal(impedance)), allClosed);
      probes.push({ id: area + ":" + from + ":" + to, area, from, to, before: current, after, currents });
      current = after;
    }

    const edits = [...station.edits].sort((left, right) => Number(left.kind === "shunt") - Number(right.kind === "shunt")
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const { open, impedance } = longitudinalStamp(edits);
    let inlineCurrents: Phases | undefined;
    if (edits.some(edit => edit.kind !== "shunt")) {
      const next = circuit.phaseNodes();
      inlineCurrents = circuit.phaseBranch(current, next, impedance, open);
      current = next;
      couplings.push(...longitudinalCouplings(edits, open, impedance));
    }
    for (const edit of edits) {
      if (edit.kind === "shunt") {
        const coupling = shuntCoupling(edit);
        if (coupling) couplings.push(coupling);
        faultIndices.set(edit.id, circuit.shunt(current, edit));
      } else {
        const mask = phaseMask(edit);
        faultIndices.set(edit.id, indices.map(index => mask[index] ? inlineCurrents![index] : undefined));
      }
    }
  }
  circuit.phaseBranch(current, [load, load, load], zeroImpedance, allClosed);

  const { referenceByNode, gauges } = circuit.references();
  const solution = circuit.matrix.solve(gauges, phaseTransform, sequenceTransform);
  if (!solution.ok) return solution;
  const { values, maxResidual } = solution;
  const readings = probes.map<SectionReading>(probe => {
    const voltageABC = readBlock(values, probe.after), currentABC = readBlock(values, probe.currents);
    const { id, area, from, to } = probe;
    const [a, b, c] = probe.after.map(node => referenceByNode.get(node)!);
    const phaseGrounded = [a === ground, b === ground, c === ground] as const;
    const reference = a !== b || a !== c ? "mixed-reference" : a === ground ? "ground" : "floating-reference";
    return {
      id, area, from, to, voltageABC, currentABC, voltage012: abcTo012(voltageABC), current012: abcTo012(currentABC),
      reference, phaseGrounded, zeroPath: circuit.zeroPath(probe),
    };
  });
  return {
    ok: true, readings, couplings, faultCurrents: Object.fromEntries(Array.from(faultIndices, ([id, positions]) => [id, readSelected(values, positions)])),
    maxResidual, gaugeFixed: gauges.length > 0, neutralVoltages: { generator: values[generator], load: values[load] },
  };
}
