import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import process from "node:process";

const api = "http://127.0.0.1:8000";
const idp = "http://127.0.0.1:58081";
const web = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:4322";
const username = process.env.ET_DEV_TEST_USERNAME || "et-dev-acceptance";
const password = process.env.ET_DEV_TEST_PASSWORD;

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("ET-09.3 real DEV authentication", () => {
  test.skip(!password, "ET_DEV_TEST_PASSWORD is required for live Keycloak acceptance");

  test("authorizes, resolves /me, and logs out", async ({ page }) => {
    const account = `${web}/ru/account/`;
    const originalEmail = process.env.ET_DEV_TEST_EMAIL || "et-dev-acceptance@invalid.example";
    try {
      await page.goto(account);
      await page.getByRole("link", { name: /Войти|Увійти/ }).click();
      await page.getByLabel("Username or email").fill(username);
      await page.getByLabel("Password", { exact: true }).fill(password!);
      await page.getByRole("button", { name: /Sign In|Войти/ }).click();
      await expect(page).toHaveURL(/\/ru\/account\//);
      const me = await page.evaluate(async (url) => (await fetch(`${url}/api/v1/me`, { credentials: "include" })).json(), api);
      expect(me.email).toBe(originalEmail);
      await page.locator("[data-logout-form] button").click();
      await page.getByRole("button", { name: "Logout", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`^${web.replaceAll(".", "\\.")}/`));
      const afterLogout = await page.evaluate(async (url) => (await fetch(`${url}/api/v1/me`, { credentials: "include" })).status, api);
      expect(afterLogout).toBe(401);

      const changedEmail = "et-dev-acceptance-changed@invalid.example";
      execFileSync(process.execPath, ["scripts/keycloak-provision.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, ET_DEV_TEST_EMAIL: changedEmail },
        stdio: "ignore",
      });
      await page.goto(account);
      await page.getByRole("link", { name: /Войти|Увійти/ }).click();
      await page.getByLabel("Username or email").fill(username);
      await page.getByLabel("Password", { exact: true }).fill(password!);
      await page.getByRole("button", { name: /Sign In|Войти/ }).click();
      await expect(page).toHaveURL(/\/ru\/account\//);
      const changed = await page.evaluate(async (url) => (await fetch(`${url}/api/v1/me`, { credentials: "include" })).json(), api);
      expect(changed.identity_id).toBe(me.identity_id);
      expect(changed.email).toBe(changedEmail);
    } finally {
      execFileSync(process.execPath, ["scripts/keycloak-provision.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, ET_DEV_TEST_EMAIL: originalEmail },
        stdio: "ignore",
      });
    }
  });

  test("Keycloak rejects an unregistered redirect URI", async ({ request }) => {
    const response = await request.get(`${idp}/realms/electro-tutor-dev/protocol/openid-connect/auth?client_id=electro-tutor-web-dev&response_type=code&redirect_uri=${encodeURIComponent("http://127.0.0.1:9999/evil")}&scope=openid&state=invalid`, { maxRedirects: 0 });
    expect([400, 403]).toContain(response.status());
  });
});
