import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Lightbulb, Target } from "lucide-react";
import CircuitDiagram from "../components/CircuitDiagram";
import Formula from "../components/Formula";
import LevelPicker from "../components/LevelPicker";
import type { DetailLevel, Language, Page } from "../types";
import { getLocale } from "../i18n";

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
  const locale = getLocale(language);
  const copy = locale.meshLesson;
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
        <button className="back-link" onClick={() => onNavigate("catalog")}><ArrowLeft size={16} />{copy.back}</button>
        <span className="sidebar-label">{copy.inTopic}</span>
        {[
          copy.idea, copy.scheme, copy.equations, copy.solution, copy.check,
        ].map((item, index) => (
          <a key={item} href={`#step-${index + 1}`} className={activeSection === index + 1 ? "active" : ""}>
            <span>{index + 1}</span>{item}
          </a>
        ))}
      </aside>
      <article className="lesson-content">
        <div className="breadcrumbs">
          <span>{copy.dc}</span><ChevronRight size={14} /><span>03</span>
        </div>
        <header className="lesson-header">
          <span className="lesson-number">{locale.lesson.topic} 03</span>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>
        <LevelPicker level={level} language={language} onChange={onLevel} />

        <section id="step-1" className="lesson-section">
          <span className="step-label">01 / {copy.idea}</span>
          <h2>{copy.oneCurrent}</h2>
          <p>{copy.intro}</p>
          {level <= 2 && (
            <div className="insight"><Lightbulb /><div><strong>{copy.mainIdea}</strong><p>
              {copy.sharedBranch}
              <Formula block={false}>I_3=I_1-I_2</Formula>.
            </p></div></div>
          )}
          {level === 1 && (
            <div className="research-note">
              <span>{copy.why}</span>
              <p>{copy.whyBody}</p>
              <Formula>m=b-n+1</Formula>
            </div>
          )}
        </section>

        <section id="step-2" className="lesson-section">
          <span className="step-label">02 / {copy.scheme}</span>
          <h2>{copy.twoLoop}</h2>
          <p>{copy.direction}</p>
          <CircuitDiagram language={language} />
          <div className="given-grid">
            <div><span>E₁</span><strong>24 V</strong></div><div><span>E₂</span><strong>12 V</strong></div>
            <div><span>R₁</span><strong>4 Ω</strong></div><div><span>R₂</span><strong>6 Ω</strong></div>
            <div><span>R₃</span><strong>2 Ω</strong></div>
          </div>
        </section>

        <section id="step-3" className="lesson-section">
          <span className="step-label">03 / {copy.equations}</span>
          <h2>{copy.writeKvl}</h2>
          {level <= 2 && <p>{copy.resistanceRule}</p>}
          <Formula>{String.raw`\begin{cases}(R_1+R_3)I_1-R_3I_2=E_1\\-R_3I_1+(R_2+R_3)I_2=E_2\end{cases}`}</Formula>
          <div className="substitution">
            <span>{copy.substitute}</span>
            <Formula>{String.raw`\begin{cases}6I_1-2I_2=24\\-2I_1+8I_2=12\end{cases}`}</Formula>
          </div>
          {level === 1 && <>
            <p>{copy.matrix}</p>
            <Formula>{String.raw`\underbrace{\begin{bmatrix}6&-2\\-2&8\end{bmatrix}}_{\mathbf R}\begin{bmatrix}I_1\\I_2\end{bmatrix}=\begin{bmatrix}24\\12\end{bmatrix}`}</Formula>
            <p>{copy.reciprocity}</p>
            <Formula>{String.raw`\det\mathbf R=6\cdot8-(-2)^2=44>0`}</Formula>
          </>}
        </section>

        <section id="step-4" className="lesson-section">
          <span className="step-label">04 / {copy.solution}</span>
          <h2>{copy.findCurrents}</h2>
          {level === 3 ? (
            <>
              <Formula>{String.raw`6I_1-2I_2=24,\qquad -2I_1+8I_2=12`}</Formula>
              <Formula>{String.raw`I_1=\frac{54}{11}\approx4.91\ \mathrm A,\qquad I_2=\frac{30}{11}\approx2.73\ \mathrm A`}</Formula>
            </>
          ) : (
            <>
              <p>{copy.eliminate}</p>
              <Formula>{String.raw`\begin{aligned}24I_1-8I_2&=96\\-2I_1+8I_2&=12\\ \hline 22I_1&=108\end{aligned}`}</Formula>
              <Formula>{String.raw`I_1=\frac{108}{22}=\frac{54}{11}\approx4.91\ \mathrm A`}</Formula>
              <p>{copy.substituteI1}</p>
              <Formula>{String.raw`I_2=\frac{12+2I_1}{8}=\frac{30}{11}\approx2.73\ \mathrm A`}</Formula>
            </>
          )}
          <div className="result-card">
            <Target />
            <div><span>{copy.sharedCurrent}</span>
              <Formula block={false}>{String.raw`I_3=I_1-I_2=\frac{24}{11}\approx2.18\ \mathrm A`}</Formula>
            </div>
          </div>
        </section>

        <section id="step-5" className="lesson-section">
          <span className="step-label">05 / {copy.check}</span>
          <h2>{copy.powerBalance}</h2>
          {level === 1 && <p>{copy.powerLead}</p>}
          <Formula>{String.raw`P_R=I_1^2R_1+I_2^2R_2+(I_1-I_2)^2R_3`}</Formula>
          <Formula>{String.raw`P_R\approx150.55\ \mathrm W,\qquad P_E=E_1I_1+E_2I_2\approx150.55\ \mathrm W`}</Formula>
          <div className="success-note"><Check />{copy.success}</div>
        </section>
        <div className="lesson-next">
          <div><span>{copy.next}</span><strong>{copy.nodal}</strong></div>
          <button disabled><ArrowRight /></button>
        </div>
      </article>
    </div>
  );
}
