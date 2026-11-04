import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import LessonPractice from "./LessonPractice";
import { useLearningProgress } from "../learning/use-learning-progress";
import { getLocale } from "../i18n";
import { localePath } from "../site-path";

// Only progress and practice hydrate; the complete textbook is static MDX.
export default function MeshTextbookIsland() {
  const learning = useLearningProgress();
  const onStep = learning.onStep;
  const copy = getLocale("ru").learning;
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".mesh-textbook .lesson-section"));
    let frame = 0;
    let previous = 0;
    const update = () => {
      frame = 0;
      let current: 1 | 2 | 3 | 4 | 5 = 1;
      for (const section of sections) {
        if (section.getBoundingClientRect().top > innerHeight * 0.32) break;
        const value = Number(section.id.replace("step-", ""));
        if (value >= 1 && value <= 5) current = value as typeof current;
      }
      if (previous === current) return;
      previous = current;
      onStep(current);
      for (const link of document.querySelectorAll<HTMLAnchorElement>(".mesh-textbook .lesson-sidebar a[href^='#step-']")) {
        const active = link.hash === `#step-${current}`;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onStep]);
  return <>
    {learning.storageState === "unavailable" && <p className="learning-storage-warning" role="status">{copy.storageUnavailable}</p>}
    <LessonPractice language="ru" completed={learning.progress?.completed ?? false}
      storageState={learning.storageState} onComplete={learning.onComplete} />
    <div className="lesson-next">
      <div><span>{copy.nextHeading}</span><strong>{copy.nextTitle}</strong></div>
      <a className="textbook-next-link" aria-label={copy.nextHeading} href={localePath("ru", "/topics/")}><ArrowRight /></a>
    </div>
  </>;
}
