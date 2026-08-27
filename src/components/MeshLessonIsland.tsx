import { useEffect, useState } from "react";
import MeshLesson from "../legacy-pages/MeshLesson";
import type { DetailLevel, Language, Page } from "../types";
import { localePath } from "../site-path";

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

  useEffect(() => {
    const saved = Number(localStorage.getItem("potential-level"));
    if (saved === 1 || saved === 2 || saved === 3) setLevel(saved);
  }, []);

  const updateLevel = (next: DetailLevel) => {
    setLevel(next);
    localStorage.setItem("potential-level", String(next));
  };

  return (
    <MeshLesson
      language={language}
      level={level}
      onLevel={updateLevel}
      onNavigate={(page) => {
        window.location.href = pagePath(page, language);
      }}
    />
  );
}
