const scalingFilters = {
  haar: [Math.SQRT1_2, Math.SQRT1_2],
  // Reconstruction low-pass coefficients from the PyWavelets 1.8.0 table.
  // https://github.com/PyWavelets/pywt/blob/v1.8.0/pywt/_extensions/c/wavelets_coeffs.template.h
  daubechies: [0.4829629131445341, 0.8365163037378079, 0.2241438680420134, -0.1294095225512604], // db2
  symlets: [0.0322231006040427, -0.012603967262037833, -0.09921954357684722, 0.29785779560527736,
    0.8037387518059161, 0.49761866763201545, -0.02963552764599851, -0.07576571478927333], // sym4
  // PyWavelets multiplies the coiflet table by sqrt(2) when constructing rec_lo.
  coiflets: [-0.07273261951252646, 0.3378976624574818, 0.8525720202116004, 0.3848648468648578,
    -0.07273261951252646, -0.01565572813579199], // coif1
};

type WaveletId = keyof typeof scalingFilters;

export function periodicWavelet(basis: WaveletId, size: number, level: number) {
  const low = scalingFilters[basis];
  const high = low.map((_, tap) => (tap % 2 ? -1 : 1) * low[low.length - 1 - tap]);
  const coarseSize = size / 2 ** level;
  const labels = Array.from({ length: coarseSize }, (_, index) => `A${level}:${index}`);
  for (let depth = level; depth >= 1; depth--) {
    const bandSize = size / 2 ** depth;
    for (let index = 0; index < bandSize; index++) labels.push(`D${depth}:${index}`);
  }

  function project(values: number[]) {
    const coefficients = values.slice();
    for (let width = size; width > coarseSize; width /= 2) {
      const half = width / 2;
      const next = Array<number>(width).fill(0);
      for (let index = 0; index < half; index++) {
        for (let tap = 0; tap < low.length; tap++) {
          // Center of the discrete convention is fixed at the even sample 2j.
          const value = coefficients[(2 * index + tap) % width];
          next[index] += low[tap] * value;
          next[half + index] += high[tap] * value;
        }
      }
      for (let index = 0; index < width; index++) coefficients[index] = next[index];
    }
    return coefficients;
  }

  function synthesize(coefficients: number[]) {
    const values = coefficients.slice();
    for (let width = 2 * coarseSize; width <= size; width *= 2) {
      const half = width / 2;
      const next = Array<number>(width).fill(0);
      for (let index = 0; index < half; index++) {
        for (let tap = 0; tap < low.length; tap++) {
          const sample = (2 * index + tap) % width;
          next[sample] += low[tap] * values[index] + high[tap] * values[half + index];
        }
      }
      for (let index = 0; index < width; index++) values[index] = next[index];
    }
    return values;
  }

  return { labels, project, synthesize };
}
