import { expect, test, type Page, type Route } from "@playwright/test";

const offerId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const offer = {
  id: offerId,
  status: "ACTIVE",
  version: 2,
  title: "Пробний урок",
  starts_at: "2030-01-02T12:00:00+02:00",
  ends_at: "2030-01-02T13:00:00+02:00",
  time_zone: "Europe/Kyiv",
  duration_minutes: 60,
  minimum_notice_minutes: 60,
  payment_mode: "FREE",
  amount_minor: 0,
  currency: null,
  currency_exponent: null,
};

function booking(status: string, paymentMode = "FREE") {
  return {
    id: bookingId,
    offer_id: offerId,
    status,
    version: 1,
    snapshot: {
      snapshot_version: 1,
      offer_version: 2,
      offer_title: "Пробний урок",
      starts_at: offer.starts_at,
      ends_at: offer.ends_at,
      tutor_time_zone: "Europe/Kyiv",
      student_time_zone: "Europe/Kyiv",
      duration_minutes: 60,
      minimum_notice_minutes: 60,
      payment_mode: paymentMode,
      amount_minor: paymentMode === "EXTERNAL" ? 12500 : 0,
      currency: paymentMode === "EXTERNAL" ? "UAH" : null,
      currency_exponent: paymentMode === "EXTERNAL" ? 2 : null,
      cancellation_policy_code: "participant_before_start_v1",
    },
  };
}

type MockOptions = {
  offers?: unknown[];
  offersResponse?: { status: number; body: unknown };
  studentBookings?: unknown[];
  tutorBookings?: unknown[];
  offerResponse?: { status: number; body: unknown };
  bookingMutation?: { status: number; body: unknown };
  delayedBookings?: boolean;
  firstBookingsResponse?: { status: number; body: unknown };
};

async function mockAccount(page: Page, options: MockOptions = {}, language = "ru") {
  let releaseBookings = () => {};
  const bookingsReleased = new Promise<void>((resolve) => { releaseBookings = resolve; });
  const bookingRequests = new Map<string, number>();
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/v1/me") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subject: "test-subject", email: "test@example.invalid" }) });
      return;
    }
    if (path.startsWith("/api/v1/profiles/")) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "profile_not_found" } }) });
      return;
    }
    if (path === "/api/v1/tutor-offers/me") {
      const response = options.offersResponse ?? { status: 200, body: options.offers ?? [] };
      await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
      return;
    }
    if (path === `/api/v1/tutor-offers/${offerId}`) {
      const response = options.offerResponse ?? { status: 200, body: offer };
      await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
      return;
    }
    if (path.endsWith("/bookings") && request.method() === "POST") {
      const response = options.bookingMutation ?? { status: 201, body: booking("REQUESTED") };
      await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
      return;
    }
    if (path === "/api/v1/bookings/me") {
      const role = url.searchParams.get("role") ?? "unknown";
      const roleRequestCount = (bookingRequests.get(role) ?? 0) + 1;
      bookingRequests.set(role, roleRequestCount);
      if (roleRequestCount === 1 && options.firstBookingsResponse) {
        const response = options.firstBookingsResponse;
        await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
        return;
      }
      if (options.delayedBookings && roleRequestCount === 1 && role === "student") await bookingsReleased;
      const values = role === "tutor" ? options.tutorBookings : options.studentBookings;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(values ?? []) });
      return;
    }
    if (/\/api\/v1\/bookings\/[^/]+\/(accept|decline|cancel)$/.test(path) && request.method() === "POST") {
      const response = options.bookingMutation ?? { status: 200, body: booking("ACCEPTED") };
      await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
      return;
    }
    await route.continue();
  });
  await page.goto(`/${language}/account/`);
  await expect(page.locator("[data-booking]")).toBeVisible();
  return { releaseBookings };
}

