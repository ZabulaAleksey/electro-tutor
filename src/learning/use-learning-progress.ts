import { useCallback, useEffect, useRef, useState } from "react";
import { resolveLocalApiOrigin } from "../account/profile-contract";
import {
  authenticatedNamespace,
  completeLesson,
  createLearningStore,
  fetchLearningIdentity,
  guestNamespace,
  loadLessonProgress,
  markLessonStep,
  MESH_LESSON_ID,
  type LearningLessonProgress,
  type LearningStorageState,
} from "./progress";

export type LessonProgressController = {
  progress?: LearningLessonProgress;
  storageState: LearningStorageState;
  onStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  onComplete: () => void;
};

export function useLearningProgress(lessonId = MESH_LESSON_ID): LessonProgressController {
  const [store, setStore] = useState(() => createLearningStore(guestNamespace()));
  const [progress, setProgress] = useState<LearningLessonProgress>();
  const [storageState, setStorageState] = useState<LearningStorageState>("loading");
  const loadSequence = useRef(0);
  const mounted = useRef(true);

  const loadStore = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const isCurrent = () => mounted.current && sequence === loadSequence.current;
    const guest = createLearningStore(guestNamespace());
    const initial = loadLessonProgress(guest, lessonId);
    if (!isCurrent()) return;
    setStore(guest);
    setProgress(initial.progress);
    setStorageState(initial.state);

    const identity = await fetchLearningIdentity(window.fetch.bind(window), resolveLocalApiOrigin(window.location));
    if (!isCurrent() || !identity) return;
    const namespace = await authenticatedNamespace(identity);
    if (!isCurrent()) return;
    if (!namespace) {
      setStorageState("unavailable");
      return;
    }
    const authenticated = createLearningStore(namespace);
    const loaded = loadLessonProgress(authenticated, lessonId);
    if (!isCurrent()) return;
    setStore(authenticated);
    setProgress(loaded.progress);
    setStorageState(loaded.state);
  }, [lessonId]);

  useEffect(() => {
    mounted.current = true;
    void loadStore();
    const onSession = () => void loadStore();
    document.addEventListener("account:session", onSession, true);
    document.addEventListener("account:session-expired", onSession, true);
    return () => {
      mounted.current = false;
      loadSequence.current += 1;
      document.removeEventListener("account:session", onSession, true);
      document.removeEventListener("account:session-expired", onSession, true);
    };
  }, [loadStore]);

  const onStep = useCallback((step: 1 | 2 | 3 | 4 | 5) => {
    const next = markLessonStep(store, step, lessonId);
    setProgress(next.progress);
    setStorageState(next.state);
  }, [lessonId, store]);

  const onComplete = useCallback(() => {
    const next = completeLesson(store, lessonId);
    setProgress(next.progress);
    setStorageState(next.state);
  }, [lessonId, store]);

  return { progress, storageState, onStep, onComplete };
}
