import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { normalizeBasePath } from "./site-contract.mjs";

const root = cwd();
const outputDirectory = process.env.BUILD_OUTPUT_DIR || "dist";
const basePath = normalizeBasePath(process.env.BASE_PATH);
const withBase = (path) => basePath === "/" ? path : `${basePath.slice(0, -1)}${path}`;

async function html(relativePath) {
  return readFile(resolve(root, outputDirectory, relativePath, "index.html"), "utf8");
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function rejectMatch(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const lessons = [
  {
    language: "ru",
    text: "Метод контурных токов позволяет заменить множество токов ветвей",
  },
  {
    language: "uk",
    text: "Метод контурних струмів дає змогу замінити множину струмів гілок",
  },
];

for (const lesson of lessons) {
  const lessonHtml = await html(
    `${lesson.language}/topics/dc/mesh-current-method`,
  );

  requireMatch(
    lessonHtml,
    new RegExp(lesson.text),
    `${lesson.language} lesson is missing visible MDX content.`,
  );
  requireMatch(
    lessonHtml,
    /<article class="lesson-intro">[\s\S]*?<\/article>[\s\S]*?<astro-island/,
    `${lesson.language} lesson does not render MDX before its interactive island.`,
  );
  if (countMatches(lessonHtml, /<h1(?:\s|>)/g) !== 1) {
    throw new Error(`${lesson.language} mesh lesson must contain exactly one h1.`);
  }
  if (countMatches(lessonHtml, /<article class="lesson-intro">/g) !== 1) {
    throw new Error(`${lesson.language} lesson must contain one lesson-intro wrapper.`);
  }
  if (countMatches(lessonHtml, /<article class="lesson-content">/g) !== 1) {
    throw new Error(`${lesson.language} mesh island must contain one lesson-content wrapper.`);
  }
  const introStart = lessonHtml.indexOf('<article class="lesson-intro">');
  const introEnd = lessonHtml.indexOf("</article>", introStart);
  const lessonContentStart = lessonHtml.indexOf(
    '<article class="lesson-content">',
  );
  if (lessonContentStart < introEnd) {
    throw new Error(
      `${lesson.language} lesson-content must not be nested inside lesson-intro.`,
    );
  }
  requireMatch(
    lessonHtml,
    /component-url="[^"]*MeshLessonIsland[^"]*"/,
    `${lesson.language} lesson is missing the MeshLessonIsland hydration marker.`,
  );
  rejectMatch(
    lessonHtml,
    /class="[^"]*sr-only[^"]*"[^>]*>[\s\S]*?Метод контурн/,
    `${lesson.language} lesson hides its primary MDX content from sighted users.`,
  );

  const expectedHref = withBase(`/${lesson.language}/topics/dc/mesh-current-method/`);
  for (const page of ["", "topics"]) {
    const listingHtml = await html(`${lesson.language}/${page}`);
    if (!listingHtml.includes(`href="${expectedHref}"`)) {
      throw new Error(`${lesson.language}/${page || "home"} misses ${expectedHref}.`);
    }
    rejectMatch(
      listingHtml,
      new RegExp(`href="${withBase("/(?:ru|uk)/topics/(?:dc|ac)/(?:ohm|kirchhoff|nodes|power-factor|phasors|resonance|three-phase)/")}"`),
      `${lesson.language}/${page || "home"} links an unpublished topic.`,
    );
  }
}

stdout.write("Built lesson publication audit passed.\n");
