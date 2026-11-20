# ElectroTutor · Phase 2–5 · браузерная приёмка

Рабочая ветка `fix/lab-production-acceptance-v3`. Исходник обоих опубликованных артефактов `b72c53718e663f731cb908b625e3cb151a31e9e8`. Cloudflare `8ed8a84d`, GitHub Pages deployment `7952134330`.

Штатный CI [44811759154](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44811759154) прошёл. Backend и PostgreSQL, Astro typecheck, lint, 773 unit, 418 Chromium с 6 предусмотренными пропусками, 2 production smoke, audit без известных уязвимостей. На каждом опубликованном адресе отдельно выполнен набор 94/94 браузерных сценариев из репозитория. Для hosted-прогона учтён base path, принятые утверждения сохранены. В срезах 2–5 использован опубликованный runtime без дополнительной правки.

Сборка обеих площадок и откат описаны в [Phase 1](universal-labs-v3-phase1.md). Проверки строятся от публичного UI к Worker или клиентскому решателю. Chromium, RU/UK, мышь, клавиатура и touch. CHEAP/Medium для этих проверок.

## Phase 2 · Топология и пользовательские операции редактора

Из пустого холста последовательно добавить элементы, узлы и соединения для T, П, моста, лестницы и двух параллельных ветвей RLC. Сверить netlist, Undo и Redo. Импортировать 100 резисторов с 99 связями, изменить R100 на 220 Ω, экспортировать и открыть повторно. Проверены также отмена preview, ошибочный импорт, перенос элемента и локализованный touch.

30 принятых сценариев редактора и его интеграции, 7 отдельных пользовательских проверок на каждом хосте.

