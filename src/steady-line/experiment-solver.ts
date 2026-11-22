import { netlist, type CircuitComponent, type CircuitTopology } from "../circuit/topology";
import { addComplex, divideComplex, multiplyComplex, subtractComplex, type Complex } from "../models/circular-diagram";
import { calculateLineSection, type RlgcSection } from "./line";

export type DistributedParameters = Omit<RlgcSection, "lengthM">;

export type SteadyExperimentSettings = {
  frequencyHz: number;
  referenceEndpoint: string;
  sourcePhases: Readonly<Record<string, number>>;
  lineParameters: Readonly<Record<string, DistributedParameters>>;
};

type Waves = { forward: Complex; backward: Complex; total: Complex };

export type SteadyExperimentSample = {
  xM: number;
  voltage: Waves;
  current: Waves;
  impedanceOhm: Complex | null;
  powerW: number;
};

type Section = { id: string; lengthM: number; gammaPerM: Complex };

export type SteadyExperimentSolution = {
  sections: readonly Section[];
  sample: (id: string, xM: number) => SteadyExperimentSample;
  poles: (id: string) => readonly number[];
};

const zero: Complex = { re: 0, im: 0 };
const one: Complex = { re: 1, im: 0 };
const tau = 2 * Math.PI;
const roundingTolerance = 64 * Number.EPSILON;
const maximumPoles = 1_024;
const magnitude = ({ re, im }: Complex) => Math.hypot(re, im);
const peak = ({ re, im }: Complex) => Math.max(Math.abs(re), Math.abs(im));
const negative = ({ re, im }: Complex): Complex => ({ re: -re, im: -im });
const conjugate = ({ re, im }: Complex): Complex => ({ re, im: -im });

function checked(value: Complex): Complex {
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) throw Error("steady-numeric-range");
  return value;
}

function divide(a: Complex, b: Complex): Complex {
  const s = peak(b);
  return checked(divideComplex({ re: a.re / s, im: a.im / s }, { re: b.re / s, im: b.im / s }));
}

function propagate(gamma: Complex, x: number): Complex {
  const decay = Math.exp(-gamma.re * x);
  if (decay === 0) return zero;
  const angle = -gamma.im * x;
  return checked({ re: decay * Math.cos(angle), im: decay * Math.sin(angle) });
}

function parameter(part: CircuitComponent, name: string, defaultValue?: number): number {
  const value = part.parameters[name] ?? defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error("steady-invalid-part");
  return value;
}

function sourcePhasor(part: CircuitComponent, settings: SteadyExperimentSettings): Complex {
  const rms = parameter(part, part.kind === "voltage" ? "voltageV" : "currentA");
  const angle = Object.hasOwn(settings.sourcePhases, part.id) ? settings.sourcePhases[part.id] : 0;
  if (!Number.isFinite(angle)) throw Error("steady-invalid-part");
  const radians = (angle % 360) * Math.PI / 180;
  return checked({ re: rms * Math.cos(radians), im: rms * Math.sin(radians) });
}

type MatrixRow = { real: Float64Array; imaginary: Float64Array };

