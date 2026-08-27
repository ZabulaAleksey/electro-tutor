import type { Topic } from "./types";

export const topics: Topic[] = [
  {
    id: "ohm",
    index: "01",
    title: { ru: "Закон Ома", uk: "Закон Ома" },
    description: {
      ru: "Связь тока, напряжения и сопротивления на участке цепи.",
      uk: "Зв'язок струму, напруги та опору на ділянці кола.",
    },
    duration: 20,
    accent: "green",
  },
  {
    id: "kirchhoff",
    index: "02",
    title: { ru: "Законы Кирхгофа", uk: "Закони Кірхгофа" },
    description: {
      ru: "Уравнения для узлов и замкнутых контуров.",
      uk: "Рівняння для вузлів і замкнених контурів.",
    },
    duration: 35,
    accent: "blue",
  },
  {
    id: "mesh",
    lessonSlug: "mesh-current-method",
    index: "03",
    title: { ru: "Метод контурных токов", uk: "Метод контурних струмів" },
    description: {
      ru: "Системный расчёт сложных цепей через независимые контуры.",
      uk: "Системний розрахунок складних кіл через незалежні контури.",
    },
    duration: 50,
    accent: "orange",
  },
  {
    id: "nodes",
    index: "04",
    title: { ru: "Метод узловых потенциалов", uk: "Метод вузлових потенціалів" },
    description: {
      ru: "Расчёт цепи через потенциалы её независимых узлов.",
      uk: "Розрахунок кола через потенціали його незалежних вузлів.",
    },
    duration: 45,
    accent: "violet",
  },
];
