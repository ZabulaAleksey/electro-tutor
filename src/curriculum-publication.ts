import {
  resolvePublishedLesson,
  type LessonHref,
  type LessonManifestSource,
  type PublishedLesson,
} from "./content/lesson-manifest";
import type { Language, Topic } from "./types";

export type TopicPublication =
  | { available: true; href: LessonHref }
  | { available: false; href?: undefined };

export function resolveTopicPublication<
  TEntry extends LessonManifestSource,
>(
  manifest: readonly PublishedLesson<TEntry>[],
  language: Language,
  sectionId: string,
  topic: Pick<Topic, "lessonSlug">,
): TopicPublication {
  if (!topic.lessonSlug) {
    return { available: false };
  }

  const lesson = resolvePublishedLesson(
    manifest,
    language,
    sectionId,
    topic.lessonSlug,
  );

  return lesson
    ? { available: true, href: lesson.href }
    : { available: false };
}
