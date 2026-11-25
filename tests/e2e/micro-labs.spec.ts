import { expect, test } from "@playwright/test";
import { microLabs } from "../../src/showcase/micro-catalog";

const catalogue = "/ru/micro-labs/";
const experimentPath = (id: string) => "/ru/interactive/experiments/micro/" + id + "/";
const microCardLinks = '[data-lab-card][href*="/interactive/experiments/micro/"]';

test("all fourteen micro models recalculate and reset real values", async ({ page }) => {
  test.slow();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(catalogue);
  await expect(page.locator(microCardLinks)).toHaveCount(14);
  for (const { id } of microLabs) {
    await test.step(id, async () => {
      await page.goto(experimentPath(id));
      const card = page.locator('[data-micro="' + id + '"]');
      const controls = card.getByRole("slider"), first = controls.first(), initial = await first.inputValue();
      const output = card.locator("[data-micro-result]").first().locator("strong"), before = await output.innerText();
      await first.press("End"); await expect(output).not.toHaveText(before);
      await expect(card.locator(".micro-circuit")).toBeVisible(); await expect(card.locator(".micro-plot")).toBeVisible();
      await card.getByRole("button", { name: "Сброс ↺", exact: true }).click(); await expect(first).toHaveValue(initial); await expect(output).toHaveText(before);
      await expect(page.locator(".katex-error")).toHaveCount(0);
    });
  }
  expect(errors).toEqual([]);
});

test("categories, keyboard and search preserve the edited experiment state", async ({ page }) => {
  await page.goto(catalogue);
  const ohmLink = page.getByRole("link", { name: "Закон Ома", exact: true });
  await ohmLink.click();
  await expect(page).toHaveURL(experimentPath("ohm-law"));
  const ohm = page.locator('[data-micro="ohm-law"]');
  const voltage = ohm.getByRole("slider", { name: "U, V", exact: true });
  await voltage.fill("48");
  await expect(ohm.locator('[data-micro-result="I"]')).toContainText("0,8");

  await page.goBack();
  const filter = page.locator("[data-directory-category-filter]");
  await filter.selectOption({ label: "Электропривод" });
  await expect(page.locator(microCardLinks + ":visible")).toHaveCount(1);
  await filter.selectOption("all");
  const last = await filter.locator("option").last().getAttribute("value");
  expect(last).not.toBeNull();
  expect(last).not.toBe("all");
  await filter.press("End");
  await expect(filter).toHaveValue(last!);
  await filter.selectOption("all");
  const search = page.locator("[data-directory-search]");
  await search.fill("RC");
  await expect(page.locator(microCardLinks + ":visible")).toHaveCount(1);
  await search.fill("Закон Ома");
  await expect(page.locator(microCardLinks + ":visible")).toHaveCount(1);
  await ohmLink.click();
  await expect(voltage).toHaveValue("48");
  await expect(ohm.locator('[data-micro-result="I"]')).toContainText("0,8");
});

test("time is shared by RC result, cursor and physical parameter changes", async ({ page }) => {
  await page.goto("/ru/micro-labs/#micro=capacitor-charge"); const card = page.locator('[data-micro="capacitor-charge"]');
  const time = card.getByRole("slider", { name: "Время t, s", exact: true });
  await time.press("Home"); await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("0 V");
  await time.press("End"); await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("11,919");
  await card.getByRole("slider", { name: "C, µF", exact: true }).press("End"); await expect(card.locator('[data-micro-result="τ"]')).toContainText("2 s"); await expect(card.locator("[data-micro-time]")).toHaveText("5");
  await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("11,015");
});

test("permanent micro link survives reload and RU/UK change", async ({ page }) => {
  await page.goto("/ru/micro-labs/#micro=dc-motor-start"); const card = page.locator('[data-micro="dc-motor-start"]');
  await expect(card).toHaveAttribute("data-selected", "true"); await page.reload(); await expect(card).toHaveAttribute("data-selected", "true");
  await page.locator(".language-switcher__trigger").click(); await page.locator("a[data-language-link]").click(); await expect(page).toHaveURL(/\/uk\/micro-labs\/#micro=dc-motor-start$/);
  await expect(card).toHaveAttribute("data-selected", "true"); await expect(card.locator("h3")).toHaveText("Розгін двигуна");
});

for (const theme of ["light", "dark"] as const) {
  test("micro cards and experiments fit mobile and desktop in " + theme + " with reduced motion", async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(catalogue);
      await expect(page.locator(microCardLinks)).toHaveCount(14);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const { id } of microLabs) {
        await test.step(id + " at " + width + "px", async () => {
          await page.goto(experimentPath(id));
          const card = page.locator('[data-micro="' + id + '"]');
          await expect(card).toBeVisible();
          const within = await card.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll("svg,input,footer")].every(child => {
              const childBounds = child.getBoundingClientRect();
              return childBounds.left >= bounds.left && childBounds.right <= bounds.right + 1;
            });
          });
          expect(within).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await expect(page.locator(".katex-error")).toHaveCount(0);
        });
      }
    }
  });
}

test("micro equations stay fully readable without horizontal formula scrolling at 390px", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const { id } of microLabs) {
    await test.step(id, async () => {
      await page.goto(experimentPath(id));
      const equations = page.locator('[data-micro="' + id + '"] .micro-formula .katex-display');
      await expect(equations.first()).toBeVisible();
      const overflowing = await equations.evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.closest("[data-micro]")?.getAttribute("data-micro")));
      expect(overflowing).toEqual([]);
    });
  }
});
