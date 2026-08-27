# Текущий AI-план

## TUTOR-03 — Версионированный URL/state круговой диаграммы

- Stage ID: `TUTOR-03`

Статус: `PLANNED`

Цель: закрыть `T0-URL-001` — недоверенный URL не должен обходить инварианты
математической модели, а share/reload/history должны воспроизводить одно и то же
каноническое состояние.

### Dependencies и входные предпосылки

- `TUTOR-00..TUTOR-02` завершены и validated locally;
- текущая математическая модель, `CircularDiagram.tsx` и browser query tests
  доступны как baseline;
- production boundary — Astro, ADR-012.

### Runnable vertical slice и scenario

Одна версия типизированной схемы выполняет pure pipeline
`parse → validate → normalize → canonicalize`. UI, URL и browser history
используют одинаковые domain limits.

Concrete end-to-end scenario: допустимая share-ссылка восстанавливает состояние;
изменение параметров создаёт канонический URL; back/forward и reload сохраняют
согласованность. Невалидные данные и неизвестная версия безопасно переходят к
defaults/сообщению и не попадают напрямую в модель.

### Scope

- schema version, fields, types, ranges, enums, defaults и maximum size;
- unknown version/params, duplicate keys, encoding и canonical ordering;
- единые limits для UI, URL, history и будущего import/saved adapter;
- `replaceState` для частых обновлений, `pushState` для смысловых переходов;
- unit/property/boundary, component и живые Chromium E2E.

### Non-goals и deferred scope

- backend, аккаунты и сохранённые presets;
- RU/UK route parity, base path, canonical/deploy gates и следующие findings;
- визуальный редизайн диаграммы;
- временный adapter допустим только если остаётся полностью рабочим и не
  передаёт сырые `URLSearchParams` в domain model.

### PASS evidence и rollback

- NaN/Infinity, отрицательные/огромные значения, duplicate/unknown keys,
  encoded payload и unknown version безопасны;
- parse/canonicalize детерминированы, canonicalization стабильна и идемпотентна;
- старые допустимые ссылки работают или мигрируют детерминированно;
- static checks, unit/integration/component, build, lesson audit и live E2E PASS;
- rollback — единый Stage 3 commit без изменения lesson content.
