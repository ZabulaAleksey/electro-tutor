export const lessonLanguages = ["ru", "uk"] as const;

export type LessonLanguage = (typeof lessonLanguages)[number];

export interface LessonContractEntry {
  source: string;
  translationKey: string;
  language: LessonLanguage;
  section: string;
  slug: string;
  order: number;
  duration: number;
  draft: boolean;
}

const sharedFields = ["section", "slug", "order", "duration", "draft"] as const;

function publicationKey(entry: LessonContractEntry): string {
  return `${entry.language}/${entry.section}/${entry.slug}`;
}

function lessonKey(entry: LessonContractEntry): string {
  return `${entry.section}/${entry.slug}`;
}

export function validateLessonContracts(entries: LessonContractEntry[]): void {
  const errors: string[] = [];
  const entriesByPublicationKey = new Map<string, LessonContractEntry>();
  const entriesByLessonKey = new Map<string, Map<LessonLanguage, LessonContractEntry>>();
  const entriesByTranslationKey = new Map<string, Map<LessonLanguage, LessonContractEntry>>();

  for (const entry of entries) {
    const key = publicationKey(entry);
    const duplicate = entriesByPublicationKey.get(key);

    if (duplicate) {
      errors.push(
        `Duplicate publication key "${key}" in ${duplicate.source} and ${entry.source}.`,
      );
    } else {
      entriesByPublicationKey.set(key, entry);
    }

    const localizedEntries = entriesByLessonKey.get(lessonKey(entry)) ?? new Map();
    if (!localizedEntries.has(entry.language)) {
      localizedEntries.set(entry.language, entry);
    }
    entriesByLessonKey.set(lessonKey(entry), localizedEntries);

    const translations = entriesByTranslationKey.get(entry.translationKey) ?? new Map();
    translations.set(entry.language, entry);
    entriesByTranslationKey.set(entry.translationKey, translations);
  }

  for (const [key, localizedEntries] of entriesByLessonKey) {
    const hasPublishedEntry = [...localizedEntries.values()].some((entry) => !entry.draft);

    if (hasPublishedEntry) {
      for (const language of lessonLanguages) {
        const localizedEntry = localizedEntries.get(language);
        if (!localizedEntry || localizedEntry.draft) {
          errors.push(`Published lesson "${key}" is missing a published ${language} version.`);
        }
      }
    }

    const reference = localizedEntries.get(lessonLanguages[0]);
    const translation = localizedEntries.get(lessonLanguages[1]);
    if (reference && translation && reference.translationKey !== translation.translationKey) {
      errors.push(
        `Published lesson "${key}" uses different translation filenames: ${reference.source}=${reference.translationKey}, ${translation.source}=${translation.translationKey}.`,
      );
    }
  }

  for (const [key, translations] of entriesByTranslationKey) {
    const reference = translations.get(lessonLanguages[0]);
    if (!reference) {
      continue;
    }

    for (const language of lessonLanguages.slice(1)) {
      const localizedEntry = translations.get(language);
      if (!localizedEntry) {
        continue;
      }

      for (const field of sharedFields) {
        if (localizedEntry[field] !== reference[field]) {
          errors.push(
            `Translation pair "${key}" has inconsistent ${field}: ${reference.source}=${String(reference[field])}, ${localizedEntry.source}=${String(localizedEntry[field])}.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Lesson content contract failed:\n- ${errors.join("\n- ")}`);
  }
}
