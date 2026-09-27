import { expect, test, type Page, type Route } from "@playwright/test";

const booking = "22222222-2222-4222-8222-222222222222";
const session = "44444444-4444-4444-8444-444444444444";
const api = "http://127.0.0.1:8000/api/v1";
const access = `${api}/bookings/${booking}/lesson-access`;
const join = `${api}/bookings/${booking}/lesson-session`;
const read = `${api}/lesson-sessions/${session}`;
const grant = {
  grant_id: "33333333-3333-4333-8333-333333333333", booking_id: booking,
  status: "ACTIVE", participant_role: "tutor",
  valid_from: "2030-01-02T11:45:00Z", valid_until: "2030-01-02T13:00:00Z",
  capabilities: ["LESSON_SHELL_ENTER"],
};
const ready = {
  id: session, booking_id: booking, status: "READY", effective_status: "READY", version: 1,
  participant_role: "tutor", capabilities: ["SESSION_VIEW", "SESSION_START"],
  created_at: "2030-01-02T11:50:00Z", started_at: null, ended_at: null, cancelled_at: null,
  current_topic_id: null,
};
function reply(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", headers: {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4322", "Access-Control-Allow-Credentials": "true",
    "Cache-Control": "no-store",
  }, body: JSON.stringify(body) });
}
async function open(page: Page, language: "ru" | "uk" = "ru") {
  await page.goto(`/${language}/lesson/#booking=${booking}`);
}

test("join waits for exact DTO, sends empty JSON/idempotency key, then preserves session fragment for reload", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(access, (route) => reply(route, 200, grant));
  await page.route(join, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toBe("{}");
    expect(route.request().headers()["content-type"]).toBe("application/json");
    expect(route.request().headers()["origin"]).toBe("http://127.0.0.1:4322");
    expect(route.request().headers()["idempotency-key"]).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    await gate;
    await reply(route, 200, ready);
  });
  await page.route(read, (route) => reply(route, 200, ready));
  try {
    await open(page);
    await expect(page.locator("[data-access-active]")).toBeVisible();
    await expect(page.locator("[data-lesson-session]")).toBeHidden();
    release();
    await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");
    await expect(page).toHaveURL(new RegExp(`#session=${session}$`));
    await page.reload();
    await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");
    await expect(page.locator("[data-session-start]")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  } finally { release(); }
});

test("student-first READY waits and cannot start; tutor transitions by expected_version and reloads ENDED", async ({ page }) => {
  await page.route(access, (route) => reply(route, 200, { ...grant, participant_role: "student" }));
  await page.route(join, (route) => reply(route, 200, { ...ready, participant_role: "student", capabilities: ["SESSION_VIEW"] }));
  await open(page, "uk");
  await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");
  await expect(page.locator("[data-session-start]")).toBeHidden();
  await expect(page.locator("[data-session-end]")).toBeHidden();
  await page.route(read, (route) => reply(route, 200, ready));
  await page.reload();
  await expect(page.locator("[data-session-start]")).toBeVisible();
  await page.route(`${read}/start`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ expected_version: 1 });
    return reply(route, 200, { ...ready, status: "ACTIVE", effective_status: "ACTIVE", version: 2,
      started_at: "2030-01-02T12:00:00Z", capabilities: ["SESSION_VIEW", "SESSION_END"] });
  });
  await page.locator("[data-session-start]").click();
  await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "ACTIVE");
  await page.route(`${read}/end`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ expected_version: 2 });
    return reply(route, 200, { ...ready, status: "ENDED", effective_status: "ENDED", version: 3,
      started_at: "2030-01-02T12:00:00Z", ended_at: "2030-01-02T12:45:00Z", capabilities: ["SESSION_VIEW"] });
  });
  await page.locator("[data-session-end]").click();
  await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "ENDED");
  await expect(page.locator("[data-session-end]")).toBeHidden();
});

test("reload 401 and same-document invalid fragment immediately hide previous Session", async ({ page }) => {
  let calls = 0;
  await page.route(read, (route) => {
    calls += 1;
    return calls === 1 ? reply(route, 200, ready) : reply(route, 401, { error: { code: "authentication_required" } });
  });
  await page.goto(`/ru/lesson/#session=${session}`);
  await expect(page.locator("[data-lesson-session]")).toBeVisible();
  await page.goto(`/ru/lesson/#session=${session}&session=${session}`);
  await expect(page.locator("[data-lesson-session]")).toBeHidden();
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-status");
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-role");
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-version");
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "notFound");
  await page.goto(`/ru/lesson/#session=${session}`);
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "signedOut");
  await expect(page.locator("[data-lesson-session]")).toBeHidden();
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-status");
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-role");
  await expect(page.locator("[data-lesson-session]")).not.toHaveAttribute("data-version");
});

test("late Session GET cannot restore private region after a new fragment generation", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(read, async (route) => { await gate; await reply(route, 200, ready); });
  try {
    await page.goto(`/ru/lesson/#session=${session}`);
    await expect(page.locator("[data-lesson-session]")).toBeHidden();
    await page.goto(`/ru/lesson/#session=${session}&booking=${booking}`);
    await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "notFound");
    release();
    await expect(page.locator("[data-lesson-session]")).toBeHidden();
  } finally { release(); }
});

test("server-denied/unavailable and malformed 200 never display Session state", async ({ page }) => {
  await page.route(read, (route) => reply(route, 200, { ...ready, capabilities: ["SESSION_VIEW", "MEDIA_ENTER"] }));
  await page.goto(`/uk/lesson/#session=${session}`);
  await expect(page.locator("[data-lesson-session]")).toBeHidden();
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "dependencyError");
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("aria-busy", "false");
  await page.route(read, (route) => reply(route, 403, { error: { code: "lesson_access_expired" } }));
  await page.locator("[data-access-retry]").click();
  await expect(page.locator("[data-lesson-session]")).toBeHidden();
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "expired");
  await expect(page.locator("[data-lesson-access]")).toHaveAttribute("aria-busy", "false");
});

test("READY refresh uses a fresh server read to reveal tutor START at the scheduled boundary", async ({ page }) => {
  let reads = 0;
  await page.route(read, (route) => {
    reads += 1;
    return reply(route, 200, reads === 1 ? { ...ready, capabilities: ["SESSION_VIEW"] } : ready);
  });
  await page.goto(`/ru/lesson/#session=${session}`);
  await expect(page.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");
  await expect(page.locator("[data-session-start]")).toBeHidden();
  await page.locator("[data-access-retry]").click();
  await expect(page.locator("[data-session-start]")).toBeVisible();
  expect(reads).toBe(2);
});
