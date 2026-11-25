import { expect, test } from "vitest";
import type { Complex } from "../models/circular-diagram";
import {
  newSequenceDocument, z, type Area, type Phase, type SequenceDocument, type SequenceEdit,
  type SequenceSolution, type Triple,
} from "./contract";
import { abcTo012, sequenceToAbc, solveSequence } from "./solve";

const a = z(-.5, Math.sqrt(3) / 2);
const a2 = z(-.5, -Math.sqrt(3) / 2);
const zero = z();
const one = z(1);
const add = (x: Complex, y: Complex) => z(x.re + y.re, x.im + y.im);
const sub = (x: Complex, y: Complex) => z(x.re - y.re, x.im - y.im);
const mul = (x: Complex, y: Complex) => z(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
const scale = (x: Complex, factor: number) => z(x.re * factor, x.im * factor);
const div = (x: Complex, y: Complex) => {
  const numerator = mul(x, z(y.re, -y.im));
  return scale(numerator, 1 / (y.re * y.re + y.im * y.im));
};
const magnitude = (x: Complex) => Math.hypot(x.re, x.im);
const sum = (values: readonly Complex[]) => values.reduce(add, zero);
const triple = (f: (index: number) => Complex): Triple => [f(0), f(1), f(2)];
const map = (values: Triple, f: (value: Complex, index: number) => Complex): Triple => triple(i => f(values[i], i));
const difference = (x: Triple, y: Triple): Triple => triple(i => sub(x[i], y[i]));
const phaseEmf = (e: number): Triple => [z(e), scale(a2, e), scale(a, e)];
const allPhases = ["A", "B", "C"] as const;
type Solved = Extract<SequenceSolution, { ok: true }>;
type ScalarMatrix = Complex[][];

function close(actual: Complex, expected: Complex) {
  expect(magnitude(sub(actual, expected))).toBeLessThanOrEqual(1e-8 * Math.max(1, magnitude(expected)));
}

function closeTriple(actual: Triple, expected: Triple) {
  actual.forEach((value, i) => close(value, expected[i]));
}

function solution(document: SequenceDocument) {
  const result = solveSequence(document);
  if (!result.ok) throw Error("Unexpected sequence result: " + result.reason);
  expect(result.maxResidual).toBeLessThan(1e-7);
  return result;
}

function atEnd(result: Solved, area: Area, to: number) {
  const segment = result.readings.find(reading => reading.area === area && Math.abs(reading.to - to) < 1e-12 && reading.to - reading.from > 1e-12);
  if (!segment) throw Error("No reading at " + area + " " + to);
  return segment;
}

function atStart(result: Solved, area: Area, from: number) {
  const segment = result.readings.find(reading => reading.area === area && Math.abs(reading.from - from) < 1e-12 && reading.to - reading.from > 1e-12);
  if (!segment) throw Error("No reading after " + area + " " + from);
  return segment;
}

function shunt(id: string, at: number, phases: readonly Phase[], target: Phase | "ground", impedance: Complex): SequenceEdit {
  return { id, kind: "shunt", area: "line", at, phases, target, impedance };
}

test("Fortescue order is 0,1,2 with positive ABC rotating A→B→C", () => {
  closeTriple(sequenceToAbc([zero, one, zero]), [one, a2, a]);
  closeTriple(sequenceToAbc([zero, zero, one]), [one, a, a2]);
  closeTriple(sequenceToAbc([one, zero, zero]), [one, one, one]);
  closeTriple(abcTo012([one, a2, a]), [zero, one, zero]);
  closeTriple(abcTo012([one, a, a2]), [zero, zero, one]);
  const arbitrary: Triple = [z(1.2, -5), z(-7, .4), z(2.2, 11)];
  closeTriple(sequenceToAbc(abcTo012(arbitrary)), arbitrary);
});

test("the symmetric network contains only the analytical positive sequence at each station", () => {
  const document = newSequenceDocument();
  const positive = sum([document.sections.generator[1], document.sections.line[1], document.sections.load[1]]);
  const current = div(z(document.sourceVolts), positive);
  const line = atEnd(solution(document), "line", 1);
  closeTriple(line.current012, [zero, current, zero]);
  closeTriple(line.currentABC, [current, mul(a2, current), mul(a, current)]);
  const voltage = mul(document.sections.load[1], current);
  closeTriple(line.voltage012, [zero, voltage, zero]);
  closeTriple(line.voltageABC, [voltage, mul(a2, voltage), mul(a, voltage)]);
  expect(line.reference).toBe("ground");
});

function terminalFaultDocument(fault: SequenceEdit) {
  const base = newSequenceDocument();
  base.generatorNeutral = { mode: "grounded", impedance: z(.42, .31) };
  base.sections.line = [z(1.7, 2.4), z(.83, 1.22), z(1.03, 1.62)];
  base.edits = [fault, { id: "isolate-load", kind: "open", area: "load", at: .5, phases: allPhases }];
  return {
    document: base,
    e: z(base.sourceVolts),
    z0: sum([base.sections.generator[0], base.sections.line[0], scale(base.generatorNeutral.impedance, 3)]),
    z1: add(base.sections.generator[1], base.sections.line[1]),
    z2: add(base.sections.generator[2], base.sections.line[2]),
  };
}

test("an ideal three-phase terminal fault has the analytical positive-sequence current", () => {
  const { document, e, z1 } = terminalFaultDocument(shunt("f", 1, allPhases, "ground", zero));
  const result = solution(document), line = atEnd(result, "line", 1);
  const i1 = div(e, z1);
  closeTriple(line.current012, [zero, i1, zero]);
  closeTriple(line.voltageABC, [zero, zero, zero]);
  closeTriple(result.faultCurrents.f, [i1, mul(a2, i1), mul(a, i1)]);
});

test.each([zero, z(.71, .27)])("SLG with Zf=%j joins all three sequence circuits with 3Zf and generator neutral Z", faultZ => {
  const { document, e, z0, z1, z2 } = terminalFaultDocument(shunt("f", 1, ["A"], "ground", faultZ));
  const result = solution(document), line = atEnd(result, "line", 1);
  const i = div(e, sum([z0, z1, z2, scale(faultZ, 3)]));
  closeTriple(line.current012, [i, i, i]);
  closeTriple(line.currentABC, [scale(i, 3), zero, zero]);
  closeTriple(result.faultCurrents.f, [scale(i, 3), zero, zero]);
  close(line.voltageABC[0], mul(scale(i, 3), faultZ));
  close(result.neutralVoltages.generator, scale(mul(document.generatorNeutral.impedance, i), -3));
});

test.each([zero, z(1.22, .56)])("LL with Zf=%j uses unequal sequence impedances without zero-sequence current", faultZ => {
  const { document, e, z1, z2 } = terminalFaultDocument(shunt("f", 1, ["B"], "C", faultZ));
  const result = solution(document), line = atEnd(result, "line", 1);
  const i1 = div(e, sum([z1, z2, faultZ]));
  const phaseB = mul(sub(a2, a), i1);
  closeTriple(line.current012, [zero, i1, scale(i1, -1)]);
  closeTriple(line.currentABC, [zero, phaseB, scale(phaseB, -1)]);
  closeTriple(result.faultCurrents.f, [zero, phaseB, zero]);
  close(sub(line.voltageABC[1], line.voltageABC[2]), mul(phaseB, faultZ));
});

test.each([zero, z(.37, .16)])("LLG joins B and C at a single ground impedance Zf=%j", faultZ => {
  const { document, e, z0, z1, z2 } = terminalFaultDocument(shunt("f", 1, ["B", "C"], "ground", faultZ));
  const result = solution(document), line = atEnd(result, "line", 1);
  const groundPath = add(z0, scale(faultZ, 3));
  const parallel = div(mul(z2, groundPath), add(z2, groundPath));
  const i1 = div(e, add(z1, parallel));
  const i2 = scale(mul(i1, div(groundPath, add(z2, groundPath))), -1);
  const i0 = scale(mul(i1, div(z2, add(z2, groundPath))), -1);
  closeTriple(line.current012, [i0, i1, i2]);
  close(line.currentABC[0], zero);
  close(line.voltageABC[1], line.voltageABC[2]);
  close(line.voltageABC[1], mul(scale(i0, 3), faultZ));
  close(sum(result.faultCurrents.f), scale(i0, 3));
});

test("shorting a nonzero ideal generator terminal directly to its grounded neutral is inconsistent", () => {
  const document = newSequenceDocument();
  document.edits = [{ id: "source-short", area: "generator", at: 0, phases: ["A"], kind: "shunt", target: "ground", impedance: zero }];
  expect(solveSequence(document)).toEqual({ ok: false, reason: "inconsistent" });
});

function uncoupledDocument() {
  const document = newSequenceDocument();
  document.sections = {
    generator: [z(2, 1), z(2, 1), z(2, 1)],
    line: [z(4, 2), z(4, 2), z(4, 2)],
    load: [z(21, 7), z(21, 7), z(21, 7)],
  };
  return document;
}

test.each([[["A"]], [["A", "B"]]] as const)("opens %j using the principal phase impedances", phases => {
  const document = newSequenceDocument();
  document.generatorNeutral = { mode: "grounded", impedance: z(1, .4) };
  document.loadNeutral = { mode: "grounded", impedance: z(.3, .25) };
  document.edits = [{ id: "cut", area: "line", at: .5, phases, kind: "open" }];
  const result = solution(document), incoming = atEnd(result, "line", .5), outgoing = atStart(result, "line", .5);
  const impedance = triple(i => sum([document.sections.generator[i], document.sections.line[i], document.sections.load[i]]));
  const total: Triple = [add(impedance[0], scale(add(document.generatorNeutral.impedance, document.loadNeutral.impedance), 3)),
    impedance[1], impedance[2]];
  const [diagonal, clockwise, counterclockwise] = phaseMatrix(total)[0];
  const emf = phaseEmf(document.sourceVolts);
  const determinant = sub(mul(diagonal, diagonal), mul(clockwise, counterclockwise));
  const expected: Triple = phases.length === 1
    ? [zero, div(sub(mul(diagonal, emf[1]), mul(clockwise, emf[2])), determinant),
      div(sub(mul(diagonal, emf[2]), mul(counterclockwise, emf[1])), determinant)]
    : [zero, zero, div(emf[2], diagonal)];

  closeTriple(incoming.currentABC, expected);
  closeTriple(outgoing.currentABC, expected);
  const upstreamImpedance = triple(i => add(document.sections.generator[i], scale(document.sections.line[i], .5)));
  const before = difference(map(emf, e => add(e, result.neutralVoltages.generator)),
    multiplyABC(phaseMatrix(upstreamImpedance), expected));
  closeTriple(incoming.voltageABC, before);
  const downstream = multiplyABC(phaseMatrix(document.sections.load), expected);
  closeTriple(atEnd(result, "line", 1).voltageABC, map(downstream, voltage => add(voltage, result.neutralVoltages.load)));
});

test("finite series impedance in A produces the analytical per-phase current and voltage drop", () => {
  const document = uncoupledDocument();
  const extra = z(4.9, -1.3);
  document.edits = [{ id: "series", area: "line", at: .25, phases: ["A"], kind: "series", impedance: extra }];
  const result = solution(document);
  const series = sum([document.sections.generator[1], document.sections.line[1], document.sections.load[1]]);
  const current = map(phaseEmf(document.sourceVolts), (voltage, i) => div(voltage, i === 0 ? add(series, extra) : series));
  closeTriple(atEnd(result, "line", .25).currentABC, current);
  closeTriple(atStart(result, "line", .25).currentABC, current);
  closeTriple(atEnd(result, "line", 1).voltageABC, map(current, i => mul(document.sections.load[1], i)));
});

test("finite shunt admittance changes currents on either side of the selected location", () => {
  const document = uncoupledDocument();
  const x = .4, fault = z(8.5, 1.2);
  const { generator, line, load } = document.sections;
  document.edits = [shunt("f", x, ["A"], "ground", fault)];
  const result = solution(document);
  const upstream = add(generator[1], scale(line[1], x));
  const downstream = add(scale(line[1], 1 - x), load[1]);
  const equivalent = div(mul(downstream, fault), add(downstream, fault));
  const before = div(z(document.sourceVolts), add(upstream, equivalent));
  const node = mul(before, equivalent);
  const after = div(node, downstream), faultCurrent = div(node, fault);
  close(atEnd(result, "line", x).voltageABC[0], node);
  close(atEnd(result, "line", x).currentABC[0], before);
  close(atStart(result, "line", x).currentABC[0], after);
  closeTriple(result.faultCurrents.f, [faultCurrent, zero, zero]);
  close(sub(before, after), faultCurrent);
});

test.each(["grounded", "isolated"] as const)("neutral %s obeys the independent star-point KCL", mode => {
  const document = uncoupledDocument();
  document.generatorNeutral = { mode: "grounded", impedance: z(.73, .2) };
  document.loadNeutral = { mode, impedance: z(.29, .17) };
  const extra = z(13, 6);
  document.edits = [{ id: "load-a", area: "load", at: .3, phases: ["A"], kind: "series", impedance: extra }];
  const result = solution(document);
  const series = sum([document.sections.generator[1], document.sections.line[1], document.sections.load[1]]);
  const admittance = triple(i => div(one, i === 0 ? add(series, extra) : series));
  const emf = phaseEmf(document.sourceVolts);
  const ground = mode === "grounded" ? div(one, add(document.generatorNeutral.impedance, document.loadNeutral.impedance)) : zero;
  const shift = div(sum(map(emf, (e, i) => mul(e, admittance[i]))), add(sum(admittance), ground));
  const expected = map(emf, (e, i) => mul(sub(e, shift), admittance[i]));
  const line = atEnd(result, "line", 1);
  closeTriple(line.currentABC, expected);
  close(sub(result.neutralVoltages.load, result.neutralVoltages.generator), shift);
  if (mode === "grounded") {
    close(result.neutralVoltages.load, mul(document.loadNeutral.impedance, sum(expected)));
    close(result.neutralVoltages.generator, scale(mul(document.generatorNeutral.impedance, sum(expected)), -1));
  } else {
    close(line.current012[0], zero);
    expect(line.zeroPath).toBe(false);
  }
});

test("two isolated neutrals use a floating reference and do not create a zero-sequence path", () => {
  const document = newSequenceDocument();
  document.generatorNeutral = { mode: "isolated", impedance: z(1, .4) };
  document.loadNeutral = { mode: "isolated", impedance: z(4, .3) };
  const expected = div(z(document.sourceVolts), sum([
    document.sections.generator[1], document.sections.line[1], document.sections.load[1],
  ]));
  const result = solution(document);
  expect(result.gaugeFixed).toBe(true);
  for (const reading of result.readings) {
    expect(reading.reference).toBe("floating-reference");
    expect(reading.zeroPath).toBe(false);
    closeTriple(reading.current012, [zero, expected, zero]);
  }
});

test("an isolated generator and open load cannot feed a single ideal ground fault", () => {
  const { document } = terminalFaultDocument(shunt("f", 1, ["A"], "ground", zero));
  document.generatorNeutral = { mode: "isolated", impedance: z(1, .4) };
  const result = solution(document);
  closeTriple(result.faultCurrents.f, [zero, zero, zero]);
  const line = atEnd(result, "line", 1);
  expect(line.zeroPath).toBe(false);
  closeTriple(line.currentABC, [zero, zero, zero]);
  close(line.voltageABC[0], zero);
});

function phaseMatrix(diagonal012: Triple): ScalarMatrix {
  const [zeroZ, positiveZ, negativeZ] = diagonal012;
  const row = [
    scale(sum(diagonal012), 1 / 3),
    scale(sum([zeroZ, mul(a, positiveZ), mul(a2, negativeZ)]), 1 / 3),
    scale(sum([zeroZ, mul(a2, positiveZ), mul(a, negativeZ)]), 1 / 3),
  ];
  return [0, 1, 2].map(i => [0, 1, 2].map(j => row[(j - i + 3) % 3]));
}

function solvePhaseMatrix(matrix: ScalarMatrix, rhs: readonly Complex[]) {
  const count = matrix.length;
  const work = matrix.map((row, index) => [...row, rhs[index]]);
  for (let i = 0; i < count; i++) {
    let best = i;
    for (let k = i + 1; k < count; k++) if (magnitude(work[k][i]) > magnitude(work[best][i])) best = k;
    if (magnitude(work[best][i]) < 1e-13) throw Error("Test phase oracle encountered a singular network");
    [work[i], work[best]] = [work[best], work[i]];
    const pivot = work[i][i];
    for (let col = i; col <= count; col++) work[i][col] = div(work[i][col], pivot);
    for (let row = 0; row < count; row++) {
      if (row === i) continue;
      const factor = work[row][i];
      for (let col = i; col <= count; col++) work[row][col] = sub(work[row][col], mul(factor, work[i][col]));
    }
  }
  return work.map(row => row[count]);
}

function multiplyABC(matrix: ScalarMatrix, values: Triple): Triple {
  return triple(i => sum(matrix[i].map((coefficient, j) => mul(coefficient, values[j]))));
}

function withSeriesPhase(diagonal012: Triple, length = 1, extraPhase = 0, extra = zero) {
  const phase = phaseMatrix(map(diagonal012, impedance => scale(impedance, length)));
  phase[extraPhase][extraPhase] = add(phase[extraPhase][extraPhase], extra);
  return phase;
}

function phaseOracle(document: SequenceDocument, seriesA: Complex, earth: Complex, bridge: Complex, seriesLoadC: Complex) {
  // Four explicit three-phase buses and two scalar neutrals. The ideal EMFs
  // enter as fixed offsets at the generator supernode. Unlike the production
  // solver, all unknowns and component stamps here stay in phase coordinates.
  const count = 14, neutralGen = 12, neutralLoad = 13, ground = -1;
  const graph = Array.from({ length: count }, () => Array<Complex>(count).fill(zero));
  const rhs = Array<Complex>(count).fill(zero);
  type Node = { id: number; offset: Complex };
  const emf = phaseEmf(document.sourceVolts);
  const source = emf.map(offset => ({ id: neutralGen, offset }));
  const bus = (position: number): Node[] => [0, 1, 2].map(i => ({ id: 3 * position + i, offset: zero }));
  const loadNeutral = [0, 1, 2].map(() => ({ id: neutralLoad, offset: zero }));

  function inject(row: number, node: Node, admittance: Complex) {
    if (row === ground) return;
    if (node.id !== ground) graph[row][node.id] = add(graph[row][node.id], admittance);
    rhs[row] = sub(rhs[row], mul(admittance, node.offset));
  }

  function stamp(aNodes: readonly Node[], bNodes: readonly Node[], admittance: ScalarMatrix) {
    for (let i = 0; i < aNodes.length; i++) for (let j = 0; j < aNodes.length; j++) {
      const y = admittance[i][j], negative = scale(y, -1);
      inject(aNodes[i].id, aNodes[j], y);
      inject(aNodes[i].id, bNodes[j], negative);
      inject(bNodes[i].id, aNodes[j], negative);
      inject(bNodes[i].id, bNodes[j], y);
    }
  }

  const branches = [
    { left: source, right: bus(0), impedance: withSeriesPhase(document.sections.generator) },
    { left: bus(0), right: bus(1), impedance: withSeriesPhase(document.sections.line, .25, 0, seriesA) },
    { left: bus(1), right: bus(2), impedance: withSeriesPhase(document.sections.line, .4) },
    { left: bus(2), right: bus(3), impedance: withSeriesPhase(document.sections.line, .35) },
    { left: bus(3), right: loadNeutral, impedance: withSeriesPhase(document.sections.load, 1, 2, seriesLoadC) },
  ].map(branch => {
    const columns = [0, 1, 2].map(i => solvePhaseMatrix(branch.impedance, triple(j => i === j ? one : zero)));
    const y = [0, 1, 2].map(i => [0, 1, 2].map(j => columns[j][i]));
    stamp(branch.left, branch.right, y);
    return { ...branch, y };
  });
  const connect = (from: number, to: number, impedance: Complex) =>
    stamp([{ id: from, offset: zero }], [{ id: to, offset: zero }], [[div(one, impedance)]]);
  connect(neutralGen, ground, document.generatorNeutral.impedance);
  connect(neutralLoad, ground, document.loadNeutral.impedance);
  connect(bus(2)[0].id, ground, earth);
  connect(bus(3)[1].id, bus(3)[2].id, bridge);

  const values = solvePhaseMatrix(graph, rhs);
  const v = (nodes: readonly Node[]) => triple(i => add(values[nodes[i].id], nodes[i].offset));
  return {
    voltages: [0, 1, 2, 3].map(index => v(bus(index))),
    currents: branches.map(({ left, right, y }) => multiplyABC(y, difference(v(left), v(right)))),
    generatorNeutral: values[neutralGen], loadNeutral: values[neutralLoad],
  };
}

test("coupled sequence solution agrees with independent ABC nodal stamps at multiple locations", () => {
  const document = newSequenceDocument();
  const seriesA = z(3.1, -1.4), earth = z(4.2, .3), bridge = z(6, 1.4), seriesLoadC = z(11, 3.2);
  document.sections.line = [z(1.5, 2), z(.8, 1.1), z(1.14, 1.67)];
  document.generatorNeutral = { mode: "grounded", impedance: z(.7, .45) };
  document.loadNeutral = { mode: "grounded", impedance: z(.35, .15) };
  document.edits = [
    { id: "series-a", kind: "series", area: "line", at: .25, phases: ["A"], impedance: seriesA },
    shunt("earth-a", .65, ["A"], "ground", earth),
    shunt("bridge-b-c", 1, ["B"], "C", bridge),
    { id: "series-load-c", kind: "series", area: "load", at: .5, phases: ["C"], impedance: seriesLoadC },
  ];
  const oracle = phaseOracle(document, seriesA, earth, bridge, seriesLoadC);
  const result = solution(document), gen = atEnd(result, "generator", 1);
  const first = atEnd(result, "line", .25), beforeFault = atEnd(result, "line", .65);
  const end = atEnd(result, "line", 1), load = atEnd(result, "load", 1);
  closeTriple(gen.voltageABC, oracle.voltages[0]);
  closeTriple(beforeFault.voltageABC, oracle.voltages[2]);
  closeTriple(end.voltageABC, oracle.voltages[3]);
  closeTriple(load.voltageABC, [oracle.loadNeutral, oracle.loadNeutral, oracle.loadNeutral]);
  [gen, first, beforeFault, end, load].forEach((reading, index) => closeTriple(reading.currentABC, oracle.currents[index]));
  close(result.neutralVoltages.generator, oracle.generatorNeutral);
  close(result.neutralVoltages.load, oracle.loadNeutral);

  const earthA = result.faultCurrents["earth-a"][0], bridgeB = result.faultCurrents["bridge-b-c"][1];
  close(earthA, div(beforeFault.voltageABC[0], earth));
  close(bridgeB, div(sub(end.voltageABC[1], end.voltageABC[2]), bridge));
  closeTriple(difference(beforeFault.currentABC, end.currentABC), [earthA, zero, zero]);
  closeTriple(difference(end.currentABC, load.currentABC), [zero, bridgeB, scale(bridgeB, -1)]);
  close(sum(gen.currentABC), scale(div(result.neutralVoltages.generator, document.generatorNeutral.impedance), -1));
  close(sum(load.currentABC), div(result.neutralVoltages.load, document.loadNeutral.impedance));
  closeTriple(difference(beforeFault.voltageABC, end.voltageABC),
    multiplyABC(withSeriesPhase(document.sections.line, .35), end.currentABC));
});
