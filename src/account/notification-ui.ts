import { getLocale, normalizeLanguage } from "../i18n";
import { resolveLocalApiOrigin } from "./profile-contract";
import {
  listNotifications,
  markNotificationRead,
  notificationBookingHref,
  unreadNotificationCount,
  type NotificationItem,
} from "./notification-contract";

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing notification UI element: ${selector}`);
  return element;
}

export function mountNotifications(): void {
  const account = document.querySelector<HTMLElement>("[data-account]");
  if (!account) return;
  const root = required<HTMLElement>(account, "[data-notifications]");
  const api = resolveLocalApiOrigin(window.location);
  if (!api) return;
  const language = normalizeLanguage(document.documentElement.lang);
  const copy = getLocale(language).notifications;
  const fetcher = window.fetch.bind(window);
  const state = required<HTMLElement>(root, "[data-notification-state]");
  const count = required<HTMLElement>(root, "[data-notification-count]");
  const list = required<HTMLElement>(root, "[data-notification-list]");
  const retry = required<HTMLButtonElement>(root, "[data-notification-retry]");
  const more = required<HTMLButtonElement>(root, "[data-notification-more]");
  let generation = 0;
  let controller: AbortController | null = null;
  let offset = 0;

  const sessionExpired = () => account.dispatchEvent(new CustomEvent("account:session-expired"));

  const refreshCount = async (version: number, signal: AbortSignal) => {
    const result = await unreadNotificationCount(fetcher, api, signal);
    if (version !== generation || signal.aborted) return;
    if (result.ok) count.textContent = `${copy.unreadCount} ${result.value}`;
    else if (result.status === 401) sessionExpired();
  };

  const render = (item: NotificationItem, version: number): HTMLElement => {
    const card = document.createElement("article");
    card.className = "notification-item";
    card.dataset.notificationId = item.id;
    card.dataset.unread = String(item.readAt === null);
    const message = document.createElement("p");
    message.textContent = copy.accepted;
    const meta = document.createElement("div");
    meta.className = "notification-meta";
    const status = document.createElement("span");
    status.textContent = item.readAt === null ? copy.unread : copy.read;
    const created = document.createElement("time");
    created.dateTime = item.createdAt;
    created.textContent = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "uk-UA", {
      dateStyle: "medium", timeStyle: "short",
    }).format(new Date(item.createdAt));
    meta.append(status, created);
    const actions = document.createElement("div");
    actions.className = "notification-actions";
    const link = document.createElement("a");
    link.className = "button ghost";
    link.href = notificationBookingHref(language, item);
    link.textContent = copy.openBooking;
    actions.append(link);
    if (item.readAt === null) {
      const mark = document.createElement("button");
      mark.className = "button ghost";
      mark.type = "button";
      mark.textContent = copy.markRead;
      mark.addEventListener("click", async () => {
        mark.disabled = true;
        const result = await markNotificationRead(fetcher, api, item.id);
        if (version !== generation || !card.isConnected) return;
        if (result.ok) {
          card.dataset.unread = "false";
          status.textContent = copy.read;
          mark.remove();
          if (controller) void refreshCount(version, controller.signal);
        } else if (result.status === 401) {
          sessionExpired();
        } else {
          state.textContent = copy.markError;
          mark.disabled = false;
        }
      });
      actions.append(mark);
    }
    card.append(message, meta, actions);
    return card;
  };

  const load = async (reset: boolean) => {
    if (reset) {
      generation += 1;
      controller?.abort();
      controller = new AbortController();
      offset = 0;
      list.replaceChildren();
    }
    if (!controller) return;
    const version = generation;
    const signal = controller.signal;
    root.setAttribute("aria-busy", "true");
    state.textContent = copy.loading;
    retry.hidden = true;
    more.hidden = true;
    const result = await listNotifications(fetcher, api, offset, signal);
    if (version !== generation || signal.aborted) return;
    root.setAttribute("aria-busy", "false");
    if (!result.ok) {
      if (result.status === 401) sessionExpired();
      else {
        state.textContent = copy.error;
        retry.hidden = false;
      }
      return;
    }
    for (const item of result.value) list.append(render(item, version));
    offset += result.value.length;
    state.textContent = offset === 0 ? copy.empty : "";
    more.hidden = result.value.length < 20 || offset > 10000;
    void refreshCount(version, signal);
  };

  retry.addEventListener("click", () => void load(true));
  more.addEventListener("click", () => void load(false));
  account.addEventListener("account:session", (event) => {
    const authenticated = (event as CustomEvent<{ authenticated: boolean }>).detail.authenticated;
    generation += 1;
    controller?.abort();
    controller = null;
    root.hidden = !authenticated;
    if (authenticated) void load(true);
    else {
      root.setAttribute("aria-busy", "false");
      list.replaceChildren();
      state.textContent = "";
      count.textContent = "";
    }
  });
  window.addEventListener("pagehide", () => controller?.abort(), { once: true });
}
