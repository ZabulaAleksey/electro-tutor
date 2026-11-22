import { expect, test } from "@playwright/test";

type Locale = "ru" | "uk";
type RouteContract = {
  slug: string;
  ready: string;
  label?: Record<Locale, string>;
  activate?: string;
};

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/+$/, "");
const directory = (language: Locale) => `${prefix}/${language}/interactive/`;
const hydratedIsland = "astro-island:not([ssr])";

const laboratories: (RouteContract & { label: Record<Locale, string> })[] = [
  {
    slug: "transmission-line/experiment",
    label: { ru: "Переходные процессы в длинных линиях", uk: "Перехідні процеси в довгих лініях" },
    activate: '[data-line-section="TL1"]',
    ready: '[data-line-a-results][data-calculation-ready="true"]',
  },
  {
    slug: "transmission-line-steady/experiment",
    label: { ru: "Длинная линия в синусоидальном режиме", uk: "Довга лінія в синусоїдному режимі" },
    ready: '[data-steady-experiment][data-ready="true"] [data-steady-experiment-results]',
  },
  {
    slug: "transmission-line-variable",
    label: { ru: "Длинная линия с переменными параметрами", uk: "Довга лінія зі змінними параметрами" },
    ready: '[data-variable-line-lab][data-ready="true"]',
  },
  {
    slug: "reactive-two-port-graph/experiment",
    label: { ru: "LC-двухполюсник", uk: "LC-двополюсник" },
    ready: '[data-lc-experiment][data-ready="true"]',
  },
  {
    slug: "power-system",
    label: { ru: "Электрические системы и сети", uk: "Електричні системи й мережі" },
    ready: '[data-power-ready="true"]',
  },
];

const compatibilityRoutes: RouteContract[] = [
  { slug: "transmission-line", ready: '[data-network-lab][data-calculation-ready="true"]' },
  {
    slug: "transmission-line-steady",
    label: { ru: "Синусоидальная линия · прежний опыт", uk: "Синусоїдна лінія · попередній дослід" },
    ready: '[data-steady-line][data-ready="true"]',
  },
  {
    slug: "reactive-two-port-graph",
    label: { ru: "Реактивный LC-граф", uk: "Реактивний LC-граф" },
    ready: '[data-lc-graph-ready="true"]',
  },
];

for (const language of ["ru", "uk"] as const) {
  test(`${language}: the public directory opens all five current electrical laboratories`, async ({ page }) => {
    for (const { slug, label, ready, activate } of laboratories) {
      await test.step(slug, async () => {
        const href = `${directory(language)}${slug}/`;
        await page.goto(directory(language));
        const link = page.locator("main #labs").getByRole("link", { name: label[language], exact: true });
        await expect(link).toHaveAttribute("href", href);
        await link.click();
        await expect(page).toHaveURL(href);
        if (activate) await page.locator(hydratedIsland).locator(activate).click();
        await expect(page.locator(hydratedIsland).locator(ready)).toBeVisible();
      });
    }
  });

  test(`${language}: bookmarked electrical laboratory URLs still hydrate`, async ({ page }) => {
    for (const { slug, label, ready } of compatibilityRoutes) {
      await test.step(slug, async () => {
        const href = `${directory(language)}${slug}/`;
        if (label) {
          await page.goto(directory(language));
          const link = page.locator("main #labs").getByRole("link", { name: label[language], exact: true });
          await expect(link).toHaveAttribute("href", href);
          await link.click();
          await expect(page).toHaveURL(href);
          await expect(page.locator(hydratedIsland).locator(ready)).toBeVisible();
        }
        await page.goto(href);
        await expect(page).toHaveURL(href);
        await expect(page.locator(hydratedIsland).locator(ready)).toBeVisible();
      });
    }
  });
}
