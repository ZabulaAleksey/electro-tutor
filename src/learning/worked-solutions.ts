import { localePath } from "../site-path";
import { softwareExamples } from "../showcase/copy";
import type { Language } from "../types";

const mesh = "/topics/dc/mesh-current-method/";
const meshExamples = [
  { id: 1, title: { ru: "Один источник напряжения", uk: "Одне джерело напруги" } },
  { id: 2, title: { ru: "Два источника и отрицательный ток", uk: "Два джерела й від’ємний струм" } },
  { id: 3, title: { ru: "Три контура и система уравнений", uk: "Три контури й система рівнянь" } },
  { id: 4, title: { ru: "Источник тока и суперконтур", uk: "Джерело струму й суперконтур" } },
] as const;

export function getWorkedSolutions(language: Language) {
  const rcLab = localePath(language, "/interactive/experiments/micro/capacitor-charge/");
  return {
    mesh: meshExamples.map(({ id, title }) => ({
      id, title: title[language],
      href: localePath("ru", `${mesh}examples/#example-${id}`),
      lab: localePath("ru", `${mesh}lab/?example=${id}`),
      theory: localePath(language, mesh),
    })),
    software: softwareExamples(language).map((example, index) => ({
      ...example,
      lab: example.kind === "dc" ? localePath("ru", `${mesh}lab/?example=2`) : rcLab,
      theory: example.kind === "dc" ? localePath(language, mesh) : undefined,
      demonstration: index < 3 ? localePath(language, `/showcase/#story=${["python-rc", "numpy-mesh", "ltspice-rc"][index]}`) : undefined,
    })),
  };
}
