/** Small, deterministic analytical models used by the science micro labs. */

export type ScienceId =
  | "derivative-tangent"
  | "definite-integral"
  | "complex-vector"
  | "projectile"
  | "pendulum"
  | "bernoulli"
  | "pipe-loss"
  | "standing-wave"
  | "beats"
  | "ideal-gas"
  | "snell-refraction"
  | "mass-spring";

export type ScienceCategory = "math" | "mechanics" | "fluids" | "waves" | "thermo" | "optics";
export type Point = { x: number; y: number };
export type ScienceResult = { values: Record<string, number>; points: Point[]; secondaryPoints?: Point[]; carrierPoints?: Point[]; characteristic?: Point };
export type ScienceParameter = { key: string; symbol: string; unit: string; min: number; max: number; step: number; initial: number };
export type ScienceDefinition = { id: ScienceId; category: ScienceCategory; title: { ru: string; uk: string }; description: { ru: string; uk: string }; assumptions: { ru: string; uk: string }; parameters: ScienceParameter[] };

const PI = Math.PI;
const G = 9.81;
const R_GAS = 8.314462618;
const WATER_DENSITY = 1000;

export const sample = (start: number, end: number, count: number, fn: (x: number) => number): Point[] =>
  Array.from({ length: count + 1 }, (_, index) => { const x = start + ((end - start) * index) / count; return { x, y: fn(x) }; });

export function derivative(x0 = 1): ScienceResult {
  const f = (x: number) => x * x; const slope = 2 * x0;
  return { values: { x0, value: f(x0), slope }, points: sample(-3, 3, 72, f), secondaryPoints: sample(-3, 3, 72, (x) => f(x0) + slope * (x - x0)), characteristic: { x: x0, y: f(x0) } };
}

export function integral(upper = 2): ScienceResult {
  return { values: { upper, integral: (upper ** 3) / 3 }, points: sample(0, upper, 48, (x) => x * x), characteristic: { x: upper, y: upper * upper } };
}

export function complexVector(real = 3, imaginary = 4): ScienceResult {
  return { values: { real, imaginary, magnitude: Math.hypot(real, imaginary), angle: Math.atan2(imaginary, real) * (180 / PI) }, points: [{ x: 0, y: 0 }, { x: real, y: imaginary }] };
}

export function projectile(speed = 20, angleDegrees = 45): ScienceResult {
  const angle = (angleDegrees * PI) / 180; const flightTime = (2 * speed * Math.sin(angle)) / G;
  const range = (speed * speed * Math.sin(2 * angle)) / G; const height = (speed * speed * Math.sin(angle) ** 2) / (2 * G);
  return { values: { range, height, flightTime }, points: sample(0, flightTime, 64, (time) => speed * Math.cos(angle) * time).map((point) => ({ x: point.y, y: Math.max(0, speed * Math.sin(angle) * point.x - (G * point.x * point.x) / 2) })), characteristic: { x: range / 2, y: height } };
}

export function pendulum(length = 1): ScienceResult {
  const period = 2 * PI * Math.sqrt(length / G); const angularFrequency = 2 * PI / period;
  return { values: { period, frequency: 1 / period, angularFrequency }, points: sample(0, period * 2, 80, (time) => 0.2 * Math.cos(angularFrequency * time)) };
}

export function bernoulli(flowRate = 0.001, outletDiameter = 0.02): ScienceResult {
  const inletDiameter = 0.04; const inletArea = (PI * inletDiameter ** 2) / 4; const outletArea = (PI * outletDiameter ** 2) / 4;
  const inletVelocity = flowRate / inletArea; const outletVelocity = flowRate / outletArea;
  const pressureDrop = (WATER_DENSITY * (outletVelocity ** 2 - inletVelocity ** 2)) / 2;
  return { values: { inletVelocity, outletVelocity, pressureDrop }, points: [{ x: 0, y: inletVelocity }, { x: 1, y: inletVelocity }, { x: 2, y: outletVelocity }], characteristic: { x: 2, y: outletVelocity } };
}

