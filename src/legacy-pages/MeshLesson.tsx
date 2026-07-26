import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Lightbulb, Target } from "lucide-react";
import CircuitDiagram from "../components/CircuitDiagram";
import Formula from "../components/Formula";
import LevelPicker from "../components/LevelPicker";
import type { DetailLevel, Language, Page } from "../types";

export default function MeshLesson({
  language,
  level,
  onLevel,
  onNavigate,
}: {
  language: Language;
  level: DetailLevel;
  onLevel: (level: DetailLevel) => void;
  onNavigate: (page: Page) => void;
}) {
  const ru = language === "ru";
  const [activeSection, setActiveSection] = useState(1);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".lesson-section"));
    let frame = 0;

    const updateActiveSection = () => {
      frame = 0;
      const readingLine = window.innerHeight * 0.32;
      let current = 1;

      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine) {
          current = Number(section.id.replace("step-", ""));
        } else {
          break;
        }
      }

      setActiveSection(current);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="lesson-page">
      <aside className="lesson-sidebar">
        <button className="back-link" onClick={() => onNavigate("catalog")}><ArrowLeft size={16} />{ru ? "К темам" : "До тем"}</button>
        <span className="sidebar-label">{ru ? "В этой теме" : "У цій темі"}</span>
        {[
          ru ? "Идея метода" : "Ідея методу",
          ru ? "Расчётная схема" : "Розрахункова схема",
          ru ? "Система уравнений" : "Система рівнянь",
          ru ? "Решение примера" : "Розв’язання прикладу",
          ru ? "Проверка" : "Перевірка",
        ].map((item, index) => (
          <a key={item} href={`#step-${index + 1}`} className={activeSection === index + 1 ? "active" : ""}>
            <span>{index + 1}</span>{item}
          </a>
        ))}
      </aside>
      <article className="lesson-content">
        <div className="breadcrumbs">
          <span>{ru ? "Постоянный ток" : "Постійний струм"}</span><ChevronRight size={14} /><span>03</span>
        </div>
        <header className="lesson-header">
          <span className="lesson-number">ТЕМА 03</span>
          <h1>{ru ? "Метод контурных токов" : "Метод контурних струмів"}</h1>
          <p>
            {ru
              ? "Научимся заменять множество токов ветвей небольшим числом контурных токов и составлять компактную систему уравнений."
              : "Навчимося замінювати множину струмів гілок невеликою кількістю контурних струмів і складати компактну систему рівнянь."}
          </p>
        </header>
        <LevelPicker level={level} language={language} onChange={onLevel} />

        <section id="step-1" className="lesson-section">
          <span className="step-label">01 / {ru ? "Идея метода" : "Ідея методу"}</span>
          <h2>{ru ? "Один ток для каждого независимого контура" : "Один струм для кожного незалежного контуру"}</h2>
          <p>
            {ru
              ? "Вместо поиска тока в каждой ветви назначим воображаемые контурные токи. Для плоской схемы их число равно числу независимых контуров."
              : "Замість пошуку струму в кожній гілці призначимо уявні контурні струми. Для плоскої схеми їх кількість дорівнює кількості незалежних контурів."}
          </p>
          {level <= 2 && (
            <div className="insight"><Lightbulb /><div><strong>{ru ? "Главная идея" : "Головна ідея"}</strong><p>
              {ru ? "В общей ветви реальный ток равен алгебраической разности контурных токов: " : "У спільній гілці реальний струм дорівнює алгебраїчній різниці контурних струмів: "}
              <Formula block={false}>I_3=I_1-I_2</Formula>.
            </p></div></div>
          )}
          {level === 1 && (
            <div className="research-note">
              <span>{ru ? "Почему это работает" : "Чому це працює"}</span>
              <p>{ru
                ? "Контурные токи образуют базис пространства токов, удовлетворяющих первому закону Кирхгофа. Для связного графа число независимых контуров равно b − n + 1, где b — число ветвей, n — число узлов."
                : "Контурні струми утворюють базис простору струмів, що задовольняють перший закон Кірхгофа. Для зв’язного графа кількість незалежних контурів дорівнює b − n + 1, де b — кількість гілок, n — кількість вузлів."}</p>
              <Formula>m=b-n+1</Formula>
            </div>
          )}
        </section>

        <section id="step-2" className="lesson-section">
          <span className="step-label">02 / {ru ? "Расчётная схема" : "Розрахункова схема"}</span>
          <h2>{ru ? "Рассмотрим двухконтурную цепь" : "Розглянемо двоконтурне коло"}</h2>
          <p>{ru
            ? "Направим оба контурных тока по часовой стрелке. Направление можно выбрать произвольно: отрицательный результат покажет, что настоящий ток течёт противоположно."
            : "Спрямуємо обидва контурні струми за годинниковою стрілкою. Напрям можна обрати довільно: від’ємний результат покаже, що справжній струм тече протилежно."}</p>
          <CircuitDiagram language={language} />
          <div className="given-grid">
            <div><span>E₁</span><strong>24 V</strong></div><div><span>E₂</span><strong>12 V</strong></div>
            <div><span>R₁</span><strong>4 Ω</strong></div><div><span>R₂</span><strong>6 Ω</strong></div>
            <div><span>R₃</span><strong>2 Ω</strong></div>
          </div>
        </section>

        <section id="step-3" className="lesson-section">
          <span className="step-label">03 / {ru ? "Система уравнений" : "Система рівнянь"}</span>
          <h2>{ru ? "Запишем второй закон Кирхгофа" : "Запишемо другий закон Кірхгофа"}</h2>
          {level <= 2 && <p>{ru
            ? "Собственное сопротивление контура умножаем на его ток. Произведение общего сопротивления на соседний ток записываем со знаком минус."
            : "Власний опір контуру множимо на його струм. Добуток спільного опору на сусідній струм записуємо зі знаком мінус."}</p>}
          <Formula>{String.raw`\begin{cases}(R_1+R_3)I_1-R_3I_2=E_1\\-R_3I_1+(R_2+R_3)I_2=E_2\end{cases}`}</Formula>
          <div className="substitution">
            <span>{ru ? "Подставим значения" : "Підставимо значення"}</span>
            <Formula>{String.raw`\begin{cases}6I_1-2I_2=24\\-2I_1+8I_2=12\end{cases}`}</Formula>
          </div>
          {level === 1 && <>
            <p>{ru ? "В матричной форме система имеет вид:" : "У матричній формі система має вигляд:"}</p>
            <Formula>{String.raw`\underbrace{\begin{bmatrix}6&-2\\-2&8\end{bmatrix}}_{\mathbf R}\begin{bmatrix}I_1\\I_2\end{bmatrix}=\begin{bmatrix}24\\12\end{bmatrix}`}</Formula>
            <p>{ru
              ? "Матрица сопротивлений симметрична в силу принципа взаимности. Её определитель положителен, поэтому решение единственно."
              : "Матриця опорів симетрична внаслідок принципу взаємності. Її визначник додатний, тому розв’язок єдиний."}</p>
            <Formula>{String.raw`\det\mathbf R=6\cdot8-(-2)^2=44>0`}</Formula>
          </>}
        </section>

        <section id="step-4" className="lesson-section">
          <span className="step-label">04 / {ru ? "Решение примера" : "Розв’язання прикладу"}</span>
          <h2>{ru ? "Найдём контурные токи" : "Знайдемо контурні струми"}</h2>
          {level === 3 ? (
            <>
              <Formula>{String.raw`6I_1-2I_2=24,\qquad -2I_1+8I_2=12`}</Formula>
              <Formula>{String.raw`I_1=\frac{54}{11}\approx4.91\ \mathrm A,\qquad I_2=\frac{30}{11}\approx2.73\ \mathrm A`}</Formula>
            </>
          ) : (
            <>
              <p>{ru
                ? "Умножим первое уравнение на 4 и сложим со вторым. Так переменная I₂ исключается:"
                : "Помножимо перше рівняння на 4 і додамо до другого. Так змінна I₂ виключається:"}</p>
              <Formula>{String.raw`\begin{aligned}24I_1-8I_2&=96\\-2I_1+8I_2&=12\\ \hline 22I_1&=108\end{aligned}`}</Formula>
              <Formula>{String.raw`I_1=\frac{108}{22}=\frac{54}{11}\approx4.91\ \mathrm A`}</Formula>
              <p>{ru ? "Подставим I₁ во второе уравнение:" : "Підставимо I₁ у друге рівняння:"}</p>
              <Formula>{String.raw`I_2=\frac{12+2I_1}{8}=\frac{30}{11}\approx2.73\ \mathrm A`}</Formula>
            </>
          )}
          <div className="result-card">
            <Target />
            <div><span>{ru ? "Ток в общей ветви" : "Струм у спільній гілці"}</span>
              <Formula block={false}>{String.raw`I_3=I_1-I_2=\frac{24}{11}\approx2.18\ \mathrm A`}</Formula>
            </div>
          </div>
        </section>

        <section id="step-5" className="lesson-section">
          <span className="step-label">05 / {ru ? "Проверка" : "Перевірка"}</span>
          <h2>{ru ? "Проверим баланс мощности" : "Перевіримо баланс потужності"}</h2>
          {level === 1 && <p>{ru
            ? "Суммарная мощность источников должна совпадать с мощностью, рассеиваемой на сопротивлениях."
            : "Сумарна потужність джерел має збігатися з потужністю, що розсіюється на опорах."}</p>}
          <Formula>{String.raw`P_R=I_1^2R_1+I_2^2R_2+(I_1-I_2)^2R_3`}</Formula>
          <Formula>{String.raw`P_R\approx150.55\ \mathrm W,\qquad P_E=E_1I_1+E_2I_2\approx150.55\ \mathrm W`}</Formula>
          <div className="success-note"><Check />{ru ? "Баланс выполнен — расчёт верен." : "Баланс виконується — розрахунок правильний."}</div>
        </section>
        <div className="lesson-next">
          <div><span>{ru ? "Следующая тема" : "Наступна тема"}</span><strong>{ru ? "Метод узловых потенциалов" : "Метод вузлових потенціалів"}</strong></div>
          <button disabled><ArrowRight /></button>
        </div>
      </article>
    </div>
  );
}