/** Complex elimination with row and column equilibration for the mixed V/A unknowns. */
function solve(rows: MatrixRow[]): Complex[] {
  const n = rows.length;
  const scales = new Float64Array(n);
  for (const { real, imaginary } of rows) {
    let rowScale = 0;
    for (let j = 0; j < n; j++) rowScale = Math.max(rowScale, Math.abs(real[j]), Math.abs(imaginary[j]));
    if (!Number.isFinite(rowScale)) throw Error("steady-numeric-range");
    if (rowScale === 0) throw Error("steady-singular");
    for (let j = 0; j <= n; j++) {
      real[j] /= rowScale;
      imaginary[j] /= rowScale;
      if (j < n) scales[j] = Math.max(scales[j], Math.abs(real[j]), Math.abs(imaginary[j]));
    }
  }
  for (let j = 0; j < n; j++) {
    if (!scales[j]) throw Error("steady-singular");
    for (const { real, imaginary } of rows) {
      real[j] /= scales[j];
      imaginary[j] /= scales[j];
    }
  }

  for (let j = 0; j < n; j++) {
    let pivotIndex = j;
    let pivotSize = 0;
    for (let i = j; i < n; i++) {
      const s = Math.hypot(rows[i].real[j], rows[i].imaginary[j]);
      if (s > pivotSize) { pivotIndex = i; pivotSize = s; }
    }
    if (pivotSize <= roundingTolerance * n) throw Error("steady-singular");
    [rows[j], rows[pivotIndex]] = [rows[pivotIndex], rows[j]];
    const pivot = rows[j];
    const inverse = divide(one, { re: pivot.real[j], im: pivot.imaginary[j] });
    for (let i = j + 1; i < n; i++) {
      const { real, imaginary } = rows[i];
      if (!real[j] && !imaginary[j]) continue;
      const f = multiplyComplex({ re: real[j], im: imaginary[j] }, inverse);
      for (let k = j + 1; k <= n; k++) {
        real[k] -= f.re * pivot.real[k] - f.im * pivot.imaginary[k];
        imaginary[k] -= f.re * pivot.imaginary[k] + f.im * pivot.real[k];
      }
      real[j] = imaginary[j] = 0;
    }
  }

  const unknowns: Complex[] = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const { real, imaginary } = rows[i];
    let rhs = { re: real[n], im: imaginary[n] };
    for (let j = i + 1; j < n; j++) {
      rhs = subtractComplex(rhs, multiplyComplex({ re: real[j], im: imaginary[j] }, unknowns[j]));
    }
    unknowns[i] = divide(rhs, { re: real[i], im: imaginary[i] });
  }
  return unknowns.map(({ re, im }, index) => checked({ re: re / scales[index], im: im / scales[index] }));
}

type Part = {
  component: CircuitComponent;
  a: number;
  b: number;
};

function physicalNodes(circuit: CircuitTopology, referenceEndpoint: string) {
  let nets: string[][];
  try { nets = netlist(circuit); }
  catch { throw Error("steady-invalid-topology"); }
  const endpoints = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
  const reference = endpoints.get(referenceEndpoint);
  if (reference === undefined) throw Error("steady-invalid-reference");
  const parents = nets.map((_, index) => index);
  const find = (id: number): number => {
    while (id !== parents[id]) id = parents[id];
    return id;
  };
  for (const part of circuit.components) {
    if (part.terminals.length !== 2) throw Error("steady-invalid-part");
    if (part.kind === "r" && parameter(part, "ohm") === 0) {
      const a = find(endpoints.get(part.terminals[0])!);
      const b = find(endpoints.get(part.terminals[1])!);
      if (a !== b) parents[b] = a;
    }
  }
  const indices = new Map<number, number>([[find(reference), -1]]);
  const indexOf = (endpoint: string): number => {
    const root = find(endpoints.get(endpoint)!);
    if (!indices.has(root)) indices.set(root, indices.size - 1);
    return indices.get(root)!;
  };
  const parts: Part[] = circuit.components.map(component => ({
    component, a: indexOf(component.terminals[0]), b: indexOf(component.terminals[1]),
  }));
  return { parts, size: indices.size - 1 };
}

type Line = Section & { characteristicOhm: Complex; through: Complex };
type SolvedLine = Line & { forward: Complex; backward: Complex };

function lineParameters(component: CircuitComponent, settings: SteadyExperimentSettings): Line {
  const id = component.id;
  const parameters = Object.hasOwn(settings.lineParameters, id) && settings.lineParameters[id];
  const lengthM = parameter(component, "lengthM");
  if (!parameters || lengthM <= 0) throw Error("steady-invalid-line");
  // Only γ and Z₀ are needed here. A full ABCD matrix for a very lossy
  // section could overflow even though the decaying-wave solution is finite.
  try {
    const { gammaPerM, characteristicOhm } = calculateLineSection({ ...parameters, lengthM: 0 }, settings.frequencyHz);
    return { id, lengthM, gammaPerM, characteristicOhm, through: propagate(gammaPerM, lengthM) };
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-line-section") throw Error("steady-invalid-line");
    throw Error("steady-numeric-range");
  }
}

function insignificant(sum: Complex, forward: Complex, backward: Complex, tolerance = roundingTolerance) {
  return peak(sum) <= tolerance * Math.max(peak(forward), peak(backward));
}

function readWavePair(forward: Complex, backward: Complex): Waves {
  const sum = checked(addComplex(forward, backward));
  return { forward, backward, total: insignificant(sum, forward, backward) ? { ...zero } : sum };
}

