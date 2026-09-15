import { getLocale, normalizeLanguage } from "../i18n";
import { resolveLocalApiOrigin } from "./profile-contract";
import { bookingIdFromFragment, readLessonAccess, type LessonAccessResult } from "./lesson-access-contract";

export function mountLessonAccess(): void {
  const root = document.querySelector<HTMLElement>("[data-lesson-access]");
  if (!root) return;
  const status = root.querySelector<HTMLElement>("[data-access-status]");
  const region = root.querySelector<HTMLElement>("[data-access-active]");
  const retry = root.querySelector<HTMLButtonElement>("[data-access-retry]");
  const login = root.querySelector<HTMLAnchorElement>("[data-access-login]");
  const role = root.querySelector<HTMLElement>("[data-access-role]");
  if (!status || !region || !retry || !login || !role) throw new Error("Missing lesson access UI element");
  const language = normalizeLanguage(document.documentElement.lang);
  const copy = getLocale(language).lessonAccess;
  const apiOrigin = resolveLocalApiOrigin(window.location);
  let bookingId = bookingIdFromFragment(window.location.hash);
  if (window.location.hash) {
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  let generation = 0;
  let hasEntered = false;
  const render = (state: keyof typeof copy, retryable = false) => {
    root.dataset.state = state;
    status.textContent = copy[state];
    region.hidden = true;
    role.textContent = "";
    retry.hidden = !retryable;
    login.hidden = state !== "signedOut";
    root.setAttribute("aria-busy", String(state === "loading"));
    if (state !== "loading") hasEntered = false;
  };
  if (!apiOrigin) { render("localOnly"); return; }
  const returnTo = `${window.location.origin}/${language}/account/`;
  login.href = `${new URL("/api/v1/auth/login", apiOrigin)}?return_to=${encodeURIComponent(returnTo)}`;

  const applyDecision = (decision: LessonAccessResult) => {
    if (decision.ok) {
      render("active");
      role.textContent = decision.role === "tutor" ? copy.tutor : copy.student;
      region.hidden = false;
      hasEntered = true;
      return;
    }
    if (decision.status === 401 || decision.code === "authentication_required") render("signedOut");
    else if (decision.status === 404 || decision.code === "booking_not_found") render("notFound");
    else if (decision.code === "lesson_access_not_yet_valid") render("notYetValid");
    else if (decision.code === "lesson_access_expired") render("expired");
    else if (decision.code === "lesson_access_revoked") render("revoked");
    else if (decision.code === "lesson_access_unavailable") render("unavailable");
    else render("dependencyError", true);
  };
  const check = async () => {
    const captured = ++generation;
    const id = bookingId;
    if (!id) { render("notFound"); return; }
    render("loading");
    const decision = await readLessonAccess(window.fetch.bind(window), apiOrigin, id);
    if (captured !== generation) return;
    applyDecision(decision);
  };
  retry.addEventListener("click", () => void check());
  window.addEventListener("hashchange", () => {
    bookingId = bookingIdFromFragment(window.location.hash);
    if (window.location.hash) {
      history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    void check();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && hasEntered) void check();
  });
  window.addEventListener("focus", () => {
    if (hasEntered) void check();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasEntered) void check();
  });
  void check();
}
