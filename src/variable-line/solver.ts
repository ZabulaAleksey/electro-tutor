import { VariableLineError, type PreparedVariableLine, type VariableLineResult } from "./contracts";

const residualLimit = 1e-10;

// Only analytical tests supply nonzero initial fields and distributed sources.
type ReferenceProblem = {
  initial: (x: number, isVoltage: boolean) => number;
  source: (x: number, time: number, isVoltage: boolean) => number;
};

export function createVariableLineRun(prepared: PreparedVariableLine, reference?: ReferenceProblem) {
  const { input, transitSeconds, steps, dt, frameStride, frameCount, sample, sourceVoltage } = prepared;
  const { cells, characteristicOhms: impedance, lengthMetres } = input;
  const nodeCount = 2 * cells + 1;
  const last = nodeCount - 1;
  const h = 1 / cells;
  const halfStep = dt / 2;
  const leftG = impedance / input.sourceOhms;
  const rightG = impedance / input.loadOhms;
  const energyScale = transitSeconds / impedance;
  const voltageMetres = Float64Array.from({ length: cells + 1 }, (_, index) => index / cells * lengthMetres);
  const currentMetres = Float64Array.from({ length: cells + 2 }, (_, index) => {
    if (index === 0) return 0;
    if (index === cells + 1) return lengthMetres;
    return (index - 0.5) / cells * lengthMetres;
  });
  const timeSeconds = new Float64Array(frameCount);
  const voltage = new Float64Array(frameCount * voltageMetres.length);
  const current = new Float64Array(frameCount * currentMetres.length);
  const energy: VariableLineResult["energy"] = {
    stored: new Float64Array(frameCount), inputWork: new Float64Array(frameCount), outputWork: new Float64Array(frameCount),
    lossWork: new Float64Array(frameCount), modulationWork: new Float64Array(frameCount), residual: new Float64Array(frameCount),
    maxStepResidual: 0, maxLinearResidual: 0,
  };
  const result = { cells, steps, transitSeconds, dtSeconds: dt * transitSeconds, timeSeconds, voltageMetres, currentMetres, voltage, current, energy };

  const locations = Float64Array.from({ length: nodeCount }, (_, index) => index / last);
  const weights = new Float64Array(nodeCount).fill(h);
  weights[0] = weights[last] = h / 2;
  let field = new Float64Array(nodeCount);
  let nextField = new Float64Array(nodeCount);
  let mass = new Float64Array(nodeCount);
  let nextMass = new Float64Array(nodeCount);
  const loss = new Float64Array(nodeCount);
  const force = new Float64Array(nodeCount);
  const diag = new Float64Array(nodeCount);
  const rhs = new Float64Array(nodeCount);
  const pivot = new Float64Array(nodeCount);
  const stationary = input.profile.kind !== "independent" && input.profile.kind !== "coax" && !reference;

  let stored = 0;
  for (let index = 0; index < nodeCount; index++) {
    const isVoltage = index % 2 === 0;
    const x = locations[index];
    const coefficients = sample(x, 0);
    mass[index] = isVoltage ? coefficients.c : coefficients.l;
    loss[index] = isVoltage ? coefficients.g : coefficients.r;
    field[index] = reference?.initial(x, isVoltage) ?? 0;
    if (!Number.isFinite(mass[index]) || mass[index] <= 0 || !Number.isFinite(field[index])) {
      throw new VariableLineError("numerical-failure");
    }
    stored += 0.5 * weights[index] * mass[index] * field[index] ** 2;
  }
  const initialEnergy = stored;
  let inputWork = 0;
  let outputWork = 0;
  let lossWork = 0;
  let modulationWork = 0;
  let sourceWork = 0;
  let completed = 0;
  let frame = 0;

  function snapshot(time: number) {
    const offsetV = frame * voltageMetres.length;
    const offsetI = frame * currentMetres.length;
    timeSeconds[frame] = time * transitSeconds;
    for (let index = 0; index <= cells; index++) voltage[offsetV + index] = field[2 * index];
    for (let index = 0; index < cells; index++) current[offsetI + index + 1] = field[2 * index + 1] / impedance;
    current[offsetI] = (sourceVoltage(time) - field[0]) / input.sourceOhms;
    current[offsetI + cells + 1] = field[last] / input.loadOhms;
    energy.stored[frame] = stored * energyScale;
    energy.inputWork[frame] = inputWork * energyScale;
    energy.outputWork[frame] = outputWork * energyScale;
    energy.lossWork[frame] = lossWork * energyScale;
    energy.modulationWork[frame] = modulationWork * energyScale;
    energy.residual[frame] = (stored - initialEnergy - inputWork + outputWork + lossWork - modulationWork - sourceWork) * energyScale;
    frame++;
  }

  function step() {
    const nextTime = (completed + 1) * dt;
    const midTime = (completed + 0.5) * dt;
    const source = sourceVoltage(midTime);
    let matrixNorm = 0;
    let rhsNorm = 0;
    for (let index = 0; index < nodeCount; index++) {
      const width = weights[index];
      const x = locations[index];
      const isVoltage = index % 2 === 0;
      if (!stationary) {
        const endpoint = sample(x, nextTime);
        const midway = sample(x, midTime);
        nextMass[index] = isVoltage ? endpoint.c : endpoint.l;
        loss[index] = isVoltage ? midway.g : midway.r;
      } else {
        nextMass[index] = mass[index];
      }
      const oldMass = mass[index];
      const newMass = nextMass[index];
      if (!Number.isFinite(newMass) || newMass <= 0 || !Number.isFinite(loss[index]) || loss[index] < 0
        || Math.abs(newMass - oldMass) > 0.1 * Math.min(oldMass, newMass)) {
        throw new VariableLineError("numerical-failure");
      }

      // Integrated over the cell, the spatial coupling has entries +1 and -1.
      // The passive Robin boundaries add conductance to the end diagonal entries.
      const damping = width * loss[index] + (index === 0 ? leftG : index === last ? rightG : 0);
      const distributed = reference?.source(x, midTime, isVoltage) ?? 0;
      force[index] = width * distributed;
      const drive = force[index] + (index === 0 ? leftG * source : 0);
      const oldFlux = (field[index - 1] ?? 0) - (field[index + 1] ?? 0);
      diag[index] = width * newMass + halfStep * damping;
      rhs[index] = (width * oldMass - halfStep * damping) * field[index] + halfStep * oldFlux + dt * drive;
      matrixNorm = Math.max(matrixNorm, diag[index] + halfStep * (index === 0 || index === last ? 1 : 2));
      rhsNorm = Math.max(rhsNorm, Math.abs(rhs[index]));

      // Thomas forward elimination. Opposite signs on the off-diagonals make
      // the correction to the positive pivot nonnegative.
      const factor = index === 0 ? 0 : halfStep / pivot[index - 1];
      pivot[index] = diag[index] + halfStep * factor;
      if (!Number.isFinite(pivot[index]) || pivot[index] <= 0) throw new VariableLineError("numerical-failure");
      nextField[index] = rhs[index] + factor * (nextField[index - 1] ?? 0);
    }
    for (let index = last; index >= 0; index--) {
      nextField[index] = (nextField[index] - halfStep * (nextField[index + 1] ?? 0)) / pivot[index];
    }

    let nextStored = 0;
    let dissipated = 0;
    let modulated = 0;
    let forced = 0;
    let residual = 0;
    let fieldNorm = 0;
    for (let index = 0; index < nodeCount; index++) {
      const oldValue = field[index];
      const newValue = nextField[index];
      const average = (oldValue + newValue) / 2;
      const width = weights[index];
      const coupled = (nextField[index + 1] ?? 0) - (nextField[index - 1] ?? 0);
      residual = Math.max(residual, Math.abs(diag[index] * newValue + halfStep * coupled - rhs[index]));
      fieldNorm = Math.max(fieldNorm, Math.abs(newValue));
      nextStored += 0.5 * width * nextMass[index] * newValue ** 2;
      dissipated += dt * width * loss[index] * average ** 2;
      modulated -= 0.5 * width * (nextMass[index] - mass[index]) * oldValue * newValue;
      forced += dt * force[index] * average;
    }
    const relativeLinear = residual / (matrixNorm * fieldNorm + rhsNorm || 1);
    if (!Number.isFinite(relativeLinear) || relativeLinear > residualLimit) throw new VariableLineError("numerical-failure");
    const leftVoltage = (field[0] + nextField[0]) / 2;
    const rightVoltage = (field[last] + nextField[last]) / 2;
    const supplied = dt * leftVoltage * (source - leftVoltage) * leftG;
    const delivered = dt * rightVoltage ** 2 * rightG;
    // The positive reference energy is 1 in normalized units. The exchange
    // term uses the cross-product identity for Δ(M*y²/2), including ΔM.
    const energyDefect = nextStored - stored - supplied + delivered + dissipated - modulated - forced;
    const energyDenominator = Math.max(1, nextStored + stored,
      Math.abs(supplied) + delivered + dissipated + Math.abs(modulated) + Math.abs(forced));
    const relativeEnergy = Math.abs(energyDefect) / energyDenominator;
    if (!Number.isFinite(relativeEnergy) || relativeEnergy > residualLimit) throw new VariableLineError("energy-balance");
    energy.maxLinearResidual = Math.max(energy.maxLinearResidual, relativeLinear);
    energy.maxStepResidual = Math.max(energy.maxStepResidual, relativeEnergy);
    stored = nextStored;
    inputWork += supplied;
    outputWork += delivered;
    lossWork += dissipated;
    modulationWork += modulated;
    sourceWork += forced;
    [field, nextField] = [nextField, field];
    [mass, nextMass] = [nextMass, mass];
    completed++;
    if (completed % frameStride === 0 || completed === steps) snapshot(nextTime);
  }

  snapshot(0);
  return {
    get completed() { return completed; },
    result,
    advance(maxSteps: number) {
      const end = Math.min(steps, completed + maxSteps);
      while (completed < end) step();
      return completed === steps;
    },
  };
}
