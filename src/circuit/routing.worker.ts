import type { Drawing } from "./drawing";
import { optimizeDrawing, optimizeLayout, type Routing } from "./routing";

export type OptimizationRequest = {
  drawing: Drawing;
  routing: Routing;
  grid: number;
  layout: boolean;
};

export type OptimizationResult =
  | { drawing: Drawing; routing: Routing }
  | { error: true };

self.onmessage = (event: MessageEvent<OptimizationRequest>) => {
  const { drawing, routing, grid, layout } = event.data;
  try {
    const result = layout ? optimizeLayout(drawing, routing, grid) : { drawing, routing: optimizeDrawing(drawing, routing) };
    self.postMessage(result satisfies OptimizationResult);
  } catch {
    self.postMessage({ error: true } satisfies OptimizationResult);
  }
};
