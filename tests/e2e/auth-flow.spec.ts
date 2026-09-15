import { randomUUID } from "node:crypto";
import process from "node:process";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  isCanonicalUuid,
  parseProvisionerSummary,
  parseTrustedCliSummary,
  requireAuthE2ESecrets,
  runTrustedProfileCli,
  trustedCliEnvironment,
} from "../../scripts/profile-e2e-support.mjs";

const api = "http://127.0.0.1:8000";
const idp = "http://127.0.0.1:58081";
const web = process.env.E2E_WEB_ORIGIN || "http://127.0.0.1:4322";
const primaryUsername = "et-dev-acceptance";
const secondaryUsername = "et-dev-acceptance-b";
const thirdUsername = "et-dev-acceptance-c";
const password = process.env.ET_DEV_TEST_PASSWORD;
const primarySubject = process.env.E2E_PRIMARY_SUBJECT;
const secondarySubject = process.env.E2E_SECONDARY_SUBJECT;
const thirdSubject = process.env.E2E_THIRD_SUBJECT;
const authPhase = process.env.E2E_AUTH_PHASE;

const grantOperationId = randomUUID();
const grantCorrelationId = randomUUID();
const grantRequestId = `et-09-4e-tutor-grant-${randomUUID()}`;
const tutorProfileRequestId = `et-09-4e-tutor-profile-${randomUUID()}`;

test.use({ trace: "off", screenshot: "off", video: "off" });

function errorCode(value: unknown) {
  return (value as { error?: { code?: string } })?.error?.code;
}

async function expectInitialSignedOutSession(
  page: Page,
  language = "ru",
  responseAfterRelease: "continue" | "signed-out" = "continue",
) {
  const copy = language === "ru"
    ? { checking: "Проверяем сессию…", signedOut: "Войдите, чтобы открыть приватные профили." }
    : { checking: "Перевіряємо сесію…", signedOut: "Увійдіть, щоб відкрити приватні профілі." };
  const meUrl = `${api}/api/v1/me`;
  let releaseInitialSession = () => {};
  const initialSessionGate = new Promise<void>((resolve) => {
    releaseInitialSession = resolve;
  });
  let held = false;
  const holdInitialSession = async (route: Route) => {
    if (!held) {
      held = true;
      await initialSessionGate;
    }
    if (responseAfterRelease === "signed-out") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "authentication_required" } }),
      });
    } else {
      await route.continue();
    }
  };
  await page.route(meUrl, holdInitialSession);
  const initialSessionRequest = page.waitForRequest((request) => request.url() === meUrl);
  const loginLink = page.getByRole("link", { name: /Войти|Увійти/ });
  try {
    await page.goto(`${web}/${language}/account/`);
    const request = await initialSessionRequest;
    expect(request.method()).toBe("GET");
    await expect(page.locator("[data-session-status]")).toHaveText(copy.checking);
    releaseInitialSession();
    await expect(loginLink).toBeVisible();
    await expect(page.locator("[data-session-status]")).toHaveText(copy.signedOut);
  } finally {
    releaseInitialSession();
    await page.unroute(meUrl, holdInitialSession);
  }
}

async function login(page: Page, username: string, language = "ru") {
  await expectInitialSignedOutSession(page, language);
  const loginLink = page.getByRole("link", { name: /Войти|Увійти/ });
  await loginLink.click();
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: /Sign In|Войти/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${language}/account/$`));
}

async function logout(page: Page) {
  await page.locator("[data-logout-form] button").click();
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${web.replaceAll(".", "\\.")}/`));
}

async function saveStudent(page: Page, displayName: string, language: "ru" | "uk" = "ru") {
  const copy = language === "ru"
    ? { region: "Профиль ученика", label: "Отображаемое имя", saved: "Изменения сохранены." }
    : { region: "Профіль учня", label: "Відображуване ім’я", saved: "Зміни збережено." };
  const student = page.getByRole("region", { name: copy.region });
  const input = student.getByLabel(copy.label);
  await expect(input).toBeVisible();
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/profiles/student/me")
    && ["PUT", "PATCH"].includes(response.request().method()),
  );
  await input.fill(displayName);
  await input.focus();
  await page.keyboard.press("Enter");
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(student.getByRole("status")).toHaveText(copy.saved);
  return response.request().method();
}

