import { describe, expect, it } from "vitest";
import { buildContentCatalogue } from "./content-catalogue";
import { buildLearningNavigation } from "./navigation";

const published = [
  { language: "ru", section: "dc", slug: "mesh-current-method" },
  { language: "uk", section: "dc", slug: "mesh-current-method" },
] as const;

describe("published content catalogue", () => {
  it("shows the experiment and calculator for a topic before a lesson is published", () => {
    const catalogue = buildContentCatalogue(buildLearningNavigation(published, "ru"), "ru", false);
    const ohm = catalogue.subjects.find(subject => subject.id === "dc")?.topics.find(topic => topic.id === "ohm");
    expect(ohm?.theory).toBeNull();
    expect(ohm?.labs.map(lab => lab.href)).toContain("/ru/micro-labs/#micro=ohm-law");
    expect(ohm?.tools.map(tool => tool.href)).toContain("/ru/engineering-board/");
    expect(new Set(catalogue.resources.map(resource => resource.href)).size).toBe(catalogue.resources.length);
  });

  it("uses the new paired lesson without changing navigation metadata", () => {
    const lesson = { language: "uk", section: "dc", slug: "ohm" } as const;
    const catalogue = buildContentCatalogue(buildLearningNavigation([...published, lesson], "uk"), "uk", false);
    const ohm = catalogue.subjects.find(subject => subject.id === "dc")?.topics.find(topic => topic.id === "ohm");
    expect(ohm?.theory).toBe("/uk/topics/dc/ohm/");
    expect(ohm?.labs.map(lab => lab.href)).toContain("/uk/micro-labs/#micro=ohm-law");
  });

  it("keeps the MVP catalogue inside the published RU routes", () => {
    const catalogue = buildContentCatalogue(buildLearningNavigation(published, "ru", true), "ru", true);
    expect(catalogue.resources.map(resource => resource.href)).toEqual(["/ru/topics/dc/mesh-current-method/lab/"]);
    expect(catalogue.subjects.flatMap(subject => subject.topics).map(topic => topic.id)).toEqual(["mesh"]);
  });
});
