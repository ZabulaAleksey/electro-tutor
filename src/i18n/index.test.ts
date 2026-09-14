import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  formatDate,
  formatMinutes,
  formatNumber,
  formatTopicCount,
  getLocale,
  normalizeLanguage,
} from ".";

describe("localization runtime contract", () => {
  it("uses Russian as the explicit fallback without publishing a new locale", () => {
    expect(normalizeLanguage("uk")).toBe("uk");
    expect(normalizeLanguage("en")).toBe(DEFAULT_LANGUAGE);
    expect(getLocale(normalizeLanguage(undefined)).brand.name).toBe("Потенциал");
  });

  it("formats numbers, durations and dates for each locale", () => {
    expect(formatNumber("ru", 1234.5)).toMatch(/1[\s\u00a0]234,5/);
    expect(formatNumber("uk", 1234.5)).toMatch(/1[\s\u00a0]234,5/);
    expect(formatMinutes("ru", 25)).toBe("25 мин");
    expect(formatMinutes("uk", 25)).toBe("25 хв");
    expect(formatDate("ru", "2026-08-27T00:00:00Z")).toContain("августа");
    expect(formatDate("uk", "2026-08-27T00:00:00Z")).toContain("серпня");
  });

  it("selects locale-aware topic plural forms", () => {
    expect(formatTopicCount("ru", 2)).toBe("2 темы");
    expect(formatTopicCount("uk", 2)).toBe("2 теми");
    expect(formatTopicCount("ru", 5)).toBe("5 тем");
  });

  it("keeps account profile states localized in both supported languages", () => {
    expect(getLocale("ru").account.permissionTitle).toBe("Нужно разрешение преподавателя");
    expect(getLocale("uk").account.permissionTitle).toBe("Потрібен дозвіл викладача");
    expect(getLocale("ru").account.validationRequired).not.toBe(getLocale("uk").account.validationRequired);
  });

  it("keeps booking lifecycle, permission and external-payment notices localized", () => {
    expect(getLocale("ru").account.booking.statusRequested).toBe("Ожидает ответа");
    expect(getLocale("uk").account.booking.statusRequested).toBe("Очікує відповіді");
    expect(getLocale("ru").account.booking.externalDisclaimer).toContain("не принимает");
    expect(getLocale("uk").account.booking.externalDisclaimer).toContain("не приймає");
    expect(getLocale("ru").account.booking.permission).not.toBe(getLocale("uk").account.booking.permission);
  });
});
