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

test("ET-10.3 live Booking/grant -> student-first join -> tutor start/reload/end", async ({ browser }) => {
  expect(process.env.E2E_AUTH_PHASE).toBe("lesson-session");
  expect(password && primary && secondary && third).toBeTruthy();
  test.setTimeout(480_000);
  const tutorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  const tutor = await tutorContext.newPage();
  const student = await studentContext.newPage();
  const stranger = await thirdContext.newPage();
  try {
    await login(tutor, "et-dev-acceptance-b", "uk");
    await login(student, "et-dev-acceptance", "ru");
    await login(stranger, "et-dev-acceptance-c", "ru");
    const form = tutor.locator("[data-offer-create]");
    await expect(form).toBeVisible();
    // Start is selected only after all three real logins, leaving bounded
    // notice for publish/request/accept/join even on a slow local host.
    // The boundary wait observes server-derived START, not a fixed sleep.
    const startsAt = new Date(Date.now() + 4 * 60_000);
    const localInput = [startsAt.getFullYear(), String(startsAt.getMonth() + 1).padStart(2, "0"),
      String(startsAt.getDate()).padStart(2, "0")].join("-")
      + `T${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;
    await form.locator('[name="title"]').fill(`ET-10.3 ${randomUUID()}`);
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

    const joinUrl = `${api}/bookings/${booking.id}/lesson-session`;
    const studentJoin = student.waitForResponse((response) => response.url() === joinUrl && response.request().method() === "POST");
    await student.goto(`${web}/ru/lesson/#booking=${booking.id}`);
    const studentJoinResponse = await studentJoin;
    expect(studentJoinResponse.ok()).toBe(true);
    expect(studentJoinResponse.request().postData()).toBe("{}");
    expect(studentJoinResponse.request().headers()["origin"]).toBe(web);
    const first = await studentJoinResponse.json();
    expect(first).toMatchObject({ booking_id: booking.id, status: "READY", effective_status: "READY",
      version: 1, participant_role: "student", current_topic_id: null });
    await expect(student.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");
    await expect(student.locator("[data-session-start]")).toBeHidden();
    await expect(student).toHaveURL(new RegExp(`#session=${first.id}$`));

    const tutorJoin = tutor.waitForResponse((response) => response.url() === joinUrl && response.request().method() === "POST");
    await tutor.goto(`${web}/uk/lesson/#booking=${booking.id}`);
    const tutorResult = await (await tutorJoin).json();
    expect(tutorResult).toMatchObject({ id: first.id, status: "READY", participant_role: "tutor" });
    await expect(tutor.locator("[data-lesson-session]")).toHaveAttribute("data-status", "READY");

    const foreignResponse = stranger.waitForResponse((response) => response.url() === `${api}/lesson-sessions/${first.id}`);
    await stranger.goto(`${web}/ru/lesson/#session=${first.id}`);
    expect((await foreignResponse).status()).toBe(404);
    await expect(stranger.locator("[data-lesson-session]")).toBeHidden();

    await expect.poll(async () => {
      await tutor.locator("[data-access-retry]").click();
      return tutor.locator("[data-session-start]").isVisible();
    }, { timeout: 300_000, intervals: [1000, 3000, 5000] }).toBe(true);
    const startResponse = tutor.waitForResponse((response) => response.url() === `${api}/lesson-sessions/${first.id}/start`);
    await tutor.locator("[data-session-start]").click();
    const started = await (await startResponse).json();
    expect(started).toMatchObject({ id: first.id, status: "ACTIVE", version: 2, participant_role: "tutor" });
    await tutor.reload();
    await expect(tutor.locator("[data-lesson-session]")).toHaveAttribute("data-status", "ACTIVE");
    await student.reload();
    await expect(student.locator("[data-lesson-session]")).toHaveAttribute("data-status", "ACTIVE");
    const endResponse = tutor.waitForResponse((response) => response.url() === `${api}/lesson-sessions/${first.id}/end`);
    await tutor.locator("[data-session-end]").click();
    const ended = await (await endResponse).json();
    expect(ended).toMatchObject({ id: first.id, status: "ENDED", version: 3, participant_role: "tutor" });
    await tutor.reload();
    await expect(tutor.locator("[data-lesson-session]")).toHaveAttribute("data-status", "ENDED");
    await expect(tutor.locator("iframe")).toHaveCount(0);
  } finally {
    await tutorContext.close(); await studentContext.close(); await thirdContext.close();
  }
});
