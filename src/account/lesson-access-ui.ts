import { getLocale, normalizeLanguage } from "../i18n";
import { resolveLocalApiOrigin } from "./profile-contract";
import { bookingIdFromFragment, readLessonAccess, type LessonAccessResult } from "./lesson-access-contract";
import { joinLessonSession, readLessonSession, sessionIdFromFragment, transitionLessonSession, type LessonSession, type LessonSessionResult } from "./lesson-session-contract";

const sessionCopy = {
  ru: { joining: "Создаём или восстанавливаем занятие…", loading: "Восстанавливаем состояние занятия…", waiting: "Ожидаем преподавателя.", readyTutor: "Занятие готово. Преподаватель может начать его по расписанию.", active: "Занятие идёт.", ended: "Занятие завершено.", cancelled: "Занятие отменено.", closed: "Время доступа к занятию завершилось.", unavailable: "Состояние занятия недоступно. Повторите проверку.", denied: "Доступ к занятию не подтверждён.", role: "Роль:", topic: "Текущая тема: пока не выбрана.", busy: "Сохраняем изменение…" },
  uk: { joining: "Створюємо або відновлюємо заняття…", loading: "Відновлюємо стан заняття…", waiting: "Очікуємо викладача.", readyTutor: "Заняття готове. Викладач може розпочати його за розкладом.", active: "Заняття триває.", ended: "Заняття завершено.", cancelled: "Заняття скасовано.", closed: "Час доступу до заняття завершився.", unavailable: "Стан заняття недоступний. Повторіть перевірку.", denied: "Доступ до заняття не підтверджено.", role: "Роль:", topic: "Поточна тема: поки не вибрана.", busy: "Зберігаємо зміну…" },
} as const;

