import type { EngineeringPlotData, PlotPoint } from "../engineering/plot";
import { calculateStar, PHASES } from "../models/star-neutral";
import type { Language } from "../types";
import { ac, dc, diode, line, rc } from "./physics";

type Text = Record<Language, string>;
type Metric = { id: string; label: string; value: number; unit: string };
type Example = {
  id: "dc" | "ac" | "three-phase" | "transients" | "nonlinear" | "magnetic" | "unbalanced" | "long-line";
  title: Text;
  assumptions: Text;
  formulas: readonly string[];
  metrics: readonly Metric[];
  plot: EngineeringPlotData;
  route?: string;
  stem?: boolean;
  operatingPoint?: PlotPoint;
};

const metric = (id: string, label: string, value: number, unit = ""): Metric => ({ id, label, value, unit });
function samples(max: number, valueAt: (position: number) => number, count = 80): PlotPoint[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const position = max * index / count;
    return [position, valueAt(position)];
  });
}

export const dcExampleInput = { voltage: 24, firstResistance: 4, secondResistance: 8 };
const direct = dc(dcExampleInput.voltage, dcExampleInput.firstResistance, dcExampleInput.secondResistance);
const alternate = ac(100 / (2 * Math.PI), 30, 60, 0.5, 0.0005);
const acPeriodMs = 2000 * Math.PI / alternate.omega;
const charge = rc(0);
const diodePoint = diode();
const magneticCore = { turns: 200, current: 0.25, length: 0.4, relativePermeability: 1000 };
const magneticField = magneticCore.turns * magneticCore.current / magneticCore.length;
const permeability = 4 * Math.PI * 1e-7 * magneticCore.relativePermeability;
const transmission = line();
const delayMs = 1000 * transmission.td;

function resistiveStar(uPhase: number, resistanceA: number, resistanceB: number, resistanceC: number, mode: "ideal" | "open" = "ideal") {
  const result = calculateStar({
    uPhase, mode, neutral: { re: 0, im: 0 },
    phases: {
      A: { re: resistanceA, im: 0 },
      B: { re: resistanceB, im: 0 },
      C: { re: resistanceC, im: 0 },
    },
  });
  if (!result.ok) throw new Error("Invalid home star demonstration");
  return result.result;
}

const balanced = resistiveStar(120, 24, 24, 24);
const unbalanced = resistiveStar(230, 20, 40, 40, "open");
const magnitude = ({ re, im }: { re: number; im: number }) => Math.hypot(re, im);
function phaseMetrics(result: typeof balanced) {
  const neutral = magnitude(result.neutralCurrent);
  return [
    ...PHASES.map(phase => metric(phase, "I" + phase, magnitude(result.currents[phase]), "A")),
    metric("neutral", "IN", neutral < 1e-12 ? 0 : neutral, "A"),
  ];
}

