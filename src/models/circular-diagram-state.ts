export const CIRCULAR_DIAGRAM_STATE_VERSION = "1";
export const CIRCULAR_DIAGRAM_MAX_QUERY_LENGTH = 1024;

export const CIRCULAR_DIAGRAM_DEFAULTS = {
  i0m: 1.5,
  i0a: -18,
  ikm: 8,
  ika: -55,
  zm: 4,
  za: 35,
  phi: 25,
  r: 43,
} as const;

export type CircularDiagramState = {
  -readonly [Key in keyof typeof CIRCULAR_DIAGRAM_DEFAULTS]: number;
};

type StateKey = keyof CircularDiagramState;
type StateLimit = { min: number; max: number };

export const CIRCULAR_DIAGRAM_LIMITS: Record<StateKey, StateLimit> = {
  i0m: { min: 0, max: 1000 },
  i0a: { min: -180, max: 180 },
  ikm: { min: 0, max: 1000 },
  ika: { min: -180, max: 180 },
  zm: { min: 0.01, max: 1_000_000 },
  za: { min: -90, max: 90 },
  phi: { min: -90, max: 90 },
  r: { min: 0, max: 100 },
};

const STATE_KEYS = Object.keys(CIRCULAR_DIAGRAM_DEFAULTS) as StateKey[];
const KNOWN_KEYS = new Set<string>(["v", ...STATE_KEYS]);
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export type CircularDiagramParseStatus =
  | "valid"
  | "migrated"
  | "normalized"
  | "recovered";

export type CircularDiagramParseResult = {
  state: CircularDiagramState;
  status: CircularDiagramParseStatus;
  canonicalSearch: string;
};

function clamp(value: number, limits: StateLimit): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

function canonicalNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

export function normalizeCircularDiagramState(
  input: CircularDiagramState,
): CircularDiagramState {
  return Object.fromEntries(STATE_KEYS.map((key) => {
    const value = input[key];
    const finiteValue = Number.isFinite(value) ? value : CIRCULAR_DIAGRAM_DEFAULTS[key];
    return [key, clamp(finiteValue, CIRCULAR_DIAGRAM_LIMITS[key])];
  })) as CircularDiagramState;
}

export function canonicalizeCircularDiagramState(
  input: CircularDiagramState,
): string {
  const state = normalizeCircularDiagramState(input);
  const params = new URLSearchParams();
  params.set("v", CIRCULAR_DIAGRAM_STATE_VERSION);
  STATE_KEYS.forEach((key) => params.set(key, canonicalNumber(state[key])));
  return `?${params.toString()}`;
}

function recoveredDefaults(): CircularDiagramParseResult {
  const state = { ...CIRCULAR_DIAGRAM_DEFAULTS };
  return {
    state,
    status: "recovered",
    canonicalSearch: canonicalizeCircularDiagramState(state),
  };
}

function parseFiniteDecimal(raw: string): number | null {
  if (!DECIMAL_NUMBER.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseCircularDiagramSearch(search: string): CircularDiagramParseResult {
  const rawQuery = search.startsWith("?") ? search.slice(1) : search;
  if (rawQuery.length > CIRCULAR_DIAGRAM_MAX_QUERY_LENGTH) return recoveredDefaults();

  const params = new URLSearchParams(rawQuery);
  for (const key of KNOWN_KEYS) {
    if (params.getAll(key).length > 1) return recoveredDefaults();
  }

  const version = params.get("v");
  if (version !== null && version !== CIRCULAR_DIAGRAM_STATE_VERSION) {
    return recoveredDefaults();
  }

  const state = { ...CIRCULAR_DIAGRAM_DEFAULTS } as CircularDiagramState;
  let missingKnownField = false;

  for (const key of STATE_KEYS) {
    const raw = params.get(key);
    if (raw === null) {
      missingKnownField = true;
      continue;
    }

    const value = parseFiniteDecimal(raw);
    const limits = CIRCULAR_DIAGRAM_LIMITS[key];
    if (value === null || value < limits.min || value > limits.max) {
      return recoveredDefaults();
    }
    state[key] = Object.is(value, -0) ? 0 : value;
  }

  const canonicalSearch = canonicalizeCircularDiagramState(state);
  if (version === null) {
    return { state, status: "migrated", canonicalSearch };
  }

  const hasUnknownKeys = [...params.keys()].some((key) => !KNOWN_KEYS.has(key));
  const originalSearch = rawQuery.length > 0 ? `?${rawQuery}` : "";
  const status = hasUnknownKeys || missingKnownField || originalSearch !== canonicalSearch
    ? "normalized"
    : "valid";

  return { state, status, canonicalSearch };
}
