let disposeCurrent = () => {};

type LearningStage = "textbook" | "examples" | "lab";

function exampleContext(url: URL): string {
  const fragment = /^#example-([1-4])$/.exec(url.hash);
  if (fragment) return fragment[1];
  const query = url.searchParams.get("example");
  if (query && /^[1-4]$/.test(query)) return query;
  if (typeof document !== "undefined") {
    for (const element of [...document.querySelectorAll<HTMLElement>('[id^="example-"]')].reverse()) {
      if (element.getBoundingClientRect().top < innerHeight * 0.5 && /^example-[1-4]$/.test(element.id)) return element.id.slice(-1);
    }
  }
  return "1";
}

/** Shared mesh-stage URL behavior for the menu, TOC and MeshJourney. */
export function meshJourneyHref(baseHref: string, stage: number, current: URL): string {
  const target = new URL(baseHref, current);
  const example = exampleContext(current);
  target.searchParams.delete("learningStage");
  if (stage === 1) {
    target.searchParams.delete("example");
    target.hash = `#example-${example}`;
  } else if (stage === 2) {
    target.hash = "";
    target.searchParams.set("example", example);
  } else {
    target.hash = "";
    target.searchParams.delete("example");
  }
  return `${target.pathname}${target.search}${target.hash}`;
}

export function requestedStage(url: URL, components: Iterable<{stage:LearningStage;href:string}> = []): LearningStage {
  const query = url.searchParams.get("learningStage");
  if (query === "textbook" || query === "examples" || query === "lab") return query;
  for (const component of components) if(isCurrentLink(component.href,url)) return component.stage;
  if (url.pathname.includes("/examples/")) return "examples";
  if (url.pathname.includes("/lab/")) return "lab";
  return "textbook";
}

/** Component identity ignores experiment parameters, while keeping tool hash selectors. */
export function isCurrentLink(value: string, current: URL): boolean {
  const url = new URL(value,current);
  return url.origin === current.origin && url.pathname === current.pathname && (!url.hash || url.hash === current.hash);
}

export function disposeLearningContents() {
  disposeCurrent();
  disposeCurrent = () => {};
}

