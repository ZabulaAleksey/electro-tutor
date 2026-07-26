import { useEffect, useState } from "react";
import MeshLesson from "../legacy-pages/MeshLesson";
import type { DetailLevel, Language, Page } from "../types";

const pagePath = (page: Page, language: Language) => {
  const root = `/${language}`;
  if (page === "home") return `${root}/`;
  if (page === "catalog") return `${root}/topics/`;
  if (page === "interactive") return `${root}/interactive/`;
  if (page === "contacts") return `${root}/contacts/`;
  if (page === "services") return `${root}/services/`;
  return `${root}/topics/dc/mesh-current-method/`;
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
