import type { LocalizedText, Topic } from "./types";

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
    available: true,
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
    available: true,
    accent: "blue",
  },
  {
    id: "mesh",
    index: "03",
    title: { ru: "Метод контурных токов", uk: "Метод контурних струмів" },
    description: {
      ru: "Системный расчёт сложных цепей через независимые контуры.",
      uk: "Системний розрахунок складних кіл через незалежні контури.",
    },
    duration: 50,
    available: true,
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
    available: false,
    accent: "violet",
  },
];

export const text = {
  brandSub: { ru: "Инженерный учебник", uk: "Інженерний підручник" },
  home: { ru: "Главная", uk: "Головна" },
  catalog: { ru: "Все темы", uk: "Усі теми" },
  continue: { ru: "Продолжить обучение", uk: "Продовжити навчання" },
  start: { ru: "Начать изучение", uk: "Почати вивчення" },
  soon: { ru: "Скоро", uk: "Незабаром" },
  minutes: { ru: "мин", uk: "хв" },
  level: { ru: "Глубина объяснения", uk: "Глибина пояснення" },
  levels: {
    1: { ru: "Исследователь", uk: "Дослідник" },
    2: { ru: "Объяснение", uk: "Пояснення" },
    3: { ru: "Только решение", uk: "Лише розв’язання" },
  },
} satisfies Record<string, LocalizedText | Record<number, LocalizedText>>;
