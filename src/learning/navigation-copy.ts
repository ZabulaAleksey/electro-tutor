import type { Language } from "../types";

export const learningStages = ["textbook", "examples", "lab"] as const;
export type LearningStageKey = (typeof learningStages)[number];

export const stageCopy: Record<Language, Record<LearningStageKey, string>> = {
  ru: { textbook: "Учебник", examples: "Примеры решений", lab: "Лаборатория" },
  uk: { textbook: "Підручник", examples: "Приклади розв'язань", lab: "Лабораторія" },
};

export const navigationCopy = {
  ru: {
    contents: "Оглавление",
    search: "Поиск по темам и инструментам",
    category: "Дисциплина",
    allCategories: "Все дисциплины",
    openContents: "Открыть общее оглавление",
    unavailable: "Пока недоступно",
    notTranslated: "Нет перевода",
    fallback: "Открыть доступный этап",
    relatedTools: "Связанные инструменты",
    variants: "Варианты",
    noResults: "Ничего не найдено. Измените запрос или дисциплину.",
  },
  uk: {
    contents: "Зміст",
    search: "Пошук за темами та інструментами",
    category: "Дисципліна",
    allCategories: "Усі дисципліни",
    openContents: "Відкрити загальний зміст",
    unavailable: "Поки недоступно",
    notTranslated: "Немає перекладу",
    fallback: "Відкрити доступний етап",
    relatedTools: "Пов'язані інструменти",
    variants: "Варіанти",
    noResults: "Нічого не знайдено. Змініть запит або дисципліну.",
  },
} as const;

export function stageLabel(language: Language, stage: string): string {
  return stageCopy[language][stage as LearningStageKey] ?? stage;
}
