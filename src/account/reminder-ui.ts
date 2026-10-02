import { getLocale, normalizeLanguage } from "../i18n";
import {
  fetchReminderSettings, saveReminderSettings, validIanaTimeZone,
  type ReminderSettings,
} from "./reminder-contract";
import { resolveLocalApiOrigin } from "./profile-contract";

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing reminder UI element: ${selector}`);
  return element;
}

export function mountReminderSettings(): void {
  const account = document.querySelector<HTMLElement>("[data-account]");
  if (!account) return;
  const root = required<HTMLElement>(account, "[data-reminder-settings]");
  const api = resolveLocalApiOrigin(window.location);
  if (!api) return;
  const copy = getLocale(normalizeLanguage(document.documentElement.lang)).reminders;
  const form = required<HTMLFormElement>(root, "[data-reminder-form]");
  const status = required<HTMLElement>(root, "[data-reminder-state]");
  const error = required<HTMLElement>(root, "[data-reminder-error]");
  const retry = required<HTMLButtonElement>(root, "[data-reminder-retry]");
  const suggest = required<HTMLButtonElement>(root, "[data-reminder-suggest]");
  const zone = required<HTMLInputElement>(form, "[data-reminder-zone]");
  const remind24h = required<HTMLInputElement>(form, "[data-reminder-24h]");
  const remind1h = required<HTMLInputElement>(form, "[data-reminder-1h]");
  const remind15m = required<HTMLInputElement>(form, "[data-reminder-15m]");
  const quiet = required<HTMLInputElement>(form, "[data-reminder-quiet]");
  const times = required<HTMLElement>(form, "[data-reminder-times]");
  const start = required<HTMLInputElement>(form, "[data-reminder-start]");
  const end = required<HTMLInputElement>(form, "[data-reminder-end]");
  const save = required<HTMLButtonElement>(form, "[data-reminder-save]");
  const fetcher = window.fetch.bind(window);
  let generation = 0;
  let controller: AbortController | null = null;
  let authenticated = false;

  const setBusy = (busy: boolean) => {
    form.setAttribute("aria-busy", String(busy));
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) {
      control.disabled = busy;
    }
    suggest.disabled = busy;
    save.textContent = busy ? copy.saving : copy.save;
  };
  const quietChanged = () => {
    times.hidden = !quiet.checked;
    start.required = quiet.checked;
    end.required = quiet.checked;
  };
  const showError = (message: string, focus?: HTMLElement) => {
    error.textContent = message;
    error.hidden = false;
    focus?.focus();
  };
  const populate = (settings: ReminderSettings) => {
    zone.value = settings.timeZone ?? "";
    remind24h.checked = settings.remind24h;
    remind1h.checked = settings.remind1h;
    remind15m.checked = settings.remind15m;
    quiet.checked = settings.quietHoursEnabled;
    start.value = settings.quietHoursStart ?? "";
    end.value = settings.quietHoursEnd ?? "";
    quietChanged();
    status.textContent = settings.timeZone ? "" : copy.needsZone;
  };
  const load = async () => {
    const version = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    root.setAttribute("aria-busy", "true");
    form.hidden = true;
    retry.hidden = true;
    status.textContent = copy.loading;
    error.hidden = true;
    const result = await fetchReminderSettings(fetcher, api, signal);
    if (version !== generation || !authenticated || signal.aborted) return;
    root.setAttribute("aria-busy", "false");
    if (!result.ok) {
      if (result.status === 401) account.dispatchEvent(new CustomEvent("account:session-expired"));
      else {
        status.textContent = copy.error;
        retry.hidden = false;
      }
      return;
    }
    form.hidden = false;
    populate(result.value);
  };

  let browserZone: string | null = null;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (validIanaTimeZone(detected)) browserZone = detected;
  } catch { /* Explicit selection remains available. */ }
  if (browserZone) {
    suggest.textContent = copy.suggest + browserZone;
    suggest.hidden = false;
    suggest.addEventListener("click", () => {
      zone.value = browserZone ?? "";
      zone.focus();
    });
  }
  quiet.addEventListener("change", quietChanged);
  zone.addEventListener("input", () => { error.hidden = true; });
  retry.addEventListener("click", () => { if (authenticated) void load(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authenticated) return;
    const timeZone = zone.value.trim();
    error.hidden = true;
    if (!validIanaTimeZone(timeZone)) {
      showError(copy.missingZone, zone);
      return;
    }
    if (quiet.checked && (!start.value || !end.value || start.value === end.value)) {
      showError(copy.missingQuiet, !start.value ? start : end);
      return;
    }
    const value: ReminderSettings = {
      timeZone,
      remind24h: remind24h.checked,
      remind1h: remind1h.checked,
      remind15m: remind15m.checked,
      quietHoursEnabled: quiet.checked,
      quietHoursStart: quiet.checked ? start.value : null,
      quietHoursEnd: quiet.checked ? end.value : null,
    };
    const version = generation;
    setBusy(true);
    status.textContent = copy.saving;
    const result = await saveReminderSettings(fetcher, api, value);
    if (version !== generation || !authenticated) return;
    setBusy(false);
    if (!result.ok) {
      if (result.status === 401) account.dispatchEvent(new CustomEvent("account:session-expired"));
      else {
        status.textContent = "";
        showError(copy.error);
      }
      return;
    }
    populate(result.value);
    status.textContent = copy.saved;
  });
  account.addEventListener("account:session", (event) => {
    authenticated = (event as CustomEvent<{ authenticated: boolean }>).detail.authenticated;
    root.hidden = !authenticated;
    if (authenticated) void load();
    else {
      generation += 1;
      controller?.abort();
      controller = null;
      root.setAttribute("aria-busy", "false");
      form.hidden = true;
      retry.hidden = true;
      status.textContent = "";
      error.hidden = true;
      setBusy(false);
    }
  });
  window.addEventListener("pagehide", () => controller?.abort(), { once: true });
}
