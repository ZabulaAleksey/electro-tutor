import { expect, test } from "@playwright/test";

type Locale = "ru" | "uk";
type RouteContract = {
  slug: string;
  canonical?: string;
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
    label: { ru: "Переходные процессы в длинной линии", uk: "Перехідні процеси в довгій лінії" },
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
  { slug: "reactive-two-port", canonical: "reactive-two-port-graph/experiment", ready: '[data-lc-experiment][data-ready="true"]' },
  { slug: "transmission-line-steady", canonical: "transmission-line-steady/experiment", ready: '[data-steady-experiment][data-ready="true"] [data-steady-experiment-results]' },
  {
    slug: "reactive-two-port-graph",
    canonical: "reactive-two-port-graph/experiment",
    ready: '[data-lc-experiment][data-ready="true"]',
  },
];

for (const language of ["ru", "uk"] as const) {
  test(`${language}: the public directory opens all five current electrical laboratories`, async ({ page }) => {
    for (const { slug, label, ready, activate, canonical } of laboratories) {
      await test.step(slug, async () => {
        const href = `${directory(language)}${slug}/`;
        await page.goto(directory(language));
        const link = page.locator("main #labs").getByRole("link", { name: label[language], exact: true });
        await expect(link).toHaveAttribute("href", href);
        await link.click();
        await expect(page).toHaveURL(`${directory(language)}${canonical ?? slug}/`);
        if (activate) await page.locator(hydratedIsland).locator(activate).click();
        await expect(page.locator(hydratedIsland).locator(ready)).toBeVisible();
      });
    }
  });

  test(`${language}: every published experiment has one full-card route`, async ({ page }) => {
    await page.goto(directory(language));
    const cards = page.locator("main #labs [data-directory-entry] > a.lab-directory-card-link");
    await expect(cards).toHaveCount(language === "ru" ? 39 : 38);
    const hrefs = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(language === "ru" ? 39 : 38);
    const first = cards.first();
    await first.hover({ position: { x: 5, y: 5 } });
    expect(await first.evaluate(link => link.matches(":hover"))).toBe(true);
    await first.focus();
    await expect(first).toBeFocused();
    for (const href of hrefs) {
      expect(href).toMatch(new RegExp(`^${prefix}/${language}/`));
      const response = await page.request.get(href!);
      expect(response.status(), href!).toBe(200);
      const structure = await page.evaluate(html => {
        const main = new DOMParser().parseFromString(html, "text/html").querySelector("main");
        return { headings: main?.querySelectorAll("h1").length, back: main?.querySelector(".laboratory-intro a")?.getAttribute("href") };
      }, await response.text());
      expect(structure, href!).toEqual({ headings: 1, back: directory(language) });
    }
  });

  test(`${language}: bookmarked electrical laboratory URLs still hydrate`, async ({ page }) => {
    for (const { slug, ready, canonical } of compatibilityRoutes) {
      await test.step(slug, async () => {
        const bookmark = canonical ? "?test=1#saved" : "";
        await page.goto(`${directory(language)}${slug}/${bookmark}`);
        await expect(page).toHaveURL(`${directory(language)}${canonical ?? slug}/${bookmark}`);
        await expect(page.locator(hydratedIsland).locator(ready)).toBeVisible();
      });
    }
  });
}
