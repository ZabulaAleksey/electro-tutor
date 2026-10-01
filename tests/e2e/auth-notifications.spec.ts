import process from "node:process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const web = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:4322";
const password = process.env.ET_DEV_TEST_PASSWORD;
const primary = process.env.E2E_PRIMARY_SUBJECT;
const secondary = process.env.E2E_SECONDARY_SUBJECT;
const third = process.env.E2E_THIRD_SUBJECT;
const api = "http://127.0.0.1:8000/api/v1";

test.use({ trace: "off", screenshot: "off", video: "off" });

async function login(page: Page, username: string, language: "ru" | "uk") {
  await page.goto(`${web}/${language}/account/`);
  await page.getByRole("link", { name: /Войти|Увійти/ }).click();
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: /Sign In|Войти/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${language}/account/$`));
}

test("ET-14.1 live Booking -> outbox -> worker -> private inbox -> read", async ({ browser }) => {
  expect(process.env.E2E_AUTH_PHASE).toBe("notification");
  expect(password && primary && secondary && third).toBeTruthy();
  test.setTimeout(480_000);
  const tutorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  const anonymousContext = await browser.newContext();
  const tutor = await tutorContext.newPage();
  const student = await studentContext.newPage();
  const stranger = await thirdContext.newPage();
  const anonymous = await anonymousContext.newPage();
  const browserOrigins = new Set<string>();
  for (const page of [tutor, student, stranger, anonymous]) {
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") browserOrigins.add(url.origin);
    });
  }
  try {
    await login(tutor, "et-dev-acceptance-b", "uk");
    await login(student, "et-dev-acceptance", "ru");
    await login(stranger, "et-dev-acceptance-c", "uk");
    const form = tutor.locator("[data-offer-create]");
    await expect(form).toBeVisible();
    // Start is selected only after all three real logins, leaving bounded
    // notice for publish/request/accept on a slow local host.
    // Keep the accepted booking within its offer window.
    const startsAt = new Date(Date.now() + 4 * 60_000);
    const localInput = [startsAt.getFullYear(), String(startsAt.getMonth() + 1).padStart(2, "0"),
      String(startsAt.getDate()).padStart(2, "0")].join("-")
      + `T${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;
    await form.locator('[name="title"]').fill(`ET-14.1 ${randomUUID()}`);
    await form.locator('[name="starts-at"]').fill(localInput);
    await form.locator('[name="notice"]').fill("0");
    await form.locator('[name="payment-mode"]').selectOption("FREE");
    const offerResponse = tutor.waitForResponse((response) => response.url().endsWith("/tutor-offers") && response.request().method() === "POST");
    await form.getByRole("button", { name: "Створити пропозицію" }).click();
    const offer = await (await offerResponse).json();
    const offerCard = tutor.locator(`[data-offer-id="${offer.id}"]`);
    const publishResponse = tutor.waitForResponse((response) => response.url().endsWith(`/tutor-offers/${offer.id}/publish`));
    await offerCard.getByRole("button", { name: "Опублікувати" }).click();
    expect((await (await publishResponse).json()).status).toBe("ACTIVE");

    await student.locator("[data-offer-id]").fill(offer.id);
    await student.locator("[data-offer-lookup]").getByRole("button", { name: "Открыть" }).click();
    const preview = student.locator(`[data-offer-preview] [data-offer-id="${offer.id}"]`);
    const requestResponse = student.waitForResponse((response) => response.url().endsWith(`/tutor-offers/${offer.id}/bookings`));
    await preview.getByRole("button", { name: "Запросить запись" }).click();
    const booking = await (await requestResponse).json();
    await tutor.reload();
    const tutorBooking = tutor.locator(`[data-booking-id="${booking.id}"]`);
    const acceptResponse = tutor.waitForResponse((response) => response.url().endsWith(`/bookings/${booking.id}/accept`));
    await tutorBooking.getByRole("button", { name: "Прийняти" }).click();
    expect((await (await acceptResponse).json()).status).toBe("ACCEPTED");

    await expect.poll(async () => {
      await student.reload();
      const inbox = student.locator("[data-notifications]");
      await expect(inbox).toHaveAttribute("aria-busy", "false");
      return inbox.locator("[data-notification-id]").count();
    }, { timeout: 90_000, intervals: [1000, 3000, 5000] }).toBe(1);
    const card = student.locator("[data-notification-id]");
    const notificationId = await card.getAttribute("data-notification-id");
    expect(notificationId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(card).toHaveAttribute("data-unread", "true");
    await expect(student.locator("[data-notification-count]")).toContainText("1");
    await expect(card.getByRole("link", { name: "Открыть занятие" }))
      .toHaveAttribute("href", "/ru/lesson/#booking=" + booking.id);

    await stranger.reload();
    await expect(stranger.locator("[data-notification-state]")).toHaveText("Сповіщень поки немає.");
    const foreignRead = await stranger.evaluate(async (url) => {
      const response = await fetch(url, { method: "POST", credentials: "include" });
      return response.status;
    }, api + "/notifications/" + notificationId + "/read");
    expect(foreignRead).toBe(404);
    await anonymous.goto(web + "/ru/account/");
    const anonymousCount = await anonymous.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return response.status;
    }, api + "/notifications/unread-count");
    expect(anonymousCount).toBe(401);

    const readResponse = student.waitForResponse((response) =>
      response.url() === api + "/notifications/" + notificationId + "/read");
    const mark = card.getByRole("button", { name: "Отметить как прочитанное" });
    await mark.focus();
    await expect(mark).toBeFocused();
    await student.keyboard.press("Enter");
    expect((await readResponse).status()).toBe(204);
    await expect(card).toHaveAttribute("data-unread", "false");
    await student.reload();
    await expect(student.locator('[data-notification-id="' + notificationId + '"]'))
      .toHaveAttribute("data-unread", "false");
    await expect(student.locator("[data-notification-count]")).toContainText("0");
  } finally {
    await tutorContext.close(); await studentContext.close(); await thirdContext.close();
    await anonymousContext.close();
  }
});
