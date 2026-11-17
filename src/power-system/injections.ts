import { powerVoltagePresetsKv } from "./configuration";
import type { PowerLoad, PowerSource } from "./network";
import { isNonnegativeNumber, isPositiveNumber, isPowerId } from "./validation";

export type LoadInput =
  | Readonly<{ kind: "pq"; activeMw: number; reactiveMvar: number }>
  | Readonly<{ kind: "power-factor"; activeMw: number; cosPhi: number; sign: "inductive" | "capacitive" }>;

export type SourceInput = Readonly<{
  id: string;
  busId: string;
  inService?: boolean;
  voltageKv?: number;
  presetKv?: typeof powerVoltagePresetsKv[number];
  angleDeg?: number;
}>;

export function normalizeLoad(input: LoadInput): Pick<PowerLoad, "activeMw" | "reactiveMvar"> {
  const { activeMw } = input;
  if (!isNonnegativeNumber(activeMw)) throw Error("power-invalid-load-input");
  if (input.kind === "pq") {
    if (!Number.isFinite(input.reactiveMvar)) throw Error("power-invalid-load-input");
    return { activeMw, reactiveMvar: input.reactiveMvar || 0 };
  }
  const { cosPhi, sign } = input;
  if (!isPositiveNumber(cosPhi) || cosPhi > 1 || (sign !== "inductive" && sign !== "capacitive")) {
    throw Error("power-invalid-load-input");
  }
  const reactiveMvar = (sign === "inductive" ? 1 : -1) * (activeMw * Math.sqrt((1 - cosPhi) * (1 + cosPhi))) / cosPhi;
  if (!Number.isFinite(reactiveMvar)) throw Error("power-invalid-load-input");
  return { activeMw, reactiveMvar: reactiveMvar || 0 };
}

export function normalizePowerSource(input: SourceInput): PowerSource {
  const voltageKv = input.voltageKv ?? input.presetKv;
  if (!isPowerId(input.id) || !isPowerId(input.busId) || !isPositiveNumber(voltageKv) ||
      (input.presetKv !== undefined && !powerVoltagePresetsKv.includes(input.presetKv)) ||
      (input.inService !== undefined && typeof input.inService !== "boolean")) throw Error("power-invalid-source-input");
  if (input.voltageKv !== undefined && input.presetKv !== undefined && input.voltageKv !== input.presetKv) {
    throw Error("power-source-voltage-conflict");
  }
  const remainder = (input.angleDeg ?? 0) % 360;
  if (!Number.isFinite(remainder)) throw Error("power-invalid-source-input");
  const angleDeg = remainder > 180 ? remainder - 360 : remainder <= -180 ? remainder + 360 : remainder || 0;
  return { id: input.id, busId: input.busId, inService: input.inService ?? true, kind: "source", voltageKv, angleDeg };
}
