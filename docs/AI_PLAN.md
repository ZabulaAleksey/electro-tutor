# Текущий AI-план

## TUTOR-04 — Реальный production-контракт RU/UK

- Stage ID: `TUTOR-04`

Статус: `PLANNED`

Цель: закрыть `T0-LOC-001` — заявленная локализация RU/UK должна быть единым
проверяемым контрактом production Astro artifact, а не набором несвязанных
строк и частичных browser-сценариев.

### Dependencies и входные предпосылки

- `TUTOR-00..TUTOR-03` завершены и validated locally;
- production Astro routes обеих локалей, парный lesson manifest и system locale
  requirements существуют;
- versioned share URL сохраняется при locale switch.

### Runnable vertical slice и scenario

Один locale source of truth питает production routes, UI, metadata, errors и
aria-labels; build-time validator ловит missing/extra keys.

Concrete end-to-end scenario: пользователь открывает одинаковый смысловой route
на RU и UK, переключает язык с сохранением versioned query/hash и получает
локализованные metadata, controls, errors и accessible names без чужого fallback.

### Scope

- locale source of truth, route strategy и fallback;
- canonical/hreflang и форматирование чисел, единиц и дат;
- inventory пользовательских строк, metadata, errors, aria-labels и CircularDiagram;
- предметный glossary/contract для терминов, формул, обозначений и единиц;
- build-time parity validation, fallback tests и RU/UK E2E.

### Non-goals и deferred scope

- новые локали и машинный перевод без предметной проверки;
- base-path portability, CI/deploy gates и security baseline следующих stages;
- новый content model или переписывание Astro routes;
- существующая Astro implementation допустима, если подключена к одному
  проверяемому contract и не зависит от удалённого legacy frontend.

### PASS evidence и rollback

- обе локали присутствуют в production artifact и имеют эквивалентные routes;
- locale switch сохраняет semantic route и canonical interactive state;
- metadata, canonical/hreflang, UI errors и aria-labels локализованы;
- missing/extra/untranslated contract keys блокируются tests/build validation;
- static checks, unit/integration/component, build, lesson audit и live E2E PASS;
- rollback — единый Stage 4 commit без изменения authored lesson formulas.
