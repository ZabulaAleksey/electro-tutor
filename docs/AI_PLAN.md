# Текущий AI-план

## TUTOR-02 — Production boundary и судьба Vite SPA

- Stage ID: `TUTOR-02`

Статус: `PLANNED`

Цель: устранить `T0-APP-001` и оставить один очевидный production frontend
boundary без преждевременного переписывания Astro или добавления Next.js.

### Dependencies и входные предпосылки

- `TUTOR-00` и `TUTOR-01` завершены и validated locally;
- baseline: `notes/stage-0-baseline.md`;
- Astro production build и используемый seam
  `MeshLessonIsland → legacy-pages/MeshLesson` подтверждены.

### Runnable vertical slice и scenario

Один production command строит Astro RU/UK artifact. Мёртвый Vite SPA удалён
после import/script/history audit либо изолирован как самостоятельный
experimental contour с отдельной ответственностью и build/test contract.

Concrete end-to-end scenario: clean frozen restore → check/lint/unit → Astro
production build → lesson audit → Chromium E2E; отсутствуют orphan
scripts/imports и второй неописанный production entrypoint.

### Scope

- ADR о production boundary и рассмотренных альтернативах;
- `index.html`, `src/main.tsx`, `src/App.tsx`, `src/legacy-pages/**`;
- Vite/TypeScript configs и package scripts только по доказанным зависимостям;
- README, architecture/status/roadmap/stage protocol и затронутые tests.

### Non-goals и deferred scope

- не внедрять Next.js и не переписывать Astro;
- не изменять пользовательский lesson content;
- не исправлять URL-state, RU/UK, base path, CI/deploy или следующие findings;
- допустим только полностью рабочий Astro baseline либо явно изолированный и
  самостоятельно проверяемый temporary legacy contour.

### PASS evidence и rollback

- один production command и deployment build path;
- ADR и repository map согласованы с фактическими imports/scripts;
- clean restore, check, lint, unit/integration, build, lesson audit и E2E PASS;
- rollback — единый Stage 2 commit без потери пользовательского контента.
