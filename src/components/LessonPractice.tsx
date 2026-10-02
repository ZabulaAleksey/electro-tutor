import { useEffect, useState, type SyntheticEvent } from "react";
import { Check, CircleAlert, Target } from "lucide-react";
import { getLocale } from "../i18n";
import type { Language } from "../types";
import { gradePracticeAnswer, type PracticeResult } from "../learning/practice";
import type { LearningStorageState } from "../learning/progress";

export default function LessonPractice({ language, completed, storageState, onComplete }: {
  language: Language;
  completed: boolean;
  storageState: LearningStorageState;
  onComplete: () => void;
}) {
  const copy = getLocale(language).learning;
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<PracticeResult>(completed ? "correct" : "idle");
  useEffect(() => {
    if (completed) setResult("correct");
  }, [completed]);
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (storageState === "loading") return;
    const next = gradePracticeAnswer(answer);
    setResult(next.result);
    if (next.result === "correct") onComplete();
  };

  return (
    <section className="lesson-practice" aria-labelledby="practice-heading">
      <span className="step-label">{copy.practiceKicker}</span>
      <h2 id="practice-heading">{copy.practiceHeading}</h2>
      <p>{copy.practicePrompt}</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="practice-answer">{copy.practiceLabel}</label>
        <div className="practice-input-row">
          <input
            disabled={storageState === "loading"}
            id="practice-answer"
            inputMode="decimal"
            value={answer}
            onChange={(event) => { setAnswer(event.target.value); setResult("idle"); }}
            aria-describedby="practice-help practice-feedback"
          />
          <span aria-hidden="true">А</span>
          <button className="button primary" type="submit" disabled={storageState === "loading"}>{copy.practiceCheck}</button>
        </div>
        <small id="practice-help">{copy.practiceHelp}</small>
        <p id="practice-feedback" role="status" aria-live="polite">
          {storageState === "loading" && copy.checkingIdentity}
          {result === "invalid" && <><CircleAlert aria-hidden="true" /> {copy.practiceInvalid}</>}
          {result === "incorrect" && <><Target aria-hidden="true" /> {copy.practiceIncorrect}</>}
          {result === "correct" && <><Check aria-hidden="true" /> {storageState === "unavailable" ? copy.practiceCorrectUnavailable : copy.practiceCorrect}</>}
        </p>
      </form>
    </section>
  );
}
