export const interactiveKeys = ["mesh-lesson"] as const;

export type InteractiveKey = (typeof interactiveKeys)[number];

export interface InteractiveTarget {
  section: string;
  slug: string;
}

export const interactiveTargets = {
  "mesh-lesson": {
    section: "dc",
    slug: "mesh-current-method",
  },
} as const satisfies Record<InteractiveKey, InteractiveTarget>;

export function isInteractiveKey(value: unknown): value is InteractiveKey {
  return typeof value === "string" && interactiveKeys.includes(value as InteractiveKey);
}

export function interactiveAssignmentError(
  interactive: InteractiveKey | undefined,
  section: string,
  slug: string,
): string | undefined {
  if (!interactive) {
    return undefined;
  }

  const target = interactiveTargets[interactive];
  if (target.section === section && target.slug === slug) {
    return undefined;
  }

  return `Interactive "${interactive}" is only allowed for ${target.section}/${target.slug}.`;
}
