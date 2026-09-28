import { expect, test, type Page, type Route } from "@playwright/test";

const itemId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const item = {
  id: itemId,
  type: "booking.accepted",
  booking_id: bookingId,
  created_at: "2026-09-28T10:00:00Z",
  expires_at: "2026-10-28T10:00:00Z",
  read_at: null as string | null,
};

async function mockAccount(page: Page, options: { empty?: boolean; failFirst?: boolean } = {}) {
  let listCalls = 0;
  let read = false;
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/v1/me") {
      await respond(200, { subject: "student", email: "student@example.invalid" });
    } else if (path.startsWith("/api/v1/profiles/")) {
      await respond(404, { error: { code: "profile_not_found" } });
    } else if (path === "/api/v1/tutor-offers/me" || path === "/api/v1/bookings/me") {
      await respond(200, []);
    } else if (path === "/api/v1/notifications" && route.request().method() === "GET") {
      listCalls += 1;
      if (options.failFirst && listCalls === 1) {
        await respond(503, { error: { code: "notification_unavailable" } });
      } else {
        await respond(200, {
          items: options.empty ? [] : [{ ...item, read_at: read ? "2026-09-28T11:00:00Z" : null }],
          limit: 20,
          offset: 0,
        });
      }
    } else if (path === "/api/v1/notifications/unread-count") {
      await respond(200, { count: read || options.empty ? 0 : 1 });
    } else if (path === `/api/v1/notifications/${itemId}/read`) {
      read = true;
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

test.describe("ET-14.1 notification component states (mock API, not live E2E)", () => {
  test("RU unread, keyboard action, read state and safe internal link", async ({ page }) => {
    await mockAccount(page);
    await page.goto("/ru/account/");
    const inbox = page.locator("[data-notifications]");
    await expect(inbox).toBeVisible();
    await expect(inbox.locator("[data-notification-count]")).toContainText("1");
    const card = inbox.locator("[data-notification-id]");
    await expect(card).toHaveAttribute("data-unread", "true");
    const link = card.getByRole("link", { name: "Открыть занятие" });
    await expect(link).toHaveAttribute("href", `/ru/lesson/#booking=${bookingId}`);
    const mark = card.getByRole("button", { name: "Отметить как прочитанное" });
    await mark.focus();
    await expect(mark).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("data-unread", "false");
    await expect(card).toContainText("Прочитано");
    await expect(inbox.locator("[data-notification-count]")).toContainText("0");
  });

  test("UK empty and retry after a temporary failure", async ({ page }) => {
    await mockAccount(page, { empty: true, failFirst: true });
    await page.goto("/uk/account/");
    const inbox = page.locator("[data-notifications]");
    await expect(inbox.locator("[data-notification-state]")).toContainText("Не вдалося");
    await inbox.getByRole("button", { name: "Повторити" }).click();
    await expect(inbox.locator("[data-notification-state]")).toHaveText("Сповіщень поки немає.");
    await expect(inbox.locator("[data-notification-list] article")).toHaveCount(0);
  });
});
