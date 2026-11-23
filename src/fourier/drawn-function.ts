export type FunctionCursor = { index: number; y: number };

export function paintInterval(values: number[], from: FunctionCursor, to: FunctionCursor) {
  const next = values.slice();
  const span = to.index - from.index;
  for (let i = Math.min(from.index, to.index); i <= Math.max(from.index, to.index); i++) {
    next[i] = span ? from.y + (to.y - from.y) * (i - from.index) / span : to.y;
  }
  return next;
}
