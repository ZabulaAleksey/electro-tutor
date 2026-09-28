import { expect, test, type Page, type Route } from "@playwright/test";

const bookingId = "22222222-2222-4222-8222-222222222222";
const itemId = "11111111-1111-4111-8111-111111111111";

async function mockAccount(page: Page, options: { initialZone?: string | null; failFirst?: boolean } = {}) {
  let loads = 0;
  let settings = {
    time_zone: options.initialZone === undefined ? null : options.initialZone,
    remind_24h: true,
    remind_1h: true,
    remind_15m: false,
    quiet_hours_enabled: false,
    quiet_hours_start: null as string | null,
    quiet_hours_end: null as string | null,
  };
  const writes: typeof settings[] = [];
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
    } else if (path === "/api/v1/reminder-settings/me") {
      if (route.request().method() === "PUT") {
        settings = JSON.parse(route.request().postData() ?? "{}") as typeof settings;
        writes.push(settings);
        await respond(200, settings);
      } else {
        loads += 1;
        if (options.failFirst && loads === 1) await respond(503, { error: { code: "unavailable" } });
        else await respond(200, settings);
      }
    } else if (path === "/api/v1/notifications") {
      await respond(200, { items: [{
        id: itemId, type: "booking.reminder.1h", booking_id: bookingId,
        created_at: "2026-09-28T10:00:00Z", expires_at: "2026-10-28T10:00:00Z", read_at: null,
      }], limit: 20, offset: 0 });
    } else if (path === "/api/v1/notifications/unread-count") {
      await respond(200, { count: 1 });
    } else {
      await route.continue();
    }
  });
  return { writes };
}

test.describe("ET-14.2 reminder component states (mock API, not live E2E)", () => {
  test("RU requires explicit timezone save, persists independent toggles and overnight quiet hours", async ({ page }) => {
    const { writes } = await mockAccount(page);
    await page.goto("/ru/account/");
    const panel = page.locator("[data-reminder-settings]");
    await expect(panel).toBeVisible();
    const form = panel.locator("[data-reminder-form]");
    await expect(form).toBeVisible();
    const zone = form.getByRole("textbox", { name: "Часовой пояс IANA" });
    await expect(zone).toHaveValue("");
    await expect(panel.locator("[data-reminder-state]")).toContainText("Укажите и сохраните");
    await expect(form.locator("[data-reminder-24h]")).toBeChecked();
    await expect(form.locator("[data-reminder-1h]")).toBeChecked();
    await expect(form.locator("[data-reminder-15m]")).not.toBeChecked();
    const save = form.getByRole("button", { name: "Сохранить настройки" });
    await save.click();
    await expect(form.locator("[data-reminder-error]")).toContainText("действительный часовой пояс");
    expect(writes).toHaveLength(0);
    await zone.fill("Europe/Kyiv");
    await form.locator("[data-reminder-1h]").uncheck();
    await form.locator("[data-reminder-15m]").check();
    await form.locator("[data-reminder-quiet]").check();
    await expect(form.locator("[data-reminder-times]")).toBeVisible();
    await form.locator("[data-reminder-start]").fill("22:00");
    await form.locator("[data-reminder-end]").fill("08:00");
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator("[data-reminder-state]")).toContainText("сохранены");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      time_zone: "Europe/Kyiv", remind_24h: true, remind_1h: false, remind_15m: true,
      quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "08:00",
    });
    await page.reload();
    await expect(panel.locator("[data-reminder-zone]")).toHaveValue("Europe/Kyiv");
    await expect(panel.locator("[data-reminder-15m]")).toBeChecked();
    await expect(panel.locator("[data-reminder-quiet]")).toBeChecked();
    const card = page.locator("[data-notification-id]");
    await expect(card).toContainText("Занятие начнётся через 1 час.");
    await expect(card.getByRole("link", { name: "Открыть занятие" }))
      .toHaveAttribute("href", `/ru/lesson/#booking=${bookingId}`);
  });

  test("UK retries loading failure and uses localized controls", async ({ page }) => {
    await mockAccount(page, { initialZone: "Europe/Warsaw", failFirst: true });
    await page.goto("/uk/account/");
    const panel = page.locator("[data-reminder-settings]");
    await expect(panel.locator("[data-reminder-state]")).toContainText("Не вдалося");
    await panel.getByRole("button", { name: "Повторити" }).click();
    await expect(panel.locator("[data-reminder-form]")).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Часовий пояс IANA" })).toHaveValue("Europe/Warsaw");
    await expect(page.locator("[data-notification-id]")).toContainText("Заняття почнеться за 1 годину.");
  });
});
