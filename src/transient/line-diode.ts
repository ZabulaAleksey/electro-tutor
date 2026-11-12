/** Memoryless Shockley diode at a fixed junction temperature. SI units. */
export type DiodeParameters = { saturationA: number; ideality: number; reversed: boolean };
export const DEFAULT_DIODE: DiodeParameters = { saturationA: 1e-12, ideality: 1.5, reversed: false };
const thermalVoltage = 0.025852; // kT/q at 300 K

export function diodeCurrent(voltage: number, parameters: DiodeParameters): number {
  const x = voltage / (thermalVoltage * parameters.ideality);
  if (x < 50) return parameters.saturationA * Math.expm1(x);
  return Math.exp(Math.log(parameters.saturationA) + x);
}

/** Vd + Rth·Id(Vd) = Vth in anode-to-cathode coordinates.
 * The residual is strictly increasing and its zero lies between 0 and Vth. */
export function diodeVoltage(theveninV: number, resistance: number, parameters: DiodeParameters): number {
  let low = Math.min(0, theveninV), high = Math.max(0, theveninV);
  for (let index = 0; index < 80; index++) {
    const midpoint = low + (high - low) / 2;
    if (midpoint === low || midpoint === high) break;
    const residual = midpoint + resistance * diodeCurrent(midpoint, parameters) - theveninV;
    if (residual > 0) high = midpoint;
    else low = midpoint;
  }
  return low + (high - low) / 2;
}
