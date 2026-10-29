import { microLabs, type MicroGroup } from "../showcase/micro-catalog";
import { scienceCatalog, type ScienceCategory } from "../science/models";
import type { Language } from "../types";
import { localePath } from "../site-path";

export type CatalogueSource = "micro" | "science" | "advanced";
export type CatalogueVisual = "circuit" | "waves" | "phasors" | "fourier" | "science" | "beam" | "rc" | "rlc" | "three-phase" | "neutral";
export type CatalogueCategory = "dc" | "ac" | "three" | "transient" | "electronics" | "control" | "drive" | "waves" | "science" | "advanced";
export type CataloguePanorama = "dc" | "transient" | "machines" | "lines";
export type CatalogueItem = { id: string; source: CatalogueSource; category: CatalogueCategory; categoryLabel: { ru: string; uk: string }; title: { ru: string; uk: string }; description?: { ru: string; uk: string }; action?: { ru: string; uk: string }; href: string; visual: CatalogueVisual; panorama?: CataloguePanorama; available: boolean };

const categoryLabels: Record<CatalogueCategory, { ru: string; uk: string }> = {
  dc: { ru: "Постоянный ток", uk: "Постійний струм" }, ac: { ru: "Переменный ток", uk: "Змінний струм" }, three: { ru: "Трёхфазные цепи", uk: "Трифазні кола" }, transient: { ru: "Переходные процессы", uk: "Перехідні процеси" },
  electronics: { ru: "Электроника", uk: "Електроніка" }, control: { ru: "Автоматика", uk: "Автоматика" }, drive: { ru: "Электропривод", uk: "Електропривід" }, waves: { ru: "Волны", uk: "Хвилі" }, science: { ru: "Математика и наука", uk: "Математика та наука" }, advanced: { ru: "Лаборатории", uk: "Лабораторії" },
};
const microVisual: Record<MicroGroup, CatalogueVisual> = { dc: "circuit", ac: "phasors", three: "three-phase", transient: "waves", electronics: "circuit", control: "fourier", drive: "phasors", waves: "waves" };
const scienceVisual: Record<ScienceCategory, CatalogueVisual> = { math: "science", mechanics: "neutral", fluids: "neutral", waves: "waves", thermo: "neutral", optics: "neutral" };
const scienceCategory = (category: ScienceCategory): CatalogueCategory => category === "waves" ? "waves" : "science";

const microPanorama: Partial<Record<MicroGroup, CatalogueItem["panorama"]>> = { dc: "dc", electronics: "dc", transient: "transient", drive: "machines", waves: "lines" };
const microItems: CatalogueItem[] = microLabs.map((lab) => ({ id: `micro:${lab.id}`, source: "micro", category: lab.category, categoryLabel: categoryLabels[lab.category], title: lab.title, description: lab.assumption, action: { ru: "Открыть эксперимент", uk: "Відкрити експеримент" }, href: `/micro-labs/#micro=${encodeURIComponent(lab.id)}`, visual: lab.id.startsWith("capacitor-") ? "rc" : lab.id === "rlc-resonance" ? "rlc" : microVisual[lab.category], panorama: microPanorama[lab.category], available: true }));
const scienceItems: CatalogueItem[] = scienceCatalog.map((item) => { const category = scienceCategory(item.category); return { id: `science:${item.id}`, source: "science", category, categoryLabel: categoryLabels[category], title: item.title, description: item.description, action: { ru: "Открыть каталог", uk: "Відкрити каталог" }, href: `/micro-labs/#science=${encodeURIComponent(item.id)}`, visual: scienceVisual[item.category], available: true }; });
const advancedItems: CatalogueItem[] = [
  { id: "advanced:beam", source: "advanced", category: "advanced", categoryLabel: categoryLabels.advanced, title: { ru: "Балка и опоры", uk: "Балка та опори" }, description: { ru: "Соберите расчётную модель и проверьте реакции.", uk: "Зберіть розрахункову модель і перевірте реакції." }, action: { ru: "Собрать балку", uk: "Зібрати балку" }, href: "/interactive/beam/", visual: "beam", available: true },
  { id: "advanced:star-neutral", source: "advanced", category: "advanced", categoryLabel: categoryLabels.advanced, title: { ru: "Несимметричная звезда", uk: "Несиметрична зірка" }, description: { ru: "Фазоры токов, напряжений и нейтрали.", uk: "Фазори струмів, напруг і нейтралі." }, action: { ru: "Открыть векторную диаграмму звезды", uk: "Відкрити векторну діаграму зірки" }, href: "/interactive/star-neutral/", visual: "three-phase", available: true },
  { id: "advanced:circular-diagram", source: "advanced", category: "advanced", categoryLabel: categoryLabels.advanced, title: { ru: "Круговая диаграмма", uk: "Кругова діаграма" }, description: { ru: "Годограф тока четырёхполюсника.", uk: "Годограф струму чотириполюсника." }, action: { ru: "Открыть круговую диаграмму", uk: "Відкрити кругову діаграму" }, href: "/interactive/circular-diagram/", visual: "phasors", available: true },
  { id: "advanced:transmission-line", source: "advanced", category: "advanced", categoryLabel: categoryLabels.advanced, title: { ru: "Переходные процессы в линии", uk: "Перехідні процеси в лінії" }, description: { ru: "Прямые и отражённые волны без потерь.", uk: "Прямі та відбиті хвилі без втрат." }, action: { ru: "Открыть линию", uk: "Відкрити лінію" }, href: "/interactive/transmission-line/", visual: "waves", panorama: "lines", available: true },
  { id: "advanced:fourier", source: "advanced", category: "advanced", categoryLabel: categoryLabels.advanced, title: { ru: "Фурье и эпициклы", uk: "Фур’є та епіцикли" }, description: { ru: "Синтез сигнала из гармоник.", uk: "Синтез сигналу з гармонік." }, action: { ru: "Открыть лабораторию Фурье", uk: "Відкрити лабораторію Фур’є" }, href: "/interactive/fourier/", visual: "fourier", available: true },
];

/** Single shared catalogue: 14 Micro Labs + 12 science labs + 5 advanced labs. */
export const catalogueItems: readonly CatalogueItem[] = [...advancedItems, ...microItems, ...scienceItems];
export const catalogueCategories = Object.keys(categoryLabels) as CatalogueCategory[];
export const catalogueCategoryLabels = categoryLabels;
export const cataloguePath = (language: Language, href: string) => localePath(language, href.startsWith("/") ? href : `/${href}`);
export function filterCatalogue(items: readonly CatalogueItem[], language: Language, category: CatalogueCategory | "all", query: string) { const term = query.trim().toLocaleLowerCase(); return items.filter((item) => (category === "all" || item.category === category) && `${item.title[language]} ${item.categoryLabel[language]} ${item.id}`.toLocaleLowerCase().includes(term)); }
