import { expect, test } from "@playwright/test";

test("public learner can answer, complete, leave and resume the authored lesson", async ({ page }) => {
  await page.goto("/ru/topics/dc/mesh-current-method/");
  await expect(page.getByRole("heading", { name: "Проверьте ток общей ветви" })).toBeVisible();

  const answer = page.getByLabel("Ваш ответ");
  await answer.fill("not a number");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator("#practice-feedback")).toContainText("Введите число");

  await answer.fill("2,18");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator("#practice-feedback")).toContainText("Урок отмечен завершённым");
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("potential-learning:v1:guest");
    return raw ? JSON.parse(raw).lessons["mesh-current-method"]?.completed : false;
  })).toBe(true);

  await page.goto("/ru/");
  await expect(page.locator("[data-learning-summary]")).toContainText("Урок завершён");
  await page.getByRole("link", { name: "Урок завершён" }).click();
  await expect(page).toHaveURL(/\/ru\/topics\/dc\/mesh-current-method\/#step-5$/);
  await expect(page.locator("#practice-feedback")).toContainText("Урок отмечен завершённым");
});
