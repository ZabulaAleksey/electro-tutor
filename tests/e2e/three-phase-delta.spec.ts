import { expect, test } from "@playwright/test";

test("one star with switched neutral, bidirectional neutral fields and restored source", async ({ page }) => {
  await page.goto("/ru/interactive/star-neutral/");
  const connected = page.getByRole("switch");
  const point = page.locator(".star-phase-n circle");
  await expect(connected).not.toBeChecked();
  await expect(point).toHaveCount(0);
  await connected.check();
  await expect(point).toHaveAttribute("cx", "250");
  await expect(point).toHaveAttribute("cy", "250");
  const fields = page.getByRole("group", { name: "Нейтраль — ZN" });
  const r = fields.getByRole("spinbutton", { name: "R, Ω", exact: true });
  const x = fields.getByRole("spinbutton", { name: "X, Ω", exact: true });
  await r.fill("12");
  await x.fill("-4");
  await expect.poll(async () => Number(await point.getAttribute("cy"))).toBeGreaterThan(250);
  const u = page.locator(".star-results tbody tr").first();
  const finite = (await u.textContent())!;
  await connected.uncheck();
  await expect(point).toHaveCount(0);
  await expect(u).not.toHaveText(finite);
  await connected.check();
  await expect(r).toHaveValue("12");
  await expect(x).toHaveValue("-4");
  await expect(u).toHaveText(finite);
  await expect(page.getByLabel("Соединение нагрузки")).toHaveCount(0);
  await expect(page.getByText("Самостоятельное построение", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-vector=current-N]")).toBeVisible();
  await page.getByLabel("Независимые фазоры источника").check();
  await page.getByLabel("|UA|, V", { exact: true }).fill("180");
  await page.getByLabel("φB, °", { exact: true }).fill("-100");
  await page.reload();
  await expect(connected).toBeChecked();
  await expect(r).toHaveValue("12");
  await expect(page.getByLabel("|UA|, V", { exact: true })).toHaveValue("180");
  await expect(page.getByLabel("φB, °", { exact: true })).toHaveValue("-100");
});

test("opening the star preserves an existing delta draft across subsequent edits", async ({ page }) => {
  const previous = JSON.stringify({
    version: 1, topology: "delta", parameters: {
      uPhase: 181, mode: "ideal", neutral: { re: 0, im: 0 },
      phases: { A: { re: 10, im: 1 }, B: { re: 20, im: 2 }, C: { re: 30, im: 3 } },
    },
  });
  await page.addInitScript(draft => {
    if (!localStorage.getItem("electrotutor-three-phase-v1")) localStorage.setItem("electrotutor-three-phase-v1", draft);
  }, previous);
  await page.goto("/ru/interactive/star-neutral/");
  const neutral = page.getByRole("switch");
  await expect(neutral).toBeEnabled();
  await expect(neutral).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("electrotutor-star-v1"))).toBeNull();
  await neutral.check();
  await page.reload();
  await expect(neutral).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("electrotutor-three-phase-v1"))).toBe(previous);
});
