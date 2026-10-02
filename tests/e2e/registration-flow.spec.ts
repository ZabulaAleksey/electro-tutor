import { randomUUID } from "node:crypto";
import process from "node:process";
import { expect, test } from "@playwright/test";

const web = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:4322";
const api = "http://127.0.0.1:8000/api/v1";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("RC1 local provider registration creates a student-only session", async ({ page }) => {
  test.skip(
    process.env.E2E_AUTH_PHASE !== "registration",
    "registration phase requires an isolated local Keycloak provider",
  );
  test.setTimeout(180_000);

  const suffix = randomUUID().replaceAll("-", "");
  const username = `et-rc1-${suffix}`;
  const email = `${username}@invalid.example`;
  const password = `Rc1-${randomUUID()}-Aa1!`;

  await page.goto(`${web}/ru/account/`);
  await page.getByRole("link", { name: /Войти|Увійти/ }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:58081\/realms\/electro-tutor-dev/);
  await page.getByRole("link", { name: /Register|Регистрация|Реєстрація/ }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("First name").fill("RC1");
  await page.getByLabel("Last name").fill("Student");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel(/Password confirmation|Confirm password/).fill(password);
  await page.getByRole("button", { name: /Register|Регистрация|Реєстрація/ }).click();

  await expect(page).toHaveURL(new RegExp(`${web.replaceAll(".", "\\.")}/ru/account/`));
  const me = await page.evaluate(async (url) => {
    const response = await fetch(`${url}/me`, { credentials: "include" });
    return { status: response.status, body: await response.json() };
  }, api);
  expect(me.status).toBe(200);
  expect(me.body.email).toBe(email);
  expect(me.body).not.toHaveProperty("account_id");

  const student = page.getByRole("region", { name: "Профиль ученика" });
  await student.getByLabel("Отображаемое имя").fill("RC1 registration student");
  await student.getByRole("button", { name: /Создать профиль|Сохранить изменения/ }).click();
  await expect(student.getByRole("status")).toHaveText("Изменения сохранены.");

  const tutor = await page.evaluate(async (url) => {
    const response = await fetch(`${url}/profiles/tutor/me`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Must not become tutor" }),
    });
    return { status: response.status, body: await response.json() };
  }, api);
  expect(tutor.status).toBe(403);

  const foreign = await page.evaluate(async (url) => {
    const response = await fetch(`${url}/profiles/student/00000000-0000-4000-8000-000000000000`, {
      credentials: "include",
    });
    return { status: response.status, body: await response.json() };
  }, api);
  expect(foreign.status).toBe(404);
  expect(foreign.body.error?.code).toBe("profile_not_found");
});
