export type EraserPoint = { x: number; y: number };

export type ErasePolylineResult = { segments: string[]; budgetExceeded: boolean };
export type EraserBudget = { densePoints: number; distanceChecks: number };
export type EraserSession = { radius: number; radiusSquared: number; index: EraserPathIndex; budget: EraserBudget };

export const MAX_ERASER_DENSE_POINTS = 200_000;
export const MAX_ERASER_PATH_POINTS = 50_000;
export const MAX_ERASER_INDEX_ENTRIES = 250_000;
export const MAX_ERASER_DISTANCE_CHECKS = 3_000_000;

const finitePoint = (point: EraserPoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

export function parsePolylinePoints(value: string): EraserPoint[] {
  if (!value) return [];
  return value.split(/\s+/).flatMap((token) => {
    const [x, y] = token.split(",").map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
}

const pointSegmentDistanceSquared = (point: EraserPoint, start: EraserPoint, end: EraserPoint) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const x = start.x + projection * dx;
  const y = start.y + projection * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
};

const serializePoint = (point: EraserPoint) => `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;

const serializePolyline = (points: EraserPoint[]) => points.map(serializePoint).join(" ");

type IndexedSegment = { start: EraserPoint; end: EraserPoint };
type EraserPathIndex = { cellSize: number; segments: IndexedSegment[]; buckets: Map<string, number[]> };

const bucketKey = (x: number, y: number, cellSize: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;

function buildEraserPathIndex(path: EraserPoint[], radius: number): EraserPathIndex | null {
  const cellSize = Math.max(8, Math.min(64, radius * 2));
  const segments: IndexedSegment[] = [];
  const buckets = new Map<string, number[]>();
  let entries = 0;
  const segmentCount = Math.max(1, path.length - 1);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = path[index];
    const end = path.length === 1 ? path[0] : path[index + 1];
    const segmentIndex = segments.push({ start, end }) - 1;
    const minX = Math.floor((Math.min(start.x, end.x) - radius) / cellSize);
    const maxX = Math.floor((Math.max(start.x, end.x) + radius) / cellSize);
    const minY = Math.floor((Math.min(start.y, end.y) - radius) / cellSize);
    const maxY = Math.floor((Math.max(start.y, end.y) + radius) / cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x},${y}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(segmentIndex);
        else buckets.set(key, [segmentIndex]);
        entries += 1;
        if (entries > MAX_ERASER_INDEX_ENTRIES) return null;
      }
    }
  }
  return { cellSize, segments, buckets };
}

function indexedDistanceToPathSquared(point: EraserPoint, index: EraserPathIndex): { distance: number; checks: number } {
  const candidates = index.buckets.get(bucketKey(point.x, point.y, index.cellSize)) ?? [];
  let distance = Number.POSITIVE_INFINITY;
  for (const segmentIndex of candidates) {
    const segment = index.segments[segmentIndex];
    distance = Math.min(distance, pointSegmentDistanceSquared(point, segment.start, segment.end));
  }
  return { distance, checks: candidates.length };
}

function densifyPolyline(points: EraserPoint[], maxStep: number): EraserPoint[] {
  const result: EraserPoint[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(length / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      result.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
    }
  }
  return result;
}

function estimateDensifiedPointCount(points: EraserPoint[], maxStep: number, limit: number): number | null {
  let count = 1;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / maxStep));
    count += steps;
    if (count > limit) return null;
  }
  return count;
}

export function createEraserSession(eraserPath: EraserPoint[], radius: number): { session?: EraserSession; budgetExceeded: boolean } {
  const path = eraserPath.filter(finitePoint);
  if (!path.length || !Number.isFinite(radius) || radius <= 0) return { budgetExceeded: false };
  if (path.length > MAX_ERASER_PATH_POINTS) return { budgetExceeded: true };
  const safeRadius = Math.max(0.5, radius);
  const index = buildEraserPathIndex(path, safeRadius);
  if (!index) return { budgetExceeded: true };
  return { session: { radius: safeRadius, radiusSquared: safeRadius * safeRadius, index, budget: { densePoints: 0, distanceChecks: 0 } }, budgetExceeded: false };
}

export function erasePolylineSegmentsWithSession(pointsText: string, session: EraserSession): ErasePolylineResult {
  const original = parsePolylinePoints(pointsText);
  if (original.length < 2) return { segments: [pointsText], budgetExceeded: false };
  const maxStep = Math.max(0.75, Math.min(8, session.radius / 2));
  const remainingBudget = MAX_ERASER_DENSE_POINTS - session.budget.densePoints;
  const estimated = estimateDensifiedPointCount(original, maxStep, remainingBudget);
  if (estimated === null) return { segments: [pointsText], budgetExceeded: true };
  const dense = densifyPolyline(original, maxStep);
  session.budget.densePoints += estimated;
  let removed = false;
  const segments: string[] = [];
  let current: EraserPoint[] = [];

  const flush = () => {
    if (current.length >= 2) segments.push(serializePolyline(current));
    current = [];
  };

  for (const point of dense) {
    const nearest = indexedDistanceToPathSquared(point, session.index);
    session.budget.distanceChecks += nearest.checks;
    if (session.budget.distanceChecks > MAX_ERASER_DISTANCE_CHECKS) return { segments: [pointsText], budgetExceeded: true };
    if (nearest.distance <= session.radiusSquared) {
      removed = true;
      flush();
    } else {
      current.push(point);
    }
  }
  flush();
  return { segments: removed ? segments : [pointsText], budgetExceeded: false };
}

/**
 * Splits a persisted polyline wherever a swept eraser path intersects it.
 * The persisted representation remains the existing whitespace-separated SVG points format.
 */
export function erasePolylineSegments(pointsText: string, eraserPath: EraserPoint[], radius: number): string[] {
  return erasePolylineSegmentsWithStatus(pointsText, eraserPath, radius).segments;
}

export function erasePolylineSegmentsWithStatus(pointsText: string, eraserPath: EraserPoint[], radius: number): ErasePolylineResult {
  const sessionResult = createEraserSession(eraserPath, radius);
  if (sessionResult.budgetExceeded) return { segments: [pointsText], budgetExceeded: true };
  if (!sessionResult.session) return { segments: [pointsText], budgetExceeded: false };
  return erasePolylineSegmentsWithSession(pointsText, sessionResult.session);
}
