import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

import {
  interactiveAssignmentError,
  interactiveKeys,
} from "./content/interactive-contract";

const lessons = defineCollection({
  loader: glob({
    base: "./src/content/lessons",
    pattern: "**/*.{md,mdx}",
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ""),
  }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      language: z.enum(["ru", "uk"]),
      section: z.string(),
      slug: z.string(),
      order: z.number(),
      duration: z.number(),
      keywords: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      interactive: z.enum(interactiveKeys).optional(),
    })
    .superRefine(({ interactive, section, slug }, context) => {
      const message = interactiveAssignmentError(interactive, section, slug);
      if (message) {
        context.addIssue({
          code: "custom",
          path: ["interactive"],
          message,
        });
      }
    }),
});

export const collections = { lessons };