function readVoltage(line: SolvedLine, xM: number): Waves {
  if (line.gammaPerM.re === 0) {
    // For a lossless line, reference both waves to the nearest port. Near
    // an open end this keeps a local half-wavelength pole from inheriting
    // the rounding error of two independently evaluated distant phases.
    const rightDistance = line.lengthM - xM;
    if (rightDistance < xM) {
      const phase = propagate(line.gammaPerM, rightDistance);
      return readWavePair(
        checked(multiplyComplex(multiplyComplex(line.forward, line.through), conjugate(phase))),
        checked(multiplyComplex(line.backward, phase)),
      );
    }
    const phase = propagate(line.gammaPerM, xM);
    return readWavePair(
      checked(multiplyComplex(line.forward, phase)),
      checked(multiplyComplex(multiplyComplex(line.backward, line.through), conjugate(phase))),
    );
  }
  const forward = checked(multiplyComplex(line.forward, propagate(line.gammaPerM, xM)));
  const backward = checked(multiplyComplex(line.backward, propagate(line.gammaPerM, line.lengthM - xM)));
  return readWavePair(forward, backward);
}

function isCurrentZero(line: SolvedLine, { forward, backward }: Waves) {
  // Both the port solution and the pole coordinates use the electrical length.
  const phaseAllowance = Math.min(1e-6, 4 * line.gammaPerM.im * line.lengthM * Number.EPSILON);
  return insignificant(subtractComplex(forward, backward), forward, backward, roundingTolerance + phaseAllowance);
}

function activePower(line: SolvedLine, voltage: Complex, current: Complex) {
  if (line.gammaPerM.re !== 0) return voltage.re * current.re + voltage.im * current.im;
  // In a lossless line the wave powers are constant and their interference
  // is reactive. Compare the port amplitudes before squaring near a standing wave.
  const forward = magnitude(line.forward);
  const backward = magnitude(line.backward);
  const delta = forward - backward;
  return Math.abs(delta) <= roundingTolerance * Math.max(forward, backward)
    ? 0 : delta * (forward + backward) / line.characteristicOhm.re;
}

function currentPoles(line: SolvedLine): number[] {
  const { forward, backward, gammaPerM, lengthM } = line;
  const f = magnitude(forward), b = magnitude(backward);
  if (f === 0 || b === 0) return [];
  const candidates = [0, lengthM];
  const logRatio = Math.log(f) - Math.log(b);
  const phase = Math.atan2(forward.im, forward.re) - Math.atan2(backward.im, backward.re);
  const attenuation = gammaPerM.re * lengthM;
  const electricalLength = gammaPerM.im * lengthM;
  // I(x)=0 iff F(0)/B(ℓ) = exp(γ(2x−ℓ)).
  if (attenuation > roundingTolerance) {
    const x = lengthM * (.5 + .5 * (logRatio / attenuation));
    if (0 < x && x < lengthM) candidates.push(x);
  } else if (Math.abs(logRatio) <= 2 * roundingTolerance && electricalLength > 0) {
    const from = -(electricalLength + phase) / tau, to = (electricalLength - phase) / tau;
    const first = Math.ceil(from), last = Math.floor(to);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first + 1 > maximumPoles) {
      throw Error("steady-limit");
    }
    for (let k = first; k <= last; k++) {
      const x = lengthM * (.5 + .5 * ((phase + tau * k) / electricalLength));
      if (0 < x && x < lengthM) candidates.push(x);
    }
  }
  const toleranceM = 16 * Number.EPSILON * lengthM;
  return candidates.sort((a, b) => a - b)
    .filter(x => isCurrentZero(line, readVoltage(line, x)))
    .filter((x, index, sorted) => !index || x - sorted[index - 1] > toleranceM);
}

