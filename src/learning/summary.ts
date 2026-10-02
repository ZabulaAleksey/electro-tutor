import { resolveLocalApiOrigin } from "../account/profile-contract";
import { getLocale, normalizeLanguage } from "../i18n";
import { localePath } from "../site-path";
import {
  authenticatedNamespace,
  createLearningStore,
  fetchLearningIdentity,
  guestNamespace,
  loadLessonProgress,
  type LearningLessonProgress,
  type LearningStorageState,
} from "./progress";

export function mountLearningSummary(): void {
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-learning-summary]:not([data-learning-summary-mounted])"));
  if (!roots.length) return;
  roots.forEach((root) => { root.dataset.learningSummaryMounted = "true"; });
  const language = normalizeLanguage(document.documentElement.lang);
  const labels = getLocale(language).learning;
  const render = (
    progress?: LearningLessonProgress,
    state: LearningStorageState = "unavailable",
    notice?: string,
  ) => {
    for (const root of roots) {
      if (!root.isConnected) continue;
      root.replaceChildren();
      const status = document.createElement("p");
      status.className = "learning-summary-status";
      if (state === "unavailable") status.textContent = labels.summaryUnavailable;
      else if (!progress) status.textContent = labels.summaryEmpty;
      else if (progress.completed) status.textContent = labels.summaryComplete;
      else status.textContent = `${labels.summaryResume} · ${progress.highestStep}/5`;
      root.append(status);
      const device = document.createElement("small");
      device.textContent = labels.summaryDevice;
      root.append(device);
      if (notice) {
        const note = document.createElement("p");
        note.textContent = notice;
        root.append(note);
      }
      if (progress) {
        const link = document.createElement("a");
        link.href = `${localePath(language, "/topics/dc/mesh-current-method/")}#step-${progress.completed ? 5 : progress.highestStep}`;
        link.textContent = progress.completed ? labels.summaryComplete : labels.summaryResume;
        root.append(link);
      }
    }
  };
  let loadSequence = 0;
  const load = async () => {
    const sequence = ++loadSequence;
    const isCurrent = () => sequence === loadSequence;
    const guest = createLearningStore(guestNamespace());
    const guestProgress = loadLessonProgress(guest);
    if (!isCurrent()) return;
    render(guestProgress.progress, guestProgress.state);
    const identity = await fetchLearningIdentity(window.fetch.bind(window), resolveLocalApiOrigin(window.location));
    if (!isCurrent() || !identity) return;
    const namespace = await authenticatedNamespace(identity);
    if (!isCurrent()) return;
    if (!namespace) return render(undefined, "unavailable");
    const authenticated = createLearningStore(namespace);
    const authenticatedProgress = loadLessonProgress(authenticated);
    if (!isCurrent()) return;
    if (!authenticatedProgress.progress && guestProgress.progress) {
      render(guestProgress.progress, guestProgress.state, labels.summaryGuest);
      return;
    }
    render(authenticatedProgress.progress, authenticatedProgress.state);
  };
  const onSession = () => void load();
  const cleanup = () => {
    loadSequence += 1;
    document.removeEventListener("account:session", onSession, true);
    document.removeEventListener("account:session-expired", onSession, true);
    document.removeEventListener("astro:before-swap", cleanup);
    window.removeEventListener("pagehide", cleanup);
  };
  document.addEventListener("account:session", onSession, true);
  document.addEventListener("account:session-expired", onSession, true);
  document.addEventListener("astro:before-swap", cleanup, { once: true });
  window.addEventListener("pagehide", cleanup, { once: true });
  void load();
}
