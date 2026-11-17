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
- `QG-006`: verify получает только `contents: read` для checkout и `pages: read`
  для `actions/configure-pages`; checkout credentials не сохраняются.
  `pages: write` и `id-token: write` принадлежат только deploy job. Permissions
  задаются по job, без workflow-wide расширения.
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

## 6. Проверяемая замена уязвимой build-зависимости

По прямому запросу владельца разрешена совместимая security-замена picomatch без ожидания официального upstream release. Это расширение не меняет QG-001..007, существующие сценарии, audit threshold или запрет failure suppression.

- QG-008. Замена обязана устранять CVE-2026-112366 в исполняемом parser/matcher. Переименование пакета или версия без реального исправления недостаточны. Изолированные child-process evals воспроизводят исходный ReDoS и подтверждают ограниченное выполнение исправленного matcher, makeRe и compileRe/parse путей.
- QG-009. Сохраняются штатные полный/production pnpm audit и HIGH gate. Не допускаются ignore advisory/CVE, уменьшение scanned graph, подмена audit endpoint, override severity, выключение safeguards или удаление обязательных проверок. Все активные runtime resolution picomatch должны вести на проверенную реализацию; старый уязвимый parser не остаётся достижимым.
- QG-010. Артефакт замены закрепляется exact version и SRI в pnpm lockfile; локальный compatibility patch хранится в Git, применяется штатным pnpm и закрепляется patch hash. До установки проверяются registry origin, tarball integrity, полный список файлов, исходный diff, отсутствие новых runtime dependencies/lifecycle scripts и сохранение лицензии. Provenance и SHA файлов сохраняются в evidence. Дополнительный security regression входит в штатный Vitest, поэтому выполняется при каждом full verify и в CI.
- QG-011. CommonJS/ESM, posix entry, используемые matcher/scan/parse/regex APIs, Windows/POSIX paths и реальные Astro/Vite/anymatch consumers сохраняют совместимость. Редкие небезопасные extglobs могут безопасно сворачиваться или трактоваться буквально с явным описанием ограничения. Перед main обязательны frozen restore, полная регрессия, build, production smoke, независимый review и audit PASS; после push подтверждаются CI и точная hosted ревизия.
- QG-012. Dependency composition root остаётся pnpm-workspace.yaml; application/domain не получает fork-specific imports. В DEPENDENCIES фиксируются причина замены, pin/integrity, границы compatibility, риск нового maintainer и условие возврата на официальный patched release с теми же evals. Rollback возвращает текущий lockfile/overrides из Git; deployment не выполняется для непрошедшего gates rollback.

Приёмка: исходные `+(*a)`/`*(*)` с неблагоприятным хвостом не должны удерживать event loop исправленного matcher; нормальные glob/brace/extglob/ignore/onResult/scan/parse consumers проходят corpus. Полный audit без находок сам по себе не является evidence исправления.