export function mountLessonAccess(): void {
  const root = document.querySelector<HTMLElement>("[data-lesson-access]");
  if (!root) return;
  const status = root.querySelector<HTMLElement>("[data-access-status]");
  const region = root.querySelector<HTMLElement>("[data-access-active]");
  const retry = root.querySelector<HTMLButtonElement>("[data-access-retry]");
  const login = root.querySelector<HTMLAnchorElement>("[data-access-login]");
  const role = root.querySelector<HTMLElement>("[data-access-role]");
  const sessionRegion = root.querySelector<HTMLElement>("[data-lesson-session]");
  const sessionMessage = root.querySelector<HTMLElement>("[data-session-message]");
  const sessionStatus = root.querySelector<HTMLElement>("[data-session-status]");
  const sessionRole = root.querySelector<HTMLElement>("[data-session-role]");
  const sessionTopic = root.querySelector<HTMLElement>("[data-session-topic]");
  const start = root.querySelector<HTMLButtonElement>("[data-session-start]");
  const end = root.querySelector<HTMLButtonElement>("[data-session-end]");
  if (!status || !region || !retry || !login || !role || !sessionRegion || !sessionMessage || !sessionStatus || !sessionRole || !sessionTopic || !start || !end) throw new Error("Missing lesson access UI element");
  const language = normalizeLanguage(document.documentElement.lang);
  const copy = getLocale(language).lessonAccess;
  const sessionText = sessionCopy[language];
  const apiOrigin = resolveLocalApiOrigin(window.location);
  let bookingId = new URLSearchParams(window.location.hash.slice(1)).has("session")
    ? null : bookingIdFromFragment(window.location.hash);
  let sessionId = sessionIdFromFragment(window.location.hash);
  if (window.location.hash && !sessionId) {
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  let generation = 0;
  let hasEntered = false;
  let currentSession: LessonSession | null = null;
  let pendingJoin: { booking: string; key: string } | null = null;
  const hideSession = () => {
    currentSession = null;
    sessionRegion.hidden = true;
    delete sessionRegion.dataset.status;
    delete sessionRegion.dataset.role;
    delete sessionRegion.dataset.version;
    sessionMessage.hidden = true;
    sessionStatus.textContent = "";
    sessionRole.textContent = "";
    sessionTopic.textContent = "";
    start.hidden = true;
    end.hidden = true;
  };
  const message = (value: string) => { sessionMessage.textContent = value; sessionMessage.hidden = false; };
  const showSession = (session: LessonSession) => {
    currentSession = session;
    sessionMessage.hidden = true;
    sessionRegion.hidden = false;
    sessionRegion.dataset.status = session.effective_status;
    sessionRegion.dataset.role = session.participant_role;
    sessionRegion.dataset.version = String(session.version);
    sessionStatus.textContent = session.effective_status === "WINDOW_CLOSED" ? sessionText.closed
      : session.status === "READY" ? (session.participant_role === "student" ? sessionText.waiting : sessionText.readyTutor)
      : session.status === "ACTIVE" ? sessionText.active
      : session.status === "ENDED" ? sessionText.ended : sessionText.cancelled;
    sessionRole.textContent = `${sessionText.role} ${session.participant_role === "tutor" ? copy.tutor : copy.student}`;
    sessionTopic.textContent = sessionText.topic;
    start.hidden = !session.capabilities.includes("SESSION_START") || session.status !== "READY" || session.effective_status === "WINDOW_CLOSED";
    end.hidden = !session.capabilities.includes("SESSION_END") || session.status !== "ACTIVE" || session.effective_status === "WINDOW_CLOSED";
    // READY may gain tutor START at the scheduled DB-time boundary; ACTIVE
    // may change in another tab. Recheck the server rather than client time.
    retry.hidden = session.status === "ENDED" || session.status === "CANCELLED";
  };
  const render = (state: keyof typeof copy, retryable = false) => {
    hideSession();
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
  const applySession = (result: LessonSessionResult, captured: number, booking?: string) => {
    if (captured !== generation) return;
    if (result.ok) {
      if (booking) {
        pendingJoin = null;
        sessionId = result.session.id;
        history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}#session=${sessionId}`);
      }
      showSession(result.session);
      return;
    }
    if (result.status === 401 || result.code === "authentication_required") { render("signedOut"); return; }
    if (!booking) {
      if (result.status === 404 || result.code === "lesson_session_not_found") render("notFound");
      else if (result.code === "lesson_access_not_yet_valid") render("notYetValid");
      else if (result.code === "lesson_access_expired") render("expired");
      else if (result.code === "lesson_access_revoked") render("revoked");
      else if (result.status === 403) render("unavailable");
      else render("dependencyError", true);
      return;
    }
    hideSession();
    message(result.status === 403 || result.status === 404 ? sessionText.denied : sessionText.unavailable);
    retry.hidden = false;
  };
  const refreshSession = async (captured: number, id: string) => {
    message(sessionText.loading);
    const result = await readLessonSession(window.fetch.bind(window), apiOrigin!, id);
    applySession(result, captured);
  };
  const check = async () => {
    const captured = ++generation;
    hideSession();
    if (sessionId) {
      render("loading");
      await refreshSession(captured, sessionId);
      if (captured === generation && currentSession) {
        root.dataset.state = "active";
        status.textContent = copy.active;
        role.textContent = currentSession.participant_role === "tutor" ? copy.tutor : copy.student;
        region.hidden = false;
        root.setAttribute("aria-busy", "false");
        hasEntered = true;
      }
      return;
    }
    const id = bookingId;
    if (!id) { render("notFound"); return; }
    render("loading");
    const decision = await readLessonAccess(window.fetch.bind(window), apiOrigin, id);
    if (captured !== generation) return;
    applyDecision(decision);
    if (decision.ok) {
      message(sessionText.joining);
      // A new request key belongs to this join attempt only. A failed mutation
      // is reconciled by a fresh server read, never by client-local Session state.
      if (!pendingJoin || pendingJoin.booking !== id) pendingJoin = { booking: id, key: crypto.randomUUID() };
      const joined = await joinLessonSession(window.fetch.bind(window), apiOrigin!, id, pendingJoin.key, decision.role);
      applySession(joined, captured, id);
    }
  };
  const transition = async (command: "start" | "end") => {
    const session = currentSession;
    if (!session || !apiOrigin || !session.capabilities.includes(command === "start" ? "SESSION_START" : "SESSION_END")) return;
    const captured = ++generation;
    hideSession();
    message(sessionText.busy);
    const result = await transitionLessonSession(window.fetch.bind(window), apiOrigin, session, command, crypto.randomUUID());
    if (captured !== generation) return;
    if (result.ok) applySession(result, captured);
    else if (result.status === 401) render("signedOut");
    else await refreshSession(captured, session.id);
  };
  start.addEventListener("click", () => void transition("start"));
  end.addEventListener("click", () => void transition("end"));
  retry.addEventListener("click", () => void check());
  window.addEventListener("hashchange", () => {
    bookingId = new URLSearchParams(window.location.hash.slice(1)).has("session")
      ? null : bookingIdFromFragment(window.location.hash);
    sessionId = sessionIdFromFragment(window.location.hash);
    pendingJoin = null;
    if (window.location.hash && !sessionId) {
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
