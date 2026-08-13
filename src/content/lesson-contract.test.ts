import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { parseLessonContractEntry } from "./lesson-contract-file";
import {
  type LessonContractEntry,
  validateLessonContracts,
} from "./lesson-contract";

const lessonsDirectory = join(process.cwd(), "src", "content", "lessons");

function parseLesson(filePath: string): LessonContractEntry {
  const sourceName = relative(process.cwd(), filePath).replaceAll("\\", "/");
  const translationKey = relative(lessonsDirectory, filePath)
    .replaceAll("\\", "/")
    .replace(/^(ru|uk)\//, "")
    .replace(/\.mdx?$/, "");

  return parseLessonContractEntry(readFileSync(filePath, "utf8"), sourceName, translationKey);
}

function lessonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return lessonFiles(path);
    }
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

function lesson(overrides: Partial<LessonContractEntry> = {}): LessonContractEntry {
  return {
    source: "src/content/lessons/ru/example.mdx",
    translationKey: "example",
    language: "ru",
    section: "dc",
    slug: "example",
    order: 1,
    duration: 10,
    draft: false,
    ...overrides,
  };
}

describe("lesson content contract", () => {
  it("accepts the actual RU/UK lesson collection", () => {
    const entries = lessonFiles(lessonsDirectory).map(parseLesson);

    expect(entries.length).toBeGreaterThan(0);
    expect(() => validateLessonContracts(entries)).not.toThrow();
  });

  it("rejects duplicate language/section/slug publication keys", () => {
    const duplicate = lesson({ source: "src/content/lessons/ru/duplicate.mdx" });

    expect(() => validateLessonContracts([lesson(), duplicate])).toThrow(
      /Duplicate publication key "ru\/dc\/example"/,
    );
  });

  it("rejects a published lesson without both published languages", () => {
    expect(() => validateLessonContracts([lesson()])).toThrow(
      /Published lesson "dc\/example" is missing a published uk version/,
    );
  });

  it("rejects a RU/UK pair stored under different filenames", () => {
    const ukLesson = lesson({
      source: "src/content/lessons/uk/different-name.mdx",
      translationKey: "different-name",
      language: "uk",
    });

    expect(() => validateLessonContracts([lesson(), ukLesson])).toThrow(
      /uses different translation filenames/,
    );
  });

  it("reports every cross-language metadata mismatch", () => {
    const ukLesson = lesson({
      source: "src/content/lessons/uk/example.mdx",
      language: "uk",
      section: "ac",
      slug: "other-example",
      order: 2,
      duration: 20,
      draft: true,
    });

    expect(() => validateLessonContracts([lesson(), ukLesson])).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /inconsistent section:[\s\S]*inconsistent slug:[\s\S]*inconsistent order:[\s\S]*inconsistent duration:[\s\S]*inconsistent draft:/,
        ),
      }),
    );
  });

  it("uses YAML numeric syntax and the schema default for draft", () => {
    const source = `---
language: ru
section: dc
slug: example
order: 1e1
duration: 5e1
---
`;

    expect(parseLessonContractEntry(source, "example.mdx", "example")).toMatchObject({
      order: 10,
      duration: 50,
      draft: false,
    });
  });
});
