export type Complex = {
  re: number;
  im: number;
};

export type PlotPoint = {
  x: number;
  y: number;
};

export type CircularDiagramParameters = {
  i0Magnitude: number;
  i0Angle: number;
  ikMagnitude: number;
  ikAngle: number;
  outputImpedanceMagnitude: number;
  outputImpedanceAngle: number;
  loadAngle: number;
  position: number;
};

export type CircularDiagramModel = {
  i0: Complex;
  ik: Complex;
  current: Complex | null;
  resistance: number;
  extent: number;
  scale: number;
  xy: (point: Complex) => PlotPoint;
  path: string;
};

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const SINGULARITY_RELATIVE_THRESHOLD = 1e-9;
const PLOT_CENTER = { x: 360, y: 260 };
const PLOT_SIZE = { width: 612, height: 412 };

function multiplyWithFiniteCap(value: number, multiplier: number): number {
  return value > Number.MAX_VALUE / multiplier
    ? Number.MAX_VALUE
    : value * multiplier;
}

export function complexFromPolar(magnitude: number, angleDegrees: number): Complex {
  const angleRadians = angleDegrees * DEGREES_TO_RADIANS;
  return {
    re: magnitude * Math.cos(angleRadians),
    im: magnitude * Math.sin(angleRadians),
  };
}

export function addComplex(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function subtractComplex(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function multiplyComplex(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function divideComplex(a: Complex, b: Complex): Complex {
  const denominator = b.re ** 2 + b.im ** 2;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

export function complexMagnitude(value: Complex): number {
  return Math.hypot(value.re, value.im);
}

export function complexArgumentDegrees(value: Complex): number {
  return Math.atan2(value.im, value.re) * RADIANS_TO_DEGREES;
}

export function resistanceFromPosition(position: number, impedanceMagnitude: number): number {
  if (position >= 100) return Infinity;
  return impedanceMagnitude * 10 ** (-3 + position / 100 * 6);
}

export function currentAtResistance(
  i0: Complex,
  ik: Complex,
  outputImpedance: Complex,
  loadAngle: number,
  resistance: number,
): Complex | null {
  if (!Number.isFinite(resistance)) return i0;

  const denominator = addComplex(
    outputImpedance,
    complexFromPolar(resistance, loadAngle),
  );
  const singularityThreshold = Math.max(1, complexMagnitude(outputImpedance))
    * SINGULARITY_RELATIVE_THRESHOLD;

  if (complexMagnitude(denominator) < singularityThreshold) return null;

  return addComplex(
    i0,
    multiplyComplex(
      subtractComplex(ik, i0),
      divideComplex(outputImpedance, denominator),
    ),
  );
}

export function buildCircularDiagramModel(
  parameters: CircularDiagramParameters,
): CircularDiagramModel {
  const {
    i0Magnitude,
    i0Angle,
    ikMagnitude,
    ikAngle,
    outputImpedanceMagnitude,
    outputImpedanceAngle,
    loadAngle,
    position,
  } = parameters;
  const i0 = complexFromPolar(i0Magnitude, i0Angle);
  const ik = complexFromPolar(ikMagnitude, ikAngle);
  const outputImpedance = complexFromPolar(
    outputImpedanceMagnitude,
    outputImpedanceAngle,
  );
  const at = (resistance: number) => currentAtResistance(
    i0,
    ik,
    outputImpedance,
    loadAngle,
    resistance,
  );
  const points: Array<Complex | null> = [at(0)];

  for (let index = 0; index <= 180; index += 1) {
    points.push(at(outputImpedanceMagnitude * 10 ** (-3 + index / 30)));
  }
  points.push(i0);

  const resistance = resistanceFromPosition(position, outputImpedanceMagnitude);
  const current = at(resistance);
  const plotLimit = multiplyWithFiniteCap(
    Math.max(1, complexMagnitude(i0), complexMagnitude(ik)),
    12,
  );
  const visiblePoints = points.filter(
    (point): point is Complex => point !== null && complexMagnitude(point) <= plotLimit,
  );
  const extent = multiplyWithFiniteCap(
    Math.max(
      1,
      ...visiblePoints.flatMap((point) => [Math.abs(point.re), Math.abs(point.im)]),
      complexMagnitude(ik),
    ),
    1.18,
  );
  const scale = Math.min(PLOT_SIZE.width, PLOT_SIZE.height) / 2 / extent;
  const xy = (point: Complex): PlotPoint => ({
    x: PLOT_CENTER.x + point.re * scale,
    y: PLOT_CENTER.y - point.im * scale,
  });
  let drawing = false;
  const path = points.map((point) => {
    if (point === null || complexMagnitude(point) > plotLimit) {
      drawing = false;
      return "";
    }

    const plotPoint = xy(point);
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${plotPoint.x.toFixed(2)},${plotPoint.y.toFixed(2)}`;
  }).join(" ");

  return { i0, ik, current, resistance, extent, scale, xy, path };
}
