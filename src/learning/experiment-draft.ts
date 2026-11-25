const prefix = "electrotutor:experiment:v1:";
type Range = { min: number; max: number };

export function readExperimentDraft(key: string, ranges: readonly Range[]): number[] | undefined {
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (!raw || raw.length > 256) return;
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length !== ranges.length) return;
    if (values.every((value, index) => Number.isFinite(value) && value >= ranges[index].min && value <= ranges[index].max)) {
      return values;
    }
  } catch {
    // The experiment remains usable when tab storage is unavailable.
  }
}

export function writeExperimentDraft(key: string, values: readonly number[]) {
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(values));
  } catch {
    // A local edit still updates the active experiment.
  }
}
