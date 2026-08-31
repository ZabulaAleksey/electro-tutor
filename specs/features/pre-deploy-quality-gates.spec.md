# Спецификация обязательных pre-deploy quality gates

Статус: Действует

## 1. Назначение

Production deployment Electro Tutor допускается только для artifact, который
создан и проверен единым воспроизводимым pipeline. Локальная full-verify команда
и GitHub Actions выполняют одинаковые существенные gates.

## 2. Требования

- `QG-001`: одна локальная команда выполняет frozen install, Git whitespace
  hygiene, static/type checks, lint, unit/integration/component tests,
  полный live Chromium E2E, production build, production-base E2E smoke и
  dependency audit.
- `QG-002`: полный browser suite проверяет транзитный root-artifact в каноническом
  `dist/` без изменения принятых тестов; root-artifact удаляется после suite,
  production artifact собирается ровно один раз и проходит живой base-path
  smoke, а deploy не выполняет повторную сборку.
- `QG-003`: upload и deploy недоступны при падении любого обязательного gate;
  retry, skip и failure suppression не используются.
- `QG-004`: deploy job зависит от verify job и получает только Pages artifact,
  загруженный verify job после успешных gates.
- `QG-005`: ручной и автоматический production deploy разрешены только для
  `main`; фактический push/merge/deploy требует отдельного разрешения пользователя.
- `QG-006`: verify получает только `contents: read`, checkout credentials не
  сохраняются; `pages: write` и `id-token: write` принадлежат только deploy job.
- `QG-007`: сторонние GitHub Actions закреплены полными commit SHA, install
  использует frozen lockfile, cache является только ускорением, а stale workflow
  runs отменяются через concurrency.

## 3. Критерии приёмки

- `AC-QG-001`: `pnpm verify:full` проходит на поддерживаемой локальной среде.
- `AC-QG-002`: структурный workflow validator принимает production workflow и
  отклоняет варианты без full verification, deploy dependency или immutable SHA.
- `AC-QG-003`: негативные contract tests подтверждают, что удаление static,
  unit/component либо live E2E gate лишает workflow допустимого upload path.
- `AC-QG-004`: workflow перед upload `dist/` выполняет полный root E2E и smoke
  собранного production artifact; deploy job не содержит checkout, install или
  build steps.
- `AC-QG-005`: README документирует одну локальную full-verify команду и явно
  отделяет локальную проверку от разрешения на production deploy.

## 4. Вне области

- фактический push, merge или deploy;
- изменение product behavior, content, locale и URL-state contracts;
- добавление отдельного security scanner или внешнего SaaS.

## 5. Rollback

Откатить единый commit `TUTOR-06`; production configuration и внешний Pages
environment этим этапом не изменяются.
