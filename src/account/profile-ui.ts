import { getLocale, normalizeLanguage } from "../i18n";
import {
  fetchCurrentSession,
  fetchOwnProfile,
  normalizeDisplayName,
  resolveLocalApiOrigin,
  writeOwnProfile,
  type OwnProfile,
  type ProfileKind,
  type ProfileResult,
} from "./profile-contract";

type ProfileState =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "active"; profile: OwnProfile; saved: boolean }
  | { kind: "permission" }
  | { kind: "error"; message: string };

interface ProfileElements {
  card: HTMLElement;
  status: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  submit: HTMLButtonElement;
  error: HTMLElement;
  permission: HTMLElement;
  retry: HTMLButtonElement;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing account UI element: ${selector}`);
  return element;
}

function profileElements(root: HTMLElement, kind: ProfileKind): ProfileElements {
  const card = requiredElement<HTMLElement>(root, `[data-profile-card="${kind}"]`);
  return {
    card,
    status: requiredElement(card, "[data-profile-status]"),
    form: requiredElement(card, "[data-profile-form]"),
    input: requiredElement(card, "[data-profile-name]"),
    submit: requiredElement(card, "[data-profile-submit]"),
    error: requiredElement(card, "[data-profile-error]"),
    permission: requiredElement(card, "[data-profile-permission]"),
    retry: requiredElement(card, "[data-profile-retry]"),
  };
}

export function mountAccountProfile(): void {
  const root = document.querySelector<HTMLElement>("[data-account]");
  if (!root) return;

  const language = normalizeLanguage(document.documentElement.lang);
  const copy = getLocale(language).account;
  const apiOrigin = resolveLocalApiOrigin(window.location);
  const sessionStatus = requiredElement<HTMLElement>(root, "[data-session-status]");
  const sessionRegion = requiredElement<HTMLElement>(root, "[data-session-region]");
  const identity = requiredElement<HTMLElement>(root, "[data-identity]");
  const login = requiredElement<HTMLAnchorElement>(root, "[data-login]");
  const logoutForm = requiredElement<HTMLFormElement>(root, "[data-logout-form]");
  const profiles = requiredElement<HTMLElement>(root, "[data-profiles]");
  const cards = {
    student: profileElements(root, "student"),
    tutor: profileElements(root, "tutor"),
  };
  let sessionVersion = 0;
  let authenticated = false;
  const profileStates: Record<ProfileKind, ProfileState> = {
    student: { kind: "loading" },
    tutor: { kind: "loading" },
  };

  const setFormBusy = (elements: ProfileElements, busy: boolean) => {
    elements.form.setAttribute("aria-busy", String(busy));
    elements.input.disabled = busy;
    elements.submit.disabled = busy;
  };

  const validationMessage = (reason: "required" | "too_long" | "control_character") => ({
    required: copy.validationRequired,
    too_long: copy.validationTooLong,
    control_character: copy.validationControl,
  })[reason];

  const renderProfile = (kind: ProfileKind, state: ProfileState) => {
    profileStates[kind] = state;
    const elements = cards[kind];
    elements.card.dataset.state = state.kind;
    elements.card.setAttribute("aria-busy", String(state.kind === "loading"));
    elements.form.hidden = true;
    elements.permission.hidden = true;
    elements.retry.hidden = true;
    elements.error.hidden = true;
    elements.error.textContent = "";
    setFormBusy(elements, false);

    if (state.kind === "loading") {
      elements.status.textContent = copy.loadingProfile;
      return;
    }
    if (state.kind === "permission") {
      elements.status.textContent = copy.permissionTitle;
      elements.permission.hidden = false;
      return;
    }
    if (state.kind === "error") {
      elements.status.textContent = state.message;
      elements.retry.hidden = false;
      return;
    }

    elements.form.hidden = false;
    if (state.kind === "absent") {
      elements.status.textContent = kind === "student" ? copy.absentStudent : copy.absentTutor;
      elements.input.value = "";
      elements.submit.textContent = copy.create;
      return;
    }

    elements.input.value = state.profile.displayName;
    elements.submit.textContent = copy.save;
    elements.status.textContent = state.saved
      ? copy.saved
      : kind === "student" ? copy.activeStudent : copy.activeTutor;
  };

  const renderSignedOut = (message = copy.signedOut) => {
    authenticated = false;
    sessionVersion += 1;
    sessionRegion.setAttribute("aria-busy", "false");
    sessionStatus.textContent = message;
    identity.hidden = true;
    identity.textContent = "";
    login.hidden = false;
    logoutForm.hidden = true;
    profiles.hidden = true;
  };

  const renderSessionError = (message: string) => {
    authenticated = false;
    sessionVersion += 1;
    sessionRegion.setAttribute("aria-busy", "false");
    sessionStatus.textContent = message;
    identity.hidden = true;
    identity.textContent = "";
    login.hidden = true;
    logoutForm.hidden = true;
    profiles.hidden = true;
  };

  if (!apiOrigin) {
    renderSessionError(copy.localOnly);
    return;
  }

  login.href = `${new URL("/api/v1/auth/login", apiOrigin)}?return_to=${encodeURIComponent(window.location.href)}`;
  logoutForm.action = `${new URL("/api/v1/auth/logout", apiOrigin)}?post_logout_redirect_uri=${encodeURIComponent(`${window.location.origin}/`)}`;

  const profileErrorMessage = (result: Extract<ProfileResult, { ok: false }>) => {
    if (result.code === "audit_unavailable") return copy.auditUnavailable;
    if (result.code === "invalid_request") return copy.validationRejected;
    if (result.code === "profile_already_exists") return copy.conflict;
    return copy.profileUnavailable;
  };

  const loadProfile = async (kind: ProfileKind, version: number) => {
    renderProfile(kind, { kind: "loading" });
    const result = await fetchOwnProfile(window.fetch.bind(window), apiOrigin, kind);
    if (!authenticated || version !== sessionVersion) return;
    if (result.ok) {
      renderProfile(kind, { kind: "active", profile: result.profile, saved: false });
    } else if (result.code === "profile_not_found") {
      renderProfile(kind, { kind: "absent" });
    } else if (result.code === "capability_required") {
      renderProfile(kind, { kind: "permission" });
    } else if (result.code === "authentication_required") {
      renderSignedOut(copy.sessionExpired);
    } else {
      renderProfile(kind, { kind: "error", message: profileErrorMessage(result) });
    }
  };

  const loadSession = async () => {
    const version = ++sessionVersion;
    authenticated = false;
    sessionRegion.setAttribute("aria-busy", "true");
    sessionStatus.textContent = copy.checkingSession;
    login.hidden = true;
    logoutForm.hidden = true;
    profiles.hidden = true;
    const result = await fetchCurrentSession(window.fetch.bind(window), apiOrigin);
    if (version !== sessionVersion) return;
    if (!result.ok) {
      if (result.code === "authentication_required" || result.status === 401) renderSignedOut();
      else renderSessionError(copy.sessionUnavailable);
      return;
    }

    authenticated = true;
    sessionRegion.setAttribute("aria-busy", "false");
    identity.textContent = `${copy.signedInAs} ${result.identityLabel}`;
    identity.hidden = false;
    login.hidden = true;
    logoutForm.hidden = false;
    profiles.hidden = false;
    sessionStatus.textContent = copy.manageProfiles;
    await Promise.all([loadProfile("student", version), loadProfile("tutor", version)]);
  };

  for (const kind of ["student", "tutor"] as const) {
    const elements = cards[kind];
    elements.retry.addEventListener("click", () => {
      if (authenticated) void loadProfile(kind, sessionVersion);
    });
    elements.input.addEventListener("input", () => {
      elements.error.hidden = true;
      elements.error.textContent = "";
      elements.input.removeAttribute("aria-invalid");
    });
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const validation = normalizeDisplayName(elements.input.value);
      if (!validation.ok) {
        const message = validationMessage(validation.reason);
        elements.error.textContent = message;
        elements.error.hidden = false;
        elements.input.setAttribute("aria-invalid", "true");
        elements.input.focus();
        return;
      }

      const previousState = profileStates[kind];
      const method = previousState.kind === "active" ? "PATCH" : "PUT";
      elements.status.textContent = copy.saving;
      elements.error.hidden = true;
      elements.input.removeAttribute("aria-invalid");
      setFormBusy(elements, true);
      const version = sessionVersion;
      const result = await writeOwnProfile(
        window.fetch.bind(window),
        apiOrigin,
        kind,
        method,
        validation.value,
      );
      if (!authenticated || version !== sessionVersion) return;
      if (result.ok) {
        renderProfile(kind, { kind: "active", profile: result.profile, saved: true });
        return;
      }
      if (result.code === "authentication_required") {
        renderSignedOut(copy.sessionExpired);
        return;
      }
      if (result.code === "capability_required") {
        renderProfile(kind, { kind: "permission" });
        return;
      }
      if (result.code === "profile_not_found") {
        renderProfile(kind, { kind: "absent" });
        return;
      }

      renderProfile(kind, previousState);
      elements.input.value = validation.value;
      elements.error.textContent = profileErrorMessage(result);
      elements.error.hidden = false;
      elements.input.setAttribute("aria-invalid", "true");
      elements.input.focus();
    });
  }

  void loadSession();
}
