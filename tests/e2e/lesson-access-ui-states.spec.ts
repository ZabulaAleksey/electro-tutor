import { expect, test, type Page, type Route } from "@playwright/test";

const bookingId = "22222222-2222-4222-8222-222222222222";
const accessUrl = `http://127.0.0.1:8000/api/v1/bookings/${bookingId}/lesson-access`;
const joinUrl = `http://127.0.0.1:8000/api/v1/bookings/${bookingId}/lesson-session`;
const activeDecision = {
  grant_id: "33333333-3333-4333-8333-333333333333",
  booking_id: bookingId,
  status: "ACTIVE",
  participant_role: "student",
  valid_from: "2030-01-02T11:45:00Z",
  valid_until: "2030-01-02T13:00:00Z",
  capabilities: ["LESSON_SHELL_ENTER"],
};

function mockResponse(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4322",
      "Access-Control-Allow-Credentials": "true",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  });
}

async function openShell(page: Page, language: "ru" | "uk") {
  await page.goto(`/${language}/lesson/#booking=${bookingId}`);
  await expect(page).toHaveURL(new RegExp(`/${language}/lesson/$`));
}

// These Access cases exercise the Access shell independently of Session
// availability. ET-10.3 always attempts a protected Session join after Access
// succeeds, so model an unavailable Session explicitly rather than allowing an
// unmocked request to receive a real 401 from an unrelated local API.
async function mockUnavailableSession(page: Page) {
  await page.route(joinUrl, (route) => mockResponse(route, 503, {
    error: { code: "lesson_session_unavailable" },
  }));
}

test("holds the exact private request without rendering the active shell and clears the fragment", async ({ page }) => {
  await mockUnavailableSession(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requested = false;
  await page.route(accessUrl, async (route) => {
    requested = true;
    await gate;
    await mockResponse(route, 200, activeDecision);
  });
  try {
    await openShell(page, "ru");
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "loading");
    await expect(page.locator("[data-access-active]")).toBeHidden();
    release();
    await expect(page.locator("[data-access-active]")).toBeVisible();
    await expect(page.locator("[data-access-role]")).toHaveText("ученик");
    await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "active");
    await expect(page.locator("[data-lesson-session]")).toBeHidden();
    await expect(page.locator("iframe")).toHaveCount(0);
  } finally {
    release();
  }
});

for (const language of ["ru", "uk"] as const) {
  for (const [status, code, state] of [
    [401, "authentication_required", "signedOut"],
    [403, "lesson_access_not_yet_valid", "notYetValid"],
    [403, "lesson_access_expired", "expired"],
    [403, "lesson_access_revoked", "revoked"],
    [403, "lesson_access_unavailable", "unavailable"],
    [404, "booking_not_found", "notFound"],
    [503, "lesson_access_policy_unavailable", "dependencyError"],
  ] as const) {
    test(`${language} maps ${code} to ${state} without exposing protected content`, async ({ page }) => {
      await page.route(accessUrl, (route) => mockResponse(route, status, { error: { code } }));
      await openShell(page, language);
      await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", state);
      await expect(page.locator("[data-access-active]")).toBeHidden();
      if (state === "dependencyError") await expect(page.locator("[data-access-retry]")).toBeVisible();
      else await expect(page.locator("[data-access-retry]")).toBeHidden();
      if (state === "signedOut") await expect(page.locator("[data-access-login]")).toBeVisible();
      else await expect(page.locator("[data-access-login]")).toBeHidden();
    });
  }
}

test("retry checks the server again and does not promote an earlier failure", async ({ page }) => {
  await mockUnavailableSession(page);
  let requests = 0;
  await page.route(accessUrl, (route) => {
    requests += 1;
    return requests === 1
      ? mockResponse(route, 503, { error: { code: "audit_unavailable" } })
      : mockResponse(route, 200, activeDecision);
  });
  await openShell(page, "uk");
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "dependencyError");
  await page.locator("[data-access-retry]").click();
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "active");
  expect(requests).toBe(2);
});

