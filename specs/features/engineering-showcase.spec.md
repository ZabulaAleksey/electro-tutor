# Инженерная витрина главной

Утверждено прямым запросом владельца 2026-10-28. Stage: ET-SHOWCASE-001.

- SHOW-001: существующая RU/UK главная заменяет декоративный hero одной SSR React island. Основной экран — SVG схемы/расчёт/график; восемь начальных сюжетов, без новых страниц/backend/dependencies.
- SHOW-002: единый типизированный каталог с постоянными IDs, category/title/assets/model/interaction/verification/existing route и шаблонами circuit, chart, simulation, software, lesson. Featured8; поиск/фильтры всей опубликованной подборки и hash #story=<id>. Сотни будущих сюжетов — backlog, без фиктивных карточек.
- SHOW-003: dynamic DC (последовательные R1/R2), sinusoidal series RLC (RMS и фазовый угол) и RC charging (uC(0)=0) имеют реальные вычисления, два ограниченных параметра, SVG, график и play/pause/reset. KVL/KCL/power/initial/steady проверки. Модельные времена подписаны; DC markers условны, AC замедлен; RC не перезапускается самопроизвольно.
- SHOW-004: balanced star, diode load line (piecewise-linear forward drop0.7V), linear magnetic core+gap (без saturation/fringing), unbalanced open star (существующий calculateStar) и lossless-line resistive-load reflection — статические явно отмеченные расчётные примеры с рассчитанными значениями. Не новые симуляторы.
- SHOW-005: auto7.5s; arrows/thumbnails/swipe; manual interaction pauses autoplay; separate explicit resume. Reduced motion prevents autoplay/physical motion by default and stops it while active; focus/hover/hidden page/offscreen pause. Only active dynamic scene gets one cleaned-up RAF; curves recompute on parameter change, not every frame. Scene parameters/time retained across navigation. No layout jumps/overflow390px; light/dark themes.
- SHOW-006: categories8, compact software demonstrations (own task graphics/code, explicitly not genuine program screenshots), learning steps5, formats5. No invented teachers/reviews/prices/times/payments/availability. CTA only validated owner-supplied HTTPS booking or public contact; otherwise unavailable status, no fake booking button.
- SHOW-007: existing lesson/action links, local guest progress and OIDC/PKCE unchanged. Keep existing primary lesson CTA label as secondary compact link. No accepted test weakening.

Acceptance: physics invariant unit tests for all8; UI unit/build/typecheck/lint; targeted browser carousel/controls/filter/hash/reload/RU-UK/mobile/light-dark/reduced-motion/offscreen and existing learner journey. Initial feature push/publication require ONE grouped owner approval after local PASS (received). Owner subsequently connected Cloudflare Git integration and separately approved main merge, push and temporary branch removal; production main builds dist. Old Pages preserved. Final public Chrome checks repeat real home→parameter/result→story link/reload with no critical errors.

References: OpenStax University Physics2 sections10.5 and15.3; Kirtley Magnetic Circuits; existing star-neutral model/spec/tests. External sources inform equations only; local computations and invariants are evidence.

Текущий release по ответу владельца: все контакты/календарь/оплата пока не подключаются.

## Micro Labs / ET-MICRO-001 — утверждено2026-10-29

- SHOW-008:14 опубликованных Micro Labs на главной: Ohm, voltage/current dividers, max power, RLC resonance, RMS, balanced star, RC charge/discharge, PWL diode, RC low-pass, first-order control, fixed-flux DC drive and matched-source line reflection. Один-два физических параметра, reset, расчёт/единицы/векторная схема/график, без фиктивной интерактивности. Явные допущения; временной ползунок для RC/control/drive синхронизирован с курсором и результатом.
- SHOW-009: data-driven micro catalog с постоянными IDs/category/title/model/parameters/verification/existing route,8групп, filtering/search and #micro=<id> preserving RU/UK. Не загружать будущие105/185карточек; расширять данные существующих моделей. Состояние карточек сохраняется при фильтрации. Сложные редакторы остаются в /interactive/; ссылки только на существующие материалы.
- SHOW-010: строгие нейтральные проводники/УГО; локальные смысловые акценты, легенды + штриховка; графики с корректными единицами/масштабом/нулём/характерными точками. Mobile390,light/dark, keyboard/reduced motion. Нет новых dependencies/services/3D engine. Для плоских моделей2D предпочтительнее3D;0 новых3D сцен в этом MVP.
- SHOW-011: independent numerical/invariant tests and current frontend gates; targeted built browser14cards/controls/reset/categories/time/hash/RU-UK/mobile/no critical errors. Existing accepted tests unchanged. After local PASS ask ONE publication permission; no prior-release approval reuse.

Future-only:105micro topics in source-only src/showcase/micro-backlog.ts (14mapped published IDs,91planned, not loaded in browser) are capability backlog, not published placeholders. Advanced Labs12directions and multi-line editor remain gradual development. Lossless2–3line editor requires typed topology/boundary states/initial conditions/verified owner reference (additional owner prompt not supplied); no fake arbitrary-RLC reflection coefficients. Future3D U(x,t)/I(x,t) shares physical coordinates/time/observations and lazy loading plus2D fallback; not on current critical path.

RLC reference: https://openstax.org/books/university-physics-volume-2/pages/15-5-resonance-in-an-ac-circuit . Motor model is explicitly reduced KVL + Jω̇=ktI−ML with La=b=0; independent ODE/back-EMF/power tests verify the analytic solution.
