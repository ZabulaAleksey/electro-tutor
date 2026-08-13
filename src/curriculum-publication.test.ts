import { describe, expect, it } from "vitest";

import {
  createPublishedLessonManifest,
  type LessonManifestSource,
} from "./content/lesson-manifest";
import { resolveTopicPublication } from "./curriculum-publication";

function source(
  language: "ru" | "uk",
  overrides: Partial<LessonManifestSource["data"]> = {},
): LessonManifestSource {
  return {
    id: `${language}-mesh`,
    data: {
      title: "Mesh",
      description: "Mesh lesson",
      language,
      section: "dc",
      slug: "mesh-current-method",
      order: 3,
      duration: 50,
      keywords: [],
      draft: false,
      ...overrides,
    },
  };
}

const mappedTopic = { lessonSlug: "mesh-current-method" };

describe("curriculum publication resolver", () => {
  it("returns exact localized RU and UK hrefs from the manifest", () => {
    const manifest = createPublishedLessonManifest([source("ru"), source("uk")]);

    expect(resolveTopicPublication(manifest, "ru", "dc", mappedTopic)).toEqual({
      available: true,
      href: "/ru/topics/dc/mesh-current-method/",
    });
    expect(resolveTopicPublication(manifest, "uk", "dc", mappedTopic)).toEqual({
      available: true,
      href: "/uk/topics/dc/mesh-current-method/",
    });
  });

  it("keeps a topic without a lesson mapping unavailable", () => {
    const manifest = createPublishedLessonManifest([source("ru"), source("uk")]);

    expect(resolveTopicPublication(manifest, "ru", "dc", {})).toEqual({
      available: false,
    });
  });

  it("does not fall back when lessonSlug points at a missing lesson", () => {
    const manifest = createPublishedLessonManifest([source("ru"), source("uk")]);

    expect(
      resolveTopicPublication(manifest, "ru", "dc", { lessonSlug: "wrong" }),
    ).toEqual({ available: false });
  });

  it("does not fall back to another locale", () => {
    const manifest = createPublishedLessonManifest([source("ru"), source("uk")]);
    const ruOnly = manifest.filter((lesson) => lesson.language === "ru");

    expect(resolveTopicPublication(ruOnly, "uk", "dc", mappedTopic)).toEqual({
      available: false,
    });
  });

  it("does not expose a draft lesson omitted from the manifest", () => {
    const manifest = createPublishedLessonManifest([
      source("ru", { slug: "other" }),
      source("uk", { slug: "other" }),
      source("ru", { draft: true }),
      source("uk", { draft: true }),
    ]);

    expect(manifest.some((lesson) => lesson.slug === "mesh-current-method")).toBe(false);
    expect(resolveTopicPublication(manifest, "ru", "dc", mappedTopic)).toEqual({
      available: false,
    });
  });
});