for (const language of ["ru", "uk"] as const) {
  test(`${language} keeps the public route but hides Access and Session when join returns 401`, async ({ page }) => {
    await page.route(accessUrl, (route) => mockResponse(route, 200, activeDecision));
    await page.route(joinUrl, (route) => mockResponse(route, 401, {
      error: { code: "authentication_required" },
    }));
    await openShell(page, language);
    await expect(page.locator("[data-lesson-access] h1")).toBeVisible();
    await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "signedOut");
    await expect(page.locator("[data-access-login]")).toBeVisible();
    await expect(page.locator("[data-access-active]")).toBeHidden();
    await expect(page.locator("[data-access-role]")).toBeEmpty();
    await expect(page.locator("[data-lesson-session]")).toBeHidden();
  });
}

test("a later 401 hides active access and ignores an older delayed private response", async ({ page }) => {
  await mockUnavailableSession(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route(accessUrl, async (route) => {
    const sequence = ++requests;
    if (sequence === 2) await gate;
    await mockResponse(route, sequence === 3 ? 401 : 200, sequence === 3
      ? { error: { code: "authentication_required" } } : activeDecision);
  });
  try {
    await openShell(page, "ru");
    await expect(page.locator("[data-access-active]")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "signedOut");
    release();
    await expect(page.locator("[data-access-active]")).toBeHidden();
    expect(requests).toBe(3);
  } finally {
    release();
  }
});

test("same-document hash re-entry makes a fresh access request and hides revoked content", async ({ page }) => {
  await mockUnavailableSession(page);
  let requests = 0;
  await page.route(accessUrl, (route) => {
    const sequence = ++requests;
    return sequence === 1
      ? mockResponse(route, 200, activeDecision)
      : mockResponse(route, 403, { error: { code: "lesson_access_revoked" } });
  });
  await openShell(page, "ru");
  await expect(page.locator("[data-access-active]")).toBeVisible();
  const secondResponse = page.waitForResponse((response) => response.url() === accessUrl);
  await page.goto(`/ru/lesson/#booking=${bookingId}`);
  expect((await secondResponse).status()).toBe(403);
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "revoked");
  await expect(page.locator("[data-access-active]")).toBeHidden();
  await expect(page).toHaveURL(/\/ru\/lesson\/$/);
  expect(requests).toBe(2);
});

test("invalid same-document re-entry closes an active shell without sending a request", async ({ page }) => {
  await mockUnavailableSession(page);
  let requests = 0;
  await page.route(accessUrl, async (route) => {
    requests += 1;
    await mockResponse(route, 200, activeDecision);
  });
  await openShell(page, "uk");
  await expect(page.locator("[data-access-active]")).toBeVisible();
  await page.goto(`/uk/lesson/#booking=${bookingId}&booking=${bookingId}`);
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "notFound");
  await expect(page.locator("[data-access-active]")).toBeHidden();
  expect(requests).toBe(1);
});

test("rejects invalid and duplicate fragment identifiers without requesting the API", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/bookings/*/lesson-access", async (route) => {
    requests += 1;
    await mockResponse(route, 200, activeDecision);
  });
  await page.goto(`/ru/lesson/#booking=${bookingId}&booking=${bookingId}`);
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "notFound");
  await expect(page.locator("[data-access-active]")).toBeHidden();
  expect(requests).toBe(0);
});

test("a 200 without the exact server capability never opens the shell", async ({ page }) => {
  await page.route(accessUrl, (route) => mockResponse(route, 200, {
    ...activeDecision,
    capabilities: ["LESSON_SHELL_ENTER", "MEDIA_ENTER"],
  }));
  await openShell(page, "ru");
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "dependencyError");
  await expect(page.locator("[data-access-active]")).toBeHidden();
});

test("localized active shell stays usable on mobile, keyboard and both themes", async ({ page }) => {
  await mockUnavailableSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.route(accessUrl, (route) => mockResponse(route, 200, activeDecision));
  await openShell(page, "uk");
  await expect(page.locator("[data-access-active]")).toBeVisible();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  const back = page.getByRole("link", { name: "До записів" });
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/uk\/account\/$/);
});
