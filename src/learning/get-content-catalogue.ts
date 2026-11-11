import { buildContentCatalogue, getStandaloneLessons } from "./content-catalogue";
import { buildLearningNavigation } from "./navigation";
import { getLearningNavigation } from "./get-navigation";
import type { Language } from "../types";

export async function getContentCatalogue(language: Language, mvp = false) {
  if (mvp) {
    return { ...buildContentCatalogue(await getLearningNavigation(language, true, true), language, true), standaloneLessons: [] };
  }
  const { getPublishedLessonManifest } = await import("../content/published-lessons");
  const published = await getPublishedLessonManifest();
  return {
    ...buildContentCatalogue(buildLearningNavigation(published, language), language, false),
    standaloneLessons: getStandaloneLessons(published, language),
  };
}
