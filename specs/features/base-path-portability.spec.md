# SPEC: переносимость base path

Статус: Действует

Версия: 1.1

## Цель

Один и тот же Astro production source должен создавать рабочий artifact для
корневого deployment (`/`) и project-site deployment под непустым base path.

## Конфигурационный контракт

- `SITE_URL` задаёт только публичный `https`/`http` origin без path, query или
  fragment; локальный fallback — `https://electrotutor.example`.
- `BASE_PATH` задаёт URL path deployment. Значение нормализуется к leading и
  trailing slash; пустое значение означает `/`.
- Astro `base` является единственным build-time источником base path;
  application helpers читают сгенерированный `import.meta.env.BASE_URL`.
- `BUILD_OUTPUT_DIR` разрешён только как локальный build/test seam и не влияет
  на публичные URL.

## Routes и assets

- Все internal page/lesson links, redirect, public assets, manifest и service
  worker registration учитывают `BASE_PATH`.
- Canonical и `ru`/`uk`/`x-default` hreflang включают base path ровно один раз.
- Locale switch сохраняет semantic route, versioned query и hash под обоими
  deployment modes.
- PWA manifest использует scope-relative URLs; service worker вычисляет scope
  из собственной registration и не обслуживает пути за пределами base.
- Неизвестный deep link возвращает 404, а offline fallback находится внутри
  текущего service worker scope.

## Acceptance criteria

1. Root и `/electro-tutor/` builds создают эквивалентные 15-page artifacts.
2. Artifact audit разрешает все internal HTML links/assets, manifest targets,
   canonical/hreflang и исключает localhost/machine-local URL.
3. Live browser smoke открывает direct home, nested lesson и interactive route,
   проверяет assets, 404 и locale switch с query/hash под непустым base.
4. Service worker script URL/scope и offline cache paths соответствуют base.
5. GitHub Pages workflow явно передаёт production build значения
   `SITE_URL=https://zabulaaleksey.github.io` и
   `BASE_PATH=/electro-tutor/`; artifact audit подтверждает этот project base и
   не допускает localhost/machine-local URL.

## Non-goals

- управление внешним GitHub Pages deployment, DNS и repository settings;
- полная перестройка CI quality gates следующего этапа;
- изменение locale, lesson content или URL-state schemas.
