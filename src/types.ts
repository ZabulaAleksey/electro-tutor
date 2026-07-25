export type Language = "ru" | "uk";
export type DetailLevel = 1 | 2 | 3;
export type Page = "home" | "catalog" | "lesson" | "interactive" | "contacts";
export type Theme = "light" | "dark";

export type LocalizedText = {
  ru: string;
  uk: string;
};

export type CurriculumSection = {
  id: string;
  index: string;
  title: LocalizedText;
  description: LocalizedText;
  topics: Topic[];
};

export type Topic = {
  id: string;
  index: string;
  title: LocalizedText;
  description: LocalizedText;
  duration: number;
  available: boolean;
  accent: "green" | "blue" | "orange" | "violet";
};
