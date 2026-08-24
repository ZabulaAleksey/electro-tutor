# Текущий AI-план

Инфраструктурный срез: миграция npm → pnpm с clean restore, CI parity и global virtual store compatibility proof. Продуктовые требования и принятые tests не изменяются.

Статус: `DONE`

## ET-04.3 — Service worker update и offline-контракт

Цель: автоматизированно подтвердить, что новая версия service worker получает
контроль над уже открытой страницей, ранее открытый маршрут работает offline, а
неизвестный маршрут показывает предсказуемый offline fallback.

Область файлов:

- `specs/system.spec.md` — уточнённый `FR-008` и `AC-009`;
- `tests/e2e/pwa-lifecycle.spec.ts` — Chromium-контракт жизненного цикла;
- `public/sw.js` и регистрация в `BaseLayout.astro` — только если RED-тест выявит
  нарушение контракта;
- `docs/AI_STATUS.md`, `docs/ROADMAP.md`, при изменении границ — архитектура,
  решения и безопасность.

Критерии приёмки:

- первая загрузка получает активный controller service worker;
- byte-изменение по неизменному `/sw.js` приводит к `controllerchange` в текущей вкладке;
- ранее открытая страница перезагружается без сети;
- неизвестный offline-маршрут показывает `offline.html`;
- 404, `Cache-Control: no-store` и зарезервированный `/api/` не попадают в кэш;
- query-параметры кабинета/интерактива не попадают в navigation cache key;
- активация удаляет старый `potential-pwa-*`, но сохраняет чужой cache namespace;
- тест не игнорирует посторонние runtime/network errors;
- unit/contract, полный Chromium E2E, Astro check, lint, build и HTML audit проходят.

Non-goals: deploy, production-домен, кэширование внешних origin, UI-баннер
обновления и offline-доступ к будущим приватным/auth/payment-данным.

Откат: удалить новый E2E-контракт и вернуть уточнение `FR-008`; production-код
меняется только при воспроизводимом нарушении.

Результат: service worker переведён на `potential-pwa-v2`, безопасно мигрирует
публичный кэш, изолирует чужие namespaces, не кэширует 404/private/no-store/API
и нормализует navigation cache key без query. Контракт подтверждён Playwright.

## Визуальная проверка

В DevTools → Application → Service Workers виден активный `/sw.js`; после
включения Offline ранее открытая страница продолжает отображаться, а новый URL
показывает «Нет подключения / Немає з’єднання».

Следующего неблокированного продуктового этапа нет: `ET-03/05/06/07/08`
ожидают перечисленных в `AI_STATUS.md` решений пользователя.
