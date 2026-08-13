import { useEffect, useState } from "react";
import Header from "./components/Header";
import Home from "./legacy-pages/Home";
import Catalog from "./legacy-pages/Catalog";
import MeshLesson from "./legacy-pages/MeshLesson";
import InfoPage from "./legacy-pages/InfoPage";
import type { DetailLevel, Language, Page, Theme } from "./types";

export default function App() {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("potential-language") as Language) || "ru",
  );
  const [level, setLevel] = useState<DetailLevel>(
    () => Number(localStorage.getItem("potential-level") || 2) as DetailLevel,
  );
  const [page, setPage] = useState<Page>("home");
  const [theme, setTheme] = useState<Theme>(
    () =>
      (localStorage.getItem("potential-theme") as Theme) ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );

  useEffect(() => {
    localStorage.setItem("potential-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => localStorage.setItem("potential-level", String(level)), [level]);

  useEffect(() => {
    localStorage.setItem("potential-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <Header
        language={language}
        page={page}
        theme={theme}
        onLanguage={setLanguage}
        onTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        onNavigate={navigate}
      />
      <main>
        {page === "home" && <Home language={language} onNavigate={navigate} />}
        {page === "catalog" && <Catalog language={language} onNavigate={navigate} />}
        {page === "interactive" && <InfoPage kind="interactive" language={language} onNavigate={navigate} />}
        {page === "contacts" && <InfoPage kind="contacts" language={language} onNavigate={navigate} />}
        {page === "lesson" && (
          <MeshLesson language={language} level={level} onLevel={setLevel} onNavigate={navigate} />
        )}
      </main>
      <footer>
        <span>© 2026 {language === "ru" ? "Потенциал" : "Потенціал"}</span>
        <span>{language === "ru" ? "Учимся понимать, а не запоминать." : "Вчимося розуміти, а не запам’ятовувати."}</span>
      </footer>
    </>
  );
}