test.describe("ET-10.1d booking UI state matrix", () => {
  test("renders loading and empty states, then retries a transient 503", async ({ page }) => {
    const { releaseBookings } = await mockAccount(page, { delayedBookings: true });
    await expect(page.locator('[data-booking-state="student"]')).toContainText("Загружаем…");
    releaseBookings();
    await expect(page.locator('[data-booking-state="student"]')).toHaveText("Здесь пока ничего нет.");
  });

  test("retries a transient 503 and reaches the deterministic empty state", async ({ page }) => {
    await mockAccount(page, { firstBookingsResponse: { status: 503, body: { error: { code: "service_unavailable" } } } });
    await expect(page.locator('[data-booking-state="student"]')).toContainText("Не удалось выполнить действие");
    await page.locator('[data-refresh-role="student"]').click();
    await expect(page.locator('[data-booking-state="student"]')).toHaveText("Здесь пока ничего нет.");
  });

  test("covers RU/UK permission, DRAFT/ACTIVE and stale-offer states", async ({ page }) => {
    await mockAccount(page, { offersResponse: { status: 403, body: { error: { code: "capability_required" } } } });
    await expect(page.locator("[data-tutor-state]")).toContainText("Нет разрешения управлять предложениями преподавателя.");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAccount(page, { offers: [{ ...offer, status: "DRAFT" }, offer] });
    await expect(page.locator('[data-offer-list] [data-status="DRAFT"]')).toContainText("Черновик");
    await expect(page.locator('[data-offer-list] [data-status="ACTIVE"]')).toContainText("Опубликовано");
    await expect(page.locator('[data-offer-list] [data-status="DRAFT"] button').filter({ hasText: "Опубликовать" })).toBeVisible();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAccount(page, { bookingMutation: { status: 409, body: { error: { code: "offer_changed" } } } }, "uk");
    await page.locator("[data-offer-id]").fill(offerId);
    await page.getByRole("button", { name: "Відкрити" }).click();
    await expect(page.locator("[data-offer-preview]")).toBeVisible();
    await page.locator("[data-offer-preview]").getByRole("button", { name: "Запросити запис" }).click();
    await expect(page.locator("[data-offer-state]")).toContainText("Пропозиція змінилася");
  });

  test("renders every lifecycle, conflict and EXTERNAL disclaimer state", async ({ page }) => {
    const statuses = ["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED"];
    await mockAccount(page, { studentBookings: statuses.map((status) => booking(status)), tutorBookings: statuses.map((status) => booking(status)) });
    for (const text of ["Ожидает ответа", "Подтверждено", "Отклонено", "Отменено"]) {
      await expect(page.locator('[data-booking-list="student"]')).toContainText(text);
    }
    await expect(page.locator('[data-booking-list="student"] [data-status="ACCEPTED"] [data-lesson-enter]'))
      .toHaveAttribute("href", `/ru/lesson/#booking=${bookingId}`);
    await expect(page.locator('[data-booking-list="student"] [data-status="REQUESTED"] [data-lesson-enter]'))
      .toHaveCount(0);
    await expect(page.locator("[role=note]")).toContainText("Платформа не принимает, не подтверждает и не возвращает оплату.");

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAccount(page, { studentBookings: [booking("ACCEPTED", "EXTERNAL")] }, "uk");
    await expect(page.locator('[data-booking-list="student"]')).toContainText("125,00 грн");
    await expect(page.locator('[data-booking-list="student"]')).toContainText("Платформа не приймає");
    await expect(page.locator('[data-booking-list="student"] [data-lesson-enter]'))
      .toHaveAttribute("href", `/uk/lesson/#booking=${bookingId}`);
  });

  test("surfaces a tutor version conflict without changing the REQUESTED booking", async ({ page }) => {
    await mockAccount(page, {
      tutorBookings: [booking("REQUESTED")],
      bookingMutation: { status: 409, body: { error: { code: "version_conflict" } } },
    });
    const card = page.locator(`[data-booking-list="tutor"] [data-booking-id="${bookingId}"]`);
    await expect(card).toContainText("Ожидает ответа");
    await card.getByRole("button", { name: "Принять" }).click();
    await expect(page.locator('[data-booking-state="tutor"]')).toContainText("Данные уже изменились");
    await expect(card).toContainText("Ожидает ответа");
  });

  test("hides private booking UI when the session expires", async ({ page }) => {
    await mockAccount(page, { tutorBookings: [booking("REQUESTED")] });
    await expect(page.locator(`[data-booking-id="${bookingId}"]`)).toBeVisible();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.route("**/api/v1/**", async (route: Route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/me" || path === "/api/v1/bookings/me") {
        await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "authentication_required" } }) });
      } else {
        await route.continue();
      }
    });
    await page.locator('[data-refresh-role="student"]').click();
    await expect(page.locator("[data-booking]")).toBeHidden();
    await expect(page.locator("[data-session-status]")).toContainText("Сессия завершилась");
    await expect(page.locator("[data-offer-list] [data-offer-id], [data-offer-preview] [data-offer-id], [data-booking-id]")).toHaveCount(0);
  });

  test("ignores a late private offer response after a concurrent session expiry", async ({ page }) => {
    let releaseOffer = () => {};
    let markOfferFinished = () => {};
    let markOfferRequested = () => {};
    const offerReleased = new Promise<void>((resolve) => { releaseOffer = resolve; });
    const offerFinished = new Promise<void>((resolve) => { markOfferFinished = resolve; });
    const offerRequested = new Promise<void>((resolve) => { markOfferRequested = resolve; });
    let expireBookings = false;
    await page.route("**/api/v1/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/me") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subject: "test-subject", email: "test@example.invalid" }) });
        return;
      }
      if (url.pathname.startsWith("/api/v1/profiles/")) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "profile_not_found" } }) });
        return;
      }
      if (url.pathname === "/api/v1/tutor-offers/me") {
        markOfferRequested();
        await offerReleased;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([offer]) });
        markOfferFinished();
        return;
      }
      if (url.pathname === "/api/v1/bookings/me") {
        const response = expireBookings
          ? { status: 401, body: { error: { code: "authentication_required" } } }
          : { status: 200, body: [] };
        await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
        return;
      }
      await route.continue();
    });

    await page.goto("/ru/account/");
    await expect(page.locator("[data-booking]")).toBeVisible();
    await offerRequested;
    expireBookings = true;
    await page.locator('[data-refresh-role="student"]').click();
    await expect(page.locator("[data-booking]")).toBeHidden();
    releaseOffer();
    await offerFinished;
    await expect(page.locator("[data-offer-list] [data-offer-id], [data-offer-preview] [data-offer-id], [data-booking-id]")).toHaveCount(0);
  });
});
