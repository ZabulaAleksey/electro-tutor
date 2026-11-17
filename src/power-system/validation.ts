export const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  !!raw && typeof raw === "object" && !Array.isArray(raw);
export const isPowerId = (raw: unknown): raw is string =>
  typeof raw === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(raw);
export const isFiniteNumber = (raw: unknown): raw is number => typeof raw === "number" && Number.isFinite(raw);
export const isPositiveNumber = (raw: unknown): raw is number => isFiniteNumber(raw) && raw > 0;
export const isNonnegativeNumber = (raw: unknown): raw is number => isFiniteNumber(raw) && raw >= 0;
export const isPositiveInteger = (raw: unknown): raw is number => isPositiveNumber(raw) && Number.isSafeInteger(raw);
