import { formatMinutes, getLocale, normalizeLanguage } from "../i18n";
import { resolveLocalApiOrigin } from "./profile-contract";
import {
  browserTimeZone,
  bookingErrorKey,
  createOffer,
  formatBookingMoney,
  formatBookingTime,
  isOpaqueUuid,
  listBookings,
  listOwnOffers,
  readOffer,
  requestBooking,
  toOffsetRfc3339,
  transitionBooking,
  transitionOffer,
  MutationAttemptStore,
  SessionGeneration,
  snapshotTimeZone,
  type Booking,
  type BookingApiResult,
  type BookingRole,
  type TutorOffer,
} from "./booking-contract";

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing booking UI element: ${selector}`);
  return element;
}

function textElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function mountBooking(): void {
  const account = document.querySelector<HTMLElement>("[data-account]");
  if (!account) return;
  const root = required<HTMLElement>(account, "[data-booking]");
  const apiOrigin = resolveLocalApiOrigin(window.location);
  if (!apiOrigin) return;

  const language = normalizeLanguage(document.documentElement.lang);
  const copy = getLocale(language).account.booking;
  const fetcher = window.fetch.bind(window);
  const offerForm = required<HTMLFormElement>(root, "[data-offer-lookup]");
  const offerIdInput = required<HTMLInputElement>(root, "[data-offer-id]");
  const offerError = required<HTMLElement>(root, "[data-offer-error]");
  const offerState = required<HTMLElement>(root, "[data-offer-state]");
  const offerPreview = required<HTMLElement>(root, "[data-offer-preview]");
  const tutorState = required<HTMLElement>(root, "[data-tutor-state]");
  const createForm = required<HTMLFormElement>(root, "[data-offer-create]");
  const createError = required<HTMLElement>(root, "[data-create-error]");
  const ownOffers = required<HTMLElement>(root, "[data-offer-list]");
  const timeZone = browserTimeZone();
  const attempts = new MutationAttemptStore(() => crypto.randomUUID());
  let activeOffer: TutorOffer | null = null;
  const sessionGeneration = new SessionGeneration();

  const statusLabel = (status: TutorOffer["status"] | Booking["status"]) => ({
    DRAFT: copy.statusDraft,
    ACTIVE: copy.statusActive,
    RETIRED: copy.statusRetired,
    REQUESTED: copy.statusRequested,
    ACCEPTED: copy.statusAccepted,
    DECLINED: copy.statusDeclined,
    CANCELLED: copy.statusCancelled,
  })[status];

  const renderError = (element: HTMLElement, result: Extract<BookingApiResult<unknown>, { ok: false }>) => {
    if (result.code === "authentication_required" || result.status === 401) {
      account.dispatchEvent(new CustomEvent("account:session-expired"));
      return false;
    }
    element.textContent = copy[bookingErrorKey(result.code)];
    return true;
  };

  const mutate = async <T>(
    slot: string,
    intent: string,
    request: (operationId: string) => Promise<BookingApiResult<T>>,
  ) => {
    const captured = sessionGeneration.capture();
    const result = await request(attempts.operationFor(slot, intent));
    attempts.settle(slot, intent, result);
    return sessionGeneration.isCurrent(captured) ? result : null;
  };

  const terms = (offer: TutorOffer) => {
    const list = document.createElement("dl");
    list.className = "booking-terms";
    const rows = [
      [copy.starts, formatBookingTime(language, offer.startsAt, offer.timeZone)],
      [copy.ends, formatBookingTime(language, offer.endsAt, offer.timeZone)],
      [copy.duration, formatMinutes(language, offer.durationMinutes)],
      [copy.terms, offer.paymentMode === "FREE" ? copy.free : formatBookingMoney(language, offer.paymentMode, offer.amountMinor, offer.currency)],
    ];
    for (const [label, value] of rows) {
      list.append(textElement("dt", "", label), textElement("dd", "", value));
    }
    return list;
  };

  const snapshot = (booking: Booking, role: BookingRole) => {
    const box = document.createElement("div");
    box.className = "booking-snapshot";
    box.dataset.snapshotVersion = String(booking.snapshot.snapshotVersion);
    box.append(textElement("strong", "", copy.snapshot));
    const list = document.createElement("dl");
    list.className = "booking-terms";
    const rows = [
      [copy.snapshotVersion, String(booking.snapshot.snapshotVersion)],
      [copy.offerVersion, String(booking.snapshot.offerVersion)],
      [copy.starts, formatBookingTime(language, booking.snapshot.startsAt, snapshotTimeZone(booking.snapshot, role))],
      [copy.ends, formatBookingTime(language, booking.snapshot.endsAt, snapshotTimeZone(booking.snapshot, role))],
      [copy.duration, formatMinutes(language, booking.snapshot.durationMinutes)],
      [copy.terms, booking.snapshot.paymentMode === "FREE" ? copy.free : formatBookingMoney(language, booking.snapshot.paymentMode, booking.snapshot.amountMinor, booking.snapshot.currency)],
    ];
    for (const [label, value] of rows) list.append(textElement("dt", "", label), textElement("dd", "", value));
    box.append(list);
    if (booking.snapshot.paymentMode === "EXTERNAL") box.append(textElement("p", "booking-external-note", copy.externalDisclaimer));
    return box;
  };

  const actionButton = (label: string, action: () => Promise<void>) => {
    const button = document.createElement("button");
    button.className = "button ghost";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async () => {
      const captured = sessionGeneration.capture();
      button.disabled = true;
      try {
        await action();
      } finally {
        if (sessionGeneration.isCurrent(captured) && button.isConnected) button.disabled = false;
      }
    });
    return button;
  };

  const renderOffer = (offer: TutorOffer, owner: boolean) => {
    const card = document.createElement("article");
    card.className = "booking-item";
    card.dataset.offerId = offer.id;
    card.dataset.status = offer.status;
    const heading = textElement("h4", "", offer.title);
    const badge = textElement("span", "booking-badge", statusLabel(offer.status));
    card.append(heading, badge, terms(offer));
    const identifier = textElement("code", "booking-id", offer.id);
    identifier.title = copy.offerIdLabel;
    card.append(identifier);
    const actions = document.createElement("div");
    actions.className = "booking-actions";
    if (owner && offer.status === "DRAFT") {
      actions.append(actionButton(copy.publish, async () => {
        const intent = JSON.stringify({ expectedVersion: offer.version });
        const result = await mutate(`offer:publish:${offer.id}`, intent, (id) => transitionOffer(fetcher, apiOrigin, offer, "publish", id));
        if (!result) return;
        if (!result.ok) {
          renderError(tutorState, result);
          return;
        }
        tutorState.textContent = copy.updated;
        await loadTutorOffers();
      }));
    }
    if (owner && offer.status !== "RETIRED") {
      actions.append(actionButton(copy.retire, async () => {
        const intent = JSON.stringify({ expectedVersion: offer.version });
        const result = await mutate(`offer:retire:${offer.id}`, intent, (id) => transitionOffer(fetcher, apiOrigin, offer, "retire", id));
        if (!result) return;
        if (!result.ok) {
          renderError(tutorState, result);
          return;
        }
        tutorState.textContent = copy.updated;
        await loadTutorOffers();
      }));
    }
    if (!owner && offer.status === "ACTIVE" && timeZone !== null) {
      actions.append(actionButton(copy.request, async () => {
        offerState.textContent = copy.loading;
        const intent = JSON.stringify({ offerVersion: offer.version, timeZone });
        const result = await mutate(`booking:request:${offer.id}`, intent, (id) => requestBooking(fetcher, apiOrigin, offer, timeZone, id));
        if (!result) return;
        if (!result.ok) {
          renderError(offerState, result);
          return;
        }
        offerState.textContent = copy.requested;
        await loadBookings("student");
      }));
    } else if (!owner && offer.status === "ACTIVE") {
      card.append(textElement("p", "profile-error", copy.invalidForm));
    }
    card.append(actions);
    return card;
  };

  const renderBooking = (booking: Booking, role: BookingRole) => {
    const card = document.createElement("article");
    card.className = "booking-item";
    card.dataset.bookingId = booking.id;
    card.dataset.status = booking.status;
    card.append(textElement("h4", "", booking.snapshot.offerTitle));
    card.append(textElement("span", "booking-badge", statusLabel(booking.status)));
    card.append(snapshot(booking, role));
    const actions = document.createElement("div");
    actions.className = "booking-actions";
    const run = (action: "accept" | "decline" | "cancel") => async () => {
      const state = required<HTMLElement>(root, `[data-booking-state="${role}"]`);
      state.textContent = copy.loading;
      const intent = JSON.stringify({ expectedVersion: booking.version });
      const result = await mutate(`booking:${action}:${booking.id}`, intent, (id) => transitionBooking(fetcher, apiOrigin, booking, action, id));
      if (!result) return;
      if (!result.ok) {
        renderError(state, result);
        return;
      }
      state.textContent = copy.updated;
      await Promise.all([loadBookings("student"), loadBookings("tutor")]);
    };
    if (role === "tutor" && booking.status === "REQUESTED") {
      actions.append(actionButton(copy.accept, run("accept")), actionButton(copy.decline, run("decline")));
    }
    if ((role === "student" && booking.status === "REQUESTED") || booking.status === "ACCEPTED") {
      actions.append(actionButton(copy.cancel, run("cancel")));
    }
    card.append(actions);
    return card;
  };

  const loadOffer = async (id: string) => {
    const captured = sessionGeneration.capture();
    offerState.textContent = copy.loading;
    offerPreview.replaceChildren();
    activeOffer = null;
    const result = await readOffer(fetcher, apiOrigin, id);
    if (!sessionGeneration.isCurrent(captured)) return;
    if (!result.ok) {
      renderError(offerState, result);
      return;
    }
    activeOffer = result.value;
    offerState.textContent = "";
    offerPreview.append(renderOffer(activeOffer, false));
  };

  const loadTutorOffers = async () => {
    const captured = sessionGeneration.capture();
    tutorState.textContent = copy.loading;
    ownOffers.replaceChildren();
    const result = await listOwnOffers(fetcher, apiOrigin);
    if (!sessionGeneration.isCurrent(captured)) return;
    if (!result.ok) {
      if (!renderError(tutorState, result)) return;
      createForm.hidden = result.code === "capability_required";
      return;
    }
    createForm.hidden = false;
    tutorState.textContent = result.value.length ? "" : copy.empty;
    for (const offer of result.value) ownOffers.append(renderOffer(offer, true));
  };

  const loadBookings = async (role: BookingRole) => {
    const captured = sessionGeneration.capture();
    const state = required<HTMLElement>(root, `[data-booking-state="${role}"]`);
    const list = required<HTMLElement>(root, `[data-booking-list="${role}"]`);
    state.textContent = copy.loading;
    list.replaceChildren();
    const result = await listBookings(fetcher, apiOrigin, role);
    if (!sessionGeneration.isCurrent(captured)) return;
    if (!result.ok) {
      renderError(state, result);
      return;
    }
    state.textContent = result.value.length ? "" : copy.empty;
    for (const booking of result.value) list.append(renderBooking(booking, role));
  };

  offerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = offerIdInput.value.trim().toLowerCase();
    offerError.hidden = true;
    offerIdInput.removeAttribute("aria-invalid");
    if (!isOpaqueUuid(id)) {
      offerError.textContent = copy.invalidOfferId;
      offerError.hidden = false;
      offerIdInput.setAttribute("aria-invalid", "true");
      offerIdInput.focus();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("offer", id);
    history.replaceState(null, "", url);
    void loadOffer(id);
  });

  const paymentMode = required<HTMLSelectElement>(createForm, '[name="payment-mode"]');
  const amountField = required<HTMLElement>(createForm, "[data-external-amount]");
  const currencyField = required<HTMLElement>(createForm, "[data-external-currency]");
  const syncMoneyFields = () => {
    const external = paymentMode.value === "EXTERNAL";
    amountField.hidden = !external;
    currencyField.hidden = !external;
  };
  paymentMode.addEventListener("change", syncMoneyFields);
  syncMoneyFields();
  const timeZoneInput = required<HTMLInputElement>(createForm, '[name="time-zone"]');
  const createSubmit = required<HTMLButtonElement>(createForm, 'button[type="submit"]');
  timeZoneInput.value = timeZone ?? "";
  if (timeZone === null) {
    createError.textContent = copy.invalidForm;
    createError.hidden = false;
    createSubmit.disabled = true;
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    createError.hidden = true;
    if (timeZone === null) {
      createError.textContent = copy.invalidForm;
      createError.hidden = false;
      createSubmit.disabled = true;
      return;
    }
    const form = new FormData(createForm);
    const startsAt = toOffsetRfc3339(String(form.get("starts-at") ?? ""));
    const title = String(form.get("title") ?? "").normalize("NFC").trim().replace(/\s+/gu, " ");
    const external = form.get("payment-mode") === "EXTERNAL";
    const amountText = String(form.get("amount") ?? "").replace(",", ".");
    const amountMatch = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amountText);
    const amountMinor = external && amountMatch
      ? Number(amountMatch[1]) * 100 + Number((amountMatch[2] ?? "").padEnd(2, "0"))
      : 0;
    if (!title || !startsAt || (external && (!amountMatch || amountMinor < 1 || amountMinor > 100_000_000))) {
      createError.textContent = copy.invalidForm;
      createError.hidden = false;
      return;
    }
    const submit = createSubmit;
    submit.disabled = true;
    createForm.setAttribute("aria-busy", "true");
    const input = {
      title,
      startsAt,
      timeZone,
      durationMinutes: Number(form.get("duration")),
      minimumNoticeMinutes: Number(form.get("notice")),
      paymentMode: external ? "EXTERNAL" : "FREE",
      amountMinor,
      currency: external ? String(form.get("currency")) as "UAH" | "EUR" | "USD" : null,
    } as const;
    const intent = JSON.stringify(input);
    const result = await mutate("offer:create", intent, (id) => createOffer(fetcher, apiOrigin, input, id));
    if (!result) return;
    submit.disabled = false;
    createForm.setAttribute("aria-busy", "false");
    if (!result.ok) {
      if (!renderError(createError, result)) return;
      createError.hidden = false;
      return;
    }
    tutorState.textContent = copy.created;
    createForm.reset();
    paymentMode.value = "FREE";
    timeZoneInput.value = timeZone;
    syncMoneyFields();
    await loadTutorOffers();
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-refresh-role]")) {
    button.addEventListener("click", () => void loadBookings(button.dataset.refreshRole as BookingRole));
  }

  account.addEventListener("account:session", (event) => {
    const authenticated = (event as CustomEvent<{ authenticated: boolean }>).detail.authenticated;
    sessionGeneration.advance();
    attempts.clear();
    root.hidden = !authenticated;
    if (!authenticated) {
      activeOffer = null;
      offerPreview.replaceChildren();
      ownOffers.replaceChildren();
      for (const list of root.querySelectorAll<HTMLElement>("[data-booking-list]")) list.replaceChildren();
      createForm.setAttribute("aria-busy", "false");
      createSubmit.disabled = timeZone === null;
      return;
    }
    const id = new URL(window.location.href).searchParams.get("offer");
    if (id) {
      offerIdInput.value = id;
      if (isOpaqueUuid(id)) void loadOffer(id);
      else offerState.textContent = copy.invalidOfferId;
    }
    void Promise.all([loadTutorOffers(), loadBookings("student"), loadBookings("tutor")]);
  });
}
