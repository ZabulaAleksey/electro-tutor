import { ArrowRight, CircuitBoard, Mail, MousePointer2 } from "lucide-react";
import type { Language, Page } from "../types";

export default function InfoPage({
  kind,
  language,
  onNavigate,
}: {
  kind: "interactive" | "contacts";
  language: Language;
  onNavigate: (page: Page) => void;
}) {
  const ru = language === "ru";

  if (kind === "contacts") {
    return (
      <section className="section info-page">
        <span className="info-icon"><Mail /></span>
        <span className="eyebrow"><i />{ru ? "Обратная связь" : "Зворотний зв’язок"}</span>
        <h1>{ru ? "Контакты" : "Контакти"}</h1>
        <p>
          {ru
            ? "Здесь появятся способы связи, информация об авторе проекта и форма обратной связи."
            : "Тут з’являться способи зв’язку, інформація про автора проєкту та форма зворотного зв’язку."}
        </p>
        <div className="info-placeholder">
          <strong>{ru ? "Раздел готов к наполнению" : "Розділ готовий до наповнення"}</strong>
          <span>{ru ? "E-mail, Telegram, GitHub и другие контакты можно добавить позже." : "E-mail, Telegram, GitHub та інші контакти можна додати пізніше."}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="section info-page">
      <span className="info-icon"><MousePointer2 /></span>
      <span className="eyebrow"><i />{ru ? "Учебная лаборатория" : "Навчальна лабораторія"}</span>
      <h1>{ru ? "Интерактив" : "Інтерактив"}</h1>
      <p>
        {ru
          ? "Будущая библиотека интерактивных схем, расчётных тренажёров и наглядных экспериментов."
          : "Майбутня бібліотека інтерактивних схем, розрахункових тренажерів і наочних експериментів."}
      </p>
      <button className="button primary" onClick={() => onNavigate("lesson")}>
        <CircuitBoard size={18} />
        {ru ? "Открыть демонстрационную схему" : "Відкрити демонстраційну схему"}
        <ArrowRight size={18} />
      </button>
    </section>
  );
}
