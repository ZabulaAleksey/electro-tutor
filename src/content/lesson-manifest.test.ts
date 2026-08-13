import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import type { InteractiveKey } from "./interactive-contract";
import { parseLessonContractEntry } from "./lesson-contract-file";
import type { LessonContractEntry, LessonLanguage } from "./lesson-contract";
import {
  createPublishedLessonManifest,
  lessonHref,
  resolvePublishedLesson,
  type LessonManifestSource,
} from "./lesson-manifest";

const lessonsDirectory = join(process.cwd(), "src", "content", "lessons");

function source(
  id: string,
  overrides: Partial<LessonManifestSource["data"]> = {},
): LessonManifestSource {
  return {
    id,
    data: {
      title: `Lesson ${id}`,
      description: `Description ${id}`,
      language: "ru",
      section: "dc",
      slug: id,
      order: 1,
      duration: 10,
      keywords: [],
      draft: false,
      ...overrides,
    },
  };
}

function lessonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return lessonFiles(filePath);
    }
    return /\.mdx?$/.test(entry.name) ? [filePath] : [];
  });
}

function actualLessonSource(filePath: string): LessonManifestSource {
  const id = relative(lessonsDirectory, filePath).replaceAll("\\", "/");
  const translationKey = id.replace(/^(ru|uk)\//, "").replace(/\.mdx?$/, "");
  const parsed = parseLessonContractEntry(
    readFileSync(filePath, "utf8"),
    id,
    translationKey,
  );

  return contractEntryToManifestSource(id, parsed);
}

function contractEntryToManifestSource(
  id: string,
  entry: LessonContractEntry,
): LessonManifestSource {
  return source(id, {
    title: entry.translationKey,
    description: entry.source,
    language: entry.language,
    section: entry.section,
    slug: entry.slug,
    order: entry.order,
    duration: entry.duration,
    draft: entry.draft,
    interactive: entry.interactive,
  });
}

describe("published lesson manifest", () => {
  it("includes only published entries and preserves route metadata and source entry", () => {
    const published = source("published", {
      language: "uk",
      section: "ac",
      slug: "phasors",
      interactive: "mesh-lesson" as InteractiveKey,
    });
    const translation = source("translation", {
      language: "ru",
      section: "ac",
      slug: "phasors",
    });
    const draft = source("draft", { draft: true });

    const manifest = createPublishedLessonManifest([draft, published, translation]);

    expect(manifest).toHaveLength(2);
    expect(manifest.find((lesson) => lesson.id === "published")).toEqual(
      expect.objectContaining({
          key: "uk/ac/phasors",
          language: "uk",
          section: "ac",
          slug: "phasors",
          href: "/uk/topics/ac/phasors/",
          interactive: "mesh-lesson",
          entry: published,
        }),
    );
    expect(manifest.some((lesson) => lesson.id === "draft")).toBe(false);
  });

  it("sorts deterministically by language, section, slug, and id", () => {
    const entries = [
      source("z", { language: "uk", slug: "same" }),
      source("z-ru", { language: "ru", slug: "same" }),
      source("c", { language: "ru", section: "dc", slug: "z" }),
      source("c-uk", { language: "uk", section: "dc", slug: "z" }),
      source("b", { language: "ru", section: "ac", slug: "z" }),
      source("b-uk", { language: "uk", section: "ac", slug: "z" }),
      source("a", { language: "ru", section: "ac", slug: "a" }),
      source("a-uk", { language: "uk", section: "ac", slug: "a" }),
    ];

    expect(createPublishedLessonManifest(entries).map((lesson) => lesson.id)).toEqual([
      "a",
      "b",
      "z-ru",
      "c",
      "a-uk",
      "b-uk",
      "z",
      "c-uk",
    ]);
    expect(createPublishedLessonManifest([...entries].reverse()).map((lesson) => lesson.id)).toEqual([
      "a",
      "b",
      "z-ru",
      "c",
      "a-uk",
      "b-uk",
      "z",
      "c-uk",
    ]);
  });

  it("rejects duplicate published language/section/slug keys", () => {
    const duplicate = source("duplicate", { slug: "original" });

    expect(() =>
      createPublishedLessonManifest([source("original"), duplicate]),
    ).toThrow(/Duplicate published lesson key "ru\/dc\/original"/);
  });

  it("allows a draft entry to reuse a published key because it is not public", () => {
    expect(
      createPublishedLessonManifest([
        source("published", { slug: "shared" }),
        source("published-uk", { language: "uk", slug: "shared" }),
        source("draft", { slug: "shared", draft: true }),
      ]),
    ).toHaveLength(2);
  });

  it("rejects a published lesson without its localized pair", () => {
    expect(() => createPublishedLessonManifest([source("only-ru")])).toThrow(
      /Published lesson "dc\/only-ru" is missing a published uk version/,
    );
  });

  it("does not count a draft translation as the published localized pair", () => {
    expect(() =>
      createPublishedLessonManifest([
        source("ru", { language: "ru", slug: "lesson" }),
        source("uk-draft", { language: "uk", slug: "lesson", draft: true }),
      ]),
    ).toThrow(/Published lesson "dc\/lesson" is missing a published uk version/);
  });

  it("resolves only an exact localized publication", () => {
    const manifest = createPublishedLessonManifest([
      source("ru-lesson", { language: "ru", slug: "lesson" }),
      source("uk-lesson", { language: "uk", slug: "lesson" }),
    ]);

    expect(resolvePublishedLesson(manifest, "uk", "dc", "lesson")?.id).toBe(
      "uk-lesson",
    );
    expect(resolvePublishedLesson(manifest, "ru", "dc", "missing")).toBeUndefined();
  });

  it("encodes section and slug as individual URL path segments", () => {
    expect(lessonHref("ru", "ac circuits", "phasor/input")).toBe(
      "/ru/topics/ac%20circuits/phasor%2Finput/",
    );
  });

  it("builds the expected manifest from the actual repository lessons", () => {
    const manifest = createPublishedLessonManifest(
      lessonFiles(lessonsDirectory).map(actualLessonSource),
    );

    expect(manifest).toHaveLength(2);
    expect(
      manifest.map(({ language, section, slug, href, interactive }) => ({
        language,
        section,
        slug,
        href,
        interactive,
      })),
    ).toEqual([
      {
        language: "ru" as LessonLanguage,
        section: "dc",
        slug: "mesh-current-method",
        href: "/ru/topics/dc/mesh-current-method/",
        interactive: "mesh-lesson",
      },
      {
        language: "uk" as LessonLanguage,
        section: "dc",
        slug: "mesh-current-method",
        href: "/uk/topics/dc/mesh-current-method/",
        interactive: "mesh-lesson",
      },
    ]);
  });
});
