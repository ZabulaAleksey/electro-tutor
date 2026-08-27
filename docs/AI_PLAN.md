# Текущий AI-план

## TUTOR-06 — Обязательные quality gates перед публикацией

- Stage ID: `TUTOR-06`

Статус: `PLANNED`

Цель: закрыть `T0-REL-001` — deploy не должен запускаться и публиковать
артефакт, пока единый воспроизводимый quality pipeline не подтвердил исходный
код и именно этот production artifact.

### Dependencies и входные предпосылки

- `TUTOR-00..TUTOR-05` завершены и validated locally;
- Astro является единственной production boundary;
- root и non-empty-base artifact contracts подтверждены;
- GitHub Pages workflow использует frozen pnpm install и получает `SITE_URL` и
  `BASE_PATH` из `actions/configure-pages`.

### Runnable vertical slice и scenario

Одна локальная команда и эквивалентный CI job выполняют frozen install,
format/diff hygiene, static checks, lint, unit/integration/component tests,
production build, live E2E smoke и доступные dependency/security checks.
Deploy job зависит от успешного verify job и публикует проверенный artifact.

Concrete end-to-end scenario: намеренно сломанный type, unit test или E2E smoke
останавливает workflow до upload/deploy; исправленная версия проходит тот же
pipeline и передаёт единственный проверенный artifact в GitHub Pages deploy.

### Scope

- нормализовать локальную full-verify command и CI parity;
- установить явный порядок gates без retry, скрывающего flaky tests;
- сделать deploy зависимым от обязательного verify и checked artifact;
- сохранить безопасный cache, concurrency cancellation и минимальные permissions;
- документировать одну команду полной локальной проверки.

### Non-goals и deferred scope

- фактический deploy, production-домен, DNS или merge в `main`;
- изменение product behavior, locale/content/URL-state schemas;
- добавление нового security scanner без оценки необходимости и контракта;
- обход красного gate через skip, retry или параллельную пересборку artifact.

### PASS evidence и rollback

- broken type, unit и live E2E fixtures в контролируемой проверке блокируют deploy DAG;
- успешный pipeline публикует ровно artifact, созданный обязательным verify job;
- локальная full-verify command повторяет CI gates в том же существенном порядке;
- workflow permissions, cache и concurrency проверены;
- static, unit/integration/component, build, E2E и configured security checks PASS;
- rollback — единый Stage 6 commit без deploy/production configuration write.
