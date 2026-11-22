import { useEffect, useMemo, useRef, useState } from "react";
import { simplifyReactiveDocument, simplifyReactiveTopology } from "../circuit/reactive-lc-simplification";
import type { CircuitTopology } from "../circuit/topology";
import { formatEngineeringValue } from "../engineering/format";
import { fractionText } from "../models/reactive-two-port";
import type { Language } from "../types";

type Props = { language: Language } & (
  { document: string; topology?: never; observedEndpoints?: never } |
  { document?: never; topology: CircuitTopology; observedEndpoints?: readonly string[] }
);

export function SimplifiedLcResults({ document, topology, observedEndpoints, language }: Props) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (disclosure.current?.open) setOpen(true);
  }, []);
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const reduced = useMemo(() => {
    if (!open) return null;
    try {
      return topology ? simplifyReactiveTopology(topology, observedEndpoints) : simplifyReactiveDocument(document);
    } catch { return null; }
  }, [document, topology, observedEndpoints, open]);

  const equivalents = new Map(reduced?.steps.map((step, index) =>
    [step.id, step.kind.toUpperCase() + t("экв", "екв") + (index + 1)] as const));
  const name = (id: string) => equivalents.get(id) ?? id;

  return <details ref={disclosure} suppressHydrationWarning data-lc-simplification className="lc-panel lc-synthesis"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Упрощённая схема", "Спрощена схема")}</summary>
    {open && !reduced && <p role="status">{t("Точную эквивалентность свёртки подтвердить не удалось.",
      "Не вдалося підтвердити точну еквівалентність згортки.")}</p>}
    {reduced && <>
      {reduced.steps.length ? <ol>{reduced.steps.map(({ id, members, connection }) =>
        <li key={id} data-lc-simplification-step>{members.map(name).join(" + ")} → {name(id)} ·
          {" "}{connection === "series" ? t("последовательно", "послідовно") : t("параллельно", "паралельно")}
        </li>)}</ol>
        : <p>{t("Однотипных последовательных и параллельных звеньев для свёртки нет.",
            "Однотипних послідовних і паралельних ланок для згортки немає.")}</p>}
      {reduced.branches.length > 0 && <table aria-label={t("Связность упрощённой схемы", "Зв’язність спрощеної схеми")}>
        <thead><tr>
          <th scope="col">{t("Элемент", "Елемент")}</th><th scope="col">{t("Узлы", "Вузли")}</th>
          <th scope="col">{t("Номинал", "Номінал")}</th>
        </tr></thead>
        <tbody>{reduced.branches.map(branch => <tr key={branch.id} data-lc-simplified-branch={branch.kind}>
          <th scope="row">{name(branch.id)}</th>
          <td>{branch.firstNode} ↔ {branch.secondNode}</td>
          <td data-lc-simplified-value={branch.valueSI}>
            {formatEngineeringValue(branch.valueSI, branch.kind === "l" ? "H" : "F", language)}
          </td>
        </tr>)}</tbody>
      </table>}
      <p data-lc-simplified-formula>{reduced.result.kind === "finite"
        ? "Z(s) = " + fractionText(reduced.result.impedance) + " Ω"
        : reduced.result.kind === "short" ? "Z(s) = 0 Ω" : "Z(s) → ∞"}</p>
      <p>{t("Входной импеданс исходной и упрощённой схем совпадает точно.",
        "Вхідний імпеданс початкової та спрощеної схем збігається точно.")}</p>
    </>}
  </details>;
}
