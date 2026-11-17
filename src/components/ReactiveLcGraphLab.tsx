import { useEffect, useState } from "react";
import CircuitEditor from "../circuit/CircuitEditor";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import type { Language } from "../types";
import { ReactiveImpedanceResults } from "./ReactiveImpedanceResults";
import { FosterResults } from "./FosterResults";
import "./ReactiveTwoPortLab.css";

const initialDocument = reactiveLcMode.createDefaultDocument();

const words = {
  ru: {
    guide: "P1 задаёт два внешних вывода. Подайте испытательный ток 1 A на первый вывод, второй примите за опорный.",
    error: "Проверьте одну пару внешних выводов, номиналы L/C и соединения.",
    value: "Проверьте номинал. Диапазон L от 1 µH до 100 H с шагом 1 µH, C от 1 nF до 0,1 F с шагом 1 nF.",
    range: "Для расчёта допустимо до 24 элементов L/C и до 12 связанных узлов.",
    open: "Между внешними выводами нет пути тока.",
    short: "Внешние выводы соединены проводом.",
    method: "Узловой метод",
    nodeCount: "Узлов в связной схеме",
  },
  uk: {
    guide: "P1 задає два зовнішні виводи. Подайте випробувальний струм 1 A на перший вивід, другий вважайте опорним.",
    error: "Перевірте одну пару зовнішніх виводів, номінали L/C і з’єднання.",
    value: "Перевірте номінал. Діапазон L від 1 µH до 100 H з кроком 1 µH, C від 1 nF до 0,1 F з кроком 1 nF.",
    range: "Для розрахунку допустимо до 24 елементів L/C і до 12 зв’язаних вузлів.",
    open: "Між зовнішніми виводами немає шляху струму.",
    short: "Зовнішні виводи з’єднані проводом.",
    method: "Вузловий метод",
    nodeCount: "Вузлів у зв’язаному колі",
  },
};

export default function ReactiveLcGraphLab({ language }: { language: Language }) {
  const copy = words[language];
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState(() => reactiveLcMode.readModel(initialDocument));
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => setReady(true), []);

  function calculate(document: string) {
    try {
      setResult(reactiveLcMode.readModel(document));
      setCursor(null);
      setError("");
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "";
      setError(reason === "invalid-lc-value" ? copy.value : reason === "lc-graph-limit" ? copy.range : copy.error);
      return false as const;
    }
  }

  return <fieldset className="lab-hydration-guard" disabled={!ready}>
    <div className="lc-lab" data-lc-graph-ready={ready}>
      <div className="lc-workspace">
        <section className="lc-panel lc-graph-editor">
          <p>{copy.guide}</p>
          <CircuitEditor embedded initial={initialDocument} language={language} mode={reactiveLcMode} onCalculate={calculate} />
          {error && <p role="alert" data-lc-graph-error>{error}</p>}
        </section>
        <div className="lc-graph-results" data-lc-graph-result={result.kind}>
          {result.kind === "finite"
            ? <ReactiveImpedanceResults impedance={result.impedance} language={language} cursor={cursor} setCursor={setCursor} />
            : <section className="lc-panel lc-results" aria-live="polite">
                <p data-lc-formula>{result.kind === "short" ? "Z(s) = 0 Ω" : "Z(s) → ∞"}</p>
                <p>{copy[result.kind]}</p>
              </section>}
          {result.kind === "finite" && <details className="lc-panel">
            <summary>{copy.method}</summary>
            <p>{copy.nodeCount} {result.nodeCount}. Yₗ = 1/(sL), Y꜀ = sC.</p>
            <p>Y(s)U(s) = I(s), Z(s) = U₁ / I₁.</p>
          </details>}
          <FosterResults result={result} cursor={cursor} language={language} form="i" />
          <FosterResults result={result} cursor={cursor} language={language} form="ii" />
        </div>
      </div>
    </div>
  </fieldset>;
}
