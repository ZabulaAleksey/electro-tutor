import type {EngineeringPlotData} from "../engineering/plot";
import {dc,rc} from "./physics";
import {lineStep} from "./line-surface";
export const panoramas = [
  { id: "dc", title: { ru: "Постоянный ток", uk: "Постійний струм" }, note: { ru: "Напряжение, сопротивление, ток", uk: "Напруга, опір, струм" }, route: "/micro-labs/#micro=ohm-law" },
  { id: "transient", title: { ru: "Переходные процессы", uk: "Перехідні процеси" }, note: { ru: "Заряд конденсатора во времени", uk: "Заряд конденсатора в часі" }, route: "/micro-labs/#micro=capacitor-charge" },
  { id: "machines", title: { ru: "Трёхфазные цепи", uk: "Трифазні кола" }, note: { ru: "Три фазы. Один согласованный расчёт", uk: "Три фази. Один узгоджений розрахунок" }, route: "/interactive/star-neutral/" },
  { id: "lines", title: { ru: "Длинные линии", uk: "Довгі лінії" }, note: { ru: "Бегущие и отражённые волны", uk: "Рухомі та відбиті хвилі" }, route: "/interactive/transmission-line/" },
] as const;
export type PanoramaId = typeof panoramas[number]["id"];
const values = Array.from({ length: 101 }, (_, i) => i / 100);
const d = dc();
export const panoramaPlots: Record<PanoramaId, EngineeringPlotData> = {
  dc: { xMax:30,yMin:0,yMax:.3,xLabel: "U, V", yLabel: "I, A", curves: [{ label: "I = U / (R₁ + R₂)", color: "blue", points: values.map(t => [t * 30, t * 30 / (d.r1 + d.r2)] as const) }] },
  transient: { xMax:5,yMin:0,yMax:12,xLabel: "t, s", yLabel: "uC, V", curves: [{ label: "uC(t)", color: "blue", points: values.map(t => [t * 5, rc(t * 5).uc] as const) }] },
  machines: { xMax:360,yMin:-1,yMax:1,xTickStep:60,xLabel: "ωt, °", yLabel: "i / Î, 1", curves: [0, 1, 2].map((phase) => ({ label: ["iA / Î", "iB / Î", "iC / Î"][phase], color: ["blue", "orange", "violet"][phase], dash: phase > 0, points: values.map(t => [t * 360, Math.sin(2 * Math.PI * t - phase * 2 * Math.PI / 3)] as const) })) },
  lines: { xMax:100000,yMin:0,yMax:70,xLabel: "x, m", yLabel: "u, V", curves: [{ label: "u(x, t = 0,75 ms)", color: "blue", points: [0, 49999.9, 50000, 100000].map(x => [x, lineStep(x, .00075).u] as const) }] },
};