export const homeExamples: readonly Example[] = [
  {
    id: "dc",
    title: { ru: "Постоянный ток", uk: "Постійний струм" },
    assumptions: {
      ru: "Идеальный источник и два последовательно соединённых резистора. Потенциал минусовой клеммы принят за ноль.",
      uk: "Ідеальне джерело і два послідовно з’єднані резистори. Потенціал мінусової клеми прийнято за нуль.",
    },
    formulas: [
      "I=\\frac{E}{R_1+R_2}=\\frac{24\\,\\mathrm{V}}{4\\,\\Omega+8\\,\\Omega}=2\\,\\mathrm{A}",
      "U_1=IR_1=8\\,\\mathrm{V},\\quad U_2=IR_2=16\\,\\mathrm{V}",
      "U_1+U_2=8\\,\\mathrm{V}+16\\,\\mathrm{V}=24\\,\\mathrm{V}",
    ],
    metrics: [
      metric("current", "I", direct.i, "A"), metric("first-drop", "U₁", direct.u1, "V"),
      metric("second-drop", "U₂", direct.u2, "V"), metric("total-drop", "U₁ + U₂", direct.u1 + direct.u2, "V"),
    ],
    plot: {
      xLabel: "A · B · 0", categories: ["A", "B", "0"], xMax: 2, yMin: 0, yMax: 24, yTickStep: 8, yLabel: "φ, V",
      curves: [{ label: "φ", color: "blue", points: [[0, direct.e], [1, direct.u2], [2, 0]] }],
    },
    route: "/interactive/experiments/micro/voltage-divider/",
    stem: true,
  },
  {
    id: "ac",
    title: { ru: "Переменный ток", uk: "Змінний струм" },
    assumptions: {
      ru: "Последовательная RLC-цепь. Действующее напряжение 60 В, R = 30 Ом, L = 0,5 Гн, C = 500 мкФ.",
      uk: "Послідовне RLC-коло. Діюча напруга 60 В, R = 30 Ом, L = 0,5 Гн, C = 500 мкФ.",
    },
    formulas: [
      "X=\\omega L-\\frac{1}{\\omega C}=50\\,\\Omega-20\\,\\Omega=30\\,\\Omega",
      "|Z|=30\\sqrt{2}\\,\\Omega,\\quad I=\\frac{60\\,\\mathrm V}{|Z|}=\\sqrt{2}\\,\\mathrm A",
      "i(t)=2\\sin(100t-\\pi/4)\\,\\mathrm A,\\quad \\omega=100\\,\\mathrm{rad/s}",
    ],
    metrics: [
      metric("reactance", "X", alternate.x, "Ω"), metric("impedance", "|Z|", alternate.z, "Ω"),
      metric("current", "I", alternate.i, "A"), metric("phase", "φ", alternate.phi * 180 / Math.PI, "°"),
    ],
    plot: {
      xLabel: "t, ms", yLabel: "i, A", xMax: acPeriodMs, yMin: -2, yMax: 2,
      curves: [{ label: "i(t)", color: "blue", points: samples(acPeriodMs, time =>
        alternate.i * Math.SQRT2 * Math.sin(alternate.omega * time / 1000 - alternate.phi)) }],
    },
    route: "/interactive/experiments/micro/rlc-resonance/",
  },
  {
    id: "three-phase",
    title: { ru: "Трёхфазные цепи", uk: "Трифазні кола" },
    assumptions: {
      ru: "Симметричная звезда и идеальная нейтраль. Действующее фазное напряжение 120 В. Частота 50 Гц.",
      uk: "Симетрична зірка й ідеальна нейтраль. Діюча фазна напруга 120 В. Частота 50 Гц.",
    },
    formulas: [
      "I_\\phi=\\frac{U_\\phi}{R_\\phi}=\\frac{120\\,\\mathrm V}{24\\,\\Omega}=5\\,\\mathrm A",
      "\\underline I_A+\\underline I_B+\\underline I_C=0",
    ],
    metrics: phaseMetrics(balanced),
    plot: {
      xLabel: "t, ms", yLabel: "i, A", xMax: 20, yMin: -8, yMax: 8,
      curves: PHASES.map((phase, index) => {
        const current = balanced.currents[phase];
        return {
          label: "i" + phase, color: ["blue", "orange", "violet"][index], dash: index !== 0,
          points: samples(20, time => Math.SQRT2 * magnitude(current) *
            Math.cos(Math.PI * time / 10 + Math.atan2(current.im, current.re))),
        };
      }),
    },
    route: "/interactive/experiments/micro/three-phase-star/",
  },
  {
    id: "transients",
    title: { ru: "Переходные процессы", uk: "Перехідні процеси" },
    assumptions: {
      ru: "Конденсатор без начального заряда подключается к источнику 12 В. R = 1 кОм, C = 1000 мкФ.",
      uk: "Конденсатор без початкового заряду підключається до джерела 12 В. R = 1 кОм, C = 1000 мкФ.",
    },
    formulas: [
      "\\tau=RC=1000\\,\\Omega\\cdot0.001\\,\\mathrm F=1\\,\\mathrm s",
      "u_C(t)=12(1-e^{-t/\\tau})\\,\\mathrm V,\\quad u_C(\\tau)\\approx7.585\\,\\mathrm V",
    ],
    metrics: [metric("tau", "τ", charge.tau, "s"), metric("one-tau", "uC(τ)", rc(charge.tau).uc, "V")],
    plot: {
      xLabel: "t, s", yLabel: "uC, V", xMax: 5, yMin: 0, yMax: 12,
      curves: [{ label: "uC(t)", color: "blue", points: samples(5, time => rc(time).uc) }],
    },
    route: "/interactive/experiments/micro/capacitor-charge/",
  },
  {
    id: "nonlinear",
    title: { ru: "Нелинейные цепи", uk: "Нелінійні кола" },
    assumptions: {
      ru: "Кусочно-линейная модель диода. Порог 0,7 В, сопротивление открытого диода 10 Ом.",
      uk: "Кусково-лінійна модель діода. Поріг 0,7 В, опір відкритого діода 10 Ом.",
    },
    formulas: [
      "i_D=\\max\\left(0,\\frac{u_D-0.7\\,\\mathrm V}{10\\,\\Omega}\\right)",
      "I=\\frac{5\\,\\mathrm V-0.7\\,\\mathrm V}{1000\\,\\Omega+10\\,\\Omega}\\approx4.257\\,\\mathrm{mA}",
    ],
    metrics: [metric("current", "I", diodePoint.i * 1000, "mA"), metric("diode-voltage", "UD", diodePoint.ud, "V")],
    plot: {
      xLabel: "uD, V", yLabel: "iD, mA", xMin: 0.6, xMax: 0.8, yMin: 0, yMax: 6,
      curves: [
        { label: "iD(uD)", color: "orange", points: [[0.6, 0], [0.7, 0], [0.76, 6]] },
        { label: "(E − uD) / R", color: "blue", dash: true, points: [[0.6, 4.4], [0.8, 4.2]] },
      ],
    },
    operatingPoint: [diodePoint.ud, diodePoint.i * 1000],
    route: "/interactive/experiments/micro/diode-operating-point/",
  },
  {
    id: "magnetic",
    title: { ru: "Магнитные цепи", uk: "Магнітні кола" },
    assumptions: {
      ru: "Замкнутый сердечник без зазора. Средняя длина 0,4 м, относительная проницаемость 1000. Насыщение вне модели.",
      uk: "Замкнене осердя без проміжку. Середня довжина 0,4 м, відносна проникність 1000. Насичення поза моделлю.",
    },
    formulas: [
      "H=\\frac{NI}{l}=\\frac{200\\cdot0.25\\,\\mathrm A}{0.4\\,\\mathrm m}=125\\,\\mathrm{A/m}",
      "B=\\mu_0\\mu_rH\\approx0.157\\,\\mathrm T",
    ],
    metrics: [metric("field", "H", magneticField, "A/m"), metric("flux-density", "B", permeability * magneticField, "T")],
    plot: {
      xLabel: "H, A/m", yLabel: "B, T", xMax: 250, yMin: 0, yMax: 0.32,
      curves: [{ label: "B(H)", color: "violet", points: [[0, 0], [250, permeability * 250]] }],
    },
    operatingPoint: [magneticField, permeability * magneticField],
  },
  {
    id: "unbalanced",
    title: { ru: "Несимметричные режимы", uk: "Несиметричні режими" },
    assumptions: {
      ru: "Звезда с разомкнутой нейтралью. Фазное напряжение 230 В, сопротивление фазы A 20 Ом, фаз B и C по 40 Ом. Uₙ измеряется относительно нейтрали источника.",
      uk: "Зірка з розімкненою нейтраллю. Фазна напруга 230 В, опір фази A 20 Ом, фаз B і C по 40 Ом. Uₙ вимірюється відносно нейтралі джерела.",
    },
    formulas: [
      "\\underline U_N=\\frac{\\sum_k\\underline U_k/R_k}{\\sum_k1/R_k}",
      "U_N=230\\cdot\\frac{1/20-1/40}{1/20+2/40}=57.5\\,\\mathrm V",
      "I_A=\\frac{230-57.5}{20}\\,\\mathrm A=8.625\\,\\mathrm A",
      "|\\underline I_B|=|\\underline I_C|=\\frac{23\\sqrt{21}}{16}\\,\\mathrm A,\\quad I_N=0",
    ],
    metrics: [...phaseMetrics(unbalanced), metric("neutral-displacement", "UN", magnitude(unbalanced.displacement), "V")],
    plot: {
      xLabel: "A · B · C · N", categories: ["A", "B", "C", "N"], xMax: 3, yMin: 0, yMax: 12, yLabel: "I RMS, A",
      curves: [{ label: "I RMS", color: "violet", points: phaseMetrics(unbalanced).map(({ value }, index) => [index, value]) }],
    },
    route: "/interactive/star-neutral/",
    stem: true,
  },
  {
    id: "long-line",
    title: { ru: "Длинные линии", uk: "Довгі лінії" },
    assumptions: {
      ru: "Линия без потерь длиной 100 км. Скорость волны 200 000 км/с. Согласованный источник даёт падающую волну 50 В.",
      uk: "Лінія без втрат завдовжки 100 км. Швидкість хвилі 200 000 км/с. Узгоджене джерело дає падаючу хвилю 50 В.",
    },
    formulas: [
      "\\Gamma_L=\\frac{100\\,\\Omega-50\\,\\Omega}{100\\,\\Omega+50\\,\\Omega}=\\frac13",
      "U_L=U^+(1+\\Gamma_L)=\\frac{200}{3}\\,\\mathrm V,\\quad I_L=\\frac{U^+(1-\\Gamma_L)}{Z_0}=\\frac23\\,\\mathrm A",
    ],
    metrics: [
      metric("delay", "t₀", delayMs, "ms"), metric("reflection", "ΓL", transmission.gamma),
      metric("load-voltage", "UL", transmission.loadU, "V"), metric("load-current", "IL", transmission.loadI, "A"),
    ],
    plot: {
      xLabel: "t, ms", yLabel: "uL, V", xMax: 1, yMin: 0, yMax: 80,
      curves: [{ label: "uL(t)", color: "blue", points: [[0, 0], [delayMs, 0], [delayMs, transmission.loadU], [1, transmission.loadU]] }],
    },
    route: "/interactive/transmission-line/experiment/",
  },
];
