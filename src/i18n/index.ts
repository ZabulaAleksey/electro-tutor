import ru from "./ru.json";
import uk from "./uk.json";
import type { Language } from "../types";

export const SUPPORTED_LANGUAGES = ["ru", "uk"] as const satisfies readonly Language[];
export const DEFAULT_LANGUAGE: Language = "ru";
export const localeCatalogs = { ru, uk } as const;

export type LocaleCatalog = typeof ru;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function getLocale(language: Language): LocaleCatalog {
  return localeCatalogs[language];
}

export function getOtherLanguage(language: Language): Language {
  return language === "ru" ? "uk" : "ru";
}

const intlLocale: Record<Language, string> = { ru: "ru-RU", uk: "uk-UA" };

export function formatNumber(language: Language, value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(intlLocale[language], { maximumFractionDigits }).format(value);
}

export function formatDate(language: Language, value: Date | number | string): string {
  return new Intl.DateTimeFormat(intlLocale[language], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatMinutes(language: Language, value: number): string {
  return `${formatNumber(language, value, 0)} ${getLocale(language).units.minutes}`;
}

export function formatTopicCount(language: Language, count: number): string {
  const copy = getLocale(language).topics;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const form = mod10 === 1 && mod100 !== 11
    ? copy.one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? copy.few
      : copy.many;
  return `${formatNumber(language, count, 0)} ${form}`;
}
