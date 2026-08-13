import type { InteractiveKey } from "./interactive-contract";
import type { LessonLanguage } from "./lesson-contract";

export interface LessonManifestData {
  title: string;
  description: string;
  language: LessonLanguage;
  section: string;
  slug: string;
  order: number;
  duration: number;
  keywords: string[];
  draft: boolean;
  interactive?: InteractiveKey;
}

export interface LessonManifestSource {
  id: string;
  data: LessonManifestData;
}

export type LessonHref = `/${LessonLanguage}/topics/${string}/${string}/`;

export interface PublishedLesson<
  TEntry extends LessonManifestSource = LessonManifestSource,
> {
  id: string;
  key: string;
  language: LessonLanguage;
  section: string;
  slug: string;
  href: LessonHref;
  title: string;
  description: string;
  order: number;
  duration: number;
  keywords: string[];
  interactive?: InteractiveKey;
  entry: TEntry;
}

export function lessonPublicationKey(
  language: LessonLanguage,
  section: string,
  slug: string,
): string {
  return `${language}/${section}/${slug}`;
}

export function lessonHref(
  language: LessonLanguage,
  section: string,
  slug: string,
): LessonHref {
  const encodedSection = encodeURIComponent(section);
  const encodedSlug = encodeURIComponent(slug);

  return `/${language}/topics/${encodedSection}/${encodedSlug}/`;
}

export function createPublishedLessonManifest<
  TEntry extends LessonManifestSource,
>(entries: readonly TEntry[]): PublishedLesson<TEntry>[] {
  const publishedLessons: PublishedLesson<TEntry>[] = [];
  const sourceByKey = new Map<string, string>();
  const languagesByLesson = new Map<string, Set<LessonLanguage>>();

  for (const entry of entries) {
    if (entry.data.draft) {
      continue;
    }

    const { data } = entry;
    const key = lessonPublicationKey(data.language, data.section, data.slug);
    const duplicateSource = sourceByKey.get(key);

    if (duplicateSource) {
      throw new Error(
        `Duplicate published lesson key "${key}" in ${duplicateSource} and ${entry.id}.`,
      );
    }

    sourceByKey.set(key, entry.id);
    const lessonKey = `${data.section}/${data.slug}`;
    const languages = languagesByLesson.get(lessonKey) ?? new Set<LessonLanguage>();
    languages.add(data.language);
    languagesByLesson.set(lessonKey, languages);
    publishedLessons.push({
      id: entry.id,
      key,
      language: data.language,
      section: data.section,
      slug: data.slug,
      href: lessonHref(data.language, data.section, data.slug),
      title: data.title,
      description: data.description,
      order: data.order,
      duration: data.duration,
      keywords: [...data.keywords],
      interactive: data.interactive,
      entry,
    });
  }

  for (const [lessonKey, languages] of languagesByLesson) {
    for (const language of ["ru", "uk"] as const) {
      if (!languages.has(language)) {
        throw new Error(
          `Published lesson "${lessonKey}" is missing a published ${language} version.`,
        );
      }
    }
  }

  return publishedLessons.sort(
    (left, right) =>
      left.language.localeCompare(right.language) ||
      left.section.localeCompare(right.section) ||
      left.slug.localeCompare(right.slug) ||
      left.id.localeCompare(right.id),
  );
}

export function resolvePublishedLesson<
  TEntry extends LessonManifestSource,
>(
  manifest: readonly PublishedLesson<TEntry>[],
  language: LessonLanguage,
  section: string,
  slug: string,
): PublishedLesson<TEntry> | undefined {
  const key = lessonPublicationKey(language, section, slug);
  return manifest.find((lesson) => lesson.key === key);
}
