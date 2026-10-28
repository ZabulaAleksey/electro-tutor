import { expect, test } from "@playwright/test";

test("all fourteen micro models recalculate and reset real values", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ru/"); const cards = page.locator("[data-micro]"); await expect(cards).toHaveCount(14);
  for (const card of await cards.all()) {
    const controls = card.getByRole("slider"), first = controls.first(), initial = await first.inputValue();
    const output = card.locator("[data-micro-result]").first().locator("strong"), before = await output.innerText();
    await first.press("End"); await expect(output).not.toHaveText(before);
    await expect(card.locator(".micro-circuit")).toBeVisible(); await expect(card.locator(".micro-plot")).toBeVisible();
    await card.getByRole("button", { name: "Сброс ↺", exact: true }).click(); await expect(first).toHaveValue(initial); await expect(output).toHaveText(before);
  }
  await expect(page.locator(".katex-error")).toHaveCount(0); expect(errors).toEqual([]);
});

test("categories, keyboard and search preserve edited card state", async ({ page }) => {
  await page.goto("/ru/"); const section = page.locator("#micro-labs"), ohm = page.locator('[data-micro="ohm-law"]');
  await ohm.getByRole("slider", { name: "U, V", exact: true }).fill("48"); await expect(ohm.locator('[data-micro-result="I"]')).toContainText("0,8");
  await section.getByRole("tab", { name: "Электропривод", exact: true }).click(); await expect(section.locator("[data-micro]")).toHaveCount(1);
  await section.getByRole("tab", { name: "Все эксперименты", exact: true }).click(); await expect(ohm.getByRole("slider", { name: "U, V", exact: true })).toHaveValue("48");
  await section.getByRole("tab", { name: "Все эксперименты", exact: true }).press("End"); await expect(section.getByRole("tab", { name: "Волны", exact: true })).toHaveAttribute("aria-selected", "true");
  await section.getByRole("tab", { name: "Все эксперименты", exact: true }).click(); await section.getByRole("textbox", { name: "Найти мини-эксперимент", exact: true }).fill("RC"); await expect(section.locator("[data-micro]")).toHaveCount(1);
});

test("time is shared by RC result, cursor and physical parameter changes", async ({ page }) => {
  await page.goto("/ru/#micro=capacitor-charge"); const card = page.locator('[data-micro="capacitor-charge"]');
  const time = card.getByRole("slider", { name: "Время t, s", exact: true });
  await time.press("Home"); await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("0 V");
  await time.press("End"); await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("11,919");
  await card.getByRole("slider", { name: "C, µF", exact: true }).press("End"); await expect(card.locator('[data-micro-result="τ"]')).toContainText("2 s"); await expect(card.locator("[data-micro-time]")).toHaveText("5");
  await expect(card.locator('[data-micro-result="uC(t)"]')).toContainText("11,015");
});

test("permanent micro link survives reload and RU/UK change", async ({ page }) => {
  await page.goto("/ru/#micro=dc-motor-start"); const card = page.locator('[data-micro="dc-motor-start"]');
  await expect(card).toHaveAttribute("data-selected", "true"); await page.reload(); await expect(card).toHaveAttribute("data-selected", "true");
  await page.locator("a[data-language-link]").click(); await expect(page).toHaveURL(/\/uk\/#micro=dc-motor-start$/);
  await expect(card).toHaveAttribute("data-selected", "true"); await expect(card.locator("h3")).toHaveText("Розгін двигуна");
});

for (const theme of ["light", "dark"] as const) test(`micro cards fit mobile and desktop in ${theme} with reduced motion`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/ru/#micro=ohm-law"); await expect(page.locator("[data-micro]")).toHaveCount(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const card of await page.locator("[data-micro]").all()) {
      const within = await card.evaluate(element => { const r = element.getBoundingClientRect(); return [...element.querySelectorAll("svg,input,footer")].every(child => { const c = child.getBoundingClientRect(); return c.left >= r.left && c.right <= r.right + 1; }); });
      expect(within).toBe(true);
    }
    await expect(page.locator(".katex-error")).toHaveCount(0);
  }
});

test("micro equations stay fully readable without horizontal formula scrolling at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/ru/#micro=ohm-law");
  const overflowing = await page.locator(".micro-formula .katex-display").evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.closest("[data-micro]")?.getAttribute("data-micro")));
  expect(overflowing).toEqual([]);
});
