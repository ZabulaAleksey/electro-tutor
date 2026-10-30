import type { Page } from "@playwright/test";

/** UI-only fixture: an empty identity response exercises the existing guest fallback.
 * Live API/session/OIDC contracts are tested separately; this is not backend E2E evidence.
 */
export async function useUnavailableIdentity(page: Page) {
  await page.route("http://127.0.0.1:8000/api/v1/me", route => route.fulfill({
    status: 204,
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4322", "Access-Control-Allow-Credentials": "true" },
  }));
}
