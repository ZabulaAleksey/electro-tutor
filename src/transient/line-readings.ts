import type { RlcEquivalent } from "../circuit/rlc-reduction";

export type LineReading = { voltage: number; current?: number };

export function liftLineReadings(
  values: ReadonlyMap<string, LineReading>,
  equivalents: ReadonlyMap<string, RlcEquivalent>,
  polarity: ReadonlyMap<string, 1 | -1>,
): Map<string, LineReading> {
  const resolved = new Map(values);
  const orient = ({ voltage, current }: LineReading, sign: 1 | -1): LineReading => ({
    voltage: voltage * sign, ...(current === undefined ? {} : { current: current * sign }),
  });
  function lift(id: string, reading: LineReading) {
    const equivalent = equivalents.get(id);
    if (!equivalent) {
      resolved.set(id, reading);
      return;
    }
    resolved.delete(id);
    const { kind, connection, value, members } = equivalent;
    const series = connection === "series";
    for (const member of members) {
      let { voltage, current } = reading;
      if (series) {
        const ratio = kind === "c" ? value / member.value : value === 0 ? 0 : member.value / value;
        voltage *= ratio;
      } else if (kind === "r" && value === 0) {
        const shorts = members.filter(item => item.value === 0);
        current = member.value > 0 ? 0 : shorts.length === 1 ? current : undefined;
      } else if (current !== undefined) {
        current *= kind === "c" ? member.value / value : value / member.value;
      }
      lift(member.id, orient({ voltage, current }, member.polarity));
    }
  }
  for (const [id, reading] of values) {
    const sign = polarity.get(id) ?? 1;
    if (equivalents.has(id)) lift(id, orient(reading, sign));
    else if (sign < 0) resolved.set(id, orient(reading, sign));
  }
  return resolved;
}
