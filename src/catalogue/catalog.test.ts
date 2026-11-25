import { expect, it } from "vitest";
import { catalogueItems, filterCatalogue } from "./catalog";

it("indexes each published laboratory once and preserves deep-link identities", () => {
  expect(catalogueItems).toHaveLength(39);
  expect(new Set(catalogueItems.map(item => item.id)).size).toBe(39);
  expect(catalogueItems.find(item => item.id === "advanced:three-phase-sequences")?.href).toBe("/interactive/three-phase-sequences/");
  expect(catalogueItems.find(item => item.id === "advanced:power-system")?.href).toBe("/interactive/power-system/");
  expect(catalogueItems.find(item => item.id === "advanced:transmission-line")?.title.ru).toBe("Переходные процессы в длинной линии");
  expect(catalogueItems.find(item => item.id === "advanced:fourier-polygon-motion")?.title.ru).toBe("Аппроксимация контура");
  expect(catalogueItems.filter(item => item.source === "advanced").every(item => !item.variants)).toBe(true);
  expect(catalogueItems.find(item => item.id === "advanced:transmission-line-steady")?.href).toBe("/interactive/transmission-line-steady/experiment/");
  expect(catalogueItems.find(item => item.id === "advanced:reactive-two-port")?.href).toBe("/interactive/reactive-two-port-graph/experiment/");
  expect(catalogueItems.filter(item => item.source === "micro").every(item => item.href.startsWith("/interactive/experiments/micro/"))).toBe(true);
  expect(catalogueItems.filter(item => item.source === "science").every(item => item.href.startsWith("/interactive/experiments/science/"))).toBe(true);
  for (const item of catalogueItems) {
    expect(item.available).toBe(true);
    expect(item.href).toMatch(/^(?:\/interactive\/(?:experiments\/(?:micro|science)\/[a-z0-9-]+|[a-z-]+(?:\/[a-z-]+)*)|\/topics\/[a-z-]+\/[a-z-]+\/lab)\//);
    expect(item.title.ru.trim()).not.toBe("");
    expect(item.title.uk.trim()).not.toBe("");
  }
  expect(filterCatalogue(catalogueItems, "ru", "all", "балка").map(item => item.href)).toEqual(["/interactive/beam/"]);
  expect(filterCatalogue(catalogueItems, "uk", "all", "контурные")).toEqual([]);
});

it("does not label science experiments with unrelated electrical equipment photos", () => {
  const science = catalogueItems.filter(item => item.source === "science");
  expect(science).toHaveLength(12);
  for (const item of science) expect(item.panorama).toBeUndefined();
});
