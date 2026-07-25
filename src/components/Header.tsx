import { BookOpen, Languages, Moon, Sun } from "lucide-react";
import { text } from "../data";
import type { Language, Page, Theme } from "../types";

export default function Header({
  language,
  page,
  theme,
  onLanguage,
  onTheme,
  onNavigate,
}: {
  language: Language;
  page: Page;
  theme: Theme;
  onLanguage: (language: Language) => void;
  onTheme: () => void;
  onNavigate: (page: Page) => void;
}) {
  return (
    <header className="header">
      <button className="brand" onClick={() => onNavigate("home")} aria-label="Потенциал">
        <span className="brand-mark"><BookOpen size={21} /></span>
        <span>
          <strong>{language === "ru" ? "ПОТЕНЦИАЛ" : "ПОТЕНЦІАЛ"}</strong>
          <small>{text.brandSub[language]}</small>
        </span>
      </button>
      <nav aria-label={language === "ru" ? "Основная навигация" : "Головна навігація"}>
        <button className={page === "home" ? "active" : ""} onClick={() => onNavigate("home")}>
          {text.home[language]}
        </button>
        <button className={page === "catalog" ? "active" : ""} onClick={() => onNavigate("catalog")}>
          {text.catalog[language]}
        </button>
      </nav>
      <button
        className="theme-toggle"
        onClick={onTheme}
        aria-label={language === "ru" ? "Переключить тему" : "Перемкнути тему"}
        title={language === "ru" ? "Светлая / тёмная тема" : "Світла / темна тема"}
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <div className="language-switch" aria-label="Language">
        <Languages size={16} />
        <button className={language === "ru" ? "selected" : ""} onClick={() => onLanguage("ru")}>RU</button>
        <button className={language === "uk" ? "selected" : ""} onClick={() => onLanguage("uk")}>UA</button>
      </div>
    </header>
  );
}
