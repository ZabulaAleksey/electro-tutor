import { ArrowRight, CircuitBoard, Languages, Layers3, Sigma } from "lucide-react";
import { text, topics } from "../data";
import type { Language, Page } from "../types";

export default function Home({
  language,
  onNavigate,
}: {
  language: Language;
  onNavigate: (page: Page) => void;
}) {
  const copy = language === "ru" ? {
    eyebrow: "Интерактивный курс по электротехнике",
    title: <>От формулы —<br />к <em>пониманию.</em></>,
    lead: "Изучайте электрические цепи в своём темпе. Выбирайте глубину объяснения, исследуйте схемы и наблюдайте, как из законов рождается решение.",
    primary: "Открыть пример урока",
    secondary: "Смотреть все темы",
    section: "Начните с основ",
    sectionSub: "Четыре метода, на которых строится расчёт электрических цепей.",
  } : {
    eyebrow: "Інтерактивний курс з електротехніки",
    title: <>Від формули —<br />до <em>розуміння.</em></>,
    lead: "Вивчайте електричні кола у своєму темпі. Обирайте глибину пояснення, досліджуйте схеми та спостерігайте, як із законів народжується розв’язання.",
    primary: "Відкрити приклад уроку",
    secondary: "Переглянути всі теми",
    section: "Почніть з основ",
    sectionSub: "Чотири методи, на яких будується розрахунок електричних кіл.",
  };

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><i />{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => onNavigate("lesson")}>
                {copy.primary}<ArrowRight size={18} />
              </button>
              <button className="button ghost" onClick={() => onNavigate("catalog")}>{copy.secondary}</button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-card card-formula">
              <span>Закон Кирхгофа</span>
              <strong>∑ I<sub>k</sub> = 0</strong>
            </div>
            <svg viewBox="0 0 490 330">
              <g fill="none" stroke="#25312e" strokeWidth="3">
                <path d="M50 95 H180 M310 95 H440 V245 H310 M180 245 H50 V95 M180 95 H310 M180 245 H310" />
                <path d="M245 95 V140 M245 190 V245" />
              </g>
              <g fill="white" stroke="#25312e" strokeWidth="3">
                <rect x="95" y="80" width="70" height="30" rx="5" />
                <rect x="325" y="80" width="70" height="30" rx="5" />
                <rect x="230" y="135" width="30" height="60" rx="5" />
                <circle cx="50" cy="170" r="27" />
                <circle cx="440" cy="170" r="27" />
              </g>
              <g fill="#e66820">
                <circle cx="180" cy="95" r="6" /><circle cx="310" cy="95" r="6" />
                <circle cx="180" cy="245" r="6" /><circle cx="310" cy="245" r="6" />
              </g>
            </svg>
            <div className="visual-card card-current">
              <span>I₁</span><strong>2.4 A</strong><small>→</small>
            </div>
          </div>
        </div>
        <div className="feature-strip">
          <span><Languages />RU / UA</span>
          <span><Layers3 />3 {language === "ru" ? "уровня объяснения" : "рівні пояснення"}</span>
          <span><Sigma />LaTeX</span>
          <span><CircuitBoard />{language === "ru" ? "Наглядные схемы" : "Наочні схеми"}</span>
        </div>
      </section>
      <section className="section topic-preview">
        <div className="section-heading">
          <div><span className="section-kicker">01 — DC</span><h2>{copy.section}</h2></div>
          <p>{copy.sectionSub}</p>
        </div>
        <div className="topic-grid">
          {topics.map((topic) => (
            <article className={`topic-card ${topic.accent}`} key={topic.id}>
              <div className="topic-card-top"><span>{topic.index}</span><small>{topic.duration} {text.minutes[language]}</small></div>
              <h3>{topic.title[language]}</h3>
              <p>{topic.description[language]}</p>
              {topic.id === "mesh" ? (
                <button onClick={() => onNavigate("lesson")}>{text.start[language]}<ArrowRight size={16} /></button>
              ) : (
                <button disabled>{topic.available ? text.soon[language] : text.soon[language]}</button>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