export function setupLearningContents() {
  disposeLearningContents();
  const roots = [...document.querySelectorAll<HTMLElement>("[data-learning-contents]")];
  const disposers: Array<() => void> = [];

  for (const root of roots) {
    const search = root.querySelector<HTMLInputElement>("[data-learning-search]");
    const category = root.querySelector<HTMLSelectElement>("[data-learning-category]");
    const stageControl = root.querySelector<HTMLSelectElement>("[data-learning-stage]");
    const entries = [...root.querySelectorAll<HTMLElement>("[data-learning-entry]")];
    const groups = [...root.querySelectorAll<HTMLElement>("[data-learning-group]")];
    const empty = root.querySelector<HTMLElement>("[data-learning-empty]");
    const listeners: Array<() => void> = [];
    const summary = root.querySelector<HTMLElement>("summary");
    let returnFocus: HTMLElement | null = summary;
    let openScroll = scrollY;
    const restoreFocus = () => { const visible = returnFocus?.getClientRects().length ? returnFocus : document.getElementById("mobile-menu-toggle"); visible?.focus({preventScroll:true}); };
    const opener = document.querySelector<HTMLAnchorElement>("[data-learning-open]");
    const onOpen = (event: Event) => { event.preventDefault(); returnFocus = opener; openScroll = scrollY; (root as HTMLDetailsElement).open = true; search?.focus({preventScroll:true}); };
    opener?.addEventListener("click", onOpen);
    if(opener) listeners.push(() => opener.removeEventListener("click", onOpen));
    const onSummaryClick = () => { if (!(root as HTMLDetailsElement).open) { returnFocus = summary; openScroll = scrollY; } };
    summary?.addEventListener("click", onSummaryClick);
    if(summary) listeners.push(() => summary.removeEventListener("click", onSummaryClick));

    const onToggle = () => { const open = (root as HTMLDetailsElement).open; opener?.setAttribute("aria-expanded",String(open)); if (!open) { scrollTo(0,openScroll); restoreFocus(); } };
    root.addEventListener("toggle",onToggle);
    listeners.push(() => root.removeEventListener("toggle",onToggle));

    const updateRuntimeTargets = () => {
      const current = new URL(location.href);
      const componentLinks = [...document.querySelectorAll<HTMLAnchorElement>("[data-learning-stage-link][data-stage]")];
      const stage = requestedStage(current, [...componentLinks.map(link=>({stage:link.dataset.stage as LearningStage, href:link.dataset.baseHref ?? link.href})), ...[...root.querySelectorAll<HTMLAnchorElement>("[data-learning-reference]")].map(link=>({stage:"lab" as LearningStage,href:link.href}))]);
      if (stageControl) stageControl.value = stage;
      for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-learning-stage-link][data-stage]")) {
        const linkStage = link.dataset.stage as LearningStage;
        if (!["textbook", "examples", "lab"].includes(linkStage)) continue;
        const baseHref = link.dataset.baseHref ?? link.href;
        link.dataset.baseHref = baseHref;
        const isMesh = current.pathname.includes("/topics/dc/mesh-current-method/") && baseHref.includes("/topics/dc/mesh-current-method/");
        link.href = isMesh ? meshJourneyHref(baseHref, linkStage === "textbook" ? 0 : linkStage === "examples" ? 1 : 2, current) : baseHref;
        const menuStage = current.pathname.includes("/topics/dc/mesh-current-method/") ? (current.pathname.includes("/examples/") ? "examples" : current.pathname.includes("/lab/") ? "lab" : "textbook") : stage;
        if (isCurrentLink(link.href, current) && (!link.closest("[data-learning-menu]") || linkStage === menuStage)) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
      for (const entry of entries) {
        const target = entry.querySelector<HTMLAnchorElement>("[data-learning-target]");
        const links = new Map<LearningStage, HTMLAnchorElement>();
        for (const link of entry.querySelectorAll<HTMLAnchorElement>("[data-learning-stage-link][data-stage]")) {
          links.set(link.dataset.stage as LearningStage, link);
          if (isCurrentLink(link.href, current)) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
        const selected = links.get(stage);
        const fallback = !selected && stage !== "lab" ? links.get("lab") : undefined;
        const actual = selected ?? fallback;
        if (target) {
          if (actual) {
            const targetUrl = new URL(actual.href, current);
            if (stage === "textbook") targetUrl.searchParams.delete("learningStage");
            else targetUrl.searchParams.set("learningStage", stage);
            target.href = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
            target.removeAttribute("aria-disabled");
          } else {
            target.removeAttribute("href");
            target.setAttribute("aria-disabled", "true");
          }
        }
        entry.classList.toggle("learning-entry-current", [...links.values(), ...entry.querySelectorAll<HTMLAnchorElement>("[data-learning-reference]")].some((link) => isCurrentLink(link.href, current)));
        const fallbackNote = entry.querySelector<HTMLElement>("[data-learning-fallback]");
        if (fallbackNote) fallbackNote.hidden = !fallback;
      }
    };

    const filter = () => {
      const needle = search?.value.trim().toLocaleLowerCase() ?? "";
      const selectedCategory = category?.value ?? "";
      for (const entry of entries) {
        const matchesText = !needle || (entry.dataset.search ?? "").includes(needle);
        const matchesCategory = !selectedCategory || entry.dataset.category === selectedCategory;
        entry.hidden = !(matchesText && matchesCategory);
      }
      for (const group of groups) {
        const visible = group.querySelector("[data-learning-entry]:not([hidden])");
        group.hidden = !visible;
      }
      if (empty) empty.hidden = entries.some((entry) => !entry.hidden);
    };

    search?.addEventListener("input", filter);
    category?.addEventListener("change", filter);
    if (search) listeners.push(() => search.removeEventListener("input", filter));
    if (category) listeners.push(() => category.removeEventListener("change", filter));
    const onStageChange = () => {
      if (!stageControl) return;
      const url = new URL(location.href);
      url.searchParams.set("learningStage", stageControl.value);
      history.pushState({ ...history.state }, "", `${url.pathname}${url.search}${url.hash}`);
      updateRuntimeTargets();
    };
    stageControl?.addEventListener("change", onStageChange);
    if (stageControl) listeners.push(() => stageControl.removeEventListener("change", onStageChange));
    const onNavigationClick = () => updateRuntimeTargets();
    document.addEventListener("click", onNavigationClick, true);
    listeners.push(() => document.removeEventListener("click", onNavigationClick, true));
    filter();
    updateRuntimeTargets();
    const onLocationChange = () => updateRuntimeTargets();
    addEventListener("hashchange", onLocationChange);
    addEventListener("popstate", onLocationChange);
    listeners.push(() => removeEventListener("hashchange", onLocationChange));
    listeners.push(() => removeEventListener("popstate", onLocationChange));

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !root.closest("details")?.open) return;
      const details = root.closest("details");
      if (!details) return;
      details.open = false;
      restoreFocus();
    };
    root.addEventListener("keydown", onKeydown);
    listeners.push(() => root.removeEventListener("keydown", onKeydown));
    disposers.push(() => listeners.forEach((remove) => remove()));
  }

  disposeCurrent = () => disposers.forEach((dispose) => dispose());
}
