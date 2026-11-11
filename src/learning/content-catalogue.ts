import { isPublicPage } from "../../scripts/public-mvp-contract.mjs";
import { catalogueCategoryLabels, catalogueItems, engineeringTools } from "../catalogue/catalog";
import { curriculum } from "../curriculum";
import { localePath } from "../site-path";
import type { Language } from "../types";
import type { LearningGroup } from "./navigation";

export interface ContentLink {
  href: string;
  title: string;
  description?: string;
  featured?: boolean;
  variants?: ContentLink[];
}

export type ContentKind = "labs" | "tools";
export interface Resource extends ContentLink {
  kind: ContentKind;
  category: string;
  categoryTitle: string;
}

export function buildContentCatalogue(groups: LearningGroup[], language: Language, mvp: boolean) {
  const availableInBuild = (path: string) => !mvp || isPublicPage(localePath(language, path).split(/[?#]/)[0], import.meta.env.BASE_URL);
  const items = [...catalogueItems, ...engineeringTools].filter(item => item.available && availableInBuild(item.href));
  const resourcesById = new Map<string, Resource>(items.map(item => [item.id, {
    kind: item.kind === "tool" ? "tools" : "labs",
    category: item.subject ?? item.category,
    categoryTitle: catalogueCategoryLabels[item.subject ?? item.category][language],
    title: item.title[language],
    description: item.description?.[language],
    href: localePath(language, item.href),
    featured: item.source === "advanced" && item.kind !== "tool",
    variants: item.variants?.filter(variant => availableInBuild(variant.href))
      .map(variant => ({ title: variant.title[language], href: localePath(language, variant.href) })),
  } satisfies Resource]));
  const resourcesByHref = new Map([...resourcesById.values()].map(resource => [resource.href, resource]));
  const subjects = groups.filter(group => group.id.startsWith("subject:")).map(group => {
    const sectionId = group.id.slice("subject:".length);
    const title = group.title[language];
    const topics = group.entries.flatMap(entry => {
      const topicId = entry.id.slice("topic:".length);
      const associated = new Set<Resource>();
      const labHref = entry.components.lab.href;
      if (labHref) {
        let lab = resourcesByHref.get(labHref);
        if (!lab) {
          lab = { kind: "labs", category: sectionId, categoryTitle: sectionId === "dc" ? catalogueCategoryLabels.dc[language] : title, title: entry.title[language],
            description: entry.description[language], href: labHref, featured: true };
          resourcesByHref.set(labHref, lab);
        }
        associated.add(lab);
      }
      for (const link of entry.relatedTools) {
        const related = resourcesById.get(link.id);
        if (related) associated.add(related);
      }
      for (const item of items) {
        if (item.topicIds?.includes(topicId)) {
          const resource = resourcesById.get(item.id);
          if (resource) associated.add(resource);
        }
      }
      const theory = entry.components.textbook.href;
      const examples = entry.components.examples.href;
      if (!theory && !examples && !associated.size) return [];
      return [{ id: topicId.split("/")[1], title: entry.title[language], theory, examples,
        labs: [...associated].filter(resource => resource.kind === "labs"),
        tools: [...associated].filter(resource => resource.kind === "tools") }];
    });
    return { id: sectionId, title, topics };
  }).filter(subject => subject.topics.length > 0);

  return { subjects, resources: [...resourcesByHref.values()] };
}

export type ContentTopic = ReturnType<typeof buildContentCatalogue>["subjects"][number]["topics"][number];

export function getStandaloneLessons(
  published: readonly { language: Language; section: string; slug: string; entry: { data: { title: string } } }[],
  language: Language,
): ContentLink[] {
  const topicKeys = new Set(curriculum.flatMap(section => section.topics.map(topic => `${section.id}/${topic.lessonSlug ?? topic.id}`)));
  return published.filter(lesson => lesson.language === language && !topicKeys.has(`${lesson.section}/${lesson.slug}`))
    .map(lesson => ({ title: lesson.entry.data.title, href: localePath(language, `/topics/${lesson.section}/${lesson.slug}/`) }));
}
