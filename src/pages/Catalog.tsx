import { useState } from "react";
import { ArrowRight, ChevronDown, Clock3 } from "lucide-react";
import { curriculum } from "../curriculum";
import { text } from "../data";
import type { Language, Page } from "../types";

export default function Catalog({ language, onNavigate }: { language: Language; onNavigate: (page: Page) => void }) {
  const [openSections, setOpenSections] = useState<string[]>(["dc"]);

  const toggleSection = (id: string) => {
    setOpenSections((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <section className="section catalog-page">
      <span className="eyebrow"><i />{language === "ru" ? "Библиотека знаний" : "Бібліотека знань"}</span>
      <h1>{language === "ru" ? "Карта электротехники" : "Мапа електротехніки"}</h1>
      <p className="page-lead">
        {language === "ru"
          ? "Раскрывайте разделы и последовательно переходите от фундаментальных законов к сложным процессам."
          : "Розкривайте розділи та послідовно переходьте від фундаментальних законів до складних процесів."}
      </p>

      <div className="curriculum">
        {curriculum.map((section) => {
          const isOpen = openSections.includes(section.id);
          return (
            <article className={`curriculum-section ${isOpen ? "open" : ""}`} key={section.id}>
              <button
                className="curriculum-trigger"
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
                aria-controls={`curriculum-${section.id}`}
              >
                <span className="curriculum-index">{section.index}</span>
                <span>
                  <h2>{section.title[language]}</h2>
                  <p>{section.description[language]}</p>
                </span>
                <span className="curriculum-count">
                  {section.topics.length} {language === "ru" ? "тем" : "тем"}
                </span>
                <ChevronDown className="curriculum-chevron" size={20} />
              </button>

              <div className="curriculum-topics" id={`curriculum-${section.id}`}>
                <div className="curriculum-topics-inner">
                  {section.topics.map((topic) => (
                    <div className="curriculum-topic" key={topic.id}>
                      <span className="curriculum-topic-number">{section.index}.{topic.index}</span>
                      <div>
                        <h3>{topic.title[language]}</h3>
                        <p>{topic.description[language]}</p>
                      </div>
                      <span className="duration"><Clock3 size={15} />{topic.duration} {text.minutes[language]}</span>
                      {topic.id === "mesh" ? (
                        <button className="round-button" onClick={() => onNavigate("lesson")} aria-label={text.start[language]}>
                          <ArrowRight size={18} />
                        </button>
                      ) : <span className="soon-label">{text.soon[language]}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}