function resolveAccount(subject: string) {
  const summary = runTrustedProfileCli(
    ["e2e-resolve-account", "--subject", subject],
    "account_resolved",
  );
  expect(isCanonicalUuid(summary.account_id)).toBe(true);
  return summary.account_id as string;
}

test.describe("ET-09.4e terminal support contracts", () => {
  test("holds the exact session request while rendering the initial checking state", async ({ page }) => {
    await expectInitialSignedOutSession(page, "ru", "signed-out");
  });

  test("fails fast without either live secret and never reports a value", () => {
    expect(() => requireAuthE2ESecrets({})).toThrow(
      "ET_KEYCLOAK_ADMIN_PASSWORD and ET_DEV_TEST_PASSWORD required",
    );
    expect(() => requireAuthE2ESecrets({ ET_KEYCLOAK_ADMIN_PASSWORD: "present" })).toThrow(
      "ET_DEV_TEST_PASSWORD required",
    );
  });

  test("parses only the three canonical managed subjects from safe provisioner output", () => {
    const parsed = parseProvisionerSummary([
      "> node scripts/keycloak-provision.mjs",
      JSON.stringify({
        realm: "electro-tutor-dev",
        testIdentities: [
          { name: primaryUsername, subject: "11111111-1111-4111-8111-111111111111" },
          { name: secondaryUsername, subject: "22222222-2222-4222-8222-222222222222" },
          { name: thirdUsername, subject: "33333333-3333-4333-8333-333333333333" },
        ],
      }),
      "contract_sha256=opaque",
    ].join("\n"));
    expect(parsed).toEqual({
      primarySubject: "11111111-1111-4111-8111-111111111111",
      secondarySubject: "22222222-2222-4222-8222-222222222222",
      thirdSubject: "33333333-3333-4333-8333-333333333333",
    });
    expect(() => parseProvisionerSummary('{"testIdentities":[]}')).toThrow(/identity count/);
    expect(() => parseProvisionerSummary(JSON.stringify({
      testIdentities: [
        { name: primaryUsername, subject: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA" },
        { name: secondaryUsername, subject: "22222222-2222-2222-2222-222222222222" },
        { name: thirdUsername, subject: "33333333-3333-4333-8333-333333333333" },
      ],
    }))).toThrow(/summary is invalid/);
  });

  test("uses the exact local production-shaped CLI target and rejects an unsafe summary", () => {
    const environment = trustedCliEnvironment({
      PATH: process.env.PATH,
      ET_TEST_DATABASE_URL: "must-not-survive",
      ET_E2E_FOREIGN_KEY: "must-not-survive",
    });
    expect(environment.ET_DATABASE_URL).toContain("/electro_tutor");
    expect(environment.ET_DATABASE_URL).not.toContain("electro_tutor_test");
    expect(environment.ET_PROVISIONING_DATABASE_URL).toContain("electro_tutor_provisioner");
    expect(environment).not.toHaveProperty("ET_TEST_DATABASE_URL");
    expect(environment).not.toHaveProperty("ET_E2E_FOREIGN_KEY");
    const e2eEnvironment = trustedCliEnvironment({ ET_E2E_DATABASE_TARGET: "test" });
    expect(e2eEnvironment.ET_ENVIRONMENT).toBe("test");
    expect(e2eEnvironment.ET_DATABASE_URL).toContain("/electro_tutor_test");
    expect(e2eEnvironment.ET_AUTH_DATABASE_URL).toContain("/electro_tutor_test");
    expect(e2eEnvironment.ET_PROVISIONING_DATABASE_URL).toContain("/electro_tutor_test");
    expect(() => parseTrustedCliSummary('{"status":"error"}', "audit_verified")).toThrow(
      /expected safe summary/,
    );
  });

  test("accepts only a redacted booking-capability grant summary", () => {
    const parsed = parseTrustedCliSummary(JSON.stringify({
      status: "ok",
      operation: "booking_grant_issued",
      account_id: "11111111-1111-4111-8111-111111111111",
      grant_id: "33333333-3333-4333-8333-333333333333",
      correlation_id: "44444444-4444-4444-8444-444444444444",
      operation_id: "55555555-5555-4555-8555-555555555555",
    }), "booking_grant_issued");
    expect(parsed.operation).toBe("booking_grant_issued");
    expect(() => parseTrustedCliSummary(JSON.stringify({
      status: "ok",
      operation: "booking_grant_issued",
      account_id: "11111111-1111-4111-8111-111111111111",
      grant_id: "not-a-uuid",
      correlation_id: "44444444-4444-4444-8444-444444444444",
      operation_id: "55555555-5555-4555-8555-555555555555",
    }), "booking_grant_issued")).toThrow(/invalid identifier/);
  });
});

test.describe("ET-09.3 / ET-09.4e real DEV authentication and profiles", () => {
  test.describe.configure({ mode: "serial" });

  test("keeps auth stable and enforces two-user own-profile authorization with durable audit", async ({ browser }) => {
    test.skip(
      authPhase !== "profiles" || !password || !primarySubject || !secondarySubject,
      "profile phase requires runner-provided password and two safe Keycloak subjects",
    );
    test.setTimeout(180_000);
    const primaryContext = await browser.newContext();
    const secondaryContext = await browser.newContext();
    const primaryPage = await primaryContext.newPage();
    const secondaryPage = await secondaryContext.newPage();
    const originalEmail = process.env.ET_DEV_TEST_EMAIL || "et-dev-acceptance@invalid.example";
    const profileRequests: string[] = [];
    for (const page of [primaryPage, secondaryPage]) {
      page.on("request", (request) => {
        if (request.url().includes("/api/v1/profiles/")) profileRequests.push(request.url());
      });
    }

    try {
      await login(primaryPage, primaryUsername);
      const primaryMe = await primaryPage.evaluate(async (url) => (
        await fetch(`${url}/api/v1/me`, { credentials: "include" })
      ).json(), api);
      expect(primaryMe.email).toBe(originalEmail);
      expect(primaryMe).not.toHaveProperty("account_id");

      const student = primaryPage.getByRole("region", { name: "Профиль ученика" });
      const studentName = student.getByLabel("Отображаемое имя");
      await expect(studentName).toBeVisible();
      await studentName.fill("   ");
      await student.getByRole("button", { name: /Создать профиль|Сохранить изменения/ }).click();
      await expect(student.getByRole("alert")).toHaveText("Введите отображаемое имя.");
      await saveStudent(primaryPage, "  Тестовый   ученик A  ");
      await saveStudent(primaryPage, "Тестовый ученик A updated");
      await expect(studentName).toHaveValue("Тестовый ученик A updated");
      const primaryStudent = await primaryPage.evaluate(async (url) => (
        await fetch(`${url}/api/v1/profiles/student/me`, { credentials: "include" })
      ).json(), api);
      expect(primaryStudent.display_name).toBe("Тестовый ученик A updated");

      const primaryAccountId = resolveAccount(primarySubject!);
      const escalation = await primaryPage.evaluate(async ({ apiUrl, accountId }) => {
        const response = await fetch(`${apiUrl}/api/v1/profiles/tutor/me`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Request-ID": "e2e-self-escalation" },
          body: JSON.stringify({
            display_name: "Escalated tutor",
            account_id: accountId,
            role: "tutor",
            capability: "TUTOR_PROFILE_MANAGE_OWN",
          }),
        });
        return { status: response.status, body: await response.json() };
      }, { apiUrl: api, accountId: primaryAccountId });
      expect(escalation.status).toBe(422);
      expect(errorCode(escalation.body)).toBe("invalid_request");
      const primaryTutor = primaryPage.getByRole("region", { name: "Профиль преподавателя" });
      await expect(primaryTutor.getByText("Нужно разрешение преподавателя", { exact: true }).first()).toBeVisible();
      await expect(primaryTutor.locator("[data-profile-form]")).toBeHidden();

      await login(secondaryPage, secondaryUsername, "uk");
      const secondaryMe = await secondaryPage.evaluate(async (url) => (
        await fetch(`${url}/api/v1/me`, { credentials: "include" })
      ).json(), api);
      expect(secondaryMe).not.toHaveProperty("account_id");
      const secondaryStudentRegion = secondaryPage.getByRole("region", { name: "Профіль учня" });
      const secondaryStudentName = secondaryStudentRegion.getByLabel("Відображуване ім’я");
      await secondaryStudentName.fill("   ");
      await secondaryStudentRegion.getByRole("button", {
        name: /Створити профіль|Зберегти зміни/,
      }).click();
      await expect(secondaryStudentRegion.getByRole("alert")).toHaveText(
        "Введіть відображуване ім’я.",
      );
      expect(await saveStudent(secondaryPage, "Тестовий учень B", "uk")).toBe("PUT");
      expect(await saveStudent(secondaryPage, "Тестовий учень B updated", "uk")).toBe("PATCH");
      const secondaryStudent = await secondaryPage.evaluate(async (url) => (
        await fetch(`${url}/api/v1/profiles/student/me`, { credentials: "include" })
      ).json(), api);
      expect(secondaryStudent.display_name).toBe("Тестовий учень B updated");
      const secondaryAccountId = resolveAccount(secondarySubject!);
      const secondaryTutorBeforeGrant = secondaryPage.getByRole("region", {
        name: "Профіль викладача",
      });
      await expect(
        secondaryTutorBeforeGrant.getByText("Потрібен дозвіл викладача", { exact: true }).first(),
        "The freshly recreated managed identity must start without Tutor capability.",
      ).toBeVisible();

      const accountOverride = await primaryPage.evaluate(async ({ apiUrl, accountId }) => {
        const response = await fetch(`${apiUrl}/api/v1/profiles/student/me`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Request-ID": "e2e-account-override" },
          body: JSON.stringify({ display_name: "Override", account_id: accountId }),
        });
        return { status: response.status, body: await response.json() };
      }, { apiUrl: api, accountId: secondaryAccountId });
      expect(accountOverride.status).toBe(422);
      expect(errorCode(accountOverride.body)).toBe("invalid_request");

      const foreignRead = await primaryPage.evaluate(async ({ apiUrl, accountId }) => {
        const response = await fetch(`${apiUrl}/api/v1/profiles/student/${accountId}`, {
          credentials: "include",
          headers: { "X-Request-ID": "e2e-foreign-read" },
        });
        return { status: response.status, body: await response.json() };
      }, { apiUrl: api, accountId: secondaryAccountId });
      expect(foreignRead.status).toBe(404);
      expect(errorCode(foreignRead.body)).toBe("profile_not_found");
      expect(JSON.stringify(foreignRead.body)).not.toContain("Тестовий учень B updated");

      const foreignMutation = await primaryPage.evaluate(async ({ apiUrl, accountId }) => {
        const response = await fetch(`${apiUrl}/api/v1/profiles/student/${accountId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Request-ID": "e2e-foreign-write" },
          body: JSON.stringify({ display_name: "Foreign overwrite" }),
        });
        return { status: response.status, body: await response.json() };
      }, { apiUrl: api, accountId: secondaryAccountId });
      expect(foreignMutation.status).toBe(404);
      expect(errorCode(foreignMutation.body)).toBe("profile_not_found");

      const grant = runTrustedProfileCli([
        "e2e-issue-tutor-grant",
        "--subject", secondarySubject!,
        "--operation-id", grantOperationId,
        "--correlation-id", grantCorrelationId,
        "--request-id", grantRequestId,
      ], "tutor_grant_issued");
      expect(grant.account_id).toBe(secondaryAccountId);
      expect(grant.capability_code).toBe("TUTOR_PROFILE_MANAGE_OWN");
      expect(grant.request_id).toBe(grantRequestId);

      const grantAudit = runTrustedProfileCli([
        "e2e-verify-audit",
        "--subject", secondarySubject!,
        "--action", "tutor_capability.granted",
        "--request-id", grantRequestId,
        "--correlation-id", grantCorrelationId,
        "--operation-id", grantOperationId,
      ], "audit_verified");
      expect(grantAudit.account_id).toBe(secondaryAccountId);

      await secondaryPage.setExtraHTTPHeaders({ "X-Request-ID": tutorProfileRequestId });
      await secondaryPage.reload();
      const tutor = secondaryPage.getByRole("region", { name: "Профіль викладача" });
      const tutorName = tutor.getByLabel("Відображуване ім’я");
      await expect(tutorName).toBeVisible();
      await expect(
        tutor.getByRole("button", { name: "Створити профіль" }),
        "The freshly recreated managed identity must not have a pre-existing TutorProfile.",
      ).toBeVisible();
      const tutorResponsePromise = secondaryPage.waitForResponse((response) =>
        response.url().endsWith("/api/v1/profiles/tutor/me")
        && response.request().method() === "PUT",
      );
      await tutorName.fill("  Перевірений   викладач  ");
      await tutorName.focus();
      await secondaryPage.keyboard.press("Enter");
      const tutorResponse = await tutorResponsePromise;
      expect(tutorResponse.ok()).toBe(true);
      expect(tutorResponse.headers()["x-request-id"]).toBe(tutorProfileRequestId);
      await expect(tutor.getByRole("status")).toHaveText("Зміни збережено.");
      await expect(tutorName).toHaveValue("Перевірений викладач");

      const profileAudit = runTrustedProfileCli([
        "e2e-verify-audit",
        "--subject", secondarySubject!,
        "--action", "tutor_profile.created",
        "--request-id", tutorProfileRequestId,
      ], "audit_verified");
      expect(profileAudit.account_id).toBe(secondaryAccountId);
      expect(profileAudit.request_id).toBe(tutorProfileRequestId);
      expect(isCanonicalUuid(profileAudit.correlation_id)).toBe(true);

      await expect(primaryPage.locator('input[name="role"], input[name="account_id"], input[name="capability"]')).toHaveCount(0);
      expect(profileRequests.some((url) => url.endsWith("/api/v1/profiles/student/me"))).toBe(true);
      expect(profileRequests.some((url) => url.endsWith("/api/v1/profiles/tutor/me"))).toBe(true);

      await primaryPage.setViewportSize({ width: 390, height: 844 });
      const dimensions = await primaryPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        localKeys: Object.keys(localStorage),
        sessionKeys: Object.keys(sessionStorage),
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      expect(dimensions.localKeys.filter((key) => /auth|session|token|profile/i.test(key))).toEqual([]);
      expect(dimensions.sessionKeys).toEqual([]);

      await logout(primaryPage);
      const afterLogout = await primaryPage.evaluate(async (url) => (
        await fetch(`${url}/api/v1/me`, { credentials: "include" })
      ).status, api);
      expect(afterLogout).toBe(401);
      await primaryPage.goto(`${web}/ru/account/`);
      await expect(primaryPage.getByRole("link", { name: "Войти" })).toBeVisible();
      await expect(primaryPage.locator("[data-session-status]")).toHaveText(
        "Войдите, чтобы открыть приватные профили.",
      );

      await logout(secondaryPage);
    } finally {
      await primaryContext.close();
      await secondaryContext.close();
    }
  });

  test("completes a two-user FREE booking and preserves its immutable snapshot", async ({ browser }) => {
    test.skip(
      authPhase !== "booking" || !password || !primarySubject || !secondarySubject,
      "booking phase requires runner-provided password and two safe Keycloak subjects",
    );
    test.setTimeout(180_000);
    const tutorContext = await browser.newContext();
    const studentContext = await browser.newContext();
    const tutorPage = await tutorContext.newPage();
    const studentPage = await studentContext.newPage();
    const title = `ET-10.1d ${randomUUID()}`;
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const localInput = [
      startsAt.getFullYear(),
      String(startsAt.getMonth() + 1).padStart(2, "0"),
      String(startsAt.getDate()).padStart(2, "0"),
    ].join("-") + `T${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;

    const responseJson = async (response: import("@playwright/test").Response) => {
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const readBooking = (page: Page, role: "student" | "tutor") => page.evaluate(async ({ url, role: requestedRole }) => {
      const response = await fetch(`${url}/api/v1/bookings/me?role=${requestedRole}`, { credentials: "include" });
      return response.json();
    }, { url: api, role });

    try {
      await login(tutorPage, secondaryUsername, "uk");
      const bookingRoot = tutorPage.locator("[data-booking]");
      await expect(bookingRoot).toBeVisible();
      await expect(bookingRoot.getByRole("note")).toContainText(
        "Платформа не приймає, не підтверджує і не повертає оплату.",
      );
      const createForm = tutorPage.locator("[data-offer-create]");
      await expect(createForm).toBeVisible();
      await createForm.locator('[name="title"]').fill(title);
      await createForm.locator('[name="starts-at"]').fill(localInput);
      await createForm.locator('[name="payment-mode"]').selectOption("FREE");
      const createResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith("/api/v1/tutor-offers") && response.request().method() === "POST",
      );
      await createForm.getByRole("button", { name: "Створити пропозицію" }).click();
      const createdResponse = await createResponse;
      const createPayload = createdResponse.request().postDataJSON() as { starts_at: string };
      const offer = await responseJson(createdResponse);
      expect(offer.payment_mode).toBe("FREE");
      expect(offer.status).toBe("DRAFT");
      const offerCard = tutorPage.locator(`[data-offer-id="${offer.id}"]`);
      await expect(offerCard).toBeVisible();
      const publishResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith(`/tutor-offers/${offer.id}/publish`) && response.request().method() === "POST",
      );
      await offerCard.getByRole("button", { name: "Опублікувати" }).click();
      const published = await responseJson(await publishResponse);
      expect(published.status).toBe("ACTIVE");

      await login(studentPage, primaryUsername, "ru");
      const studentOfferForm = studentPage.locator("[data-offer-lookup]");
      await studentPage.locator("[data-offer-id]").fill(offer.id);
      await studentOfferForm.getByRole("button", { name: "Открыть" }).click();
      const preview = studentPage.locator(`[data-offer-preview] [data-offer-id="${offer.id}"]`);
      await expect(preview).toBeVisible();
      const requestResponse = studentPage.waitForResponse((response) =>
        response.url().endsWith(`/tutor-offers/${offer.id}/bookings`) && response.request().method() === "POST",
      );
      await preview.getByRole("button", { name: "Запросить запись" }).click();
      const requested = await responseJson(await requestResponse);
      expect(requested.status).toBe("REQUESTED");
      const studentBooking = studentPage.locator(`[data-booking-id="${requested.id}"]`);
      await expect(studentBooking).toContainText(title);
      await expect(studentBooking).toContainText("Ожидает ответа");

      await tutorPage.reload();
      const tutorBooking = tutorPage.locator(`[data-booking-id="${requested.id}"]`);
      await expect(tutorBooking).toBeVisible();
      const acceptResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith(`/bookings/${requested.id}/accept`) && response.request().method() === "POST",
      );
      await tutorBooking.getByRole("button", { name: "Прийняти" }).click();
      const accepted = await responseJson(await acceptResponse);
      expect(accepted.status).toBe("ACCEPTED");
      await expect(tutorBooking).toContainText("Підтверджено");

      await studentPage.reload();
      const studentAccepted = studentPage.locator(`[data-booking-id="${requested.id}"]`);
      await expect(studentAccepted).toContainText("Подтверждено");
      await expect(studentAccepted.locator("[data-snapshot-version]")).toHaveAttribute("data-snapshot-version", "1");
      const studentSnapshot = (await readBooking(studentPage, "student")).find((item: { id: string }) => item.id === requested.id).snapshot;

      const revised = await tutorPage.evaluate(async ({ apiUrl, offerValue, originalStartsAt }) => {
        const response = await fetch(`${apiUrl}/api/v1/tutor-offers/${offerValue.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            title: `${offerValue.title} revised`,
            starts_at: originalStartsAt,
            time_zone: offerValue.time_zone,
            duration_minutes: offerValue.duration_minutes,
            minimum_notice_minutes: offerValue.minimum_notice_minutes,
            payment_mode: offerValue.payment_mode,
            amount_minor: offerValue.amount_minor,
            currency: offerValue.currency,
            expected_version: offerValue.version,
          }),
        });
        return { status: response.status, body: await response.json() };
      }, { apiUrl: api, offerValue: published, originalStartsAt: createPayload.starts_at });
      expect(revised.status).toBe(200);
      expect(revised.body.title).toContain("revised");
      await Promise.all([tutorPage.reload(), studentPage.reload()]);
      await expect(tutorPage.locator(`[data-booking-id="${requested.id}"]`)).toContainText(title);
      await expect(studentPage.locator(`[data-booking-id="${requested.id}"]`)).toContainText(title);
      const tutorSnapshot = (await readBooking(tutorPage, "tutor")).find((item: { id: string }) => item.id === requested.id).snapshot;
      expect(tutorSnapshot).toEqual(studentSnapshot);
      expect(tutorSnapshot.offer_title).toBe(title);
      expect(tutorSnapshot.offer_version).toBe(published.version);

      await studentPage.setViewportSize({ width: 390, height: 844 });
      const dimensions = await studentPage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        buttons: [...document.querySelectorAll("[data-booking-id] button")].map((button) => ({
          text: button.textContent?.trim(),
          accessible: button.getAttribute("aria-label"),
        })),
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      expect(dimensions.buttons.every(({ text, accessible }) => Boolean(text || accessible))).toBe(true);
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });

  test("ET-10.2d authorizes both Booking participants, masks the third identity and revokes lesson entry", async ({ browser }) => {
    test.skip(
      authPhase !== "lesson-access" || !password || !primarySubject || !secondarySubject || !thirdSubject,
      "lesson-access phase requires runner-provided password and three managed Keycloak subjects",
    );
    test.setTimeout(180_000);
    const tutorContext = await browser.newContext();
    const studentContext = await browser.newContext();
    const thirdContext = await browser.newContext();
    const tutorPage = await tutorContext.newPage();
    const studentPage = await studentContext.newPage();
    const thirdPage = await thirdContext.newPage();
    const title = `ET-10.2d ${randomUUID()}`;
    const startsAt = new Date(Date.now() + 10 * 60_000);
    const localInput = [
      startsAt.getFullYear(),
      String(startsAt.getMonth() + 1).padStart(2, "0"),
      String(startsAt.getDate()).padStart(2, "0"),
    ].join("-") + `T${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;
    const accessPath = (id: string) => `/api/v1/bookings/${id}/lesson-access`;
    const responseJson = async (response: import("@playwright/test").Response) => {
      expect(response.ok()).toBe(true);
      return response.json();
    };
    try {
      await login(tutorPage, secondaryUsername, "uk");
      const form = tutorPage.locator("[data-offer-create]");
      await expect(form).toBeVisible();
      await form.locator('[name="title"]').fill(title);
      await form.locator('[name="starts-at"]').fill(localInput);
      await form.locator('[name="notice"]').fill("0");
      await form.locator('[name="payment-mode"]').selectOption("FREE");
      const createResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith("/api/v1/tutor-offers") && response.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Створити пропозицію" }).click();
      const offer = await responseJson(await createResponse);
      expect(offer.minimum_notice_minutes).toBe(0);
      const offerCard = tutorPage.locator(`[data-offer-id="${offer.id}"]`);
      await expect(offerCard).toBeVisible();
      const publishResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith(`/tutor-offers/${offer.id}/publish`) && response.request().method() === "POST",
      );
      await offerCard.getByRole("button", { name: "Опублікувати" }).click();
      expect((await responseJson(await publishResponse)).status).toBe("ACTIVE");

      await login(studentPage, primaryUsername, "ru");
      await studentPage.locator("[data-offer-id]").fill(offer.id);
      await studentPage.locator("[data-offer-lookup]").getByRole("button", { name: "Открыть" }).click();
      const preview = studentPage.locator(`[data-offer-preview] [data-offer-id="${offer.id}"]`);
      await expect(preview).toBeVisible();
      const requestResponse = studentPage.waitForResponse((response) =>
        response.url().endsWith(`/tutor-offers/${offer.id}/bookings`) && response.request().method() === "POST",
      );
      await preview.getByRole("button", { name: "Запросить запись" }).click();
      const booking = await responseJson(await requestResponse);
      expect(booking.status).toBe("REQUESTED");
      await tutorPage.reload();
      const tutorBooking = tutorPage.locator(`[data-booking-id="${booking.id}"]`);
      await expect(tutorBooking).toBeVisible();
      const acceptResponse = tutorPage.waitForResponse((response) =>
        response.url().endsWith(`/bookings/${booking.id}/accept`) && response.request().method() === "POST",
      );
      await tutorBooking.getByRole("button", { name: "Прийняти" }).click();
      expect((await responseJson(await acceptResponse)).status).toBe("ACCEPTED");
      await studentPage.reload();
      const studentBooking = studentPage.locator(`[data-booking-id="${booking.id}"]`);
      await expect(studentBooking).toBeVisible();
      await expect(studentBooking.locator("[data-lesson-enter]")).toHaveAttribute(
        "href", `/ru/lesson/#booking=${booking.id}`,
      );

      for (const [page, expectedRole] of [[tutorPage, "tutor"], [studentPage, "student"]] as const) {
        const lang = expectedRole === "tutor" ? "uk" : "ru";
        const accessResponse = page.waitForResponse((response) => response.url().endsWith(accessPath(booking.id)));
        await page.goto(`${web}/${lang}/lesson/#booking=${booking.id}`);
        const decision = await responseJson(await accessResponse);
        expect(decision).toMatchObject({ booking_id: booking.id, status: "ACTIVE", participant_role: expectedRole });
        expect(decision.capabilities).toEqual(["LESSON_SHELL_ENTER"]);
        await expect(page.locator("[data-access-active]")).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/${lang}/lesson/$`));
      }

      await login(thirdPage, thirdUsername, "ru");
      const thirdResponse = thirdPage.waitForResponse((response) => response.url().endsWith(accessPath(booking.id)));
      await thirdPage.goto(`${web}/ru/lesson/#booking=${booking.id}`);
      const denied = await thirdResponse;
      expect(denied.status()).toBe(404);
      expect(errorCode(await denied.json())).toBe("booking_not_found");
      await expect(thirdPage.locator("[data-lesson-access]")).toHaveAttribute("data-state", "notFound");
      await expect(thirdPage.locator("[data-access-active]")).toBeHidden();
      await expect(thirdPage).toHaveURL(new RegExp("/ru/lesson/$"));

      const cancellation = tutorPage.waitForResponse((response) =>
        response.url().endsWith(`/bookings/${booking.id}/cancel`) && response.request().method() === "POST",
      );
      await tutorPage.goto(`${web}/uk/account/`);
      const acceptedCard = tutorPage.locator(`[data-booking-id="${booking.id}"]`);
      await expect(acceptedCard).toBeVisible();
      await acceptedCard.getByRole("button", { name: "Скасувати" }).click();
      expect((await responseJson(await cancellation)).status).toBe("CANCELLED");
      for (const [page, lang] of [[tutorPage, "uk"], [studentPage, "ru"]] as const) {
        const responsePromise = page.waitForResponse((response) => response.url().endsWith(accessPath(booking.id)));
        await page.goto(`${web}/${lang}/lesson/#booking=${booking.id}`);
        const revoked = await responsePromise;
        expect(revoked.status()).toBe(403);
        expect(errorCode(await revoked.json())).toBe("lesson_access_revoked");
        await expect(page.locator("[data-access-active]")).toBeHidden();
        await expect(page.locator("[data-lesson-access]")).toHaveAttribute("data-state", "revoked");
      }
    } finally {
      await tutorContext.close();
      await studentContext.close();
      await thirdContext.close();
    }
  });

  test("keeps the immutable identity after trusted provider email reconciliation", async ({ page }) => {
    test.skip(
      authPhase !== "identity-change" || !password || !primarySubject,
      "identity-change phase requires runner-provided password and safe primary subject",
    );
    const changedEmail = process.env.ET_DEV_TEST_EMAIL;
    expect(changedEmail).toBe("et-dev-acceptance-changed@invalid.example");
    await login(page, primaryUsername);
    const changed = await page.evaluate(async (url) => (
      await fetch(`${url}/api/v1/me`, { credentials: "include" })
    ).json(), api);
    expect(changed.subject).toBe(primarySubject);
    expect(changed.email).toBe(changedEmail);
    expect(changed).not.toHaveProperty("account_id");
    await logout(page);
  });

  test("Keycloak rejects an unregistered redirect URI", async ({ request }) => {
    test.skip(authPhase !== "profiles", "redirect rejection runs in the primary live phase");
    const response = await request.get(
      `${idp}/realms/electro-tutor-dev/protocol/openid-connect/auth?client_id=electro-tutor-web-dev&response_type=code&redirect_uri=${encodeURIComponent("http://127.0.0.1:9999/evil")}&scope=openid&state=${randomUUID()}`,
      { maxRedirects: 0 },
    );
    expect([400, 403]).toContain(response.status());
  });
});