[cloudflare](https://electrotutor.org/ru/interactive/circuit-editor/) · [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/circuit-editor/)

## Phase 3 · Переходный опыт от стартовой схемы до расчёта

На 1440 × 900 и 390 × 844 замкнуть входной ключ через инспектор, дождаться расчёта, выполнить Пуск → Пауза → Стоп. На конце при t = 6 ms согласованная нагрузка даёт 50 В / 1 А, обрыв 100 В / 0 А, КЗ 0 В / 2 А. Обе эпюры отмечают один x. Некорректная длительность отклоняется с сообщением. Исторические варианты отдельно проверены на динамике RLC, потерях, экспорте, коммутации и Worker.

34 принятых переходных сценария и 2 прямых пользовательских проверки с чистого контекста на каждом хосте.

[cloudflare](https://electrotutor.org/ru/interactive/transmission-line/) · [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line/)

## Phase 4 · Длинная линия в синусоидальном режиме

Перейти из переходной лаборатории, щёлкнуть точку I(x), сверить общий x эпюр и по три вектора на каждом графике. На конце при несогласовании |U| = 200/3 В, при согласовании отражённая волна нулевая. Изменить R1 на 150 Ω, пересчитать и получить |U| = 25 В на входе. Схема без источника отвергнута, прежний результат виден. Unit-эталоны проверяют ABCD, потери, каскады и комплексную нагрузку.

2 принятых браузерных сценария, включая украинский экран 390 px, на каждом хосте.

[cloudflare](https://electrotutor.org/ru/interactive/transmission-line-steady/) · [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line-steady/)

## Phase 5 · Реактивный LC-двухполюсник

На исходном LC-мосте изменить L3, пересчитать и открыть Original, Simplified, Foster I/II и Cauer I/II. В браузере сверены коэффициенты рациональной функции и реактанс в контрольных точках. Разомкнутые внешние выводы дают явную диагностику. Во всех четырёх формах соответствующие unit-эталоны сверяют эквивалентность исходной входной функции.

12 принятых браузерных сценариев на каждом хосте, включая мобильные Foster/Cauer.

[cloudflare](https://electrotutor.org/ru/interactive/reactive-two-port-graph/) · [github](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/reactive-two-port-graph/)

## Снимки Chromium

- `phase2-cloudflare-bridge.png` · SHA-256 `daf06e5817ca5c3fd9139c62520bb5518cba49eee66e71b56d796a9583a65d2b`
- `phase2-cloudflare-ladder.png` · SHA-256 `182804f755124b4b11932e9a3ceb5ebc3bd876901a5d4f8026e5bea38899ab4c`
- `phase2-cloudflare-parallel.png` · SHA-256 `73316eea782b30b1f499e56778234bcc2003537b1d5360f85d599d529af139aa`
- `phase2-cloudflare-pi.png` · SHA-256 `c32891fc873e0c839437d32a376afce0a2dd486b258817337f7d0f4a24502930`
- `phase2-cloudflare-t.png` · SHA-256 `bcf2b1ad4010c1750607f47f6a5fecbf4b95ebece5b073a859ba875ce281a429`
- `phase2-github-bridge.png` · SHA-256 `daf06e5817ca5c3fd9139c62520bb5518cba49eee66e71b56d796a9583a65d2b`
- `phase2-github-ladder.png` · SHA-256 `182804f755124b4b11932e9a3ceb5ebc3bd876901a5d4f8026e5bea38899ab4c`
- `phase2-github-parallel.png` · SHA-256 `73316eea782b30b1f499e56778234bcc2003537b1d5360f85d599d529af139aa`
- `phase2-github-pi.png` · SHA-256 `c32891fc873e0c839437d32a376afce0a2dd486b258817337f7d0f4a24502930`
- `phase2-github-t.png` · SHA-256 `bcf2b1ad4010c1750607f47f6a5fecbf4b95ebece5b073a859ba875ce281a429`
- `phase3-cloudflare-desktop-matched.png` · SHA-256 `580881cc222546697d47935f0719375ad9a4e40d96c487d723770ec2d2397cfb`
- `phase3-cloudflare-mobile-matched.png` · SHA-256 `6f31686b12ec2a5f02a7b69f473170395b7b9644c3472e08d9b69abaaaac4792`
- `phase3-github-desktop-matched.png` · SHA-256 `ecc59b2ab2a6c366ee74c9cb898975381dc154b170bc1b7957b5e73f4418d851`
- `phase3-github-mobile-matched.png` · SHA-256 `31f0714d8644f58bcd8d65d1c920f1650f18e7f97272fac2399c5ef1594170bd`
- `phase4-cloudflare-accepted-editor-graph.png` · SHA-256 `d1c88224484bde2fec8dc6c5cb0014618934191f978a789f639d0634651b545a`
- `phase4-cloudflare-without-horizontal-overflow.png` · SHA-256 `8446f72d75dc1e24ce4dcc8bba81bc843e8aef89f9bc71f30e9b5ed72fd63227`
- `phase4-github-accepted-editor-graph.png` · SHA-256 `0afd8701fc35cf538fc98c4983742b70f03585fef2c3943e4d2c14db91d08996`
- `phase4-github-without-horizontal-overflow.png` · SHA-256 `8446f72d75dc1e24ce4dcc8bba81bc843e8aef89f9bc71f30e9b5ed72fd63227`
- `phase5-cloudflare-auer-ladders-for-one-bridge.png` · SHA-256 `1ec9fa50984b152c0a2c6ca549794f8f29a0d45d7cd5d65e82529c894c2443f7`
- `phase5-cloudflare-Cauer-II-on-a-Ukrainian.png` · SHA-256 `32bf60cd9936482f6e0f6b6606ab8a531ce60bcd0a1c03122e7e1990ef9b1265`
- `phase5-github-auer-ladders-for-one-bridge.png` · SHA-256 `a1d94711b483efd38d31c53d2f51fb4970a9191d73743aa02ecd61d8f73e110d`
- `phase5-github-Cauer-II-on-a-Ukrainian.png` · SHA-256 `32bf60cd9936482f6e0f6b6606ab8a531ce60bcd0a1c03122e7e1990ef9b1265`
