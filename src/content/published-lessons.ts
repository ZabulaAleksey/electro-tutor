import { getCollection } from "astro:content";

import { createPublishedLessonManifest } from "./lesson-manifest";

export async function getPublishedLessonManifest() {
  const lessons = await getCollection("lessons");
  return createPublishedLessonManifest(lessons);
}
