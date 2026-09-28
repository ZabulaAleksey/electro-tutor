import process from "node:process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const web = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:4322";
const password = process.env.ET_DEV_TEST_PASSWORD;
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

test("ET-14.2 live settings -> Booking -> due worker -> localized private reminder", async ({ browser }) => {
  expect(process.env.E2E_AUTH_PHASE).toBe("reminder");
  expect(password && process.env.E2E_PRIMARY_SUBJECT && process.env.E2E_SECONDARY_SUBJECT
    && process.env.E2E_THIRD_SUBJECT).toBeTruthy();
  test.setTimeout(480_000);
  const studentContext = await browser.newContext();
  const tutorContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  const anonymousContext = await browser.newContext();
  const student = await studentContext.newPage();
  const tutor = await tutorContext.newPage();
  const stranger = await thirdContext.newPage();
  const anonymous = await anonymousContext.newPage();
  try {
    await login(student, "et-dev-acceptance", "ru");
    await login(tutor, "et-dev-acceptance-b", "uk");
    await login(stranger, "et-dev-acceptance-c", "uk");

    const settings = student.locator("[data-reminder-settings]");
    const form = settings.locator("[data-reminder-form]");
    await expect(form).toBeVisible();
    await expect(settings.locator("[data-reminder-zone]")).toHaveValue("");
    await expect(settings.locator("[data-reminder-24h]")).toBeChecked();
    await expect(settings.locator("[data-reminder-1h]")).toBeChecked();
    await expect(settings.locator("[data-reminder-15m]")).not.toBeChecked();
    await expect(settings.locator("[data-reminder-quiet]")).not.toBeChecked();
    await settings.locator("[data-reminder-zone]").fill("Europe/Kyiv");
    await settings.locator("[data-reminder-15m]").check();
    const saveResponse = student.waitForResponse((response) =>
      response.url() === api + "/reminder-settings/me" && response.request().method() === "PUT");
    await settings.locator("[data-reminder-save]").focus();
    await expect(settings.locator("[data-reminder-save]")).toBeFocused();
    await student.keyboard.press("Enter");
    expect((await saveResponse).status()).toBe(200);
    await student.reload();
    await expect(student.locator("[data-reminder-form]")).toBeVisible();
    await expect(student.locator("[data-reminder-zone]")).toHaveValue("Europe/Kyiv");
    await expect(student.locator("[data-reminder-15m]")).toBeChecked();

    await expect(stranger.locator("[data-reminder-form]")).toBeVisible();
    await expect(stranger.locator("[data-reminder-zone]")).toHaveValue("");
    await expect(stranger.getByLabel("Часовий пояс IANA")).toBeVisible();
    await anonymous.goto(web + "/ru/account/");
    const anonymousSettings = await anonymous.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      return response.status;
    }, api + "/reminder-settings/me");
    expect(anonymousSettings).toBe(401);

    const offerForm = tutor.locator("[data-offer-create]");
    await expect(offerForm).toBeVisible();
    // The opt-in 15m reminder is one minute late at acceptance; the approved
    // 15m grace allows immediate delivery while the Booking remains future.
    const startsAt = new Date(Date.now() + 14 * 60_000);
    const localInput = [startsAt.getFullYear(), String(startsAt.getMonth() + 1).padStart(2, "0"),
      String(startsAt.getDate()).padStart(2, "0")].join("-")
      + `T${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;
    await offerForm.locator('[name="title"]').fill(`ET-14.2 ${randomUUID()}`);
    await offerForm.locator('[name="starts-at"]').fill(localInput);
    await offerForm.locator('[name="notice"]').fill("0");
    await offerForm.locator('[name="payment-mode"]').selectOption("FREE");
    const offerResponse = tutor.waitForResponse((response) =>
      response.url().endsWith("/tutor-offers") && response.request().method() === "POST");
    await offerForm.getByRole("button", { name: "Створити пропозицію" }).click();
    const offer = await (await offerResponse).json();
    const offerCard = tutor.locator(`[data-offer-id="${offer.id}"]`);
    const publishResponse = tutor.waitForResponse((response) =>
      response.url().endsWith(`/tutor-offers/${offer.id}/publish`));
    await offerCard.getByRole("button", { name: "Опублікувати" }).click();
    expect((await (await publishResponse).json()).status).toBe("ACTIVE");

    await student.locator("[data-offer-id]").fill(offer.id);
    await student.locator("[data-offer-lookup]").getByRole("button", { name: "Открыть" }).click();
    const preview = student.locator(`[data-offer-preview] [data-offer-id="${offer.id}"]`);
    const requestResponse = student.waitForResponse((response) =>
      response.url().endsWith(`/tutor-offers/${offer.id}/bookings`));
    await preview.getByRole("button", { name: "Запросить запись" }).click();
    const booking = await (await requestResponse).json();
    await tutor.reload();
    const tutorBooking = tutor.locator(`[data-booking-id="${booking.id}"]`);
    const acceptResponse = tutor.waitForResponse((response) =>
      response.url().endsWith(`/bookings/${booking.id}/accept`));
    await tutorBooking.getByRole("button", { name: "Прийняти" }).click();
    const accepted = await acceptResponse;
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).status).toBe("ACCEPTED");

    await expect.poll(async () => {
      await student.reload();
      await expect(student.locator("[data-notifications]")).toHaveAttribute("aria-busy", "false");
      return student.locator("[data-notification-id]")
        .filter({ hasText: "Занятие начнётся через 15 минут." })
        .filter({ has: student.locator(`a[href="/ru/lesson/#booking=${booking.id}"]`) }).count();
    }, { timeout: 90_000, intervals: [1000, 3000, 5000] }).toBe(1);
    const reminder = student.locator("[data-notification-id]")
      .filter({ hasText: "Занятие начнётся через 15 минут." })
      .filter({ has: student.locator(`a[href="/ru/lesson/#booking=${booking.id}"]`) });
    await expect(reminder).toContainText("Занятие начнётся через 15 минут.");
    await expect(reminder.getByRole("link", { name: "Открыть занятие" }))
      .toHaveAttribute("href", "/ru/lesson/#booking=" + booking.id);
    const reminderId = await reminder.getAttribute("data-notification-id");
    expect(reminderId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(reminder).toHaveAttribute("data-unread", "true");
    const foreignRead = await stranger.evaluate(async (url) => {
      const response = await fetch(url, { method: "POST", credentials: "include" });
      return response.status;
    }, api + "/notifications/" + reminderId + "/read");
    expect(foreignRead).toBe(404);
  } finally {
    await studentContext.close(); await tutorContext.close();
    await thirdContext.close(); await anonymousContext.close();
  }
});
