import { useMemo } from "react";
import type { PowerNetwork } from "../power-system/network";
import { createPowerStudy } from "../power-system/topology";
import type { Language } from "../types";

export function PowerSwitchPanel({ language, network, onSwitch }: {
  language: Language; network: PowerNetwork; onSwitch: (id: string, closed: boolean) => void;
}) {
  const topology = useMemo(() => createPowerStudy(network), [network]);
  const switches = network.elements.filter(element => element.kind === "switch");
  const t = (ru: string, uk: string) => language === "ru" ? ru : uk;
  const types = { isolated: t("Изолированный узел", "Ізольований вузол"),
    radial: t("Радиальная схема", "Радіальна схема"), meshed: t("Замкнутая схема", "Замкнена схема") };
  return <section className="power-panel power-switches" data-power-switches>
    <h2>{t("Физическая коммутация", "Фізична комутація")}</h2>
    {topology.islands.map(island => <p key={island.busIds[0]} data-power-topology={island.topology}>
      {types[island.topology]} · {island.busIds.join(", ")} ·
      {" "}{island.energized ? t("под питанием", "під живленням") : t("без питания", "без живлення")}
    </p>)}
    {switches.map(item => <label key={item.id}>
      <input type="checkbox" role="switch" checked={item.closed} onChange={event => onSwitch(item.id, event.currentTarget.checked)} />
      {t("Аппарат ", "Апарат ") + item.id}
      <span>{item.closed ? t("Замкнут", "Замкнений") : t("Разомкнут", "Розімкнений")}</span>
    </label>)}
  </section>;
}
