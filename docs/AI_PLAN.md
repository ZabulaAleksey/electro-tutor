# Текущий AI-план

## ET-09.1 — Architecture/reuse audit и platform contract

- Stage ID: `ET-09.1`

Статус: `PLANNED`

Цель: превратить future vision в проверенный target contract до выбора
backend/provider и начала code scaffolding.

### Dependencies и входные предпосылки

- `ET-08` завершён и deployed;
- Electro Tutor и MathMorph доступны для read-only audit;
- draft platform SPEC и current repository evidence доступны.

### Runnable slice и scenario

Repository evidence и user vision проходят audit/reuse classifier; результат —
согласованные SPEC/architecture/ADR/DAG/traceability, после которых context
validator однозначно выбирает `ET-09.2`.

### Scope и PASS evidence

- зафиксировать current/target maps, gap/reuse/conflict audit и first release slice;
- определить domain/data/provider/security/privacy/integration boundaries;
- классифицировать features и подготовить executable contract `ET-09.2`;
- синхронизировать только изменившиеся canonical planning/architecture sources.

### Non-goals и blocker

- product/backend/provider implementation и mutation MathMorph запрещены;
- data model и migration policy допускаются только как docs contract;
- недоступное cross-project evidence маркируется `NOT VERIFIED`, не угадывается.
