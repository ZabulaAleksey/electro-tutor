import type { Language } from "../types";

export const learningSections = [
  { id: "topics", path: "/topics/", label: { ru: "Учебник", uk: "Підручник" } },
  { id: "solutions", path: "/solutions/", label: { ru: "Решения", uk: "Розв’язання" } },
  { id: "interactive", path: "/interactive/", label: { ru: "Лаборатории", uk: "Лабораторії" } },
] as const satisfies readonly { id: string; path: string; label: Record<Language, string> }[];