/** Nodal KCL with a common return and two end-referenced wave amplitudes per section. */
export function solveSteadyExperiment(circuit: CircuitTopology, settings: SteadyExperimentSettings): SteadyExperimentSolution {
  const omega = tau * settings.frequencyHz;
  if (!Number.isFinite(omega) || omega <= 0) throw Error("steady-invalid-frequency");
  if (!circuit || !Array.isArray(circuit.components) || !Array.isArray(circuit.junctions) || !Array.isArray(circuit.wires)) {
    throw Error("steady-invalid-topology");
  }
  if (circuit.components.length > 100 || circuit.junctions.length > 200 || circuit.wires.length > 400) {
    throw Error("steady-limit");
  }
  const { parts, size } = physicalNodes(circuit, settings.referenceEndpoint);
  const lines = parts.filter(({ component }) => component.kind === "line");
  if (!lines.length) throw Error("steady-missing-line");
  if (lines.length > 12) throw Error("steady-limit");
  const n = size + 2 * lines.length + parts.filter(({ component }) => component.kind === "voltage").length;
  const rows = Array.from({ length: n }, () => ({ real: new Float64Array(n + 1), imaginary: new Float64Array(n + 1) }));
  function add(row: number, column: number, { re, im }: Complex) {
    if (row < 0 || column < 0) return;
    rows[row].real[column] += re;
    rows[row].imaginary[column] += im;
  }
  const waves = new Map<string, { line: Line; left: number; right: number }>();
  let nextColumn = size;
  for (const { component, a, b } of parts) {
    switch (component.kind) {
      case "line": {
        const line = lineParameters(component, settings);
        const left = nextColumn++, right = nextColumn++;
        const admittance = divide(one, line.characteristicOhm);
        const cross = negative(checked(multiplyComplex(line.through, admittance)));
        add(a, left, admittance); add(a, right, cross);
        add(b, right, admittance); add(b, left, cross);
        add(left, a, one); add(left, left, negative(one)); add(left, right, negative(line.through));
        add(right, b, one); add(right, left, negative(line.through)); add(right, right, negative(one));
        waves.set(line.id, { line, left, right });
        break;
      }
      case "voltage": {
        const r = parameter(component, "resistanceOhm", 0);
        if (r < 0) throw Error("steady-invalid-part");
        const branch = nextColumn++;
        // Branch current points from a (positive) to b. It is negative
        // when a positive ideal source delivers power to its circuit.
        if (a !== b) {
          add(a, branch, one); add(b, branch, negative(one));
          add(branch, a, one); add(branch, b, negative(one));
        }
        add(branch, branch, { re: -r, im: 0 });
        add(branch, n, sourcePhasor(component, settings));
        break;
      }
      case "current": {
        const value = sourcePhasor(component, settings);
        if (a !== b) { add(a, n, value); add(b, n, negative(value)); }
        break;
      }
      case "r":
      case "l":
      case "c": {
        const key = component.kind === "r" ? "ohm" : component.kind === "l" ? "henry" : "farad";
        const value = parameter(component, key);
        if (value < 0 || (!value && component.kind !== "r")) throw Error("steady-invalid-part");
        if (a === b) break;
        const omegaValue = component.kind === "r" ? value : omega * value;
        if (omegaValue <= 0 || !Number.isFinite(omegaValue)) throw Error("steady-numeric-range");
        const admittance = checked(component.kind === "r" ? { re: 1 / value, im: 0 }
          : { re: 0, im: component.kind === "l" ? -(1 / omegaValue) : omegaValue });
        add(a, a, admittance); add(b, b, admittance);
        add(a, b, negative(admittance)); add(b, a, negative(admittance));
        break;
      }
      default: throw Error("steady-invalid-part");
    }
  }
  const solved = solve(rows);
  const byId = new Map([...waves].map(([id, { line, left, right }]) =>
    [id, { ...line, forward: solved[left], backward: solved[right] }] as const));
  function section(id: string) {
    const line = byId.get(id);
    if (!line) throw Error("steady-missing-line");
    return line;
  }
  return {
    sections: [...byId.values()].map(({ id, lengthM, gammaPerM }) => ({ id, lengthM, gammaPerM: { ...gammaPerM } })),
    poles: id => currentPoles(section(id)),
    sample(id, xM) {
      const line = section(id);
      if (!Number.isFinite(xM) || xM < 0 || xM > line.lengthM) throw Error("steady-position-out-of-range");
      const voltage = readVoltage(line, xM);
      // Both reported currents use the coordinate direction a→b.
      const current = readWavePair(divide(voltage.forward, line.characteristicOhm),
        negative(divide(voltage.backward, line.characteristicOhm)));
      const atPole = peak(current.total) === 0 || isCurrentZero(line, voltage);
      if (atPole) current.total = { ...zero };
      const powerW = atPole ? 0 : activePower(line, voltage.total, current.total);
      if (!Number.isFinite(powerW)) throw Error("steady-numeric-range");
      return { xM, voltage, current, powerW, impedanceOhm: atPole ? null : divide(voltage.total, current.total) };
    },
  };
}
