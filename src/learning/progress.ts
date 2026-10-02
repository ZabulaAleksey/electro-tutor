import { resolveLocalApiOrigin } from "../account/profile-contract";

export const LEARNING_STORAGE_VERSION = 1 as const;
export const MESH_LESSON_ID = "mesh-current-method" as const;
const STORAGE_PREFIX = `potential-learning:v${LEARNING_STORAGE_VERSION}:`;
const MAX_LESSONS = 12;
const MAX_RECORD_BYTES = 4096;
const PUBLISHED_LESSON_IDS = new Set<string>([MESH_LESSON_ID]);

export type LearningLessonProgress = {
  highestStep: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  lastVisitedAt: string;
  completedAt?: string;
};

export type LearningRecord = {
  version: typeof LEARNING_STORAGE_VERSION;
  lessons: Record<string, LearningLessonProgress>;
};

export type LearningStorageState = "loading" | "ready" | "unavailable";
export type LearningIdentity = { issuer: string; subject: string };
export type LearningNamespace =
  | { kind: "guest"; key: string }
  | { kind: "authenticated"; key: string };

export type LearningStore = {
  namespace: LearningNamespace;
  load(): { state: LearningStorageState; record: LearningRecord };
  updateLesson(
    lessonId: string,
    update: (current: LearningLessonProgress | undefined) => LearningLessonProgress,
  ): { state: LearningStorageState; record: LearningRecord };
};

const emptyRecord = (): LearningRecord => ({ version: LEARNING_STORAGE_VERSION, lessons: {} });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isLessonProgress(value: unknown): value is LearningLessonProgress {
  if (!isRecord(value)) return false;
  const highestStep = value.highestStep;
  return (highestStep === 1 || highestStep === 2 || highestStep === 3 || highestStep === 4 || highestStep === 5)
    && typeof value.completed === "boolean"
    && isIsoTimestamp(value.lastVisitedAt)
    && (value.completedAt === undefined || isIsoTimestamp(value.completedAt));
}

function parseRecord(value: unknown): LearningRecord | null {
  if (!isRecord(value) || value.version !== LEARNING_STORAGE_VERSION || !isRecord(value.lessons)) return null;
  const entries = Object.entries(value.lessons);
  if (entries.length > MAX_LESSONS) return null;
  const lessons: Record<string, LearningLessonProgress> = {};
  for (const [lessonId, lesson] of entries) {
    if (!PUBLISHED_LESSON_IDS.has(lessonId) || !isLessonProgress(lesson)) return null;
    lessons[lessonId] = lesson;
  }
  return { version: LEARNING_STORAGE_VERSION, lessons };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function guestNamespace(): LearningNamespace {
  return { kind: "guest", key: `${STORAGE_PREFIX}guest` };
}

async function digestIdentity(identity: LearningIdentity): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(`${identity.issuer}\u0000${identity.subject}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticatedNamespace(identity: LearningIdentity): Promise<LearningNamespace | null> {
  let issuer: URL;
  try {
    issuer = new URL(identity.issuer);
  } catch {
    return null;
  }
  const isLoopback = issuer.hostname === "127.0.0.1" || issuer.hostname === "localhost";
  const allowedProtocol = issuer.protocol === "https:" || (issuer.protocol === "http:" && isLoopback);
  if (!allowedProtocol || issuer.username || issuer.password || issuer.search || issuer.hash) return null;
  if (!identity.subject || identity.subject.length > 256 || /\p{C}/u.test(identity.subject)) return null;
  const digest = await digestIdentity(identity);
  return digest ? { kind: "authenticated", key: `${STORAGE_PREFIX}subject:${digest}` } : null;
}

export function createLearningStore(namespace: LearningNamespace): LearningStore {
  const storage = browserStorage();
  let state: LearningStorageState = storage ? "ready" : "unavailable";
  let record = emptyRecord();
  let loaded = false;

  const load = (): { state: LearningStorageState; record: LearningRecord } => {
    if (loaded) return { state, record };
    loaded = true;
    if (!storage) return { state, record };
    try {
      const raw = storage.getItem(namespace.key);
      if (!raw) return { state, record };
      if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) {
        state = "unavailable";
        return { state, record };
      }
      const parsed = parseRecord(JSON.parse(raw));
      if (!parsed) state = "unavailable";
      else record = parsed;
    } catch {
      state = "unavailable";
    }
    return { state, record };
  };

  const updateLesson = (
    lessonId: string,
    update: (current: LearningLessonProgress | undefined) => LearningLessonProgress,
  ): { state: LearningStorageState; record: LearningRecord } => {
    load();
    if (state !== "ready") return { state, record };
    if (!PUBLISHED_LESSON_IDS.has(lessonId)) return { state: "unavailable", record };
    const next = update(record.lessons[lessonId]);
    if (!isLessonProgress(next)) return { state: "unavailable", record };
    record = { ...record, lessons: { ...record.lessons, [lessonId]: next } };
    if (!storage) {
      state = "unavailable";
      return { state, record };
    }
    try {
      const serialized = JSON.stringify(record);
      if (new TextEncoder().encode(serialized).byteLength > MAX_RECORD_BYTES) {
        state = "unavailable";
        return { state, record };
      }
      storage.setItem(namespace.key, serialized);
    } catch {
      state = "unavailable";
    }
    return { state, record };
  };

  return { namespace, load, updateLesson };
}

export async function fetchLearningIdentity(
  fetcher: typeof fetch,
  apiOrigin: URL | null = typeof window === "undefined" ? null : resolveLocalApiOrigin(window.location),
): Promise<LearningIdentity | null> {
  if (!apiOrigin) return null;
  try {
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(10_000)
      : undefined;
    const response = await fetcher(new URL("/api/v1/me", apiOrigin), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.issuer !== "string" || typeof value.subject !== "string") return null;
    return { issuer: value.issuer, subject: value.subject };
  } catch {
    return null;
  }
}

export function loadLessonProgress(store: LearningStore, lessonId: string = MESH_LESSON_ID) {
  const result = store.load();
  return { state: result.state, progress: result.record.lessons[lessonId] };
}

export function markLessonStep(store: LearningStore, step: 1 | 2 | 3 | 4 | 5, lessonId: string = MESH_LESSON_ID) {
  const now = new Date().toISOString();
  const result = store.updateLesson(lessonId, (current) => ({
    highestStep: Math.max(current?.highestStep ?? 1, step) as 1 | 2 | 3 | 4 | 5,
    completed: current?.completed ?? false,
    lastVisitedAt: now,
    ...(current?.completedAt ? { completedAt: current.completedAt } : {}),
  }));
  return { state: result.state, progress: result.record.lessons[lessonId] };
}

export function completeLesson(store: LearningStore, lessonId: string = MESH_LESSON_ID) {
  const now = new Date().toISOString();
  const result = store.updateLesson(lessonId, (current) => ({
    highestStep: 5,
    completed: true,
    lastVisitedAt: now,
    completedAt: current?.completedAt ?? now,
  }));
  return { state: result.state, progress: result.record.lessons[lessonId] };
}