export function pipeLoss(length = 20, diameter = 0.05, flowRate = 0.004): ScienceResult {
  const frictionFactor = 0.02; const area = (PI * diameter ** 2) / 4; const velocity = flowRate / area;
  const headLoss = (frictionFactor * length * velocity ** 2) / (diameter * 2 * G); const pressureLoss = WATER_DENSITY * G * headLoss;
  return { values: { velocity, headLoss, pressureLoss }, points: sample(0, length, 48, (distance) => -pressureLoss * (distance / length)), characteristic: { x: length, y: -pressureLoss } };
}

export function standingWave(mode = 2, length = 1): ScienceResult {
  return { values: { mode, wavelength: (2 * length) / mode, waveNumber: (mode * PI) / length }, points: sample(0, length, 64, (x) => Math.sin((mode * PI * x) / length)) };
}

export function beats(frequency1 = 440, frequency2 = 444): ScienceResult {
  const beatFrequency = Math.abs(frequency2 - frequency1); const averageFrequency = (frequency1 + frequency2) / 2; const end = Math.max(0.05, 2 / Math.max(beatFrequency, 1));
  const carrierEnd = Math.min(end, 0.02);
  return { values: { beatFrequency, averageFrequency }, points: sample(0, end, 128, (time) => 2 * Math.cos(PI * (frequency2 - frequency1) * time)), carrierPoints: sample(0, carrierEnd, 512, (time) => Math.sin(2 * PI * frequency1 * time) + Math.sin(2 * PI * frequency2 * time)) };
}

export function idealGas(temperature = 300, volume = 1): ScienceResult {
  const pressure = (R_GAS * temperature) / volume;
  return { values: { temperature, volume, pressure }, points: sample(0.2, 3, 64, (v) => (R_GAS * temperature) / v), characteristic: { x: volume, y: pressure } };
}

export function snell(n1 = 1, n2 = 1.5, incidentAngleDegrees = 30): ScienceResult {
  const incident = (incidentAngleDegrees * PI) / 180; const sine = (n1 / n2) * Math.sin(incident); const totalInternalReflection = Math.abs(sine) > 1;
  const refractedAngle = totalInternalReflection ? Number.NaN : (Math.asin(sine) * 180) / PI;
  // In total internal reflection there is no transmitted ray: the reflected ray stays in medium 1.
  // The SVG visual maps positive model y to the upper half-plane.
  const refracted = totalInternalReflection ? { x: Math.sin(incident), y: Math.cos(incident) } : { x: Math.sin((refractedAngle * PI) / 180), y: -Math.cos((refractedAngle * PI) / 180) };
  return { values: { incidentAngle: incidentAngleDegrees, refractedAngle, totalInternalReflection: totalInternalReflection ? 1 : 0 }, points: [{ x: -Math.sin(incident), y: Math.cos(incident) }, { x: 0, y: 0 }, refracted] };
}

export function massSpring(mass = 1, stiffness = 100, amplitude = 0.1): ScienceResult {
  const angularFrequency = Math.sqrt(stiffness / mass); const period = (2 * PI) / angularFrequency;
  return { values: { angularFrequency, frequency: angularFrequency / (2 * PI), period }, points: sample(0, period * 2, 80, (time) => amplitude * Math.cos(angularFrequency * time)) };
}

export const models: Record<ScienceId, (...parameters: number[]) => ScienceResult> = { "derivative-tangent": derivative, "definite-integral": integral, "complex-vector": complexVector, projectile, pendulum, bernoulli, "pipe-loss": pipeLoss, "standing-wave": standingWave, beats, "ideal-gas": idealGas, "snell-refraction": snell, "mass-spring": massSpring };

