import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticatedNamespace,
  completeLesson,
  createLearningStore,
  fetchLearningIdentity,
  guestNamespace,
  loadLessonProgress,
  markLessonStep,
} from "./progress";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("quota");
  }
}

describe("bounded learning progress", () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", { localStorage: storage });
  });

  it("keeps step and completion idempotent", () => {
    const store = createLearningStore(guestNamespace());
    markLessonStep(store, 3);
    const first = completeLesson(store).progress;
    const second = completeLesson(store).progress;
    expect(first?.completed).toBe(true);
    expect(second?.completedAt).toBe(first?.completedAt);
    expect(loadLessonProgress(store).progress?.highestStep).toBe(5);
  });

  it("fails closed on malformed records and storage quota errors", () => {
    storage.setItem("potential-learning:v1:guest", "{broken");
    const malformed = createLearningStore(guestNamespace());
    expect(malformed.load().state).toBe("unavailable");

    const malformedLesson = JSON.stringify({
      version: 1,
      lessons: { "mesh-current-method": { highestStep: 99, completed: true, lastVisitedAt: "invalid" } },
    });
    storage.setItem("potential-learning:v1:guest", malformedLesson);
    const malformedNested = createLearningStore(guestNamespace());
    expect(malformedNested.load().state).toBe("unavailable");
    expect(completeLesson(malformedNested).state).toBe("unavailable");
    expect(storage.getItem("potential-learning:v1:guest")).toBe(malformedLesson);

    vi.stubGlobal("window", { localStorage: new ThrowingStorage() });
    const result = completeLesson(createLearningStore(guestNamespace()));
    expect(result.state).toBe("unavailable");

    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("storage denied");
      },
    });
    expect(createLearningStore(guestNamespace()).load().state).toBe("unavailable");
  });

  it("derives authenticated storage from issuer path and isolates issuer and subject", async () => {
    const local = await authenticatedNamespace({
      issuer: "http://127.0.0.1:58081/realms/electro-tutor-dev",
      subject: "subject-a",
    });
    expect(local?.kind).toBe("authenticated");
    const namespace = await authenticatedNamespace({ issuer: "https://issuer.example", subject: "subject-a" });
    expect(namespace?.kind).toBe("authenticated");
    expect(namespace?.key).not.toContain("subject-a");
    expect(namespace?.key).not.toContain("issuer.example");
    const otherSubject = await authenticatedNamespace({ issuer: "https://issuer.example", subject: "subject-b" });
    expect(otherSubject?.key).not.toBe(namespace?.key);
    expect(local?.key).not.toBe(namespace?.key);
    await expect(authenticatedNamespace({ issuer: "http://remote.example", subject: "subject-a" })).resolves.toBeNull();
    await expect(authenticatedNamespace({ issuer: "https://user:pass@issuer.example/realm", subject: "subject-a" })).resolves.toBeNull();
  });

  it("keeps records bounded to published lesson ids", () => {
    const store = createLearningStore(guestNamespace());
    expect(completeLesson(store, "future-course").state).toBe("unavailable");
    completeLesson(store);
    const raw = storage.getItem("potential-learning:v1:guest");
    expect(raw).not.toBeNull();
    expect(raw!.length).toBeLessThan(4096);

    storage.setItem("potential-learning:v1:guest", JSON.stringify({
      version: 1,
      lessons: { "mesh-current-method": { highestStep: 5, completed: true, lastVisitedAt: new Date().toISOString(), padding: "x".repeat(5000) } },
    }));
    expect(createLearningStore(guestNamespace()).load().state).toBe("unavailable");
  });

  it("uses a credentialed no-store identity read and fails closed on malformed data", async () => {
    let captured: RequestInit | undefined;
    const identity = await fetchLearningIdentity(async (_input, init) => {
      captured = init;
      return new Response(JSON.stringify({ issuer: "https://issuer.example", subject: "subject-a" }), { status: 200 });
    }, new URL("https://api.example/"));
    expect(identity).toEqual({ issuer: "https://issuer.example", subject: "subject-a" });
    expect(captured).toMatchObject({ credentials: "include", cache: "no-store" });
    await expect(fetchLearningIdentity(async () => new Response(JSON.stringify({ subject: "missing-issuer" }), { status: 200 }), new URL("https://api.example/"))).resolves.toBeNull();
  });
});
