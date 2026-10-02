import { useEffect, useState } from "react";
import MeshLesson from "../legacy-pages/MeshLesson";
import type { DetailLevel, Language, Page } from "../types";
import { localePath } from "../site-path";
import { useLearningProgress } from "../learning/use-learning-progress";

const pagePath = (page: Page, language: Language) => {
  if (page === "home") return localePath(language);
  if (page === "catalog") return localePath(language, "/topics/");
  if (page === "interactive") return localePath(language, "/interactive/");
  if (page === "contacts") return localePath(language, "/contacts/");
  if (page === "services") return localePath(language, "/services/");
  return localePath(language, "/topics/dc/mesh-current-method/");
};

export default function MeshLessonIsland({ language }: { language: Language }) {
  const [level, setLevel] = useState<DetailLevel>(2);
  const learning = useLearningProgress();

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("potential-level"));
      if (saved === 1 || saved === 2 || saved === 3) setLevel(saved);
    } catch {
      // Private browsing and denied storage leave the lesson usable at its default depth.
    }
  }, []);

  const updateLevel = (next: DetailLevel) => {
    setLevel(next);
    try {
      localStorage.setItem("potential-level", String(next));
    } catch {
      // Explanation depth is a convenience preference; a denied store must not break learning.
    }
  };

  return (
    <MeshLesson
      language={language}
      level={level}
      onLevel={updateLevel}
      learning={learning}
      onNavigate={(page) => {
        window.location.href = pagePath(page, language);
      }}
    />
  );
}
