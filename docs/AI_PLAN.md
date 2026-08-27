# Текущий AI-план

## TUTOR-05 — Base-path portability и GitHub Pages project-site

- Stage ID: `TUTOR-05`

Статус: `PLANNED`

Цель: закрыть `T0-PATH-001` — production artifact должен одинаково работать
на корневом домене и под непустым project base path без 404 внутренних
routes/assets и утечек machine-local URL.

### Dependencies и входные предпосылки

- `TUTOR-00..TUTOR-04` завершены и validated locally;
- Astro является единственной production boundary;
- versioned share URL и RU/UK semantic route/SEO contract подтверждены;
- текущие GitHub Pages/Cloudflare configs доступны для read-only reconciliation.

### Runnable vertical slice и scenario

Один base/site URL contract питает build configuration и маленькие route/asset
helpers; production artifact проверяется под root и тестовым непустым base.

Concrete end-to-end scenario: пользователь открывает прямую ссылку на RU/UK
interactive route под project base, получает все assets, переключает локаль с
сохранением versioned query/hash и обновляет страницу без 404.

### Scope

- inventory root-absolute links/assets/canonical/redirects/fetch/router/service worker paths;
- один конфигурационный base/site contract и helpers без ручной конкатенации;
- deep links, locale routes, share URLs и 404 behavior;
- artifact smoke под непустым base и broken internal links/assets audit;
- root-domain compatibility без hardcoded будущего production domain.

### Non-goals и deferred scope

- фактический deploy, production-домен и DNS;
- полная нормализация CI quality gates (`TUTOR-06`);
- изменение locale, content или URL-state schemas;
- существующие hosting adapters допустимы, если оба artifact modes доказаны.

### PASS evidence и rollback

- root и non-empty-base builds открывают home, nested lesson и interactive deep link;
- locale switch/share/reload сохраняют semantic path, query и hash под base;
- internal routes/assets и service worker scope не дают 404;
- artifact не содержит localhost, machine-local или случайный future domain;
- static checks, unit/integration/component, оба builds и live E2E PASS;
- rollback — единый Stage 5 commit без deploy/production configuration write.
