import type { ComponentType } from "react";

import MeshLessonIsland from "../components/MeshLessonIsland";
import type { Language } from "../types";
import {
  type InteractiveKey,
  type InteractiveTarget,
  interactiveTargets,
} from "./interactive-contract";

export interface InteractiveDescriptor extends InteractiveTarget {
  component: ComponentType<{ language: Language }>;
}

export const interactiveRegistry = {
  "mesh-lesson": {
    ...interactiveTargets["mesh-lesson"],
    component: MeshLessonIsland,
  },
} as const satisfies Record<InteractiveKey, InteractiveDescriptor>;
