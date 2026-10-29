/** Ideal lossless line; matched source absorbs the returning step. SI inputs. */
export function lineStep(x: number, t: number, load = 100, z0 = 50) {
  const length = 100_000, velocity = 200_000_000, amplitude = 50;
  const gamma = (load - z0) / (load + z0);
  const incident = t >= x / velocity ? amplitude : 0;
  const reflected = t >= (2 * length - x) / velocity ? amplitude * gamma : 0;
  return { u: incident + reflected, i: (incident - reflected) / z0, incident, reflected, gamma, td: length / velocity };
}