export const scienceCatalog: ScienceDefinition[] = [
  { id: "derivative-tangent", category: "math", title: { ru: "Производная и касательная", uk: "Похідна і дотична" }, description: { ru: "Наклон касательной к f(x)=x²", uk: "Нахил дотичної до f(x)=x²" }, assumptions: { ru: "Гладкая функция f(x)=x²; x₀∈[-2;2]", uk: "Гладка функція f(x)=x²; x₀∈[-2;2]" }, parameters: [{ key: "x0", symbol: "x₀", unit: "1", min: -2, max: 2, step: 0.01, initial: 1 }] },
  { id: "definite-integral", category: "math", title: { ru: "Определённый интеграл", uk: "Визначений інтеграл" }, description: { ru: "Площадь под y=x² от 0 до a", uk: "Площа під y=x² від 0 до a" }, assumptions: { ru: "I=∫₀ᵃx²dx=a³/3; a>0; x без физической размерности", uk: "I=∫₀ᵃx²dx=a³/3; a>0; x без фізичної розмірності" }, parameters: [{ key: "upper", symbol: "a", unit: "1", min: 0.5, max: 4, step: 0.01, initial: 2 }] },
  { id: "complex-vector", category: "math", title: { ru: "Комплексный вектор", uk: "Комплексний вектор" }, description: { ru: "Модуль и аргумент z=Re+jIm", uk: "Модуль і аргумент z=Re+jIm" }, assumptions: { ru: "Оси Re и Im имеют одинаковый масштаб", uk: "Осі Re та Im мають однаковий масштаб" }, parameters: [{ key: "real", symbol: "Re", unit: "1", min: -5, max: 5, step: 0.1, initial: 3 }, { key: "imaginary", symbol: "Im", unit: "1", min: -5, max: 5, step: 0.1, initial: 4 }] },
  { id: "projectile", category: "mechanics", title: { ru: "Полёт тела", uk: "Політ тіла" }, description: { ru: "Траектория без сопротивления воздуха", uk: "Траєкторія без опору повітря" }, assumptions: { ru: "g=9,81 м/с²; сопротивлением воздуха пренебрегаем", uk: "g=9,81 м/с²; опором повітря нехтуємо" }, parameters: [{ key: "speed", symbol: "v₀", unit: "м/с", min: 5, max: 40, step: 0.1, initial: 20 }, { key: "angle", symbol: "α", unit: "°", min: 10, max: 80, step: 1, initial: 45 }] },
  { id: "pendulum", category: "mechanics", title: { ru: "Математический маятник", uk: "Математичний маятник" }, description: { ru: "Период малых колебаний", uk: "Період малих коливань" }, assumptions: { ru: "Малый угол; T=2π√(L/g); потерь нет", uk: "Малий кут; T=2π√(L/g); втрат немає" }, parameters: [{ key: "length", symbol: "L", unit: "м", min: 0.2, max: 3, step: 0.01, initial: 1 }] },
  { id: "bernoulli", category: "fluids", title: { ru: "Уравнение Бернулли", uk: "Рівняння Бернуллі" }, description: { ru: "Скорость в сужающемся канале", uk: "Швидкість у звуженому каналі" }, assumptions: { ru: "Несжимаемая идеальная жидкость; высота постоянна", uk: "Нестислива ідеальна рідина; висота стала" }, parameters: [{ key: "flowRate", symbol: "Q", unit: "м³/с", min: 0.0002, max: 0.003, step: 0.00001, initial: 0.001 }, { key: "outletDiameter", symbol: "d₂", unit: "м", min: 0.012, max: 0.04, step: 0.001, initial: 0.02 }] },
  { id: "pipe-loss", category: "fluids", title: { ru: "Потери давления в трубе", uk: "Втрати тиску в трубі" }, description: { ru: "Дарси–Вейсбах для воды", uk: "Дарсі–Вейсбах для води" }, assumptions: { ru: "ρ=1000 кг/м³; коэффициент трения f=0,02", uk: "ρ=1000 кг/м³; коефіцієнт тертя f=0,02" }, parameters: [{ key: "length", symbol: "L", unit: "м", min: 5, max: 50, step: 0.1, initial: 20 }, { key: "diameter", symbol: "D", unit: "м", min: 0.02, max: 0.1, step: 0.001, initial: 0.05 }, { key: "flowRate", symbol: "Q", unit: "м³/с", min: 0.001, max: 0.008, step: 0.0001, initial: 0.004 }] },
  { id: "standing-wave", category: "waves", title: { ru: "Стоячая акустическая волна", uk: "Стояча акустична хвиля" }, description: { ru: "Узлы и пучности для закрытой трубы", uk: "Вузли та пучності для закритої труби" }, assumptions: { ru: "Длина трубы L=1 м; узлы на границах", uk: "Довжина труби L=1 м; вузли на межах" }, parameters: [{ key: "mode", symbol: "n", unit: "1", min: 1, max: 5, step: 1, initial: 2 }] },
  { id: "beats", category: "waves", title: { ru: "Биения звука", uk: "Биття звуку" }, description: { ru: "Суперпозиция двух близких частот", uk: "Суперпозиція двох близьких частот" }, assumptions: { ru: "Две синусоиды равной амплитуды", uk: "Дві синусоїди однакової амплітуди" }, parameters: [{ key: "frequency1", symbol: "f₁", unit: "Гц", min: 200, max: 800, step: 1, initial: 440 }, { key: "frequency2", symbol: "f₂", unit: "Гц", min: 200, max: 800, step: 1, initial: 444 }] },
  { id: "ideal-gas", category: "thermo", title: { ru: "Идеальный газ p–V", uk: "Ідеальний газ p–V" }, description: { ru: "Изотерма одного моля газа", uk: "Ізотерма одного моля газу" }, assumptions: { ru: "n=1 моль; pV=nRT; температура постоянна", uk: "n=1 моль; pV=nRT; температура стала" }, parameters: [{ key: "temperature", symbol: "T", unit: "К", min: 200, max: 600, step: 1, initial: 300 }, { key: "volume", symbol: "V", unit: "м³", min: 0.2, max: 3, step: 0.01, initial: 1 }] },
  { id: "snell-refraction", category: "optics", title: { ru: "Закон Снеллиуса", uk: "Закон Снелліуса" }, description: { ru: "Преломление луча на границе сред", uk: "Заломлення променя на межі середовищ" }, assumptions: { ru: "Плоская граница; углы от нормали; n₁sinα=n₂sinβ", uk: "Плоска межа; кути від нормалі; n₁sinα=n₂sinβ" }, parameters: [{ key: "n1", symbol: "n₁", unit: "1", min: 1, max: 2, step: 0.01, initial: 1 }, { key: "n2", symbol: "n₂", unit: "1", min: 1, max: 2, step: 0.01, initial: 1.5 }, { key: "incidentAngleDegrees", symbol: "α", unit: "°", min: 5, max: 80, step: 1, initial: 30 }] },
  { id: "mass-spring", category: "mechanics", title: { ru: "Масса–пружина", uk: "Маса–пружина" }, description: { ru: "Гармонические колебания груза", uk: "Гармонічні коливання вантажу" }, assumptions: { ru: "Пружина идеальна; затухания нет; x(0)=A", uk: "Пружина ідеальна; загасання немає; x(0)=A" }, parameters: [{ key: "mass", symbol: "m", unit: "кг", min: 0.2, max: 5, step: 0.01, initial: 1 }, { key: "stiffness", symbol: "k", unit: "Н/м", min: 10, max: 300, step: 1, initial: 100 }, { key: "amplitude", symbol: "A", unit: "м", min: 0.02, max: 0.5, step: 0.01, initial: 0.1 }] },
];

export const getScienceDefinition = (id: ScienceId): ScienceDefinition => {
  const definition = scienceCatalog.find((item) => item.id === id);
  if (!definition) throw new Error(`Unknown science model: ${id}`);
  return definition;
};
