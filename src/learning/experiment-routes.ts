import { scienceCatalog } from "../science/models";
import { microLabs } from "../showcase/micro-catalog";

export const experiments = [
  ...microLabs.map(model => ({ family: "micro" as const, model })),
  ...scienceCatalog.map(model => ({ family: "science" as const, model })),
];
export type Experiment = typeof experiments[number];

export function experimentPath(family: Experiment["family"], id: string) {
  return `/interactive/experiments/${family}/${id}/`;
}

export function experimentForHref(href: string) {
  const match = href.match(/\/micro-labs\/#(micro|science)=([a-z0-9-]+)$/);
  return match && experiments.find(({ family, model }) => family === match[1] && model.id === match[2]);
}
