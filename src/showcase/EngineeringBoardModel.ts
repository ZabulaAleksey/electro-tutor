export type PersistedStroke = { id: number; points: string };
export const MAX_STROKES = 500;
export const MAX_POINTS_TEXT = 1000000;
const validPoints = (value:unknown):value is string => typeof value==="string" && value.length>0 && value.length<=MAX_POINTS_TEXT && value.split(/\s+/).every(point=>{if(!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(point))return false;return point.split(",").every(x=>Number.isFinite(Number(x))&&Math.abs(Number(x))<=1e6);});

export function parseStrokes(raw: string | null): { strokes: PersistedStroke[]; error?: string } {
  if (!raw) return { strokes: [] };
  if (raw.length > 4000000) return { strokes: [], error: "Сохранённая доска слишком велика" };
  try {
    const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || value.length > MAX_STROKES) return { strokes: [], error: "Сохранённая доска повреждена или превышает лимит" };
    const strokes: PersistedStroke[] = [];
    for (const [index, item] of value.entries()) { if (!item || typeof item !== "object" || !validPoints((item as { points?: unknown }).points)) return { strokes: [], error: "Сохранённая доска повреждена или превышает лимит" }; const entry = item as { id?: unknown; points: string }; strokes.push({ id: Number.isInteger(entry.id) ? Number(entry.id) : index + 1, points: entry.points }); }
    return { strokes };
  } catch { return { strokes: [], error: "Не удалось прочитать сохранённую доску" }; }
}
export function serializeStrokes(strokes: PersistedStroke[]): string { const serialized = JSON.stringify(strokes); if (serialized.length > 4000000) throw new Error("payload too large"); return serialized; }
