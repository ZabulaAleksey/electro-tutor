# ElectroTutor · опубликованная приёмка Phase 6–8

Ветка работы `fix/lab-production-acceptance-v3`, runtime `main` `ff267aa5033a7ef36a5cdff20b209a26b36ac51c`. GitHub Pages deployment `7953916855`. [Точная выкладка Cloudflare](https://163eb713.electrotutor.pages.dev/) · [Обязательный CI](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44825590875)

Локальный и CI engineering gates PASS. 775 unit / 120 файлов, 418 Chromium PASS / 6 предусмотренных пропусков, 2 production smoke, audit без известных уязвимостей. Отдельная приёмка `playwright.lab-acceptance.config.ts` — 5/5. Backend API и PostgreSQL проверены штатным CI. Установка по frozen lockfile, lint/check и build PASS.

Предварительный локальный прогон на четырёх воркерах дал 417 PASS, шесть предусмотренных пропусков и один таймаут захвата эталонного снимка научной лаборатории. Полный повтор на той же ревизии одним Chromium-воркером прошёл. Принятые проверки и эталон остались прежними.

В первом прогоне на основном домене Cloudflare из 94 сценариев 93 прошли. Браузер завершился при открытии одного контекста. Повтор на той же выкладке с одним воркером охватил все 94 сценария.

Phase 0 закрыла сверку production. В Phase 1 восстановлены исторические обозначения и закреплены размещённые компоненты переходного опыта. Phase 2–5 подтверждены опубликованными браузерными сценариями. Предыдущая опубликованная точка восстановления `b72c537` и точный артефакт `8ed8a84d`. [Phase 1](universal-labs-v3-phase1.md) · [Phase 2–5](universal-labs-v3-phase2-5.md)

Отдельные коммиты изменили границы редактирования схемы, настройки AC и доступ к учебным методам пользовательской сети. Переиспользованы общий CircuitEditor, численные решатели, каталожные контракты, схемы замещения, результаты и слои. `git apply --check --reverse` подтвердил применимость обратного патча к выпускному SHA. Откат доступен через штатный workflow. CHEAP/Medium для UI и интеграции, LOCAL/Low для проверки документации.

## Phase 6 · Документ сети, каталог и настройки точности

Открыть сеть из 65 шин и 193 устройств, добавить B66 и запросить AC. Предел 64/192 отображается в расчёте. Все 193 устройства и связи видны, документ 128/256 открывается, импорт 129 шин отклоняется с сохранением схемы. В готовом кольце открыть «Настройки точности AC». При одной итерации получить диагностику, затем выбрать 60 и допуск 10⁻⁸ MVA. Ввод нуля оставляет рабочий результат.

Действующие Basic/Advanced, ревизии каталога, переопределения и схемы замещения линий и трансформаторов подтверждены отдельно. Для двух цепей ℓ = 40 km, R = 4,6 Ω и X = 8,2 Ω. Для двух трансформаторов P₀ = 40 kW, нагрузочные потери при номинальном токе 160 kW. Максимальная узловая невязка в итоговом опыте ≈ 9,771 × 10⁻⁹ MVA.

[Cloudflare](https://electrotutor.org/ru/interactive/power-system/) · [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/power-system/)

## Phase 7 · Радиальный, кольцевой и общий AC расчёты

Из готового примера с учебным типом линии открыть «Создать свою сеть». Добавить B2 и B3, источник B1, линии B1–B2 и B2–B3, нагрузку B3 8 MW / 2 MVAr. Выбрать радиальный метод, получить U(B3) ≈ 109,975 kV. Добавление B3–B1 вызывает диагностику замкнутого контура в радиальном методе. Выбрать кольцевой метод, отметить условный разрез P на B2, уточнить потери и сравнить с Ybus.

Итоговые невязки баланса меньше 10⁻⁶ MVA. Физическая коммутация, разные точки раздела P/Q, слои и обратная стрелка P на L2 проверены на эталонном кольце. Пользовательский сценарий выполнен мышью и касанием 390 × 844. Контракт трансформатора охватывает двухобмоточную модель.

[Cloudflare](https://electrotutor.org/ru/interactive/power-system/) · [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/power-system/)

## Phase 8 · Итоговая опубликованная приёмка

На каждом хосте 94 принятых браузерных сценария. Дополнительно проверены переходы с главной через каталог и 20 сочетаний лаборатории, локали и размеров экрана на площадку. Повторены Phase 1–3 с продуктивными ассетами. При точном запущенном SHA подтверждены Chromium, RU/UK, keyboard, touch, отсутствие клиентских исключений, корректный base, неизменность TL1 и отсутствие перекрытия панели. CSP пропускает ресурсы приложения и блокирует добавленный Cloudflare внешний скрипт Web Analytics.

Предметные эталоны и ограничения перечислены в предыдущих фазах и SPEC. Замеры времени зависят от устройства и соединения. Плотная сеть использует раскладку рядами. Её проводники могут пересекаться. Электрический граф хранится независимо от пересечений.

[Cloudflare](https://electrotutor.org/ru/interactive/power-system/) · [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/power-system/)

## Публичные лаборатории и артефакты

| Лаборатория | Cloudflare | GitHub Pages | SHA-256 опубликованного модуля на Cloudflare / GitHub Pages |
| --- | --- | --- | --- |
| transmission-line | [cloudflare](https://electrotutor.org/ru/interactive/transmission-line/) | [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line/) | `6e8095e7f793d25de2aa66aa8173f15505ec07df50a4ea485c1a04618bd921f8` / `f502d4c3140fc983328f30a65b2f5c2e8afc439eec9147fe116af91f34831306` |
| transmission-line-steady | [cloudflare](https://electrotutor.org/ru/interactive/transmission-line-steady/) | [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line-steady/) | `3ff76a238d8b2ca12e63ffc93466a064faac5204cd9786c3cb5b5d21eef446f6` / `3dbf98f57d7451f5fa958fe7ce957718f15055c6fc2a6f7ed20b46fb2138eb64` |
| reactive-two-port-graph | [cloudflare](https://electrotutor.org/ru/interactive/reactive-two-port-graph/) | [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/reactive-two-port-graph/) | `9cdb4723eec7184db94dc2be993280c0c3b7a08e28256bd00e02159da9dfffd3` / `39d52e63c5335811444608be51ce39726a7a60b42a72a999e104b6c223b8a0e0` |
| power-system | [cloudflare](https://electrotutor.org/ru/interactive/power-system/) | [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/power-system/) | `31d8eb9c8f7289ce06d7a7258ee44990e0fbf732ee2f09c048c5dd68c2d59567` / `a7a20c6f7af3c13e1dabf2745b10cd6bea4774b2b513d1a4830702558d3db491` |

Мобильная регрессия на предыдущей Cloudflare-сборке `f2f402d`: таблица после расчёта расширяла страницу до 556 px на экране 390 px. Запуск 44819443910 отменён до деплоя на GitHub Pages. Итоговая версия сохраняет ширину документа 390 px и прокрутку внутри таблиц. Для AC, LC-графа и сетей добавлены ссылки из публичного каталога.

## Снимки Chromium

- `phase1-hosted-cloudflare-desktop.png` · `909773bf40fe25a5a58cba0d451935a4745b01c9305d470bea0bca2863ef3fa6`
- `phase1-hosted-cloudflare-mobile.png` · `d81d5d9d9ca19b3fe2964a6a87a6304e38d5e3b10dc563b57b578f5f75c0eedd`
- `phase1-hosted-cloudflare-player.png` · `df714d6bbdda6e0b1835007883d08bf0c0e4e3c120b80fe7625c362186d308ea`
- `grid-cloudflare-large-board.png` · `815fd0b9fab6ac28a524534add2751e63a208ae6643b372d89a4da8d3cfbef47`
- `grid-cloudflare-large-document.png` · `8c8937b7ff012a8597ebd6bfb84281194cfddaa3da5f658b8a4f234828e8f26a`
- `grid-cloudflare-solver-precision.png` · `b550b5740fc51e577a24ab003bb25a479978390e48f1c154ee9ff9f1b08fc67c`
- `grid-cloudflare-custom-ring.png` · `4c515be1fb47285a4b9228f7052887cb44da7200133757ef9a78249817da2e62`
- `grid-cloudflare-custom-ring-mobile.png` · `8f97f2bfcebcd725a6239bb4a8f21d945da5a90e50143496ef44fe0da2f82c5e`
- `phase1-hosted-github-desktop.png` · `909773bf40fe25a5a58cba0d451935a4745b01c9305d470bea0bca2863ef3fa6`
- `phase1-hosted-github-mobile.png` · `d81d5d9d9ca19b3fe2964a6a87a6304e38d5e3b10dc563b57b578f5f75c0eedd`
- `phase1-hosted-github-player.png` · `df714d6bbdda6e0b1835007883d08bf0c0e4e3c120b80fe7625c362186d308ea`
- `grid-github-large-board.png` · `815fd0b9fab6ac28a524534add2751e63a208ae6643b372d89a4da8d3cfbef47`
- `grid-github-large-document.png` · `8c8937b7ff012a8597ebd6bfb84281194cfddaa3da5f658b8a4f234828e8f26a`
- `grid-github-solver-precision.png` · `b550b5740fc51e577a24ab003bb25a479978390e48f1c154ee9ff9f1b08fc67c`
- `grid-github-custom-ring.png` · `4c515be1fb47285a4b9228f7052887cb44da7200133757ef9a78249817da2e62`
- `grid-github-custom-ring-mobile.png` · `8f97f2bfcebcd725a6239bb4a8f21d945da5a90e50143496ef44fe0da2f82c5e`
- `grid-cloudflare-before-limit.png` · до правки · `8d2551d5c8d99955ebce902636ac73378475d7bead879c5549da9e6bb45145d8`
- `grid-cloudflare-before-study.png` · до правки · `ea5152f2490baa806df5128ef168b191e4bd4481567727c070d79b5d8184b21d`
- `grid-cloudflare-before-mobile-overflow.png` · до ограничения ширины результата · `3d6a4faae8273d31914b466b56e00d25678d988a84aa3e3eb3f4b79fe280e644`
