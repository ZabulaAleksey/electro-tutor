import { parse } from "yaml";

import type { LessonContractEntry, LessonLanguage } from "./lesson-contract";

type Frontmatter = Record<string, unknown>;

function required<T extends string | number>(
  frontmatter: Frontmatter,
  source: string,
  name: string,
  type: "string" | "number",
): T {
  const value = frontmatter[name];
  if (typeof value !== type) {
    throw new Error(`${source} has no valid ${name} frontmatter field.`);
  }
  return value as T;
}

export function parseLessonContractEntry(
  sourceText: string,
  source: string,
  translationKey: string,
): LessonContractEntry {
  const frontmatterMatch = sourceText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatterMatch) {
    throw new Error(`${source} does not start with frontmatter.`);
  }

  const parsed: unknown = parse(frontmatterMatch[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${source} frontmatter must be a YAML mapping.`);
  }

  const frontmatter = parsed as Frontmatter;
  const language = required<string>(frontmatter, source, "language", "string");
  if (language !== "ru" && language !== "uk") {
    throw new Error(`${source} has unsupported language "${language}".`);
  }

  const draft = frontmatter.draft ?? false;
  if (typeof draft !== "boolean") {
    throw new Error(`${source} has no valid draft frontmatter field.`);
  }

  return {
    source,
    translationKey,
    language: language as LessonLanguage,
    section: required(frontmatter, source, "section", "string"),
    slug: required(frontmatter, source, "slug", "string"),
    order: required(frontmatter, source, "order", "number"),
    duration: required(frontmatter, source, "duration", "number"),
    draft,
  };
}
