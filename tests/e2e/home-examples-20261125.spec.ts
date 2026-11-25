import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

const topics = ["dc", "ac", "three-phase", "transients", "nonlinear", "magnetic", "unbalanced", "long-line"];

for (const language of ["ru", "uk"] as const) {
  test(`EVAL-02 ${language}: fixed examples, language, controls and responsive charts`, async ({ page }, info) => {
    const width = language === "ru" ? 1440 : 390;
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/${language}/`);
    const carousel = page.locator("[data-home-examples]");
    const shown = carousel.locator("article[data-example-topic]:visible");
    const next = carousel.getByRole("button", { name: language === "ru" ? "Следующая тема" : "Наступна тема" });
    await expect(shown).toHaveAttribute("data-example-topic", "dc");
    await expect(shown.getByText(language === "ru" ? "Постоянный ток" : "Постійний струм", { exact: true })).toBeVisible();
    await expect(shown.locator("[data-example-metric=current]")).toContainText("2");
    await expect(shown.locator("[data-example-metric=first-drop]")).toContainText("8");
    await expect(shown.locator("[data-example-metric=second-drop]")).toContainText("16");
    await expect(shown.locator("[data-example-metric=total-drop]")).toContainText("24");
    expect(await shown.locator("[data-stem-amplitude]").evaluateAll(points => points.map(point => Number(point.getAttribute("data-stem-amplitude"))))).toEqual([24, 16, 0]);
    const arrows = await shown.locator("[data-demo-flow]").evaluateAll(lines => lines.map(line => Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"))));
    expect(arrows).toHaveLength(2);
    expect(arrows[0] * arrows[1]).toBeLessThan(0);
    for (const node of ["A", "B", "0"]) {
      await expect(shown.locator("[data-example-figure]").getByText(node, { exact: true })).toBeVisible();
    }
    await carousel.screenshot({ path: info.outputPath("dc.png"), animations: "disabled" });

    for (const id of topics.slice(1)) {
      await next.click();
      await expect(shown).toHaveAttribute("data-example-topic", id);
      await expect(shown.locator(".katex").first()).toBeVisible();
      await expect(shown.locator("[data-example-chart]")).toBeVisible();
      const figure = shown.locator("[data-example-figure] svg[role=img]");
      await expect(figure).toBeVisible();
      await expect(figure).toHaveAccessibleName(/\S+/);
      const title = await shown.locator("h3").innerText();
      await expect(carousel.getByRole("status")).toContainText(title);
      const wrapped = await shown.locator(".example-formulas .katex-display").evaluateAll(formulas =>
        formulas.every(formula => formula.scrollWidth <= formula.clientWidth + 1));
      expect(wrapped, id + " formulas fit the panel").toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }

    await next.press("Home");
    await expect(shown).toHaveAttribute("data-example-topic", "dc");
    await next.press("End");
    await expect(shown).toHaveAttribute("data-example-topic", "long-line");
    if (language === "uk") {
      const figure = shown.locator("[data-example-figure]");
      await figure.scrollIntoViewIfNeeded();
      const box = await figure.boundingBox();
      if (!box) throw new Error("Visible slide figure missing");
      const cdp = await page.context().newCDPSession(page);
      const y = Math.round(box.y + box.height / 2);
      const start = Math.round(box.x + box.width * 0.8);
      const end = Math.round(box.x + box.width * 0.2);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: end, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(shown).toHaveAttribute("data-example-topic", "dc");
      await cdp.detach();
    }
    await expect(carousel.getByRole("tab")).toHaveCount(0);
    await expect(shown.locator("input, select, textarea")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
