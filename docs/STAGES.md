# Этапы Electro Tutor — active local track

- Stage ID: ET-UNIVERSAL-V3-008

## ET-UNIVERSAL-V3-000 — Сверка production и пользовательских требований

- Status: verified
- Goal: установить причину расхождения двух опубликованных артефактов и квалифицировать вход для Phase 1 по Master Prompt V3 от 2026-11-18.
- Scope: production Cloudflare и GitHub Pages, локальная education-сборка, старые Stage 0–32 и действующие SPEC. Отдельная правка по референсу владельца от 2026-11-20 — LINE-UX-038.
- Entry and rollback: чистый `main` `a7a8095ee59692f5eda7a9cf11d8d7f1c63df15b`, рабочая ветка `fix/lab-production-acceptance-v3`. Манифесты и версия runtime совпадают с `f3123c3`. Неизменяемые Cloudflare 9a6a2dfd и 5cd42ef5 доступны. Подтверждённые пути восстановления и точные SHA в evidence.
- Invariants: общий редактор и электрические модели сохраняются. Нужны отдельные доказательства пользовательского поведения на обоих хостах и инженерный релизный gate.
- Evidence: [Phase 0 и матрица 33 обязанностей](evidence/universal-labs-v3-phase0.md). На обоих production aliases Cloudflare устаревший JS переходного опыта, три других маршрута 404. Точная выкладка Cloudflare и GitHub Pages отдают новые маршруты. Плавающий плеер воспроизводится и на новых сборках. Старые stage/release receipts фиксируют исторические проверки.
- LINE-UX-038: в двух лабораториях общий SVG-символ отображается толстым прямым отрезком. 2/2 целевых сценария воспроизвели капсулу до правки. После правки 19/19 Chromium, включая обе ширины и 16 принятых сценариев рукописного редактора. Production build и целевой ESLint PASS. Снимки локального desktop/mobile просмотрены. Deploy и full release gate впереди.
- Blockers: нет для диагностики и локального Phase 1. Provider receipt получен в авторизованном Cloudflare Dashboard.
- User actions: ET-V3-SOURCE-001 | DONE | владелец подтвердил действующие SPEC и матрицу Stage 0–32 как основание сверки. ET-V3-CF-001 | DONE | действующий deployment 32f72925 подтверждён в Dashboard и по HTTP.
- Deferred: Phase 1 → редактор и viewport/плеер, Phase 2 → топология, затем переходный опыт, AC, LC, сети, итоговая приёмка.
- NEXT: ET-UNIVERSAL-V3-001

## ET-UNIVERSAL-V3-001 — Компоновка переходного опыта

- Status: verified
- Goal: первый экран действующего общего редактора, осмысленная стартовая схема, доступный плеер и мобильная компоновка без перекрытия.
- Entry: ET-UNIVERSAL-V3-000 verified, локальный checkpoint `9bb5c1c`, ветка `fix/lab-production-acceptance-v3`.
- Requirements: LINE-UX-034–041, V3 Phase 1 и референс владельца на символ линии. Спецификации и матрица старых Stage 0–32 приняты владельцем как основание сверки.
- Scope: общий CircuitEditor, стартовая схема V2, вписывание геометрии при zoom 1, обозначения до капсулы из d8ca78b, длинная прямая TL1, фиксированные координаты размещённых компонентов переходного опыта, вставка из палитры, транспорт у измерений и переход к нему из первого экрана, RU/UK. Формат архива, электрический граф и решатель прежние.
- E2E: открыть переходный опыт, проверить начальную схему и видимые U(x)/I(x), открыть измерения, выбрать ×1/2, нажать Пуск / Пауза / Стоп и получить 0 ms, проверить пять ширин, восстановление черновика и zoom. Общий символ сверить также на синусоидальном маршруте.
- Evidence: [локальная приёмка и снимки](evidence/universal-labs-v3-phase1.md). 50/50 целевых Chromium, повторная отдельная приёмка 3/3, 773 unit в 119 файлах, аналитический эталон 13 случаев/49 утверждений, education и full build, audit без известных уязвимостей. Отдельный конфиг лабораторий оставил прежние 424 сценария базового discovery. Полный прогон 413 PASS / 6 SKIP / 5 FAIL, повтор пяти с правильным root-артефактом и одним worker 5 PASS, исходный dist восстановлен. Итоговый кандидат 2889637: verify:full PASS, 773 unit, 418 Chromium PASS / 6 SKIP, smoke 2/2, audit без известных уязвимостей, отдельная приёмка 3/3. См. Phase 1 evidence.
- Recovery: вернуть локальный коммит компоновки. Известные точные публичные артефакты и способы проверки сохранены в Phase 0.
- Hosted: source `b72c53718e663f731cb908b625e3cb151a31e9e8`, Cloudflare production `8ed8a84d` и [GitHub Actions](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44811759154) verify/deploy SUCCESS. На [Cloudflare](https://electrotutor.org/ru/interactive/transmission-line/) и [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line/) 5/5 экранов каждым хостом. Работают переход к плееру, Пуск / Пауза / Стоп и ×1/2. TL1 закреплена, символ и эпюры видимы. Точные hashes, действия и снимки в Phase 1 evidence.
- Blockers: none.
- User actions: ET-V3-CF-001 | DONE | Cloudflare сверён. ET-V3-DEPLOY-001 | DONE | владелец дал прямую команду развернуть ElectroTutor, штатная выкладка подтверждена.
- Deferred: фазы 2–8 остаются в scope мастер-промпта.
- NEXT: ET-UNIVERSAL-V3-002

## ET-UNIVERSAL-V3-002 — Топология и пользовательские операции редактора

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-001 verified.
- Requirements: CE-001–022, мастер V3 Phase 2.
- E2E: Из пустого холста последовательно добавить элементы, узлы и соединения для T, П, моста, лестницы и двух параллельных ветвей RLC. Сверить netlist, Undo и Redo. Импортировать 100 резисторов с 99 связями, изменить R100 на 220 Ω, экспортировать и открыть повторно. Проверены также отмена preview, ошибочный импорт, перенос элемента и локализованный touch.
- Evidence: `b72c537`. 30 принятых сценариев редактора и его интеграции, 7 отдельных пользовательских проверок на каждом хосте. [Приёмка Phase 2–5](evidence/universal-labs-v3-phase2-5.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-003

## ET-UNIVERSAL-V3-003 — Переходный опыт от стартовой схемы до расчёта

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-002 verified.
- Requirements: LINE-UX, CIRCUIT-LINE, мастер V3 Phase 3.
- E2E: На 1440 × 900 и 390 × 844 замкнуть входной ключ через инспектор, дождаться расчёта, выполнить Пуск → Пауза → Стоп. На конце при t = 6 ms согласованная нагрузка даёт 50 В / 1 А, обрыв 100 В / 0 А, КЗ 0 В / 2 А. Обе эпюры отмечают один x. Некорректная длительность отклоняется с сообщением. Исторические варианты отдельно проверены на динамике RLC, потерях, экспорте, коммутации и Worker.
- Evidence: `b72c537`. 34 принятых переходных сценария и 2 прямых пользовательских проверки с чистого контекста на каждом хосте. [Приёмка Phase 2–5](evidence/universal-labs-v3-phase2-5.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-004

## ET-UNIVERSAL-V3-004 — Длинная линия в синусоидальном режиме

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-003 verified.
- Requirements: STEADY-LINE, мастер V3 Phase 4.
- E2E: Перейти из переходной лаборатории, щёлкнуть точку I(x), сверить общий x эпюр и по три вектора на каждом графике. На конце при несогласовании |U| = 200/3 В, при согласовании отражённая волна нулевая. Изменить R1 на 150 Ω, пересчитать и получить |U| = 25 В на входе. Схема без источника отвергнута, прежний результат виден. Unit-эталоны проверяют ABCD, потери, каскады и комплексную нагрузку.
- Evidence: `b72c537`. 2 принятых браузерных сценария, включая украинский экран 390 px, на каждом хосте. [Приёмка Phase 2–5](evidence/universal-labs-v3-phase2-5.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-005

## ET-UNIVERSAL-V3-005 — Реактивный LC-двухполюсник

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-004 verified.
- Requirements: LC, мастер V3 Phase 5.
- E2E: На исходном LC-мосте изменить L3, пересчитать и открыть Original, Simplified, Foster I/II и Cauer I/II. В браузере сверены коэффициенты рациональной функции и реактанс в контрольных точках. Разомкнутые внешние выводы дают явную диагностику. Во всех четырёх формах соответствующие unit-эталоны сверяют эквивалентность исходной входной функции.
- Evidence: `b72c537`. 12 принятых браузерных сценариев на каждом хосте, включая мобильные Foster/Cauer. [Приёмка Phase 2–5](evidence/universal-labs-v3-phase2-5.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-006

## ET-UNIVERSAL-V3-006 — Документ сети, каталог и настройки точности

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-005 verified.
- Requirements: POWER-004–015, POWER-036/037.
- E2E: Открыть сеть из 65 шин и 193 устройств, добавить B66 и запросить AC. Предел 64/192 отображается в расчёте. Все 193 устройства и связи видны, документ 128/256 открывается, импорт 129 шин отклоняется с сохранением схемы. В готовом кольце открыть «Настройки точности AC». При одной итерации получить диагностику, затем выбрать 60 и допуск 10⁻⁸ MVA. Ввод нуля оставляет рабочий результат.
- Evidence: `ff267aa`. Действующие Basic/Advanced, ревизии каталога, переопределения и схемы замещения линий и трансформаторов подтверждены отдельно. Для двух цепей ℓ = 40 km, R = 4,6 Ω и X = 8,2 Ω. Для двух трансформаторов P₀ = 40 kW, нагрузочные потери при номинальном токе 160 kW. Максимальная узловая невязка в итоговом опыте ≈ 9,771 × 10⁻⁹ MVA. [Отчёт Phase 6–8](evidence/universal-labs-v3-phase6-8.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-007

## ET-UNIVERSAL-V3-007 — Радиальный, кольцевой и общий AC расчёты

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-006 verified.
- Requirements: POWER-016–031, POWER-038.
- E2E: Из готового примера с учебным типом линии открыть «Создать свою сеть». Добавить B2 и B3, источник B1, линии B1–B2 и B2–B3, нагрузку B3 8 MW / 2 MVAr. Выбрать радиальный метод, получить U(B3) ≈ 109,975 kV. Добавление B3–B1 вызывает диагностику замкнутого контура в радиальном методе. Выбрать кольцевой метод, отметить условный разрез P на B2, уточнить потери и сравнить с Ybus.
- Evidence: `ff267aa`. Итоговые невязки баланса меньше 10⁻⁶ MVA. Физическая коммутация, разные точки раздела P/Q, слои и обратная стрелка P на L2 проверены на эталонном кольце. Пользовательский сценарий выполнен мышью и касанием 390 × 844. Контракт трансформатора охватывает двухобмоточную модель. [Отчёт Phase 6–8](evidence/universal-labs-v3-phase6-8.md).
- Blockers: none
- User actions: none
- NEXT: ET-UNIVERSAL-V3-008

## ET-UNIVERSAL-V3-008 — Итоговая опубликованная приёмка

- Status: verified
- Dependencies: ET-UNIVERSAL-V3-007 verified.
- Requirements: POWER-032–035, V3 §§ 8–13.
- E2E: На каждом хосте 94 принятых браузерных сценария. Дополнительно проверены переходы с главной через каталог и 20 сочетаний лаборатории, локали и размеров экрана на площадку. Повторены Phase 1–3 с продуктивными ассетами. При точном запущенном SHA подтверждены Chromium, RU/UK, keyboard, touch, отсутствие клиентских исключений, корректный base, неизменность TL1 и отсутствие перекрытия панели. CSP пропускает ресурсы приложения и блокирует добавленный Cloudflare внешний скрипт Web Analytics.
- Evidence: `ff267aa`. Предметные эталоны и ограничения перечислены в предыдущих фазах и SPEC. Замеры времени зависят от устройства и соединения. Плотная сеть использует раскладку рядами. Её проводники могут пересекаться. Электрический граф хранится независимо от пересечений. [Отчёт Phase 6–8](evidence/universal-labs-v3-phase6-8.md).
- Blockers: none
- User actions: none
- NEXT: complete
- Stop condition: Phase 0–8 проверены, точная сборка работает на обоих публичных хостах, обязательных действий нет.

## ET-CE-PARALLEL-001 — Универсальное параллельное подключение

- Status: completed
- Goal: один выбор двухполюсного участка для элемента, соседней группы и всей ветви; preview, атомарная установка и обратимое математическое представление.
- Scope: topology-derived regions, placement/routing, CircuitEditor, RU/UK copy, explicit equivalent view; документ v2 сохраняется.
- Requirements: CE-016..022 в circuit-engine.spec.md по прямому запросу владельца.
- Dependencies: ET-UNIVERSAL-002/003/006/031 verified; завершённый граф/редактор/редукция доступны. ET-DEP-20261117 delivery не является prerequisite локальной реализации; dependency security gate закрыт ET-DEP-20261117; production release подтверждён.
- Entry: исходная явная топология и стабильные endpoint ID; React CircuitEditor, orthogonal router и reduceRlc.
- Architecture: выбор ephemeral по boundary endpoint IDs, derived grouping не заменяет topology. Ограниченные graph components вместо перечисления путей. Планирование возвращает полный Drawing/Routing либо диагностику. commit/record — единственная атомарная граница Undo.
- Plan: core region/geometry и узкие evals → общий UI выбора/preview/drag/touch/keyboard → явный equivalent view/model constraints → браузерная регрессия → reviewer → документация/commit.
- Ownership: root — финальные regions/attachment, CircuitEditor/copy/CSS/E2E/docs; stage1_review — equivalent view и tests; touch_fix — исходный core; parallel_review — read-only review. Контракты APIs согласованы до кода.
- Evals: четыре Series(R,L,C) примера пользователя, taps/ambiguity/reversed/same-net/disconnected/stale/cancel, geometry/routes/board bounds; редукция L/C и состояния; desktop drag + boundaries + Undo/Redo/JSON + UK touch/keyboard; типы/lint/unit/build/full existing Chromium.
- Concrete E2E: импорт Series(R,L,C), drag X на R и preview; единым выбором граничных узлов R–L и всей ветви подключить X, подтвердить netlist, отменить/повторить, JSON round-trip; открыть equivalent view и продолжить редактирование исходных элементов на RU desktop и UK phone.
- Recovery: один Undo либо исходный JSON; feature commit обратим, старые тесты и форматы не меняются.
- Deferred: взаимно связанные катушки и новые решатели; нелинейная/частотно зависимая редукция; существующие предметные solver limits сохраняются.
- Blockers: none
- User actions: none
- Evidence: current runtime f3123c3 —773 Vitest/119 файлов,418 Chromium PASS/6 прежних SKIP,production smoke2,audit0; exact CI44210175433 attempt2 verify/deploy SUCCESS. Cloudflare exact/primary по13 hosted PASS, GitHub Pages3 hosted PASS. Source, receipts и ограничения — evidence/picomatch-remediation.json / evidence/circuit-parallel.json.
- Historical evidence (e8e3ba1): локальная функциональная квалификация PASS для e8e3ba1: frozen restore, CI contract, Astro check (0 errors/warnings, 3 прежние hints), ESLint, 761 Vitest / 116 файлов, 415 Chromium / 6 прежних SKIP, production build и 2 production smoke. Полный pnpm verify:full завершился FAIL только на обязательном HIGH audit picomatch; исправленной версии нет. Полный и production pnpm audit дают одну HIGH-находку picomatch; Python runtime pip-audit повторно PASS. Новые 9 сценариев конструктора PASS локально и на preview. PNG desktop/phone сверены, SHA в docs/evidence/circuit-parallel.json.
- Verification recovery ET-QG-FONT-001: прежний полный прогон дал 413 Chromium PASS / 6 SKIP / 1 beam Ctrl-wheel FAIL; отдельно 4/5 PASS. Контролируемая поздняя загрузка web-fonts воспроизводит +3 px сдвига из-за normal line-height. Явные line boxes только над SVG устранили сдвиг. Новый font regression и все 13 прежних beam сценариев PASS (14), Ctrl-wheel дополнительно 5/5 PASS. Zoom, solver, допуски и goldens не менялись. Окончательный полный прогон прошёл все 415 Chromium, включая этот regression; прежний отказ устранён.
- Completion sync: обновлены README, SPEC, ARCHITECTURE, DESIGN, ROADMAP, TRACEABILITY, requirement ledger, TESTING, DEPENDENCIES, LEARNING_LOG и STAGES. Проверены без изменений DECISIONS, SECURITY, API, DATA_MODEL, project-context и pre-deploy SPEC; новые API/БД/dependency/solver контракты не вводятся.
- Hosted feature: [Cloudflare preview](https://a5758efe.electrotutor.pages.dev/ru/interactive/circuit-editor/), deployment a5758efe-74de-4368-abb9-fca26fd03381 для e8e3ba1 — build success, HTTP 200, 10 Chromium PASS (9 feature + прежний Ctrl-wheel). Root-only delayed-font probe не применим к education-сборке: BaseLayout отключает внешние web-fonts, fonts.status уже loaded; его исходный отказ сохранён, тест не менялся. Исторический preview e8e3ba1; на тот момент main/production ещё не обновлялись. Текущий release указан ниже.
- NEXT: complete
- Next action: feature выпущена вместе с закрытым ET-DEP-20261117; новая задача требует отдельного запроса.
- Stop condition: реализация, локальный full, CI, main и оба production hosts проверены.



- Remediation qualification: full/audit/review PASS, main f3123c3b7eaa5878ab0cc3783829314f875f505a, CI44210175433 verify/deploy SUCCESS, Cloudflare 9a6a2dfd и GitHub Pages hosted PASS. Исторические FAIL/preview выше относятся к явно указанным прежним ревизиям; текущий production receipt — evidence/picomatch-remediation.json.

- Released feature: source f3123c3b7eaa5878ab0cc3783829314f875f505a, Cloudflare exact/primary по9 feature cases + unchanged beam PASS; GitHub Pages base-aware lab/history smoke PASS. Code feature01d0ea8 и font recoverye8e3ba1 остаются в истории.

## ET-DEP-20261117 — Security dependency maintenance

- Status: completed
- Goal: устранить HIGH picomatch без ожидания upstream и без ослабления gates; получить полный PASS, merge/main push и production deploy.
- Scope: exact alias всех9 активных consumers, security-only parser, штатный compatibility patch, обязательный regression; адресные FR-384 navigation и CE-017..019 drop repairs для полного gate; интеграция текущей ветки.
- Requirements: QG-001..013; существующие FR-384 и CE-017..019. Previous master ET-UNIVERSAL-MASTER-V2 completed; Circuit Engine prerequisite verified.
- Entry: GitHub main ae22dcd, continuation feature/universal-parallel-attachment; исходный HIGH GHSA-fc5q-39xc-vjpf; официальный patched release отсутствует.
- Architecture: pnpm composition root → exact @ryotsu/picomatch4.0.7-a + SRI + tracked zero-context compatibility patch; эффективный diff к official4.0.7 —81 security additions. App imports не зависят от fork name.
- Security evidence: 10 source/tarball files проверены; MIT сохранена, новых runtime deps/install hooks нет. Parser SHA2d26af…; patch SHA8657c5…; все9 actual consumers используют reviewed source и не отключают safeguard. RED исходного ReDoS; mandatory4 regression +42 positive/boundary assertions PASS. Независимый security/compatibility/packaging review PASS.
- Verification recovery: TypeScript narrowing нового test исправлен; реальный late-hydration URL/storage race закрыт immutable owner path + новым causal RED/GREEN test. Staging обнаружил context-only patch whitespace; штатный pnpm diff.context=0 сохранил все10 installed files byte-identical. Gates, attributes, принятые tests/goldens не ослаблялись. Failed receipts сохранены.
- Evals: локальный pnpm verify:full со staged zero-context patch и real WebSocket PASS (exact sourcef3123c3, включая cold-discovery и native/SVG-root drag regression; тот же source whole pipeline в CI): frozen restore, hygiene/CI contract, Astro check0 errors/0 warnings/3 прежние hints, ESLint,773 Vitest/119 файлов,13 независимых аналитических cases/49 assertions,418 Chromium PASS/6 прежних conditional SKIP, production build,2 production smoke и HIGH audit0. Отдельный full/production audit0.
- Integration: обычный fast-forward в main и push f3123c3b7eaa5878ab0cc3783829314f875f505a; source включает nav7c74e6d, security94493cb и ранее проверенный parallel/editor/font slice. origin/main SHA подтверждён.
- CI transport recovery: initial44177003756/source94493cb failed4 Download.path cases; accepted files/assertions/goldens остались byte-identical. QG-013 partition+ambient endpoint transfer сохраняет все cases; до двух новых drag regressions422 root logical cases/33 MVP;actual mixed9 и whole-full real-WebSocket PASS.
- Clean-checkout recovery: CI44188507681/source5ecbbec выявил зависимость нового discovery unit от dist; owned empty BUILD_OUTPUT_DIR изолирован только внутри --list child. Assertions и реальные E2E не изменены; cold probe3, whole unit772, static/lint/frozen/audit0 PASS.
- Drag recovery: CI44191637707/source224f6ff —772unit/415ChromiumPASS,6skip/1palette-previewFAIL; Pages skipped. Current-board coordinate hit вместо stale SVG target: causal RED/GREEN, native drag и прежний palette5/5/empty-drop PASS; independent review PASS. Принятые tests/goldens сохранены.
- Case-scope recovery: CI44199486789/source423f3af повторил один host-native palette FAIL при417PASS/6skip. File-wide adapter был избыточен: только4 exact filesystem cases остаются local,3 non-file возвращены canonical pinned image. Full logical-set guards424/426/33, exact4allowlist и0omission/duplicates подтверждены, mixed11PASS (7remote/4local); accepted tests/assertions/goldens/retries/workflow неизменны. Host-native gesture bug не объявляется исправленным.
- Infrastructure recovery: CI44210175433 attempt1 остановился до frontend на5min APT download timeout; backend PASS. Один bounded retry неизменного source/workflow, без retries функциональных tests или изменения gates; failed receipt сохранён.
- CI: [44210175433](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44210175433) для точного runtime SHA — verify/deploy SUCCESS, backend API/PostgreSQL и полный frontend pipeline PASS.
- Production: Cloudflare 9a6a2dfd-afcc-4137-b4e1-49a0225e42a7 для того же source; [точная выкладка](https://9a6a2dfd.electrotutor.pages.dev) и [primary](https://electrotutor.org/) — по3 lab/history smoke и10 feature/beam PASS;6 JS/CSS assets побайтно совпадают. [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/) — deploy SUCCESS,3 hosted smoke PASS с /electro-tutor/ base.
- Evidence: [полный receipt](evidence/picomatch-remediation.json), [feature receipt](evidence/circuit-parallel.json). Local full и CI/source/deployment различаются явно.
- Cleanup: feature/universal-parallel-attachment, fix/dependency-vulnerabilities, fix/ci-local-download-transport, fix/discovery-clean-checkout, fix/parallel-drag-preview и fix/download-case-partition удалены локально; первые две также на origin после clean/reachability/main-SHA/worktree preflight; unique/dirty/unknown work не удалялся. Docs-only receipt подготовлен в отдельной временной ветке; runtime и его конфигурация не пересобираются и не меняются.
- Recovery: текущие source/manifests/patch/lock сохраняются в Git, прежняя production source eff12b6 и deployment5cd42ef5 доступны. Откат не публикуется при непрошедших исходных gates.
- Limits: provenance воспроизводима, криптографическая attestation/личность нового maintainer независимо не аутентифицирована. Небезопасные сложные extglobs literalized, captures могут отличаться. Возврат к официальному patched release требует тех же evals; автоматического обновления нет.
- Deferred host qualification: ET-CI-HOST-PALETTE-001 — deferred, non-blocking for canonical configured release. Условие: отдельное требование поддержать standalone Ubuntu host-native gesture profile. Действие: воспроизвести palette drag с event/geometry receipt в этой среде; ожидаемое evidence — native drop coordinates/target и causal RED/GREEN + unchanged accepted case. Это разблокирует только будущую host-native qualification; никаких пользовательских действий для текущего release нет.
- Deferred: никакого нового product/backend/provider scope; прежние отдельные secret-bearing phases не переопределяются.
- User actions: none
- Blockers: none
- Completion sync: обновлены README, STAGES, ROADMAP, ARCHITECTURE, DECISIONS, LEARNING_LOG, TESTING, SECURITY, DEPENDENCIES, TRACEABILITY, requirement ledger, pre-deploy SPEC и evidence. Проверены без изменений DESIGN, API, DATA_MODEL, project-context, circuit-engine и unified-navigation SPEC; их контракты сохраняются.
- NEXT: complete
- Next action: новая работа только по отдельному явному запросу; старый master/внешние очереди не возобновляются.
- Stop condition: поставленная security/integration/deployment задача выполнена, обязательных незавершённых хвостов нет.

## ET-UNIVERSAL-000 — Stage 0. Baseline snapshot

- Status: completed
- Goal: воспроизводимая исходная точка для универсальных электрических лабораторий и сетей. Вход: чистый GitHub main 53793834d6e803b594bc210edcd339413aaa8e83 после интеграции 14 веток и публикации.
- Launcher: ElectroTutor Master Prompt v2, редакция Google Drive от 2026-11-16, § 24, 28. Scope: baseline. Контракты: CE-001..008, LC-001..004, SPEC переходных процессов и pre-deploy quality gates.
- Baseline: CircuitEditor хранит явные узлы, стабильные выводы и связность отдельно от координат. В браузере проверены RLC с четырьмя проводниками, RU/UK, готовность переходного расчёта линии и LC-двухполюсник с отдельным деревом соединений. Изменение C с 50 до 200 µF переносит нуль реактивности с 1000 до 500 rad/s. Синусоидальная длинная линия и расчёт сетей не найдены среди действующих маршрутов и солверов. Синтез Фостера/Кауэра выходит за текущий LC-контракт.
- Reproduce: pnpm verify:full, pnpm backend:check, pnpm build и pnpm test:e2e:production-smoke. Для измерения трассировки: CIRCUIT_BENCHMARK=1 и pnpm exec vitest run src/circuit/routing-corpus.test.ts --disableConsoleIntercept --silent=false.
- Windows: frozen restore, context, lint, Astro check (422 файла, 3 подсказки), 590 Vitest (82 файла), 13 независимых аналитических задач и 49 утверждений, root build 103 страницы, education build 98 страниц и production smoke 2/2. Параллельный Playwright: 360 PASS, 6 SKIP, 6 таймаутов. Эти шесть сценариев прошли последовательно на свежем root-артефакте с одним воркером. Аудит Node: 5 LOW, 7 MODERATE, HIGH gate PASS. Backend: 208 быстрых, 81 интеграционный и 9 проверок каталога PostgreSQL PASS, 2 интеграционных SKIP, API live/ready 200, Python runtime audit без находок.
- GitHub Pages: [run 44038295894](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44038295894) verify и deploy PASS для 5379383. PostgreSQL и Python runtime audit PASS. 590 Vitest, 366 Chromium PASS, 6 SKIP, production smoke 2/2. Deployment 7847187452. Hosted Chromium подтвердил RU/UK, редактор RLC, расчёт линии и LC-резонанс под /electro-tutor/.
- Cloudflare Pages: production 22cc6eb6-0e39-4fe1-a376-baee1854ba52, источник 5379383. Chromium 151 на [публичном домене](https://electrotutor.org/) и [точной выкладке](https://22cc6eb6.electrotutor.pages.dev/): RLC, готовый расчёт длинной линии и изменение резонанса LC PASS. Домен добавляет Cloudflare Insights. Страницы Pages alias совпадают с точной выкладкой на сверенных маршрутах.
- Performance and visual evidence: [измерения и SHA-256 PNG](evidence/universal-labs-stage-0.json), 17 схем, 0,17–35,85 мс, медиана 0,46 мс на этом Windows-хосте. Шесть PNG на ширинах 1280 и 390 px. На трёх поверхностях горизонтальный overflow равен 0. Кадры длинной линии фиксируют частичное перекрытие органов управления закреплённой панелью воспроизведения и большую вертикальную дистанцию между схемой и эпюрами.
- NEXT: complete
- Next action: Stage 1 brief готов. Запуск ограничен Stage 0 по § 28.

### Stage 1 brief — Inventory editor architecture

- Рекомендуемая модель: CHEAP / Medium. Нужны прослеживание TypeScript/React точек входа, состояния, Worker и форматов документов и план переноса.
- Цель: составить карту CircuitEditor → topology/drawing/document → адаптеры → Worker/solver → results. Сопоставить её с отдельным LC-деревом, перечислить допущения адаптера длинной линии и определить минимальный путь переиспользования редактора для остальных режимов.
- Риски: произвольный граф шире области расчёта существующих солверов. При переносе нужно сохранить стабильные ID, события, измерения и действующие форматы line-v2..v5 и LC JSON.
- Обязательные evals: проследить размещение RLC до netlist и JSON, архив линии до адаптера, Worker и показаний, изменение LC до Z(s) и частоты резонанса. Приложить входы, выходы, границы валидации и результаты существующих сценариев. Для PASS карта и план должны показать доказанные возможности, пробелы и первую обратимо проверяемую интеграцию без потери поддерживаемых документов.

## ET-UNIVERSAL-001 — Stage 1. Inventory editor architecture

- Status: verified
- Entry: ET-UNIVERSAL-000 completed на 1273ea3, базовая runtime-ревизия 5379383. Мастер-промпт v2 § 24, Stage 1. Рабочий маршрут: существующие локальные сборка и Chromium. Класс задачи CHEAP / Medium.
- Scope: архитектурная карта CircuitEditor, длинной линии и LC-дерева, границы импорта и расчёта, минимальный план переиспользования. Контракты CE-001…008, LC-001…004 и действующая SPEC переходной линии. Реализация и изменение контрактов относятся к последующим этапам.
- Result: [карта потоков, ограничения и план](ARCHITECTURE.md#инвентаризация-stage-1--универсальные-лаборатории). Первый обратимый кандидат — отдельная проекция LC-дерева с двумя явными внешними выводами и сохранением пути/ID, прежнего JSON и Z(s).
- Evals: RLC → netlist → JSON round-trip и атомарный отказ. Архив линии v2–v5 → редактирование секции → Worker → показания → reload и прежняя физическая модель при экспорте. Изменение LC → Z(s) → частота резонанса, обмен JSON и отказ от неверного импорта. Подробности в TESTING.
- Evidence: архитектурная карта и план, 23/23 целевых Chromium. Рукописный ввод: 3/3 RED, 24/24 GREEN. PASS на Windows с CI=true. Frozen install, типы, ESLint, 590 Vitest, 13 независимых аналитических задач (49 утверждений), 367 root Chromium / 6 SKIP, учебная сборка, 2 production smoke и HIGH audit. [Диагностика и результаты](TESTING.md#et-universal-touch-gate--стабильные-координаты-рукописного-штриха).
- Blockers: none. ET-UNIVERSAL-TOUCH-GATE закрыт после фиксации координатной системы на время штриха.
- Completion sync: обновлены STAGES, TESTING. Проверены README, ROADMAP, ARCHITECTURE, DECISIONS, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES, TRACEABILITY, project-context и действующие SPEC. Исправление и регрессия сохраняют LINE-UX-030/032.
- User actions: none
- NEXT: ET-UNIVERSAL-002
- Next action: Stage 2. Уточнить контракт topology/geometry. Критерий: идентичность связности и ID после round-trip существующих схем. Рекомендуемый режим FRONTIER / High.

## ET-UNIVERSAL-002 — Stage 2. Topology contract

- Status: verified
- Entry: ET-UNIVERSAL-001 verified и запушен в docs/universal-labs-stage-0 на 11fab02. Утверждённые требования CE-001, CE-003, CE-006, CE-007 и действующий ADR об ID выводов.
- Scope: канонические компоненты, выводы, junctions, провода, производные сети и граница геометрии. Уточнение SPEC и сквозные проверки действующих кодеков. Пользовательский интерфейс, форматы на диске и решатели сохраняют действующие контракты.
- Runnable slice: пользователь открывает существующую схему, меняет её геометрию, экспортирует и открывает JSON. Соединения, ID, параметры и одиночные выводы остаются теми же. Архивы v2–v5 проходят через прежний архивный адаптер. Неподдерживаемый файл отклоняется до замены схемы.
- Acceptance: сравнить полную топологию и netlist после каждого round-trip, проверить входы v1/v2 и перенос архивов линии, выполнить действующие Chromium-сценарии редактора и линии.
- Evidence: контракт уточнён в circuit-engine.spec.md. Локально PASS: 594 Vitest (83 файла), 13 аналитических задач / 49 утверждений, 21 Chromium редактора и архивов, Astro check и ESLint. Четыре дополнительных evals проверяют импорт v1/v2, экспорт v2, сохранение ID и netlist, одиночные концы и ретрассировку при перемещении. Chromium использовал проверенный артефакт Stage 1 с той же runtime-ревизией.
- Completion sync: обновлены SPEC, STAGES, ROADMAP, TESTING и TRACEABILITY. Сверены README, ARCHITECTURE, ADR-060, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context. Изменения подключения и рекурсивные ветви относятся к Stage 3.
- User actions: none
- Published: Stage 2 checkpoint 636154396b243b312ac49c581c0bfdd595430314 подтверждён на GitHub.
- NEXT: ET-UNIVERSAL-003

## ET-UNIVERSAL-003 — Stage 3. Recursive branching

- Status: verified
- Entry: опубликованный Stage 2 `6361543` и верифицированный контракт CE-001, CE-003, CE-005, CE-006. Master Prompt v2, § 4 и § 24.
- Goal: последовательные вставки и дополнительные ветви используют явные узлы и выводы. Схема со 100 элементами остаётся редактируемой и проходит экспорт/импорт с тем же netlist.
- Eval-first: T, П, лестница, две параллельные RLC-ветви, мост, соединённая схема на 100 компонентов. Проверить реальный жест в CircuitEditor, round-trip JSON и откат одной операцией. Отдельные правила решателей вступают в силу в своих адаптерах.
- User actions: none
- Evidence: пять топологических evals, 23 целевых Chromium и полный verify:full PASS. 599 Vitest, 369 root Chromium, 6 SKIP, 2 production smoke. GitHub SHA 74965923d8a23032f12ac0fed807b5e61446bdaf. Preview 3a1265e7-66fc-497d-82ae-f0dec17d4cf9 прошёл браузерный smoke: ветви, шунт, Undo и импорт 100 компонентов. [Точный preview](https://3a1265e7.electrotutor.pages.dev/).
- NEXT: ET-UNIVERSAL-004
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, ROADMAP, TESTING, TRACEABILITY, SPEC и coverage ledger. Проверены README, SECURITY, DECISIONS, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-004 — Stage 4. Shared mode adapter

- Status: verified
- Entry: Stage 3 verified и опубликован. CE-001, CE-006 и CE-007 действуют.
- Goal: общий редактор получает описание возможностей режима. Режим определяет разрешённые элементы, валидацию, исходный шаблон и преобразование в предметную модель.
- Evals: свободный редактор и переходная лаборатория используют единый контракт и запускаются со своими исходными схемами. Действующий архивный маршрут сохраняет совместимость. Неподдерживаемое соединение остаётся редактируемым черновиком и получает диагностику при попытке расчёта.
- User actions: none
- Evidence: 2/2 targeted mode tests и браузерный smoke обоих режимов PASS. Windows verify:full PASS, 601 Vitest, 369 Chromium, 6 SKIP, 2 production smoke. SHA 1c68dee5de43a026ac3b508b1eb867007ad4809c подтверждён. [Preview e5cabdf8](https://e5cabdf8.electrotutor.pages.dev/) прошёл smoke обоих режимов.
- NEXT: ET-UNIVERSAL-005
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, SPEC и coverage ledger. Проверены README, ROADMAP, SECURITY, DECISIONS, DESIGN, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-005 — Stage 5. Transient default template and switching

- Status: verified
- Entry: Stage 4 verified на 1c68dee, существующий transient mode owner и архивы v2–v5.
- Goal: новый опыт открывается со схемой источник ЭДС → замыкающий ключ → одна линия → нагрузка. Конец линии имеет явные варианты нагрузки, КЗ и обрыва.
- Evals: проверить состояние до и после замыкания/размыкания в действующем Worker, три окончания, открытие прежнего архива и отсутствие щупа как компонента схемы.
- User actions: none
- Evidence: Windows `pnpm verify:full` PASS, 608 Vitest, 372 Chromium, 6 SKIP, 2 production smoke, HIGH audit PASS. Подтверждён push f43490cdbd5f1d149e8afb00893d3c87ec92585e. [Cloudflare preview 05d63612](https://05d63612.electrotutor.pages.dev/) 7/7 PASS: переключение, замена ключа, составная нагрузка, три окончания и импорт архивов v2–v5.
- NEXT: ET-UNIVERSAL-006
- Completion sync: обновлены STAGES, ROADMAP, ARCHITECTURE, TESTING, TRACEABILITY, SPEC и coverage ledger. Проверены README, DECISIONS, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-006 — Stage 6. RLC reduction engine

- Status: verified
- Entry: Stage 5 verified на f43490c. Входы: явный CircuitTopology, канонический netlist и физический контракт CE-013–015.
- Goal: из неизменяемой схемы получить меньший расчётный граф эквивалентов R, L и C с соответствием исходным ID и направлениям.
- Evals: потребитель строит реальный CircuitTopology, получает уменьшенный граф и проверяет эквивалент по независимым импедансам или через существующий решатель. Все шесть однородных соединений, полярность начальных состояний, запрещённый свёрткой внешний отвод, сохранность оригинала и явная диагностика.
- Scope: редукция и вычислительная приёмка. Подключение сокращённого графа к переходной лаборатории проходит в Stage 7.
- User actions: none
- Evidence: eval-first зафиксировал отсутствие редуктора. Затем 22 целевых и 630 полных Vitest PASS, 13 независимых инженерных задач и 49 утверждений PASS. Astro check, ESLint, production build и аудиты артефакта PASS. Реальный адаптер передал прежнюю цепочку и эквивалент решателю, совпали отсчёты напряжения и тока нагрузки. GitHub подтвердил 2542bba40213fb9f9b487223056f5e1a39f042b8.
- NEXT: ET-UNIVERSAL-007
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, Circuit Engine SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-007 — Stage 7. Transient solver integration

- Status: verified
- Entry: Stage 6 verified на 2542bba. Доступны явные электрические сети, сокращённая топология, связи эквивалентов и штатный Worker.
- Goal: свободный граф переходной линии преобразуется и редуцируется до вызова реального Worker. Показания возвращаются на исходные компоненты.
- Evals: новый граф с составной нагрузкой и входным ключом рассчитывается из редактора. Численный результат и исходные ID сохраняются при восстановлении. Неподдерживаемая топология и несовместимые начальные состояния явно диагностируются. Прежние эксперименты и архивы v2–v5 заново проверяются.
- User actions: none
- Evidence: 638 Vitest PASS, Astro check, lint, root и production build PASS, 2 production smoke PASS. Chromium 84/84 до финальной полярности. На 4e88a5d 83/84, один старый сценарий вставки диода в свободном редакторе дал сбой координатного клика. Повтор того же сценария на том же артефакте прошёл 5/5. Реальный Worker подтвердил 50 Ω и исходные показания 20 В / 1 А и −30 В / −1 А. [Cloudflare preview 24e17028](https://24e17028.electrotutor.pages.dev/) 8/8 PASS, GitHub SHA 4e88a5d0a350e8bebd3e39c73b9833b2449a437d.
- NEXT: ET-UNIVERSAL-008
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-008 — Stage 8. Transient responsive visualization

- Status: verified
- Entry: Stage 7 verified на 4e88a5d. Доступны физические эпюры и единый курсор x.
- Goal: компактная схема и две вертикально согласованные эпюры x полезны на desktop и мобильном экране.
- Evals: ширины 1280 и 390 px, общая шкала x, порядок суммарной, прямой и обратной волн, выделенная толщиной сумма и сохранённый SVG. Измерения, оси времени, переключение и доступность прежних действий сохраняются.
- User actions: none
- Evidence: 638 Vitest, Astro check, lint, root и production build, 2 production smoke PASS. Первый расширенный прогон выявил несовместимый селектор, исправленный на 1a664a3. Затем Chromium 86/86 PASS, включая touch, x-шкалы и прежние эксперименты. [Cloudflare preview 66de86ee](https://66de86ee.electrotutor.pages.dev/) 10/10 PASS. На 390 × 844 px проверены схема и обе эпюры над панелью после прокрутки к холсту. Экспорт сохранил порядок, фактические цвета и толщину. GitHub SHA 1a664a3346208241c5e504f2da753c858fcb59c6.
- NEXT: ET-UNIVERSAL-009
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-009 — Stage 9. Steady-state long-line core

- Status: verified
- Entry: Stage 8 verified на 1a664a3. Входные условия задаёт отдельная SPEC частотной модели.
- Goal: один однородный участок RLGC рассчитывается в установившемся синусоидальном режиме. Ядро даёт γ, Zc, ABCD и входное сопротивление для граничного условия нагрузки.
- Evals: независимые формулы для линии без потерь, линии без искажений с потерями, комплексного Z, согласования, КЗ и обрыва. Проверяются численные границы, нулевая длина и четверть волны.
- Scope: покрытый тестами численный API одной секции. Каскад и редактор имеют отдельные этапы.
- User actions: none
- Evidence: 15 целевых, 653 полных Vitest PASS, check, lint и production build PASS. Независимый Python cmath эталон подтвердил 54,587 − j8,194 Ω для линии с потерями и комплексной нагрузки. Проверены γ, Zc, взаимность, малый аргумент и различие физического полюса и соседнего конечного сопротивления. GitHub SHA 60aa04d87aec6240c954a18050538ee2c98e7b13.
- NEXT: ET-UNIVERSAL-010
- Completion sync: обновлены STAGES, ROADMAP, ARCHITECTURE, TESTING, TRACEABILITY, частотная SPEC и coverage ledger. Проверены README, DECISIONS, DESIGN, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-010 — Stage 10. ABCD network composition

- Status: verified
- Entry: однородная секция Stage 9 verified. Матрица передаёт [U, I] от нагрузки к входу.
- Goal: собрать последовательность участков линии, продольных сопротивлений и поперечных проводимостей в одном частотном расчёте.
- Evals: каскадное произведение в физическом порядке, независимый эталон входного сопротивления, перестановка некоммутирующих звеньев, согласование, КЗ, обрыв и неподдерживаемый ввод.
- Scope: численная модель каскада. Фазоры по координате проверяются в Stage 11.
- User actions: none
- Evidence: 24 целевых и 662 полных Vitest PASS, check, lint и production build PASS. Два четвертьволновых участка, R и шунт дали 93,75 Ω против независимого пересчёта от нагрузки. Проверены порядок некоммутирующих матриц, согласование, обрыв, КЗ и совпадение двух секций с цельной линией с потерями. GitHub SHA ac0175e97abe345ced7379aa24fcc3fbd06ca064.
- NEXT: ET-UNIVERSAL-011
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, частотная SPEC и coverage ledger. Проверены README, ROADMAP, DESIGN, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-011 — Stage 11. Phasor inspection by coordinate

- Status: verified
- Entry: Stage 10 verified. Рассчитаны ABCD, локальные секции и граничное условие.
- Goal: на живой RU/UK странице выбор x синхронизирует эпюры и векторы прямой, обратной и суммарной волн напряжения и тока.
- Evals: независимые численные эталоны фазоров, случай с постоянными модулями двух волн и меняющейся суммой, соответствие координаты эпюр и векторов в браузере, работа применённой схемы из общего редактора.
- User actions: none
- Evidence: Windows `pnpm verify:full` PASS для runtime d0c52299c9cd9e2e874f9cf6cf257f0b94b0132c, Chromium использовал сценарии из e143e70cdd60500b6dc9644bd48a8d6ca0fc2992. 666 Vitest, 377 Chromium, 6 предусмотренных пропусков, 2 production smoke, audit HIGH PASS. Исправлена гидратация SVG title в обеих локализациях. На [точном Cloudflare preview](https://2eb54caa.electrotutor.pages.dev/) 12 браузерных сценариев PASS, включая общий x и сохранение расчёта после отклонения схемы.
- NEXT: ET-UNIVERSAL-012
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, частотная SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-012 — Stage 12. Reactive one-port Z(s)

- Status: verified
- Entry: Stage 11 verified. Общий CircuitEditor хранит связность отдельно от геометрии, действующая LC-лаборатория вычисляет точные Z(s) для последовательно-параллельного дерева.
- Goal: между явно выбранной парой выводов произвольный граф идеальных L и C, включая мост. В RU/UK доступны точное Z(s), X(ω), конечные полюсы и нули и предельные режимы.
- Evals: асимметричный мост из пяти ветвей с независимым расчётом по узловым напряжениям, отмена ненаблюдаемого резонанса, разомкнутый и замкнутый порт, правка графа и пересчёт в браузере, прежние LC-сценарии.
- Deferred: эквивалентные реализации Фостера и Кауэра по отдельным этапам.
- User actions: none
- Evidence: 672 Vitest и 27 браузерных сценариев PASS на Windows, check/lint/build и 2 production smoke PASS. Для асимметричного моста X(1000 rad/s) = −16 Ω совпало с независимым расчётом по узлам. Проверены сокращение невидимого резонанса, обрыв, КЗ и 12 узлов. На [опубликованном превью](https://09e2bac4.electrotutor.pages.dev/) 7 браузерных сценариев PASS. GitHub SHA fbf00480357b01bd259f3b47e0c08e050b0f59e0.
- NEXT: ET-UNIVERSAL-013
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-013 — Stage 13. Foster I

- Status: verified
- Entry: Stage 12 verified. Доступны сокращённая функция входного импеданса и её конечные полюсы.
- Goal: представить входной импеданс LC-графа последовательной цепью Фостера I. В интерфейсе видны разложение, значения компонентов и полученная топология.
- Evals: одиночные L/C, два полюса моста, крайние члены, проверка равенства X(ω) по номиналам реализации в обход исходного решателя, браузерное обновление после пересчёта.
- Deferred: формы Фостера II и Кауэра.
- User actions: none
- Evidence: 676 Vitest, 29 Chromium, check/lint/build и 2 production smoke PASS. Номиналы формы Фостера I воспроизвели независимые узловые значения X(ω) моста. Проверены пересчёт L3, один L/C, обрыв и ширина 390 px с открытой схемой. На [точном превью](https://bb521715.electrotutor.pages.dev/) 9 браузерных сценариев PASS. GitHub SHA d1f28815c4980ab0eb50b7d6e20ffc22863ae262.
- NEXT: ET-UNIVERSAL-014
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-014 — Stage 14. Foster II

- Status: verified
- Entry: Stage 13 verified. Доступны точное Z(s), операции над рациональной функцией и отображение результата синтеза.
- Goal: разложение входной проводимости даёт параллельную цепь Фостера II. Пользователь видит значения, соединения и эквивалентный X(ω).
- Evals: одиночные L/C, крайние члены и конечные частоты, асимметричный мост, независимый пересчёт импеданса из параллельных ветвей, живое сравнение форм I и II.
- Deferred: формы Кауэра.
- User actions: none
- Evidence: 679 Vitest, 31 Chromium, check/lint/build и 2 production smoke PASS. Две последовательные LC-ветви и параллельная L воспроизвели независимые узловые значения X(ω) моста. Проверены обе формы на одной принятой схеме, общий курсор и пересчёт L3. На [точном превью](https://0f84552f.electrotutor.pages.dev/) 11 браузерных сценариев PASS. GitHub SHA f551934d20c52263876dc4fc5e4caa637226a647.
- NEXT: ET-UNIVERSAL-015
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-015 — Stage 15. Cauer I

- Status: verified
- Entry: Stage 14 verified. Граф даёт точный входной импеданс с целыми полиномами.
- Goal: разложение в непрерывную дробь по старшим степеням даёт LC-лестницу Кауэра I. На RU/UK видны номиналы, порядок и эквивалентность.
- Evals: известная лестница, одиночные L/C, асимметричный мост, точная обратная сборка дроби, независимое сравнение X(ω) по номиналам и браузерный пересчёт.
- Deferred: Кауэр II и остальные режимы.
- User actions: none
- Evidence: 683 Vitest, 33 Chromium, check/lint/build и 2 production smoke PASS. Обратная сборка лестницы дала точные коэффициенты Z(s) моста, реактивность из номиналов совпала с узловыми эталонами. Проверены исходное начало со шунта, пересчёт принятого графа и экран 390 px. На [точном превью](https://72641dfd.electrotutor.pages.dev/) 13 браузерных сценариев PASS. GitHub SHA 3e786989c158806f146defbba3711d82f242b0c5.
- NEXT: ET-UNIVERSAL-016
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-016 — Stage 16. Cauer II

- Status: verified
- Entry: Stage 15 verified. Доступны точная сборка лестницы, общий редактор и рациональный решатель LC-графа.
- Goal: разложение при q → 0 даёт лестницу Кауэра II. Закрыть общий набор представлений § 10 мастер-промпта отображением упрощённой связности рядом с исходным LC-графом.
- Evals: известная лестница, одиночные L/C, точная обратная сборка и X(ω) из номиналов, совместный просмотр форм и физическая LC-свёртка с точным сохранением импеданса.
- Deferred: режим электрических систем и сетей.
- User actions: none
- Evidence: 688 Vitest (повтор после тайм-аута прежней проверки на первом прогоне), 36 Chromium, check/lint/build и 2 production smoke PASS. Лестница Кауэра II точно восстановила Z(s), её X(ω) совпала с узловым эталоном. Свёртка катушек 1 и 2 µH сохранила точное Z(s) и эквивалент 2/3 µH при сохранении исходного графа. На [точном превью](https://487e602e.electrotutor.pages.dev/) 16 браузерных сценариев PASS. GitHub SHA ba3b37b7665c096dc15c01448bf47a1dab41ec15.
- NEXT: ET-UNIVERSAL-017
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-017 — Stage 17. Power-system domain model

- Status: verified
- Entry: Stage 16 verified. LC-режим завершён. Общий редактор хранит связность независимо от геометрии.
- Goal: версионированная физическая сеть из шин, питающих источников, линий, двухобмоточных трансформаторов, нагрузок и коммутационных аппаратов. Эксплуатационная связность отделена от расчётных разрезов.
- Evals: импорт реального примера кольца и трансформаторной нагрузки, открытие аппарата сохраняет оборудование и меняет связность, исключённый трансформатор создаёт остров без питания, условные разрезы P и Q сохраняют физическую связность.
- Deferred: каталог, UI и решатели потокораспределения.
- User actions: none
- Evidence: 5 целевых и 693 общих Vitest, check/lint/build PASS. Импорт кольца, физическое открытие аппарата, непитаемый остров и разрезы P/Q проверены через производственные доменные функции. Браузерный редактор выделен в поздние этапы. GitHub SHA c54ed7f94ed95641fbcfcea37b67f4cce846abb6.
- NEXT: ET-UNIVERSAL-018
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, SPEC электрических сетей, индекс SPEC и coverage ledger. Проверены README, ROADMAP, DESIGN, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-018 — Stage 18. Equipment catalog schema

- Status: verified
- Entry: Stage 17 verified. Физические устройства хранят идентификатор каталожного типа отдельно от электрической связности.
- Goal: версионируемые типы линий и двухобмоточных трансформаторов с происхождением, проверкой параметров и пользовательскими записями.
- Evals: указание точной версии, сохранение ссылки старого документа, выбор пользовательского типа, отклонение дубликатов, неполного происхождения и недопустимых паспортных данных.
- Deferred: интерфейс каталога и вычисление схем замещения.
- User actions: none
- Evidence: 10 целевых и 698 общих Vitest, check/lint/build PASS. Проверены точные и старые каталожные ссылки, сохранение параметров физических устройств, происхождение, оба представления шунта, отпаек и активной составляющей. Исходный каталог не содержит неподтверждённых паспортных значений. GitHub SHA d6eca951ca91938713903a64dc36c1bbe34234ae.
- NEXT: ET-UNIVERSAL-019
- Completion sync: обновлены STAGES, ARCHITECTURE, TESTING, TRACEABILITY, SPEC электрических сетей и coverage ledger. Проверены README, ROADMAP, DESIGN, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-019 — Stage 19. Catalog UI and hidden advanced parameters

- Status: verified
- Entry: Stage 18 verified. Каталог читает собственные и документированные типы, поддерживает ревизии и закрепляет тип на физическом устройстве.
- Goal: RU/UK лаборатория даёт простые параметры линии и трансформатора, выбор типа, скрытые дополнительные поля, локальное переопределение и возврат к типу. Напряжение выбирается из учебного набора или вводится вручную.
- Evals: открыть физическую схему, загрузить пользовательские типы, закрепить ревизии, изменить параметры в дополнительных настройках и вернуть исходные. Другие экземпляры и записи каталога сохраняются. Проверить узкий экран и стандартное/пользовательское напряжение.
- Deferred: вычисление эквивалентов и потоков.
- User actions: none
- Evidence: 702 Vitest, 39 локальных и 19 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Подтверждены выбор закреплённой ревизии, изоляция переопределений, сброс, отпайки и отдельные напряжения шины и источника. SHA 5a078c12d7676e07cb06911a1ac35a28948d4b6e. Preview https://b0cc8740.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-020
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY и coverage ledger. Проверены README, ROADMAP, SPEC электрических сетей, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-020 — Stage 20. Line equivalent generator

- Status: verified
- Entry: Stage 19 verified. Параметры фактической линии редактируются и связываются с каталожной ревизией.
- Goal: вычислить пофазную номинальную П-схему линии из действующих параметров, длины и числа цепей. Показать эквивалент в RU/UK лаборатории рядом с физической линией.
- Evals: независимое численное сравнение сопротивлений и проводимостей, C′ и B′, длина, параллельные цепи, изменённый тип и сброс override. End-to-end пользователь меняет фактическую линию и сверяет формулы, вывод и восстановление результата.
- Deferred: трансформатор, режим сети, расчёт напряжений и потерь.
- User actions: none
- Evidence: 706 Vitest, 40 локальных и 20 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. При ℓ = 40 km и n = 2 браузер сверил R = 4,6 Ω, X = 8,2 Ω и проводимость каждого плеча. Переопределение R обновило схему, сброс восстановил результат. SHA aab8c10123bc1c4a97d488b559d8f1917518c303. Preview https://25b12093.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-021
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-021 — Stage 21. Transformer equivalent generator

- Status: verified
- Entry: Stage 20 verified. Действующая каталожная запись и параметры физического экземпляра дают проверяемую схему замещения.
- Goal: из данных двухобмоточного трансформатора получить пофазный эквивалент, коэффициент трансформации с отпайкой, раздельные мощность холостого хода и нагрузочные потери. Показать результат в RU/UK инспекторе.
- Evals: численно сверить паспортный базис, параллельные экземпляры, активную и реактивную составляющие, нейтральную и смещённую отпайки. В браузере изменить n и отпайку фактического трансформатора и проверить номинальные потери.
- Deferred: сетевой режим и рабочие потери при рассчитанных токах.
- User actions: none
- Evidence: 711 Vitest, 41 локальный и 21 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Для двух агрегатов проверены 40 kW холостого хода, 160 kW нагрузочных потерь при номинальном токе, R = 1,891 Ω и коэффициент 10,45 при отпайке −2. SHA 18c8c301294c026d291e66c072a83e8be700db4a. Preview https://e4eee37f.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-022
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-022 — Stage 22. Load and source normalization

- Status: verified
- Entry: Stage 21 verified. Сеть хранит типизированные линии и трансформаторы и показывает их схемы замещения.
- Goal: принимать прямые P и Q либо P и коэффициент мощности с характером нагрузки, показывать вычисленное Q. Источник принимает независимые линейное действующее напряжение и фазовый угол.
- Evals: совпадение двух способов ввода, положительная и отрицательная Q, отклонение неверного cos φ, нулевая Q при cos φ = 1, стандартное и пользовательское напряжение, канонический угол. Browser E2E подтверждает принятие нагрузки и фазора в той же сети.
- Deferred: итерационный расчёт режима.
- User actions: none
- Evidence: 715 Vitest, 42 локальных и 22 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Браузер подтвердил для 10 MW и cos φ = 0,8 реактивную мощность ±7,5 MVAr, совпадение ёмкостного ввода с прямым и независимую настройку фазора источника 220 kV, −30°. SHA 9303da6d25ff7bbe28b7854a917bbd02ed1b22cb. Preview https://c49761af.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-023
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-023 — Stage 23. Radial educational load flow

- Status: verified
- Entry: Stage 22 verified. Источник, нагрузки и эквиваленты ветвей имеют общие единицы и физические связи.
- Goal: решать радиальный режим обратным суммированием комплексной мощности с потерями и прямым пересчётом напряжений. Публиковать напряжения шин, токи, потоки, потери, итерации и невязку.
- Evals: одна линия и нагрузка, две последовательные линии, ответвление, двусторонний трансформатор, знак шунта, баланс, сходимость и диагностические сценарии. В браузере назначить типы реальным ветвям, рассчитать фидер и наблюдать обновление напряжения после изменения нагрузки.
- Deferred: кольцевой и общий сетевой режим.
- User actions: none
- Evidence: 720 Vitest, 43 локальных и 23 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Независимый эталон подтверждён для двух шин и разветвлённого фидера. Браузер проверил двухлинейную сеть с трансформатором, баланс, потери и пересчёт после изменения нагрузки. После устранения гонки гидратации проверен переход между режимами длинной линии. SHA 4503884fcef12921ba7f18de9c15324e9e23c93c. Preview https://f0ce3e8f.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-024
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-024 — Stage 24. Simple ring preliminary flow

- Status: verified
- Entry: Stage 23 verified. Физический фидер рассчитывается с рабочими потерями и контролем сходимости.
- Goal: определить предварительные P и Q в простом кольце как двухстороннем питании. Сравнить методы по длинам и комплексным сопротивлениям, показывать обратные направления и раздельные точки потокораздела. Сохранить условные разрезы без изменения проводящих соединений.
- Evals: ручной однородный пример, комплексные веса для неоднородного примера, различающиеся разрезы P и Q, отрицательный знаковый поток и проверка связности. В браузере открыть живое кольцо и сравнить оба метода.
- Deferred: уточнение с потерями, общая узловая модель, физическая коммутация.
- User actions: none
- Evidence: 723 Vitest, 44 локальных и 24 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Оба метода дали одинаковые потоки в однородном примере, неоднородное кольцо сверено независимым комплексным расчётом. На L2 активная мощность −0,5 MW отображена B3 → B2, точки раздела P и Q различаются. Разрезы сохранили физический цикл. SHA 2074109a8bee19531debd9369f57f763df04846b. Preview https://f021372c.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-025
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-025 — Stage 25. Ring loss refinement

- Status: verified
- Entry: Stage 24 verified. Предварительные потоки, физическое кольцо и условные разрезы доступны в лаборатории.
- Goal: условно разделить кольцо на два пути к выбранной шине, итерационно вычислить токи, потери, напряжения и баланс. Привести напряжения обоих путей к одному комплексному значению на разрезе.
- Evals: показать ненулевые потери, пересчитать напряжения и проверить совпадение результатов при смене условного разреза. Отдельно проверить ограничение итераций и сохранение физического кольца. Browser E2E проходит тот же сценарий.
- Deferred: независимый Ybus для многоконтурных сетей.
- User actions: none
- Evidence: 726 Vitest, 45 локальных и 25 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Проверены совпадение напряжения двух путей на расчётной шине, реальные потери и независимый баланс. Перенос условного разреза сохранил режим и все три физические ветви. SHA 600c9e966e3a8f59432013c4afa43aa2e2fc4c41. Preview https://42525f20.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-026
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-026 — Stage 26. General Ybus AC power flow

- Status: verified
- Entry: Stage 25 verified. Учебное уточнение кольца считается с потерями, проверяемым балансом и независимым условным разрезом.
- Goal: добавить независимый общий расчёт произвольной поддерживаемой замкнутой сети с Ybus, опорными фазорами и постоянными нагрузками. Подключить импорт документов сети и диагностику в RU/UK лаборатории.
- Evals: независимо заданная многоконтурная сеть, комплексная отпайка и реактивная нагрузка, идеальный аппарат, непитаемый участок, недоопределённые токи идеальных петель, несходимость. Браузер импортирует физическую двухконтурную сеть, решает её и отклоняет неверный документ без потери режима.
- Deferred: сравнение с учебным расчётом и наложение измерений на схему.
- User actions: none
- Evidence: 731 Vitest, 46 локальных и 26 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Независимый расчёт подтвердил сетку 110/108/107 kV, комплексную отпайку и единственные токи идеальных ответвлений. Браузер импортировал двухконтурную сеть и отклонил неверный документ с сохранением решения. При смене схемы сохраняется один CircuitEditor. SHA f49752f3ff56a972122adfeedc0464d488ef8a9e. Preview https://03a50532.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-027
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-027 — Stage 27. Ring educational vs general-solver equivalence

- Status: verified
- Entry: Stage 26 verified. Независимые учебный и узловой solvers получают одну типизированную сеть.
- Goal: сверять напряжение и фазу шин, знаковые P/Q на обоих выводах, потери и опорный источник. Публиковать максимальные расхождения, допуски и расхождения по ID.
- Evals: однородное кольцо двумя стартовыми методами, разные разрезы, разворот физической ориентации и намеренно неверные знак Q и масштаб U. В браузере пересчитать сравнение после изменения условного разреза.
- Deferred: слои потоков, загрузки и предупреждений.
- User actions: none
- Evidence: 733 Vitest, 47 локальных и 27 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Учебное и узловое решения совпали в пределах 0,001 kV, 0,001°, 0,001 MW и 0,001 MVAr. Сравнение сохранилось после смены расчётной шины и выявило искусственные ошибки знака Q и масштаба U. SHA 28888dd9c8cb7452dd832ffef631a8dbf8d04753. Preview https://71b9892f.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-028
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-028 — Stage 28. Power-flow overlay

- Status: verified
- Entry: Stage 27 verified. Решатели согласуются по независимому эталону, общий режим выдаёт параметры всех выводов.
- Goal: рисовать принятый сетевой режим в CircuitEditor отдельными слоями. Дать пользователю сборку своей физической сети через тот же документ и редактор.
- Evals: знак и направление стрелок P/Q, отдельные переключатели, загрузка параллельного оборудования, напряжение и предупреждения, выбор вывода, сборка собственной схемы и реальный расчёт. Использовать типовой ток линии и мощность трансформатора при наличии.
- Deferred: физическая коммутация, мобильная настройка и итоговая проверка всех режимов.
- User actions: none
- Evidence: 735 Vitest, 49 локальных и 29 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. На схеме L2 стрелки P и Q направлены в разные стороны. Проверены слои, загрузка параллельных цепей, предупреждение напряжения и создание своего физического документа с реальным источником. SHA 0e74f380c378754ac0e805e34cf2ecf640edb041. Preview https://b5aca753.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-029
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-029 — Stage 29. Physical switching and normally-open ring

- Status: verified
- Entry: Stage 28 verified. Наложение отражает текущий физический режим и принятые параметры объектов.
- Goal: открывать и закрывать аппарат в физическом документе. Показывать состояние символа и автоматически пересчитывать режим. Разрезы P и Q отображать отдельно как признаки расчёта.
- Evals: нормально-разомкнутое кольцо даёт радиальную связность и результаты двух решателей. Закрытие аппарата образует цикл и даёт отдельный ток аппарата. При повторном открытии цикл исчезает. В отдельном учебном кольце условный разрез оставляет три ветви и не создаёт аппарат.
- Deferred: телефонный вид и итоговый кросс-режимный прогон.
- User actions: none
- Evidence: 736 Vitest, 50 локальных и 30 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Замыкание Q1 создало цикл, обновило символ, напряжение B4 и протекающий ток. Размыкание вернуло радиальную сеть. Независимый условный разрез Q сохранил физическое кольцо и отобразил пунктирный маркер. SHA 96d599a1422fde932d3e3048fc8a73ddadde5ef7. Preview https://175a6f0d.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-030
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-030 — Stage 30. Mobile power-system layout

- Status: verified
- Entry: Stage 29 verified. Схема показывает рабочие потоки, состояние аппаратов и условные разрезы.
- Goal: сохранить читаемость схемы на телефоне, дать компактные напряжения и сведения о ветви по касанию. Различать касание и панорамирование.
- Evals: сенсорный Chromium 390 × 844 px, украинская страница, локальная горизонтальная прокрутка, N шин, касание физической ветви и обновление показаний без горизонтального переполнения документа.
- Deferred: полный межрежимный прогон и выпуск.
- User actions: none
- Evidence: 736 Vitest, 51 локальный и 31 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Сенсорный Chromium 390 × 844 на украинской странице подтвердил локальную прокрутку схемы, три напряжения, смену показаний при касании L2 и ширину документа. SHA 7c02894a627ff43f95c2a9d216c84c9ad4afd070. Preview https://475e5199.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-031
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-031 — Stage 31. Cross-mode regression

- Status: verified
- Entry: Stage 30 verified. Экраны сети и условные разрезы готовы для проверки вместе с лабораториями линий и LC.
- Goal: проверить четыре явно определённых адаптера общего редактора. Сохранить отдельные палитры, начальные документы, расчётные требования и единый механизм связности.
- Evals: один реальный CircuitEditor на каждом маршруте, переход из переходного режима в установившийся, изолированные палитры, корректные Z(s) и Ybus, отказ неподходящих документов. Проверить отсутствие регрессии свободного редактора.
- Deferred: полный выпускной цикл.
- User actions: none
- Evidence: 738 Vitest, 52 локальных и 32 Cloudflare Chromium, 2 production smoke, check/lint/build PASS. Все четыре режима прошли в одном сеансе. Подтверждены общий CircuitEditor, отдельные палитры и расчёты, отсутствие чужих элементов и отказ несовместимых документов. SHA 6ff79d26dff7a57822557c7a7b320e33108feff0. Preview https://37ffbf0e.electrotutor.pages.dev.
- NEXT: ET-UNIVERSAL-032
- Completion sync: обновлены STAGES, ARCHITECTURE, DESIGN, TESTING, TRACEABILITY, LC SPEC и coverage ledger. Проверены README, ROADMAP, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

## ET-UNIVERSAL-032 — Stage 32. Production readiness

- Status: verified
- Entry: Stage 31 verified. Четыре режима проверены совместно, включая переключение длинной линии, LC и физические сети.
- Goal: квалифицировать точный выпуск на Windows, довести штатный CI и развёртывания GitHub Pages и Cloudflare Pages, подтвердить фактический runtime, записать предыдущую точку и доказательство обратимости.
- Evals: полный `pnpm verify:full`, основной GitHub workflow с backend, два независимых production hosts и smoke RU/UK, совпадение SHA, HTTP previous immutable и проверка обратного Git patch. Канонический статус синхронизируется после проверки эксплуатации.
- User actions: none
- NEXT: master-completed
- Evidence: Windows `pnpm verify:full` PASS. 738 Vitest, 405 Chromium, 6 предусмотренных пропусков, 2 production smoke, audit HIGH PASS. Доставленный runtime SHA eff12b6373dd08094edd8fed0136821517018b33.
- Production CI: GitHub Actions verify и deploy PASS, включая backend API и PostgreSQL. Два браузерных сценария прошли на GitHub Pages. [Run](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44118159240) [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/)
- Cloudflare: deployment 5cd42ef5-f6f4-433a-b198-111394dc482f, источник eff12b6. По два браузерных smoke прошли на точном развёртывании и основном домене. [Выкладка](https://5cd42ef5.electrotutor.pages.dev) [Основной домен](https://electrotutor.org/)
- Rollback evidence: предыдущий SHA 53793834d6e803b594bc210edcd339413aaa8e83, обратный Git patch принят `git apply --check`, предыдущий точный Cloudflare-артефакт ответил HTTP 200. [Предыдущая выкладка](https://22cc6eb6.electrotutor.pages.dev) [Предыдущий GitHub CI](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/44038295894)
- Completion sync: обновлены README, ROADMAP, STAGES, TESTING, SPEC электрических сетей и coverage ledger. Проверены ARCHITECTURE, DESIGN, TRACEABILITY, DECISIONS, SECURITY, API, DATA_MODEL, DEPENDENCIES и project-context.

```master-execution
{
  "schema_version": 2,
  "state_revision": 33,
  "master": {
    "id": "ET-UNIVERSAL-MASTER-V2",
    "status": "completed",
    "source": {
      "backend": "google_drive",
      "queue_id": "none",
      "item_id": "ElectroTutor-Master-Prompt-v2",
      "revision": "2026-11-16T16:28:20.617Z",
      "prompt_type": "master_prompt",
      "retention": "Original Google Doc and selected project SPECs"
    }
  },
  "tracks": [
    {
      "id": "universal-labs-v2",
      "repository": "C:/Users/aleks/projects/electro-tutor",
      "worktree": "C:/Users/aleks/projects/electro-tutor",
      "branch": "main",
      "checkpoint": "eff12b6373dd08094edd8fed0136821517018b33",
      "ownership": [
        "src",
        "specs",
        "tests",
        "docs"
      ],
      "status": "integrated"
    }
  ],
  "slices": [
    {"id":"ET-UNIVERSAL-000","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Baseline snapshot","status":"verified","predecessors":[],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"","checkpoint_after":"1273ea397f5877ff07e6eb2f9552d57bc99756e9","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit","tests/e2e/circuit-editor.spec.ts"],"requirements":["CE-001","CE-003","CE-006"],"capabilities":[],"model_class":"LOW","reasoning_effort":"low","stop_after":false},
    {"id":"ET-UNIVERSAL-001","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Inventory editor architecture","status":"verified","predecessors":["ET-UNIVERSAL-000"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"1273ea397f5877ff07e6eb2f9552d57bc99756e9","checkpoint_after":"11fab0214ddf3002b083eb55f4304ea83c753b94","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit","tests/e2e/circuit-editor.spec.ts"],"requirements":["CE-001","CE-003","CE-006"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-002","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Topology contract","status":"verified","predecessors":["ET-UNIVERSAL-001"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"11fab0214ddf3002b083eb55f4304ea83c753b94","checkpoint_after":"636154396b243b312ac49c581c0bfdd595430314","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit","tests/e2e/circuit-editor.spec.ts"],"requirements":["CE-001","CE-003","CE-006"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-003","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Recursive branching","status":"verified","predecessors":["ET-UNIVERSAL-002"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"636154396b243b312ac49c581c0bfdd595430314","checkpoint_after":"74965923d8a23032f12ac0fed807b5e61446bdaf","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit","tests/e2e/circuit-editor.spec.ts"],"requirements":["CE-001","CE-003","CE-006"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-004","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Shared mode adapter","status":"verified","predecessors":["ET-UNIVERSAL-003"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"74965923d8a23032f12ac0fed807b5e61446bdaf","checkpoint_after":"1c68dee5de43a026ac3b508b1eb867007ad4809c","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit","tests/e2e/circuit-editor.spec.ts"],"requirements":["CE-006","CE-007","CE-012"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-005","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Transient default template and switching","status":"verified","predecessors":["ET-UNIVERSAL-004"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"1c68dee5de43a026ac3b508b1eb867007ad4809c","checkpoint_after":"f43490cdbd5f1d149e8afb00893d3c87ec92585e","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-transient.spec.md","src/transient/network.ts","src/transient/circuit-mode.ts","src/components/TransmissionNetworkLab.tsx"],"requirements":["CE-007","LINE-UX-034","LINE-UX-035"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-006","master_id":"ET-UNIVERSAL-MASTER-V2","title":"RLC reduction engine","status":"verified","predecessors":["ET-UNIVERSAL-005"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"f43490cdbd5f1d149e8afb00893d3c87ec92585e","checkpoint_after":"2542bba40213fb9f9b487223056f5e1a39f042b8","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/circuit-engine.spec.md","src/circuit/topology.ts","src/circuit/rlc-reduction.ts","src/circuit/rlc-reduction.test.ts"],"requirements":["CE-013","CE-014","CE-015"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-007","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Transient solver integration","status":"verified","predecessors":["ET-UNIVERSAL-006"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"2542bba40213fb9f9b487223056f5e1a39f042b8","checkpoint_after":"4e88a5d0a350e8bebd3e39c73b9833b2449a437d","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-transient.spec.md","src/transient/circuit-adapter.ts","src/transient/line-archive-document.ts","src/components/TransmissionNetworkLab.tsx"],"requirements":["CE-007","LINE-UX-036"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-008","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Transient responsive visualization","status":"verified","predecessors":["ET-UNIVERSAL-007"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"4e88a5d0a350e8bebd3e39c73b9833b2449a437d","checkpoint_after":"1a664a3346208241c5e504f2da753c858fcb59c6","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-transient.spec.md","src/components/TransmissionNetworkLab.tsx","src/components/TransmissionNetworkLab.css","src/engineering/EngineeringPlot.tsx"],"requirements":["LINE-UX-024","LINE-UX-037"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-009","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Steady-state long-line core","status":"verified","predecessors":["ET-UNIVERSAL-008"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"1a664a3346208241c5e504f2da753c858fcb59c6","checkpoint_after":"60aa04d87aec6240c954a18050538ee2c98e7b13","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-steady.spec.md","src/steady-line/line.ts","src/steady-line/line.test.ts","src/models/circular-diagram.ts"],"requirements":["LINE-AC-001","LINE-AC-002","LINE-AC-003"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-010","master_id":"ET-UNIVERSAL-MASTER-V2","title":"ABCD network composition","status":"verified","predecessors":["ET-UNIVERSAL-009"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"60aa04d87aec6240c954a18050538ee2c98e7b13","checkpoint_after":"ac0175e97abe345ced7379aa24fcc3fbd06ca064","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-steady.spec.md","src/steady-line/line.ts","src/steady-line/cascade.ts"],"requirements":["LINE-AC-004","LINE-AC-005"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-011","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Phasor inspection by coordinate","status":"verified","predecessors":["ET-UNIVERSAL-010"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"ac0175e97abe345ced7379aa24fcc3fbd06ca064","checkpoint_after":"e143e70cdd60500b6dc9644bd48a8d6ca0fc2992","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/transmission-line-steady.spec.md","src/steady-line","src/circuit/CircuitEditor.tsx"],"requirements":["LINE-AC-006","LINE-AC-007"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-012","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Reactive one-port Z(s)","status":"verified","predecessors":["ET-UNIVERSAL-011"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"e143e70cdd60500b6dc9644bd48a8d6ca0fc2992","checkpoint_after":"fbf00480357b01bd259f3b47e0c08e050b0f59e0","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/reactive-two-port.spec.md","src/models/reactive-two-port.ts","src/circuit/CircuitEditor.tsx"],"requirements":["LC-005","LC-006","LC-007"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-013","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Foster I","status":"verified","predecessors":["ET-UNIVERSAL-012"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"fbf00480357b01bd259f3b47e0c08e050b0f59e0","checkpoint_after":"d1f28815c4980ab0eb50b7d6e20ffc22863ae262","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/reactive-two-port.spec.md","src/models/reactive-lc-graph.ts","src/components/ReactiveLcGraphLab.tsx"],"requirements":["LC-008","LC-009"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-014","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Foster II","status":"verified","predecessors":["ET-UNIVERSAL-013"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"d1f28815c4980ab0eb50b7d6e20ffc22863ae262","checkpoint_after":"f551934d20c52263876dc4fc5e4caa637226a647","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/reactive-two-port.spec.md","src/models/reactive-foster-i.ts","src/components/ReactiveLcGraphLab.tsx"],"requirements":["LC-010","LC-011"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-015","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Cauer I","status":"verified","predecessors":["ET-UNIVERSAL-014"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"f551934d20c52263876dc4fc5e4caa637226a647","checkpoint_after":"3e786989c158806f146defbba3711d82f242b0c5","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/reactive-two-port.spec.md","src/models/lc-polynomial.ts","src/components/ReactiveLcGraphLab.tsx"],"requirements":["LC-012","LC-013"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-016","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Cauer II","status":"verified","predecessors":["ET-UNIVERSAL-015"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"3e786989c158806f146defbba3711d82f242b0c5","checkpoint_after":"ba3b37b7665c096dc15c01448bf47a1dab41ec15","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/reactive-two-port.spec.md","src/models/reactive-cauer-i.ts","src/models/reactive-lc-graph.ts","src/components/ReactiveLcGraphLab.tsx"],"requirements":["LC-014","LC-015","LC-016"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-017","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Power-system domain model","status":"verified","predecessors":["ET-UNIVERSAL-016"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"ba3b37b7665c096dc15c01448bf47a1dab41ec15","checkpoint_after":"c54ed7f94ed95641fbcfcea37b67f4cce846abb6","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/circuit/topology.ts","src/power-system"],"requirements":["POWER-001","POWER-002","POWER-003"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-018","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Equipment catalog schema","status":"verified","predecessors":["ET-UNIVERSAL-017"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"c54ed7f94ed95641fbcfcea37b67f4cce846abb6","checkpoint_after":"d6eca951ca91938713903a64dc36c1bbe34234ae","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/network.ts","src/power-system/topology.ts"],"requirements":["POWER-004","POWER-005","POWER-006"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-019","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Catalog UI and hidden advanced parameters","status":"verified","predecessors":["ET-UNIVERSAL-018"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"d6eca951ca91938713903a64dc36c1bbe34234ae","checkpoint_after":"5a078c12d7676e07cb06911a1ac35a28948d4b6e","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/catalogue.ts","src/power-system/network.ts","src/circuit/CircuitEditor.tsx"],"requirements":["POWER-007","POWER-008","POWER-009"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-020","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Line equivalent generator","status":"verified","predecessors":["ET-UNIVERSAL-019"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"5a078c12d7676e07cb06911a1ac35a28948d4b6e","checkpoint_after":"aab8c10123bc1c4a97d488b559d8f1917518c303","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/line-equivalent.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-010","POWER-011"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-021","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Transformer equivalent generator","status":"verified","predecessors":["ET-UNIVERSAL-020"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"aab8c10123bc1c4a97d488b559d8f1917518c303","checkpoint_after":"18c8c301294c026d291e66c072a83e8be700db4a","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/transformer-equivalent.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-012","POWER-013"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-022","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Load/source normalization","status":"verified","predecessors":["ET-UNIVERSAL-021"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"18c8c301294c026d291e66c072a83e8be700db4a","checkpoint_after":"9303da6d25ff7bbe28b7854a917bbd02ed1b22cb","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/injections.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-014","POWER-015"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-023","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Radial educational load flow","status":"verified","predecessors":["ET-UNIVERSAL-022"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"9303da6d25ff7bbe28b7854a917bbd02ed1b22cb","checkpoint_after":"4503884fcef12921ba7f18de9c15324e9e23c93c","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/radial-flow.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-016","POWER-017"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-024","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Simple ring preliminary flow","status":"verified","predecessors":["ET-UNIVERSAL-023"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"4503884fcef12921ba7f18de9c15324e9e23c93c","checkpoint_after":"2074109a8bee19531debd9369f57f763df04846b","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/ring-preliminary.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-018","POWER-019"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-025","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Ring loss refinement","status":"verified","predecessors":["ET-UNIVERSAL-024"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"2074109a8bee19531debd9369f57f763df04846b","checkpoint_after":"600c9e966e3a8f59432013c4afa43aa2e2fc4c41","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/ring-refinement.ts","src/components/RingFlowPanel.tsx"],"requirements":["POWER-020","POWER-021"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-026","master_id":"ET-UNIVERSAL-MASTER-V2","title":"General Ybus AC power flow","status":"verified","predecessors":["ET-UNIVERSAL-025"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"600c9e966e3a8f59432013c4afa43aa2e2fc4c41","checkpoint_after":"f49752f3ff56a972122adfeedc0464d488ef8a9e","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/ac-power-flow.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-022","POWER-023"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-027","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Ring educational vs general-solver equivalence","status":"verified","predecessors":["ET-UNIVERSAL-026"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"f49752f3ff56a972122adfeedc0464d488ef8a9e","checkpoint_after":"28888dd9c8cb7452dd832ffef631a8dbf8d04753","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/ring-agreement.ts","src/components/RingFlowPanel.tsx"],"requirements":["POWER-024","POWER-025"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-028","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Power-flow overlay","status":"verified","predecessors":["ET-UNIVERSAL-027"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"28888dd9c8cb7452dd832ffef631a8dbf8d04753","checkpoint_after":"0e74f380c378754ac0e805e34cf2ecf640edb041","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/components/PowerSystemLab.tsx","src/power-system/flow-overlay.ts"],"requirements":["POWER-026","POWER-027"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-029","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Physical switching and normally-open ring","status":"verified","predecessors":["ET-UNIVERSAL-028"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"0e74f380c378754ac0e805e34cf2ecf640edb041","checkpoint_after":"96d599a1422fde932d3e3048fc8a73ddadde5ef7","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/power-system/normally-open.ts","src/components/PowerSystemLab.tsx"],"requirements":["POWER-028","POWER-029"],"capabilities":[],"model_class":"HIGH","reasoning_effort":"high","stop_after":false},
    {"id":"ET-UNIVERSAL-030","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Mobile power-system layout","status":"verified","predecessors":["ET-UNIVERSAL-029"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"96d599a1422fde932d3e3048fc8a73ddadde5ef7","checkpoint_after":"7c02894a627ff43f95c2a9d216c84c9ad4afd070","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/components/PowerSystemLab.tsx","src/circuit/CircuitEditor.tsx"],"requirements":["POWER-030","POWER-031"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-031","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Cross-mode regression","status":"verified","predecessors":["ET-UNIVERSAL-030"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"7c02894a627ff43f95c2a9d216c84c9ad4afd070","checkpoint_after":"6ff79d26dff7a57822557c7a7b320e33108feff0","required_evidence":["L1","L2"],"evidence":["L1","L2"],"context_scope":["specs/features/power-system.spec.md","src/circuit/editor-mode.ts","src/circuit/CircuitEditor.tsx","tests/e2e/power-system-cross-mode.spec.ts"],"requirements":["POWER-032","POWER-033"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false},
    {"id":"ET-UNIVERSAL-032","master_id":"ET-UNIVERSAL-MASTER-V2","title":"Production readiness","status":"verified","predecessors":["ET-UNIVERSAL-031"],"dependencies":[],"worktree_track":"universal-labs-v2","checkpoint_before":"6ff79d26dff7a57822557c7a7b320e33108feff0","checkpoint_after":"eff12b6373dd08094edd8fed0136821517018b33","required_evidence":["L1","L2"],"evidence":["L1","L2","L3"],"context_scope":["specs/features/power-system.spec.md","README.md","docs/ROADMAP.md","scripts/full-verify.mjs",".github/workflows/pages.yml"],"requirements":["POWER-034","POWER-035"],"capabilities":[],"model_class":"MEDIUM","reasoning_effort":"medium","stop_after":false}
  ],
  "blockers": [],
  "decisions": [],
  "context_budget": {
    "max_chars": 55000,
    "max_items": 8,
    "max_contours": 3,
    "max_decisions": 2,
    "max_evidence_threads": 4
  },
  "next_action": "Master complete",
  "integration": {
    "required": false,
    "reason": "Production source integrated into main and verified on both hosts."
  }
}
```

## final-qualification

- Status: completed
- Goal: независимый редактор схем и проверенный адаптер лаборатории длинных линий.
- Entry: чистый main ef16730, pnpm test PASS (550). Текущая интеграция линий работает по ET-LAB-021. Физический ввод и внешний корпус ET-LAB-022 остаются в своём record и не требуются для топологического ядра.
- SPEC: specs/features/circuit-engine.spec.md, CE-001..008.
- Invariants: существующий solver и Network-документы совместимы, электрические соединения явные, координаты живут отдельно, редактирование сохраняет идентичность выводов.
- Core evidence: исходные 550 тестов PASS. Eval-first FAIL на отсутствующем модуле. Публичный API прошёл 5 целевых проверок на разветвление, циклы, удаление, отказы и валидацию. Consumer path: Vitest создаёт электрическую цепь через публичные операции и проверяет состав каждой сети, явное разветвление, разрыв, отклонение некорректной правки и сохранение идентичности. Внешние сервисы не требуются.
- Ownership: CircuitEditor хранит граф и геометрию. Лабораторный адаптер импорта сохраняет физическую модель, события и рукописный архив. TransmissionNetworkLab управляет историей, расчётным Worker и результатами.
- Scope order: topology → standalone UI → wiring → layout → editing → interchange → line adapter → qualification. Каждый следующий slice требует PASS предыдущего.
- Risk: неверная связность при пересечениях, тихая порча импортов, избыточный бюджет поиска и регрессии solver. Покрытие: независимые топологические/геометрические утверждения, ограниченные операции и проверки реальных браузерных сценариев.
- ET-CIRCUIT-MERGE | completed | Владелец разрешил локальное слияние. `main` обновлена fast-forward с `ef16730` до `50dfab8`.
- Editor evidence: RU/UK routes built in the education profile. Initial Chromium 404 on both routes; after explicit route registration, 2/2 Chromium PASS for blank placement, drag, rotation, zoom, removal and 390 px touch placement. Astro check and targeted ESLint PASS.
- Wiring evidence: 557 Vitest PASS, including 100 seeded geometry edits preserving netlist and obstacle avoidance. Chromium 3/3 PASS, including explicit terminal/junction wiring and rotation with unchanged connectivity. Education build and types PASS.
- Layout and editing evidence: incremental routing retains unrelated paths. Global wire-order search compares unrouted count, crossings, bends and length; broader layout benchmarks and component repositioning remain pending. Ten focused Vitest and 5/5 Chromium PASS, including RLC wire optimization, clearing with undo/redo, series diode insertion and resistor value editing.
- ET-CIRCUIT-LAB-PARITY PASS: архивы line-v2..v5 проходят импорт, редактирование, расчёт в действующем Worker, перезагрузку и экспорт. Структура нагрузки, параметры элементов, потери линии, события, начальные состояния и связи с исходными штрихами проходят циклические проверки. Для конфликтной геометрии предусмотрено допустимое размещение с сохранением исходных архивных координат.
- CircuitEditor — единственная доска лаборатории. NetworkWorkbench удалён после браузерных проверок. Мышь, клавиатура, touch, измерения, время, составные нагрузки, Undo/Redo, сохранение и исправление штрихов проверены через обычные точки входа.
- Final evidence: 590 Vitest PASS, 77 Chromium PASS для редактора и лаборатории, 2 Chromium PASS для учебного релиза, образование build, Astro check, ESLint, context и diff PASS. Ранее два теста перетаскивания зависели от прокрутки под закреплённой панелью. Итоговый прогон проверяет попадание указателя по SVG перед жестом.
- Проверка после слияния на `main` (`50dfab8`): 590 Vitest и 79 Chromium PASS, включая редактор, лабораторию и учебный релиз. Учебная сборка, Astro check, ESLint, context и Git diff PASS.
- Routing qualification: 17 схем, повторное сравнение оптимизированных путей и netlist. Windows benchmark 0.18–27.94 ms. RLC: два пересечения устранены, нагруженные ветви: длина 1606 → 1566 при прежних поворотах и числе пересечений. В Chromium подтверждён Worker оптимизации шестисекционной схемы и сохранение netlist. Просмотрены кадры desktop, 320 px и редактирование штрихов на 390 px.
- Verification limits: физический ввод и независимый корпус распознавания ведутся в ET-LAB-022. Проверка оптимизации ограничена измеренными схемами и браузерными сценариями.
- ET-CIRCUIT-CI-DOWNLOADS: release verification repair. GitHub Pages run 43599889619 failed seven remote Chromium scenarios because Download.path() is unavailable over Playwright WebSocket. RED reproduced on the existing circuit import test. GREEN: all seven scenarios passed with the remote connection after saving JSON with Download.saveAs() in the test output directory. Same import, export, archive and solver assertions. Targeted ESLint and 590 Vitest tests passed. GitHub Pages run 43956203495 passed the download scenarios but failed the board eraser scenario (365 Chromium passed, 6 skipped, 1 failed). The original straight-stroke test passed 12/12 locally. RED with a bent stroke reproduced the one-fragment failure because the bounding-box midpoint was off the path. The test now waits for the board and eraser to be ready and clicks the actual SVG midpoint in screen coordinates. All 54 remote Chromium checks passed across six repetitions of the board and workspace scenarios. The application is unchanged.
- ET-MAIN-SYNC | PASS | Every local and remote branch tip is reachable from main. Test-only commits 566d2b2 and 955bdb0 corrected remote Chromium JSON downloads and board eraser targeting. [GitHub Pages run 43960006523](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43960006523) passed verify and deploy on 955bdb0 (590 Vitest passed, 366 Chromium passed, 6 skipped). Cloudflare Pages deployment 229b9827-2daf-4bbb-87c6-397967d0b686 served the same editor bundle on the [custom domain](https://electrotutor.org/), [Pages alias](https://electrotutor.pages.dev/) and [immutable deployment](https://229b9827.electrotutor.pages.dev/). Playwright on both Cloudflare public addresses and the [GitHub Pages mirror](https://zabulaaleksey.github.io/electro-tutor/) checked RU and UK, loaded the circuit editor, and downloaded and parsed the four-component RLC JSON with zero page errors.
- NEXT: complete

```master-execution
{
  "schema_version": 2,
  "state_revision": 6,
  "master": {
    "id": "ET-CIRCUIT-001",
    "status": "completed",
    "source": {
      "backend": "user_attachment",
      "queue_id": "none",
      "item_id": "6c796bca-1a7f-424a-942d-4275bfb56c48",
      "revision": "b36aa80a200739f4346415509fa8898a199cb362abc38c7f2f1047511d585765",
      "prompt_type": "master_prompt",
      "retention": "user attachment and project SPEC"
    }
  },
  "tracks": [
    {
      "id": "circuit-engine",
      "repository": "~/projects/electro-tutor",
      "worktree": "~/projects/electro-tutor",
      "branch": "feature/circuit-engine",
      "checkpoint": "50dfab8d44b84cd25e8957d5c93144b31d304150",
      "ownership": [
        "src/circuit",
        "src/transient/circuit-adapter.ts",
        "src/transient/circuit-archive.ts",
        "src/transient/line-archive-document.ts",
        "src/transient/useLineInk.tsx",
        "src/transient/useLineOperations.tsx",
        "src/components/TransmissionNetworkLab.tsx"
      ],
      "status": "integrated"
    }
  ],
  "slices": [
    {
      "id": "topology",
      "master_id": "ET-CIRCUIT-001",
      "title": "Audit and topology",
      "status": "verified",
      "predecessors": [],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "",
      "checkpoint_after": "d73cf4a2ca58093c7a9860a3423fad1d5b5694fd",
      "required_evidence": [
        "L1",
        "L2"
      ],
      "evidence": [
        "L1",
        "L2"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-001"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "editor",
      "master_id": "ET-CIRCUIT-001",
      "title": "Localized editor",
      "status": "verified",
      "predecessors": [
        "topology"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "d73cf4a2ca58093c7a9860a3423fad1d5b5694fd",
      "checkpoint_after": "403addb50c96fcb2494a96a9e833f2876283fe60",
      "required_evidence": [
        "L1",
        "L5"
      ],
      "evidence": [
        "L1",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-002"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "wiring",
      "master_id": "ET-CIRCUIT-001",
      "title": "Explicit topology and routing",
      "status": "verified",
      "predecessors": [
        "editor"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "403addb50c96fcb2494a96a9e833f2876283fe60",
      "checkpoint_after": "99d8c9e5de9119f31c7e9104fc18d9e361dc3c37",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-003"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "working-layout",
      "master_id": "ET-CIRCUIT-001",
      "title": "Bounded layout and atomic editing",
      "status": "verified",
      "predecessors": [
        "wiring"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "99d8c9e5de9119f31c7e9104fc18d9e361dc3c37",
      "checkpoint_after": "d8ca78b4d57b0132ec52d9221e2898bec2cfd3a2",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-004"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "interchange",
      "master_id": "ET-CIRCUIT-001",
      "title": "Version 1 document and existing Worker path",
      "status": "verified",
      "predecessors": [
        "working-layout"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "d8ca78b4d57b0132ec52d9221e2898bec2cfd3a2",
      "checkpoint_after": "ad96ff9e86254a2439e691a963aa1464bed6aaca",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-006"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "ET-CIRCUIT-QUALIFY-LAYOUT",
      "master_id": "ET-CIRCUIT-001",
      "title": "Expand layout quality and performance evidence",
      "status": "verified",
      "predecessors": [
        "interchange"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "ad96ff9e86254a2439e691a963aa1464bed6aaca",
      "checkpoint_after": "ad96ff9e86254a2439e691a963aa1464bed6aaca",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-004"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "ET-CIRCUIT-QUALIFY-EDITING",
      "master_id": "ET-CIRCUIT-001",
      "title": "Finish interactive editing, touch and document acceptance",
      "status": "verified",
      "predecessors": [
        "ET-CIRCUIT-QUALIFY-LAYOUT"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "ad96ff9e86254a2439e691a963aa1464bed6aaca",
      "checkpoint_after": "8c639b78a51f9ab82b3fdd1821fcae3d9c73ba38",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-005"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "ET-CIRCUIT-LAB-PARITY",
      "master_id": "ET-CIRCUIT-001",
      "title": "Complete remaining legacy graph and archive compatibility before retiring the original workbench",
      "status": "completed",
      "predecessors": [
        "ET-CIRCUIT-QUALIFY-EDITING"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "8f79422",
      "checkpoint_after": "8c460e4acad23cec83eb7a8481d810dc2f4af836",
      "required_evidence": [
        "L3",
        "L5"
      ],
      "evidence": [
        "L2",
        "L3",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/transient/circuit-archive.ts",
        "src/components/TransmissionNetworkLab.tsx",
        "tests/e2e/transmission-archive-migration.spec.ts"
      ],
      "requirements": [
        "CE-007"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    },
    {
      "id": "final-qualification",
      "master_id": "ET-CIRCUIT-001",
      "title": "Complete visual, property and performance acceptance",
      "status": "completed",
      "predecessors": [
        "ET-CIRCUIT-LAB-PARITY"
      ],
      "dependencies": [],
      "worktree_track": "circuit-engine",
      "checkpoint_before": "8c460e4acad23cec83eb7a8481d810dc2f4af836",
      "checkpoint_after": "8c460e4acad23cec83eb7a8481d810dc2f4af836",
      "required_evidence": [
        "L2",
        "L5"
      ],
      "evidence": [
        "L2",
        "L5"
      ],
      "context_scope": [
        "specs/features/circuit-engine.spec.md",
        "src/circuit",
        "tests/e2e/circuit-editor.spec.ts"
      ],
      "requirements": [
        "CE-008"
      ],
      "capabilities": [],
      "model_class": "HIGH",
      "reasoning_effort": "high",
      "stop_after": false
    }
  ],
  "blockers": [],
  "decisions": [
    "ADR-060"
  ],
  "context_budget": {
    "max_chars": 55000,
    "max_items": 8,
    "max_contours": 3,
    "max_decisions": 2,
    "max_evidence_threads": 4
  },
  "next_action": "Integrated locally into main and verified.",
  "integration": {
    "required": false,
    "reason": ""
  }
}
```

## ET-LAB-022 — Рукописный ввод схемы

- Status: partial
- Entry: ET-LAB-021 changes merged and pushed at b40cd21. Cloudflare Pages deployment fd019a09-89cf-48d0-b599-a4c0e38accd1 succeeded. Production and Pages alias returned the same lab asset. Browser verification confirmed the solver and CSV control on both.
- SPEC: LINE-UX-030..033. Use existing circuit topology, routing, history and solver.
- Acceptance: draw a wire and a marked transmission section, edit real line parameters, verify topology, undo/redo, reload and JSON. Reopen accepted ink, correct the same object and preserve its terminals and history.
- Evidence: 546 Vitest, 62 Chromium in the broad regression run and 35 after review, including all eight handwriting scenarios. Full build, lint, types and context passed.
- Implemented: per-symbol ink with correction, explicit endpoint gesture for physical lines, saved originals and validated placement on the existing network. Norton injection uses the characteristic solver in both exact-front and reactive modes.
- ET-LAB-022-DEVICE | pending | Draw a marked line, a zigzag resistor and two crossing wires with a finger or stylus. Pinch during drawing, then undo and reload. Evidence: recognized kinds, retained endpoints, no new node at the crossing and restored ink. Confirm that the first tap on Insert after a touch stroke commits the mark. The local first-touch fix passes Chromium mobile emulation. Verify it on a physical device when the fix is available there. This closes physical input acceptance.
- ET-LAB-022-CORPUS | pending | Collect independent handwritten samples with agreed ground-truth symbols, terminals and topology. This closes recognition quality acceptance.
- Release: GitHub Pages run 43439931116 skipped deployment after eight root Chromium failures. Local test fixes address display expectations, primary links, remote downloads and scroll timing. After explicit approval, only 627410c was pushed. GitHub Pages run 43445342027 verified and deployed that exact SHA. The RU home and transmission lab returned HTTP 200. Chromium reached calculation-ready state on the published lab with no page errors.
- Eval-first: the new instruction arrived after the initial implementation. The review follow-up reproduced the invalid attachment and routing paths before the final fixes. Mobile and desktop capture pairs are in test-results/handwriting-*.png.
- Review: independent reviewer identified implicit endpoint attachment, JSON size asymmetry and stale geometry. Added explicit node checks, compact bounded JSON and section geometry cleanup. Accepted ink reopens from the archive and updates the linked object, retaining its terminals and same-kind parameters. Review of this slice added import pairing, detach/reattach and relocation identity transfer, protection of existing resistance and no-op history handling.
- ET-LAB-022-RELEASE | done | Authorized fast-forward merge and push of the editor at 65bf64f to origin/main. The local feature branch was deleted after remote reachability checks. No remote feature branch existed.
- Cloudflare Pages: deployment cbb75ea1-fe63-4e56-aeb0-405bb6376350 succeeded for 65bf64f. The production domain, Pages alias and immutable deployment returned the same SHA-256 for the editor bundle as the local education build. Chromium verified a 100 Ω correction on the same wire terminals at 1000 and 390 px with calculation ready and no page errors.
- GitHub Pages: Run 43449003853 passed on attempt 2 and deployed 65bf64f. Attempt 1 failed one R/L/C placement scenario, which passed 8 local repeats. Attempt 2 passed 342 Chromium scenarios with 6 skips and both production smoke checks. The published mirror passed the same wire-correction browser scenario.
- Correction evidence: baseline browser checks failed at the absent archive action. Updated code passed 550 Vitest, 52 Chromium line scenarios, including 12 handwriting scenarios, full build, types and lint. Captures of the correction panel at 390 and 1000 px were visually checked.
- First-touch fix: baseline failed three Chromium runs after drawing. Confirm on touch release within the button, reject drags and suppress the matching native click. Playwright verifies one tap, one history entry, original terminals and reload. Full build, types, lint, 550 Vitest and 54 line Chromium scenarios passed. Commit 1eb722f was fast-forwarded and pushed to main. Production verification is blocked.
- ET-LAB-022-FIRST-TOUCH-RELEASE | done | The two CDP drag gestures now use independent pages, verified hit targets and event delivery before release or return. Windows passed 15 targeted repeats and the 15-scenario handwriting suite. GitHub Pages run 43465471546 passed on attempt 2 for acdbf35 with 345 Chromium scenarios, 6 skips and 2 production smoke scenarios. Both drag checks passed on Linux. The first-touch check failed on attempt 1 and passed on attempt 2.
- ET-LAB-022-CLOUDFLARE | done | Production deployment 32f72925-1deb-48cc-a41c-2ff237db6c52 published acdbf35. The public lab bundle matches the local education build. Chromium verified first-touch placement, terminals, Undo/Redo and reload on electrotutor.org and GitHub Pages. Deleted the local fix branch after both hosted checks. No remote fix branch existed.
- NEXT: independent-handwriting-corpus


## ET-LAB-021 — Трассировка и упрощение лабораторий

- Status: partial
- Entry: Базовая ветвь main 6ec4636. Первый срез LINE-UX-023 — два вывода одиночной концевой нагрузки.
- Evidence: 514 Vitest, 23 Chromium, типизация, lint изменённых файлов, полная сборка и 49 независимых аналитических проверок. Перемещение выше линии, Undo/Redo и сохранение ревизии расчёта проверены в браузере.
- Независимый срез интерфейса: FOUR-UX-001 убирает пояснение, лишний столбец и легенду Фурье, сохраняя базисы и пресеты. LINE-UX-024 закрепляет красный, зелёный и синий для обеих пространственных эпюр. Проверены 12 сценариев Fourier и жестов и отдельный браузерный тест цветов.
- LINE-UX-025: ортогональные пары выводов при перемещении и повороте вложенных элементов нагрузки, источника, линии, последовательных вставок и шунтирующих ветвей. В Chromium подтверждено полное равенство экспортируемой электрической модели после перемещения составной нагрузки и межузловой ветви, Undo и Redo. Автотрассировка локальная. Общий поиск маршрутов с учётом всех уже проложенных проводов ещё отсутствует.
- LINE-UX-026: добавлен текст «MCP — скоро», убраны повторная ссылка на измерения, служебная надпись о фронтах и статус готовности. Следующий срез LINE-UX-029 завершает очистку панели.
- Evidence текущего среза: 516 Vitest, 32 Chromium, 49 независимых аналитических проверок и полная сборка. Физический телефон ожидает проверки ET-LAB-020-TOUCH.
- LINE-UX-027: перемещаемые ветви обходят стационарные и уже рассчитанные проводники в пределах своего уровня. Общий узел допускает касание, но не наложение. Вложенные ветви учитывают шины нагрузки. Маршрутизация последовательная, без глобальной оптимизации между вложенной нагрузкой и внешними проводниками.
- LINE-UX-028: длительность вводится вместе с единицей; полный ряд измерений щупа скачивается в JSON и CSV независимо от окна графика. JSON содержит параметры, начальные условия и единицы, а событийный ряд сохраняет обе стороны скачка.
- Проверки текущего среза: 531 Vitest, 33 Chromium, 49 независимых аналитических проверок, типизация, линтер изменённых файлов и полная сборка. Деплой не выполнялся.
- FR-413..414: общая витрина RU/UK из пяти лабораторий на главной и в каталоге; отдельная пустая доска; учебник и решения в подвале. Проверены 88 сценариев Chromium, включая 28 повторённых после отвязки доски от тем, и 7 сценариев учебной сборки с префиксом. 531 Vitest, типизация, линтер, обе сборки и аудит артефактов прошли.
- LINE-UX-029: индикатор расчёта на «Пуске», настройки масштаба в панели времени, измерения и общий экспорт JSON/CSV/SVG. Убраны история событий, блок описания модели и 3D из основной лаборатории. Эталон коммутации проверяет напряжение и сериализованные данные по обе стороны события, отдельная 3D-демонстрация проверяется прежним тестом.
- Проверки LINE-UX-029: 531 Vitest, 47 Chromium, 49 независимых аналитических проверок, типизация, линтер, проверка контекста и полная сборка.
- SHOW-020: общий числовой формат внедрён. Прошли 532 Vitest, 65 целевых Chromium, типизация, lint и полная сборка. Точность JSON/CSV подтверждена. Физический телефон остаётся ET-LAB-020-TOUCH.
- ET-LAB-021-VISUAL | verified | Приняты 72 эталона Windows Chromium для четырёх схем на ширинах 320, 375, 390, 768, 1280 и 1920 px. Прошли 134 сценария Chromium, в том числе 12 визуальных и переход в трёхфазную лабораторию RU/UK. Повтор на свежей сборке: 26 Chromium. Прошли 532 Vitest, типизация, lint и полная сборка.
- Следующая открытая приёмка на физическом устройстве описана в ET-LAB-020-TOUCH.
- NEXT: physical-device-acceptance

## ET-LAB-020 — Контекстный монтаж и длинный расчёт

- Status: partial
- Entry: 9b6fbe5, проверенный характеристический решатель и редактор.
- SPEC: LINE-UX-019..022.
- Runnable path: очистка → восстановление → установка и вращение → выбор 1 секунды → проверка фронта и измерения.
- Автоматизировано: 511 Vitest, 31 Chromium, сборка, типизация и линтер. Секундный реактивный эталон использует 40 000 шагов и 1 280 032 байта буферов.
- ET-LAB-020-TOUCH | pending | на физическом смартфоне открыть лабораторию, вставить компонент, повернуть его кнопкой, открыть номинал, проверить доступность панели при системной клавиатуре и восстановить подтверждённую очистку. Evidence: жесты и клавиатура работают в обеих ориентациях; готовность расчёта возвращается после Undo. Полный произвольный граф проводов и дополнительные источники остаются в ROADMAP.
- Cloudflare Pages: опубликован c552758, deployment 5307c981-80bb-43d4-a212-b7068fea37d5. На electrotutor.org проверены LC в RU/UK, расчёт линии на 1 с и зум по сохранённым данным, сенсорная вставка, жест двумя пальцами и положение панели при имитации экранной клавиатуры. Проверка на устройстве остаётся ET-LAB-020-TOUCH.
- GitHub Pages: [первый CI](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43415458096) прошёл backend и 318 E2E, 6 пропусков, 6 ошибок в ожиданиях количества карточек и обработке скачанных файлов удалённым Chromium. После исправления ожиданий RU/UK и переноса JSON через saveAs все 6 сценариев прошли локально через удалённое подключение Chromium. [Повторный CI](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43418352086): на f2573a6 прошли 324 root E2E, 6 условных пропусков, 2 сценария production smoke и deploy. На зеркале подтверждены HTTP 200 для LC RU/UK и длинной линии. На неизменяемом адресе Cloudflare оба production smoke прошли. На основном домене CSP блокирует добавляемый Cloudflare скрипт аналитики, из-за этого проверка чистой консоли не прошла.
- NEXT: physical-device-acceptance

## ET-LAB-019 — Стационарные потери в длинной линии

- Status: verified
- SPEC: LINE-LOSS-001..002.
- Runnable path: линия → R′ → отражение и затухание → измерение и восстановление.
- Evidence: 504 теста Vitest, 47 целевых Chromium, сборка учебного артефакта, типы, lint и аудит контекста. Отдельный визуальный тест мини-лабораторий — см. TESTING.
- Следующий физический этап — модель линии с независимыми R′ и G′, аналитическим эталоном дисперсии и проверкой сходимости. Универсальный редактор и синтез LC описаны в ROADMAP.
- NEXT: dispersive-line-reference

## ET-LAB-018 — Геометрические контуры и сравнение базисов

- Status: verified
- SPEC: FOUR-SHAPE-001..003.
- Runnable path: многоугольник → Haar → сравнение ошибок → сглаживание и отмена → сохранение.
- Evidence: эталоны контуров и QR, браузерная правка, восстановление и отказ при зависимом базисе.
- NEXT: complete

## ET-LAB-017 — Трёхфазные фазоры Y/Δ

- Status: verified
- Entry: существующая звезда и эталонные проверки STAR.
- SPEC: THREE-LAB-001..004.
- Runnable path: симметричная звезда → треугольник → независимые фазоры → сохранение.
- Evidence: эталон симметричного Δ, KCL, независимый источник, восстановление и проверка UAB в браузере.
- NEXT: complete

## ET-LAB-016 — Пошаговая круговая диаграмма

- Status: verified
- Entry: работающая круговая диаграмма с историей URL. LC-лаборатория проверена отдельно.
- SPEC: CIR-GUIDE-001..003.
- Runnable path: пример → I₀ и Iк → центр и радиус → траектория тока → восстановление параметров из URL.
- Evidence: эталон центра и радиуса, история URL и шаги прошли в браузере. См. TESTING.
- NEXT: complete

## ET-LAB-015 — Реактивный LC-двухполюсник

- Status: verified
- Entry: daf39f0. Независимый этап, ручная проверка ET-LAB-014 остаётся в своём record.
- SPEC: LC-001..004.
- Runnable path: каталог → последовательный LC → изменение номинала → резонанс, график и эквивалентный импеданс → восстановление.
- Evidence: 5 новых численных тестов и 2 сценария Chromium. Сводка — [TESTING](TESTING.md).
- NEXT: complete

## ET-LAB-014 — Свободная компоновка и промежуточные двухполюсники

- Status: partial
- Entry: b5958d9, feature/lab-first-network. Автоматизированная основа ET-LAB-013 пройдена, физическая приёмка переходит на новый интерфейс.
- SPEC: LINE-UX-015..018.
- Runnable path: оставить конденсатор свободным → выбрать выводы → проверить напряжение и ток → переподключить → восстановить черновик.
- Automated evidence: 490 тестов Vitest, полный build и 23 сценария Chromium с реальным Worker. См. [TESTING](TESTING.md).
- Ограничения: один источник, цепочка распределённых участков с сосредоточенными ветвями. Запланированная коммутация с L/C требует отдельной модели. Несовместимые соединения и несходимость останавливают расчёт.
- ET-LAB-014-TOUCH | pending | открыть `http://192.168.1.103:4325/ru/interactive/transmission-line/` со смартфона в той же сети, перетащить C на пустое место и подвинуть, выбрать «Подключить» и «Шунт к опоре», проверить масштаб двумя пальцами. Открыть поле C и проверить доступность нижней панели при системной клавиатуре в обеих ориентациях. Evidence: модель готова после подключения, проводники сохраняют выводы после перетаскивания, кнопки доступны при клавиатуре. Это закрывает физическую мобильную приёмку.
- NEXT: physical-device-acceptance


## ET-LAB-013 — Единая палитра, УГО и диод

- Status: partial
- Entry: 95ab556, feature/lab-first-network. Автоматизированная основа ET-LAB-012 подтверждена. Физическая мобильная приёмка переносится на обновлённый интерфейс.
- SPEC: LINE-UX-011..014.
- Runnable path: открыть палитру → поставить диод на конец линии → запустить → открыть ВАХ с рабочей точкой.
- Implemented: общая палитра восьми элементов, курсор размещения и повтор, Ctrl+колесо и pinch, автоматический масштаб эпюр, экранная геометрия отдельно от схемы, концевой диод Шокли с рабочей точкой, импорт v2/v3 и сохранение v4.
- Evidence: 485 Vitest PASS / 63 файла, 49 независимых утверждений по балкам, lint, Astro check, WASM fingerprint и учебная/полная сборки PASS. Полный Chromium 310 PASS / 6 ожидаемых live-auth skips. Целевой Chromium 31 PASS. Повтор на финальной учебной сборке после уточнения палитры и добавления сценария R/L/C — 23 PASS. По LAN проверены 320×650, 390×844, 844×390 и 1280×800, а R/L/C и разрыв после удаления подтверждены касаниями Chromium.
- Blockers: ручная проверка физического смартфона. Нелинейный элемент в промежуточной ветви, реактивные элементы вне нагрузки, свободные несвязанные компоненты и произвольное переподключение требуют более общей модели и рабочего поля. Геометрия ограничена коридорами компоновки.
- User action ET-LAB-013-TOUCH / PENDING: открыть `http://192.168.1.103:4325/ru/interactive/transmission-line/` с телефона в той же сети. Проверить касание и drag из палитры, pinch, перенос нагрузки без изменения схемы, ВАХ диода и нижнюю панель при вводе номинала. Повторить в альбомной ориентации и зафиксировать ОС, браузер и результат.
- NEXT: ET-LAB-013-TOUCH


## ET-LAB-012 — Управление опытом и коммутация в конструкторе

- Status: partial
- Entry: c758b0b, feature/lab-first-network. Основа ET-LAB-011 прошла автоматизированную регрессию; оставшаяся ручная проверка применяется к обновлённой панели.
- SPEC: LINE-UX-006..010.
- Scope: управление воспроизведением → контекстная правка → реальные резистивные стыки и ветви → события ключей → приёмка.
- Runnable path: выбрать R на схеме, вставить в стык двух участков, добавить ключ в ветвь, задать событие, запустить и проверить результат до и после коммутации.
- Implemented: раздельные Старт/Пауза/Стоп, скорости ×1/16–×32, параметры на схеме, последовательный R, шунт к опоре, резистивная перемычка, ключи с событиями, локальные черновики и экспорт v3 с импортом v2.
- Evidence: 481 Vitest PASS и 49 независимых проверок балок. Astro check, lint, сборки и WASM fingerprint PASS. Целевой Chromium на финальной учебной сборке — 34 PASS, включая старые физические сценарии и новые транспорт, коммутацию и импорт. Локальная сборка доступна по адресу 192.168.1.103:4324. Измерения в Chromium подтверждают, что панель времени не перекрывает схему при 320×650, 390×844, 844×390 и 1280×800.
- Full Chromium: 307 PASS / 6 ожидаемых live-auth skips. Единственный PWA-тест читает dist/sw.js напрямую. После сборки в штатный dist прошёл отдельным прогоном (1 PASS). Первый прогон с шестью workers дал два браузерных сбоя и обнаружил ошибку сценария повторного импорта. Все три сценария затем прошли.
- Blockers: требуется физическая проверка клавиатуры и касаний. Распределённые ответвления и коммутация с реактивной нагрузкой остаются отдельными расчётными задачами.
- User action ET-LAB-012-TOUCH / PENDING: открыть `http://192.168.1.103:4324/ru/interactive/transmission-line/` на смартфоне в той же сети, перетащить ключ в линию, включить коммутацию, ввести 4 мс и проверить панель с открытой системной клавиатурой. Закрыть клавиатуру, запустить, поставить на паузу, продолжить и остановить. Повторить в альбомной ориентации. Зафиксировать устройство, браузер и результаты действий для LINE-UX-005/006/009.
- NEXT: ET-LAB-012-TOUCH


## ET-LAB-011 — Каталог лабораторий и визуальный конструктор линий

- Status: partial
- Dependencies: ET-UI-010 verified, характеристическое ядро V2 и существующий каталог доступны. Entry: bf4788a. Branch: feature/lab-first-network.
- SPEC: LINE-UX-001..005, FR-412.
- Execution order: аудит и модель операций → визуальное размещение и инспектор → нижняя панель → вход через каталог → регрессия и мобильная приёмка.
- Audit: основной маршрут использует TransmissionNetworkLab, network.worker.ts и ядро network.ts. FDTD остаётся отдельным эталоном. Сериализация V2 хранит модель и расположение. Старые контролы подтверждают LIVE, RLC и импорт.
- Runnable path: главная → каталог → переходные процессы → добавить участок и шунт → изменить нагрузку → запустить опыт → проверить эпюры и восстановление после обновления.
- Implemented: каталог и конструктор RU/UK, размещение по маркерам, правка и история, камера, нижняя панель и локальный черновик. Подробные параметры и FDTD-эталон доступны по прежним маршрутам.
- Evidence: Vitest 476 PASS и 49 независимых проверок балок. Astro check без ошибок и предупреждений, lint и WASM fingerprint PASS. Full Chromium 305 PASS / 6 ожидаемых live-auth skips. Финальная учебная сборка и 24 целевых Chromium-теста PASS. MVP 31 PASS / 2 ожидаемых skips, base-path 5 PASS. На 390×844 и 844×390 просмотрены схема и панель; нижняя панель не перекрывает схему и ссылку на графики.
- Blockers: физический смартфон с системной клавиатурой недоступен в текущей среде.
- User action ET-LAB-011-TOUCH / PENDING: на доверенной локальной сети запустить `pnpm.cmd dev --host <локальный-IP>`, открыть `/ru/interactive/transmission-line/` на телефоне и проверить перетаскивание шунта, поворот, pinch, ввод R с системной клавиатурой, видимость нижней панели и Undo. Зафиксировать модель устройства, ОС, браузер и результат каждого действия. Это закрывает ручную часть LINE-UX-005.
- NEXT: ET-LAB-011-TOUCH


## ET-UI-010 — презентационная главная и три раздела

- Status: verified
- Dependencies: ET-UI-009 verified. Entry: main 1f3b417, clean checkout. Branch: feature/editorial-learning-sections.
- SPEC: editorial-learning-sections.spec.md, FR-407..411.
- Scope: full Astro/MDX RU/UK, существующие React islands, восстановление доступности опубликованного контента, локальный production preview. Отдельные профили разработки и прежнего MVP сохранены.
- Runnable path: главная → решения → разбор → пресет лаборатории → изменённый ток → Back. Второй путь: каталог лабораторий → самостоятельная микролаборатория → изменённый параметр и график.
- Audit: docs/notes/editorial-content-inventory.md. Одна тема в двух локалях, четыре RU-разбора и четыре примера вычислений, 35 RU / 34 UK карточки. 26 моделей получили отдельные адреса на каждый язык.
- Evidence: 472 unit, 13 аналитических случаев / 49 проверок, types и lint PASS. Full 296 E2E PASS / 6 условных пропусков live auth. MVP 31 PASS / 2 условных пропуска, оба отдельно PASS с реальными CSP и обновлением service worker. Full root и /electro-tutor/ собрали 98 локализованных маршрутов. Все 52 выделенные страницы моделей открыты и проверены вводом. Desktop/mobile preview просмотрен.
- Deferred: отсутствующие авторские лекции, UK-тексты четырёх разборов и лаборатории метода контурных токов, отдельное утверждение публичного выпуска.
- Blockers: none.
- User action ET-UI-010-RELEASE / DONE: владелец подтвердил «Да, сливай» и выбрал публикацию учебного сайта RU/UK с ограничениями для аккаунта и служебных страниц. Разрешены обычный push, деплой и удаление слитой временной ветки после проверки.
- Release scope: публичная сборка через pnpm build. 92 локализованных страницы, 14 закрытых префиксов, CSP с хешами встроенных скриптов и разрешением WebAssembly. На локальном HTTP preview проверены 404, гостевой урок, WASM, офлайн и перенос безопасных записей кеша.
- Production evidence: fast-forward и обычный push origin/main на ad44a81. Cloudflare preview b39b2a7f прошёл 2 браузерных сценария. Cloudflare Pages и GitHub Pages опубликовали учебную сборку RU/UK. На каждой площадке 92 адреса sitemap возвращают HTTP 200, 42 варианта закрытых URL возвращают 404, браузерные проверки PWA/WASM прошли. Cloudflare production побайтно совпадает с preview на 14 входах. [GitHub Actions](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43066861103) verify/deploy SUCCESS.
- NEXT: none


## ET-UI-009 — каталоги учебника и светлый интерфейс

- Status: verified
- Dependencies: ET-NAV-006, ET-UI-008 verified. Entry: clean origin/main at 56f9262, feature/content-navigation-light, existing full and MVP source graphs.
- SPEC: content-first-navigation.spec.md, FR-401..406. Scope: Astro navigation, published content discovery, light theme configuration and consumer verification.
- Runnable path: RU/UK home → experiment/calculator → update input → Back → textbook index → material or experiment for that topic; MVP uses only its released RU graph.
- Acceptance: check/lint/unit, full and MVP builds, published URLs, mobile/desktop history and locale paths, stable light in dark OS and with persisted dark preference, functional and visual regression review.
- Evidence: 472 unit, 13 независимых расчётных примеров, check/lint, full/MVP build audit и 31 целевой browser scenario PASS (19 full, 12 MVP). Полные E2E и просмотр старых расхождений описаны в TESTING.
- Temporary implementation: none. Deferred: dark switching reactivation, translation/publication of unreleased content.
- User action ET-UI-009-RELEASE / DONE: владелец ответил «Да, сливай». Merge, push, deploy и удаление временной ветки разрешены после успешных full/MVP проверок; требуется подтверждение точного коммита и опубликованного артефакта.
- Regression evidence: Windows full 289 PASS / 6 conditional skips, MVP 31 PASS / 2 conditional skips; обе дополнительные предпосылки MVP отдельно PASS. 42 просмотренных Windows-эталона, 193 ранее принятых сохранены. Запись параметров круговой диаграммы ограничена её pathname.
- Linux evidence: [43043933366](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43043933366) SUCCESS. 289 full / 31 MVP PASS, 6/2 conditional skips, 472 unit, audit HIGH, three focused Back replays; 25 reviewed Linux PNG. Backend/PostgreSQL PASS в 43041088807.
- Blockers: none.
- User action ET-UI-009-REGRESSION / DONE: 2026-11-11 владелец явно разрешил обновление затронутых E2E и скриншотов с сохранением расчётных проверок и допусков. Evidence: сообщение владельца и FR-406.
- Delivery: fast-forward и обычный push в main. Cloudflare Pages выпустил MVP из 5f3c020, GitHub Pages из 8141d88. Между публикациями уточнили один сценарий E2E. Для verify GitHub Pages закрепили runner Ubuntu 24.04 и добавили резервное зеркало с проверкой подписи пакетов при отказе DNS. Пользовательские артефакты используют один и тот же код.
- Production evidence: [43051174416](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/43051174416) verify/deploy SUCCESS. На каждой площадке прошли 12 браузерных сценариев. На обеих площадках прошли проверки 7 опубликованных RU-страниц, 4 скрытых маршрутов, светлого режима, ресурсов и метаданных. Проверочная ветка verify/et-ui-009-linux удалена после завершения CI и проверки recovery bundle.
- NEXT: none


## ET-UI-008 — язык, статус операций и проверенные visual baselines

- Status: verified
- Lifecycle: reviewed visual/CI repair committed, fast-forward merged, pushed and deployed2026-11-09; exact source d62d27186ef98ca9b3fe4c43676a2fa876c7a451.
- SPEC: language-switcher-ui.spec.md and reference-ui.spec.md FR-391..395; dependencies ET-UI-007 and existing RU/UK shell/workers verified.
- Scope: icon Languages, persisted RU/UK, EN type reservation, actual worker status; public MVP remains RU-only. No math/model/API/hidden-content change.
- Plan: inspect CI → review candidate screenshots → fix real clipping and stale setup → non-update Windows/Linux MVP and full native-Linux E2E → review/docs/commit → approved push/merge/deploy/hosted acceptance.
- Runnable path: full locale menu preserves query/hash/reload; MVP home→textbook→example→editable lab; all controls/readings visible below measured header at six widths and both themes.
- User action UI7-GOLDENS / APPROVED2026-11-09: owner explicitly permits reviewed update of12visual scenarios (4screens each), repeated checks, commit, push, merge and deployment to existing origin/main and electrotutor.pages.dev.48Windows references replaced and48pinned-Linux references added; no new resources, paid plan, secrets, DNS or branch deletion.
- Historical CI42598817335 / FAIL:281PASS/6SKIP/3FAIL; two panorama tests assumed above-fold placement and one accessibility test expected old UA link. Setup/selectors synchronized without dropping timing/swipe/accessibility assertions. Earlier f38b069 Cloudflare00eee74a remained successful; this was not all-CI-green evidence.
- Visual review: all96candidates inspected across320/375/390/768/1280/1920 and light/dark before promotion. Home follows approved ReferenceHome; textbook/examples/formulas retain content; platform font raster/wrapping differences use separate references. No tolerance/retry/skip relaxation.
- Rejected candidates exposed clipped preset caused by old135px scroll and readings below900px at375/390. Setup measures actual journey rail and asserts preset visibility; SVG max-width310px only at mobile<=700px/height<=900px keeps all readings within the original900px bound. SVG topology/formulas and44px controls unchanged.
- Verification: check333files/0errors/0warnings/3existing hints, lint,469unit/61files plus13analytical cases/49assertions PASS;398paired locale keys; context/hygiene/workflow contract PASS; full41page/194artifact and MVP9page/96artifact builds PASS.
- Normal MVP replay (no snapshot update): Windows30PASS/2existing skips/2.0m; pinnedNoble Linux30PASS/2existing skips/2.2m. All12visual scenarios PASS on both platforms,96images have exact viewport dimensions.
- Full native-Linux root replay:284PASS/6existing live-phase skips/10.6m, all290scenarios retained and all3prior CI failures PASS. Both Node test host and browser Linux; exact CI browser image dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e, locked Playwright1.62.1, source read-only. Earlier mixed Windows-host/Linux-browser attempt stopped for incorrectly activated Windows-only snapshot branches; its72missing-reference artifacts were discarded, not accepted or counted PASS.
- Dependency audit HIGH gate exit0:4LOW/6MODERATE, lockfile unchanged. Reviewer: no code/test-contract blockers after mobile fix. No additional dependencies or mathematical goldens changed.
- Completion sync: STAGES/ROADMAP/TESTING/DESIGN/affected SPEC updated; README/ARCHITECTURE/DECISIONS/SECURITY/API/DATA_MODEL/DEPENDENCIES/TRACEABILITY/project-context checked consistent. No LEARNING_LOG churn.
- Temporary implementation: none. Deferred: EN course publication and physical-device/Narrator acceptance; not represented by emulated browser evidence.
- CI follow-up42604669717 / FAIL: root284PASS/6existing skips and all12MVP visual scenarios PASS; MVP28PASS/2SKIP/2FAIL because reference-home tests used absolute /ru/ instead of existing E2E_BASE_PATH. Only both entry URLs corrected; every CTA/theme/no-JS assertion preserved. Fresh production /electro-tutor/ build and full MVP30PASS/2existing skips/1.7m, scoped ESLint and diff checks PASS. Cloudflare production a4f9070b/sourcecf1a017 and primary hosted30PASS/2skips/2.2m verified; primary/immutable HTML identical and CSP present. Follow-up CI required before final closure.
- Final CI: [42607491526](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/42607491526) verify/deploy SUCCESS on d62d271. Backend API/PostgreSQL/audit gates PASS;469unit/61files, types/lint, root284PASS/6existing skips/9.4m, production /electro-tutor/ MVP30PASS/2existing skips/1.4m, builds and audit HIGH PASS. Previous failures remain historical, no skipped gate or relaxed assertion.
- Production: Cloudflare082fc435-c217-4031-ae28-3085d8761c6a/source d62d271, https://electrotutor.pages.dev/ and immutable https://082fc435.electrotutor.pages.dev/ return identical home HTML200 with CSP. Complete primary-domain MVP30PASS/2existing conditional skips/2.7m, including all12visual cases, route visibility, actual lab edits, navigation, theme and no-JS paths.
- Delivery/cleanup: cf1a017 baseline/UI repair and d62d271 base-path test repair pushed to origin feature/main with fast-forward only. Documentation-only terminal receipt uses [skip ci]; tested/deployed source remains d62d271. Owned preview and labelled ephemeral browser container stopped/removed; auto-remove native-Linux runner gone. Existing MathMorph backend containers preserved. Feature branch retained; no deletion authorized by this task.
- NEXT: none
- Next action: none for approved visual/CI repair and delivery. EN course publication and physical-device/Narrator acceptance remain outside this scoped completion.

## ET-UI-007 — интерфейс по HTML-макету

- Status: verified
- Scope: FR-391..395, specs/features/reference-ui.spec.md. STANDARD production frontend, root checkout, feature/reference-ui; root owns source/docs/verification.
- Dependencies/DAG: ET-NAV-006 verified, clean main 7d1a6e2, existing dependencies and static MVP/full routes. No future backend prerequisite.
- Entry: electrotutor-ui.zip SHA256 011e428faf969b817e1cd3de2aca7595801d90ef7620ae1c7cb5de70acf19cca; единственный index.html inspected as reference data.
- Plan: shared localized home → shared shell styles → existing unit/type/lint/build checks → live browser journey and responsive review → documentation/commit.
- Runnable slice: home CTA → existing textbook → examples → laboratory parameter edit, theme and contents after client navigation.
- PASS/DoD: FR-395 checks, no route widening, protected math sources unchanged, keyboard/mobile usable.
- Temporary implementation: none. Existing full showcase remains accessible below new home; existing solvers reused.
- Blockers: none for local reference UI acceptance; prior shell goldens/remote CI/device gates are not claimed complete.
- Deferred: other course content, provider/media work and old Linux golden/manual acceptance remain separate.
- User action UI7-INTEGRATION / DONE: 2026-11-09 explicit «выполняй мердж пуш удаление деплой» authorizes fast-forward integration, normal push to origin/main, deletion of feature/reference-ui after reachability verification and deployment to existing electrotutor production. Clean2679645, main/origin7d1a6e2, single root checkout confirmed; no unrelated cleanup or new resources.
- Evidence: docs/evidence/reference-ui-acceptance.json. 469 unit; Astro329/0errors/0warnings/3existing hints; lint; full41pages/193files and MVP96files/7indexed audit PASS; full34E2E PASS, MVP18PASS/2existing conditional skips;48page/width/theme bounds0overflow/0pageerrors, representative PNG reviewed. Protected math/model/MDX/engineering/WASM and dependencies unchanged.
- Completion sync: README/STAGES/ROADMAP/ARCHITECTURE/DESIGN/TESTING/TRACEABILITY/project-context/ledger/SPEC updated. DECISIONS/SECURITY/API/DATA_MODEL/DEPENDENCIES/LEARNING_LOG reviewed unchanged; FALLBACKS/CHANGELOG/DEV_LOG absent. No new architecture/security/backend decision; prior UI palette supersession explicit in feature SPEC.
- User action UI7-GOLDENS / DONE2026-11-09: subsequent explicit approval and reviewed Windows/Linux references completed in ET-UI-008; final green CI and hosted visual evidence recorded there.
- User action UI7-NARRATOR / NOT_RUN: review new home CTA and mobile two-row header with Narrator/keyboard; expected focus/announcement result. Existing historical UA-19 retained, not reused for changed controls.
- NEXT: none
- Delivery: owner-authorized ff merge7d1a6e2→2f8b31e and normal origin/main push verified by ls-remote. feature/reference-ui safely deleted after reachability check; remote feature branch absent. Cloudflare Git production5cb7a463-94b8-407f-902a-e15c7d81c6da/source2f8b31e published and primary domain verified. Hosted18PASS/2conditional skips; independent7public200/5hidden404/CSP4presets/theme/mobile PASS,0pageerrors/0CSPviolations. docs/evidence/reference-ui-delivery.json owns evidence.
- CI follow-up UI7-CI / SUPERSEDED: historical42532651358 observation is replaced by ET-UI-008 exact-source successful CI42607491526; prior failed runs are not reclassified.
- Next action: no pending merge/push/deployment of implementation. Documentation receipt transported with [skip ci] to avoid a second release; physical/golden follow-ups remain scoped.

## ET-NAV-006 — RUN6: единая навигация и RTC diagnosis

- Status: verified
- Checkpoint: `1f591a240ea8fa57fd988aaab551f91387dbff34`
- Lifecycle/evidence: RUN6 source 1f591a240ea8fa57fd988aaab551f91387dbff34 owner-accepted and fast-forward merged into local main on 2026-11-05 (328c812→1f591a2, including prior docs-only9ac07fd);373f5b8 ancestor confirmed. This separate documentation checkpoint records authorized Git delivery; exact final transport refs/cleanup evidence belong to Git and outputs/ElectroTutor_run6_merge_2026-11-05.md. Owner subsequently authorized public deployment2026-11-05: fresh source3267948 manually published to existing electrotutor/main; canonical7ba2859a-4b84-449a-8550-ba7084b9f3ef success confirmed by API and primary HTTP/browser evidence. Published runtime source remains3267948. Owner subsequently accepted deployment receipt45becd0 for normal Git delivery; local main fast-forward3267948→45becd0 verified. Current documentation transport refs/cleanup evidence belong to Git and outputs/ElectroTutor_run6_deploy_merge_2026-11-05.md; this does not change the published artifact.
- Goal/scope: unified-navigation-run6.spec.md FR-381..387,RTC-601..603. Full20topic definitions/31tools/long-line variant accessible through one derived shared contents, independent3main-menu stages, preserved public7route policy; independent evidence-backed two-session RTC diagnosis. No textbook/solver/backend rewrite/global redesign.
- Dependencies/DAG: ET-MVP-004 verified and ET-MESH-003D verified/accepted source in current history; existing full-source/manifest/catalogue and installed Node22.23.1/pnpm11.23.0/Chromium. Partial ET-REL-005 manual/CI gates are retained caveats, not falsely completed prerequisites; new navigation has independent local consumer path.
- Entry evidence: clean9ac07fd, main/origin328c812; baseline full before UI built fresh41pages/40localized/190files with auditsPASS at work/run6/video/baseline-full. Source inventory20topics, only mesh RU/UK published,31tools source, examples/lab RU-only. LegacyJitsi guest path independent of media-less protected LessonSession; public MVP intentionally excludes both.
- Plan/owners: root owns SPEC/ADR/stage/derived registry/tests and integration; frontend writer owns shared contents/menu/layout/rail UI after frozen interface. Architect owns read-only video evidence in work/run6/video, no product writes. Reviewers read-only. Exact ownership/no overlapping writers; one coherent root checkout, no new worktrees.
- Runnable vertical slice/E2E: full any page→contents→search/filter/stage→existing topic/tool/lab→edit→Back/Forward; MVP3menu links/mesh context/contents→only allowed3URLs. Runtime correctness through actual local builds/browser, not source presence. RTC: two independent contexts create/copy/open same invite→actual provider conference/RTP or precise auth/network blocker.
- PASS/DoD: unit/check/lint/fresh2builds and public guards; all-discovered-route/31tool/no-deadlink/navigation/keyboard/touch/history/negative cases; six widths×2themes reviewed images; existing math hashes/regressions; independent reviewers and finaldiff; successful gates before navigation commit. Known old Linux baseline CI gap reported separately, no goldens autoapproval. RTC may conclude proven refusal +concrete options/plan, hardware unavailable NOT_RUN.
- Security/fallback: server-filter public components before HTML/client serialization, no hidden/classroom routes or backend secrets in MVP. Native noJS links, unavailable components non-links/explained lab fallback, storage failures not blockers. Public Jitsi not authentication; no new paid resource/server/JWT/DNS/OIDC change, no provider-login bypass.
- Temporary implementation: none; existing data owners and actual source routes reused. Missing19textbooks/examples remain honestly unavailable; no empty pages.
- User action NAV6-INTEGRATION / DONE: owner-approved clean ff main328c812→1f591a2→3267948, normal origin/main push independently ls-remote verified; local feat/electrotutor-navigation-run6 safely deleted only after reachability/remote checks, remote ref absent. Other branches/worktree/materials retained. Both automatic deployment pipelines were skipped for that Git transport; no fresh CI PASS. Separate manual deployment now authorized and verified below. Historical authorization: explicit owner instruction 2026-11-05 authorizes merge, normal push to https://github.com/ZabulaAleksey/electro-tutor.git refs/heads/main, and deletion of the temporary RUN6 branch only after delivery. Local source fast-forward1f591a2 is verified; force push/history rewrite/cloud changes are excluded. [skip ci] is required for this transport because current main workflow and Cloudflare Git integration otherwise publish automatically. At integration preflight Cloudflare API returned401; deployment follow-up restored access via official Wrangler refresh, with no auth bypass or config/DNS mutation. Exact remote SHA, safe cleanup and actual auto-run observation are in final Git/task receipt; previous CI41938077938 FAILURE remains unresolved.
- User action NAV6-DEPLOY-DOCS / OWNER_APPROVED_FINALIZATION: explicit owner instruction «слияние, пуш, удаление»2026-11-05 authorizes receipt45becd0 fast-forward merge, normal push to https://github.com/ZabulaAleksey/electro-tutor.git refs/heads/main and deletion only of local docs/run6-production-deployment after confirmed remote reachability. Clean main/origin3267948 and temporary remote-ref absence verified before operation; local merge45becd0 confirmed. This final status checkpoint retains [skip ci] to suppress both automatic deployment pipelines. Exact final execution evidence is Git/outputs/ElectroTutor_run6_deploy_merge_2026-11-05.md; no force/rebase/reset, no file/cache deletion or broader branch cleanup.
- User action NAV6-DEPLOY / DONE: explicit owner instruction «делаем деплой»2026-11-05. Wrangler4.157.0 officially refreshed existing OAuth; API read access restored, no new scopes/login bypass. Fresh96file artifact from clean main3267948, no old dist; build/guards and7/7local browser PASS. Existing Pages electrotutor production/main deployment7ba2859a-4b84-449a-8550-ba7084b9f3ef canonical success;7public200/24hidden404/92served SHA exact,8/8hosted accepted cases,16independent math sets, real same-origin oldSW113fc61d1eccad90566c→689264eb202cf73d6b12 with old-cache removal/unrelated storage preserved/offline lab+hidden404 PASS.16captures,4representative frames visually viewed; hosted6width×2theme geometry PASS. Prior safe-MVP41affa11 retained for rollback. Config/fail_open=false/DNS/tariff/backend/source unchanged; no new push/CI. docs/evidence/run6-production-deployment.json and task outputs own evidence.
- User action RTC6-HOST / PENDING: teacher authenticates through official Jitsi first-participant flow, then repeat same-room student guest test. Expected evidence: two conferenceJoined/participant events, growing inbound/outbound RTP in both sessions; unlocks actual media acceptance, not navigation. No provider login or cloud/secret change performed by agent.
- User action NAV6-NARRATOR / NOT_RUN: after owner chooses to accept new menu/contents, Windows Narrator+keyboard check only affected new controls: open global contents→search Cyrillic→select stage→announce current/unavailable→Escape returns focus without scroll loss. Expected browser/device/version and speech/focus result; old UA-19 remains historical PASS, not reused for changed controls.
- User action RTC6-MEDIA / NOT_RUN: after RTC6-HOST passes, real two-device camera/microphone bidirectional test and screen share; expected remote media plus selected ICE pair/RTP evidence. No physical media substituted by synthetic prejoin.
- User action RTC6-PROVIDER / DEFERRED: before controlled embedding choose external-hosted link/JaaS/self-hosting; expected provider/MAU/budget/trust decision and separate approved SPEC. Official Jitsi now directs embedding to JaaS;25MAU Developer free/300MAU Basic$99month public price only, no subscription created. This is future media scope, not a navigation prerequisite.
- Documentation scope: README and project context describe the current RU MVP,
  full local mode, and publication runbook. Public read-only probe: /ru/ 200,
  /uk/ 404. This probe covers HTTP route exposure.
- Blockers: no open mandatory local navigation gate. Actual AV remains FAIL/BLOCKED_BY_PROVIDER_AUTH, protected media NOT_IMPLEMENTED, physical media/Narrator NOT_RUN. Pre-existing Linux CI48golden gap remains; GitHub CI/deploy not rerun. Additional dev CLI warning Invalid hook call is PARTIAL, not hidden by three HTTP200/51entry checks.
- Deferred: textbook content expansion, new labs/solvers, public index expansion, controlled media/backend/tenant/TURN deployment, global redesign, STUD/DEV migration.
- Evidence: docs/evidence/run6-navigation-acceptance.json and run6-video-diagnosis.json;469unit/61files, Astro328files0errors0warnings3oldhints,lint,full193files41pages40localized/MVP96files7indexed guards PASS; full275PASS/6oldauthskips, MVP30/30PASS with enforcedCSP/reallegacyPWAupgrade/reviewed48shellPNG. Independent nodal16cases72exactzero;42protected math/engineering/MDX/WASM sources+534engineeringPNG byte-unchanged. Source/asset/route/visual evidence in current task outputs/ElectroTutor_run6. No source/data deletion, generated dist/.astro/cache listed, no cleanup.
- NEXT: none
- Next action: RUN6 navigation integrated/pushed and public MVP manually deployed; no pending integration/cleanup for the deleted implementation branch. Preserve remaining provider/dev-SSR/manual/legal/Linux-CI follow-ups as separate scoped work. Deployment documentation45becd0 accepted and fast-forward integrated locally; owner-authorized normal origin/main transport and temporary-ref cleanup are handled at this finalization checkpoint with [skip ci]. No new functional work, cloud settings change or repeat deployment; final Git receipt records actual remote SHA/cleanup. Remaining scoped follow-ups above are unchanged.

- Follow-up DEV6-SSR / DEFERRED (non-blocking for static MVP): reproduce legacy React dev SSR warning on a verified baseline, inspect renderer/duplicate-React diagnosis and actual client hydration; expected precise cause and regression evidence before any dependency update. CLI3routes200/51entries is only HTTP/navigation evidence, not clean SSR PASS. No kernel or dependency patch attempted.
- Completion sync: README/STAGES/ROADMAP/ARCHITECTURE/DECISIONS/DESIGN/SECURITY/TESTING/project-context/SPEC/TRACEABILITY/ledger/evidence updated for changed facts. API/DATA_MODEL/DEPENDENCIES/FALLBACKS/CONTENT_GUIDE/LEARNING_LOG and backend/infra inspected for scope, preserved without edits; old accepted manual UA-19 not reused for new controls.

## ET-REL-005 — RUN5: автономный Web/PWA release preparation

- Status: partial
- Lifecycle/evidence: RUN5 and REL5-CACHE verified runtime; cache fix a56fcaa clean ff merged local main and pushed origin/main under explicit owner instruction2026-11-05. Local fix branch safely deleted, older RUN branches/root checkout preserved. Historical cache-fix runtime was automated sourcea56fcaa/canonical41affa11; current production is owner-authorized RUN6 source3267948/canonical7ba2859a-4b84-449a-8550-ba7084b9f3ef, verified in selected ET-NAV-006. Overall status remains partial for prior manual/legal gates. Final docs-only integration receipt does not change runtime code.
- Scope/contract: FR-361..373, ADR-048..050. One RU mesh module, public7pages/three-stage journey/four physical schemes; full UK/19other themes/31tools remain source-only. No kernel/backend/OIDC/PostgreSQL changes, no DNS/domain registration/paid-plan activation/push.
- Dependencies/DAG: ET-MVP-004 verified/owner accepted/ff merged d3da1b9; RUN5 source373f5b8 locally verified and merged by explicit owner instruction. Installed Node22.23.1/pnpm11.23.0/Chromium/Wrangler4.157.0 and official OAuth available; static public solver has no live service prerequisite.
- Entry/plan: main373f5b8 clean; primary /uk/ and /ru/interactive/ raw200HIT versus unique alias404 reproduced. SPEC/ADR→bounded delivery correction→unit/types/lint/fresh build→read-only review→real preview→clean commit→same artifact production→raw primary+accepted browser+CSP/SEO/math/PWA→doc/diff gate. Slice complete; no future infrastructure dependency.
- Architecture/security: tiny generated Pages handler returns existing404HTML directly, HEAD empty, copied first global security-header block +no-store/noindex/marker; no ASSETS/network/input reflection/secrets. Four exact non-overlapping invocation rules cover only retired roots/subtrees;7public pages/assets bypass handler and stay static. Exact source/config/target-absence guards, no arbitrary Worker/maps/functions folders. No product dependency change.
- Concrete E2E/PASS (direct-upload50a3aa3a; current automated41affa11 receives additional24HTTP+3browser confirmation below): anonymous network GET/HEAD hidden URLs (no browserSW)→Pages handler→literal404/no Location/no old body; public book→examples→4scheme lab/edit→correct results and history; current installed browser worker→new fingerprint→old-key removal→offline lab+hidden404. Primary24HTTP+6bot/browserUA/oldETag checks,35historic404,90served SHA/7public200/security/SEO PASS; accepted primary13/13PASS and preview13/13PASS without retries. Hosted independent16math cases/0unexpectedCSP/errors/external requests/invalid-input/theme/current offline PASS. No physical-device/native-install equivalence claimed.
- Local evidence:458unit/59files,6new executable edge tests+3static policy tests, Astro318files0errors0warnings3oldhints, lint/fresh94file release/strict guards PASS. Relative to RUN5, only _redirects/_headers/_routes/_worker/browserSW fingerprint differ;89old files identical. Source/goldens/full routes/locks untouched.24captured images;4representative404/lab/example images visually viewed390/1280light/dark; previous six-width material unchanged. Receipts work/cache404_final; actual update proof work/cache404_edge/pwa-update.json; final report outputs/ElectroTutor_cache404_2026-11-05.md.
- Failed/degraded evidence retained: initial static0d1227a/59cfcc84 previewPASS but primary12PASS1FAIL/raw200+304(VIE), not accepted fix. Initial six-pattern edge config rejected as overlapping before deployment; reconciled then corrected4patterns. First custom PWA harness asserted before activation; final harness waits actual old-key removal and passes. Existing unpatched dependency audit4LOW/6MODERATE remains previous evidence, not rerun/patched here. Actual subscription GET403, no scope/billing upgrade.
- Fallback/availability/recovery: no retry on unknown side effect; canonical/source/config reconciled after publication. Keep prior8e96428d,59cfcc84 and current checked artifacts; restoring a no-handler artifact reopens known route blocker. Owner-approved fail-closed returns provider error rather than old static assets on free-quota exhaustion (shared100000/day); may affect project availability, not deliberately exhausted. Do not silently restore fail-open while handler required; no unsupported CDN/build-cache purge.
- User action REL5-DOMAIN / DONE: owner chose electrotutor.pages.dev; custom domain later, no DNS needed now.
- User action REL5-CF-ACCESS / DONE: explicit pinned tooling installation+official OAuth login, owner completed grant; CLI/GET verified. Credentials remain official runtime only, no values in evidence. Existing project electrotutor/main and settings confirmed, other old project untouched.
- User action REL5-INTEGRATION / DONE: explicit owner clean ff main d3da1b9→373f5b8; release/source branches retained. Documentation receipt/fix branches have no merge permission.
- User action REL5-PUBLISH / DONE: initial accepted RUN5 deployment8e96428d/source373f5b8 explicitly approved; subsequent cache repair explicitly authorized by owner latest request. Final 50a3aa3a-8dc9-44d2-826b-38b66933d1f9 sourceee38ba3d29a38c8ef32da6054628020a3d662dfa success/canonical confirmed,94file fresh artifact SHA preserved. No push/DNS/build/source/env/branch-control mutation.
- User action REL5-FAIL-CLOSED / DONE: automatic review initially rejected project-wide availability change; no PATCH executed then. Owner explicitly replied «Разрешаю fail-closed для preview и production». Subsequent approved PATCH/GET changed only two fail_open booleans true→false, all other selected configuration identical. Receipt work/cache404_edge/fail-mode.json; rejection fully resolved, no authorization workaround.
- User action REL5-CACHE / DONE: final primary24HTTP/13accepted browser/16math/35historic +actual PWA upgrade evidence above closes strict404 defect for two named trees. No claim of global cache purge or proof from all worldwide PoPs.
- User action REL5-DEVICE / NOT_RUN: remaining release/manual checklist Windows/Android/iOS as available/native PWA install/update/touch/Narrator; expected real device/browser/version receipt. This network-delivery-only fix does not add focus/UI behavior or require redoing unrelated historical UA-19.
- User action REL5-LEGAL / PENDING: owner confirms applicable operator/jurisdiction/material rights/hosting logging policy or justified not-applicable; no invented legal data.
- User action REL5-FIX-INTEGRATION / DONE: Owner explicit merge/push/delete instruction2026-11-05 completed: clean ff main373f5b8→a56fcaa, normal origin/main48c3fef→a56fcaa confirmed by ls-remote; local fix/mvp-cdn-hidden-routes safely deleted after reachability/push checks, no remote fix branch existed. Other source branches/root worktree/files preserved. Push-triggered Cloudflare Git deployment41affa11/sourcea56fcaa success/canonical confirmed, no manual redeploy/settings/DNS/kernel change. Post-push primary24HTTP hidden404/7public200/CSP/SEO and3accepted browser lab/route/PWA scenarios PASS. Strict byte comparator found3different files:87exact served matches; two HTML only Astro uid differ and sw.js only VERSION, exact normalized equality proved. No numerical/content/client-JS/CSS difference. Previous detailed458unit/16math evidence retained, not unnecessarily rerun. GitHub Actions41938077938 completed FAILURE on2026-11-05T00:15:16Z: production MVP visual suite lacks48Linux golden files,12visual scenarios FAIL;13functional PASS/2conditional skips. Backend gates/types/lint/458unit/full root264PASS+6skips and both builds PASS. GitHub Pages deploy skipped; independent Cloudflare41affa11 remains live. Documentation-only328c812 [skip ci] receipt was merged/pushed, transient branches removed and remote SHA verified; this CI-status audit is separate/local, no new push/deploy.
- External execution REL5-AUTO-CI / FAILURE: terminal run41938077938/sourcea56fcaa completed2026-11-05T00:15:16Z, verify failed in pnpm test:e2e:production-smoke solely on48missing *-chromium-linux.png goldens;12visual failures/13functional passes/2conditional skips. Existing48MVP goldens are Windows-named, Linux0. Root264PASS+6skips, unit458, types/lint/full+MVP builds/backend gates PASS. GitHub deploy skipped, workflow artifacts0; Linux actual images no longer available from this run. Audit log/evidence in outputs/ElectroTutor_ci_41938077938_2026-11-05.md. No rerun/config/test changes.
- User action REL5-CI-LINUX / PENDING: proposed next implementation only, not started by status-check request. Preserve accepted Windows tests/goldens; use existing pinned Linux/Chromium profile to obtain48candidate MVP images (6width×2theme×4screen), save failure report/trace/screenshots with always-upload, inspect images then add reviewed Linux goldens and rerun unchanged full CI. Expected48reviewed Linux files +full green run; never skip/auto-approve visual assertions. Unlocks green required CI/GitHub Pages gate.
- Blockers: required GitHub CI visual gate FAIL (48Linux baselines missing); REL5-CACHE none. Whole release caveats: physical/native/manual legal acceptance and unpatched prior low/moderate audit. Account-wide billing/retention controls not certified by existing read scope.
- Deferred: broader theme/tool/backend releases, own domain, native Android/iOS, DEV/STUD migration, unrelated audit remediation.
- NEXT: none
- Next action: proposed bounded Linux visual-baseline/CI-artifact fix, then green full CI; separate authorization/implementation. Current status audit complete, merge/push/deletion previously completed, no code changes or workflow rerun in audit. Prior manual/legal gates retained.

## ET-MVP-004 — RUN4: единый публичный RU MVP

- Status: verified
- Lifecycle: completed locally/validated on feat/electrotutor-mvp-run4, existing root checkout; one owner-authorized atomic checkpoint contains this record, exact SHA in Git log/external receipt. RUN4 owner-accepted and ff merged local main d3da1b9; sourcebranch retained. No push/deploy.
- Goal/scope: public-mvp-run4 FR-341..353 + scoped FR-001/002/ADR-047;7indexable RU pages, one complete3URL mesh journey, honest public404/SEO/PWA upgrade; all full source retained.
- Dependencies/DAG: ET-MESH-003D verified/accepted/ff merged local main56e314c; sourcebranch retained. No backend/future component prerequisite for static consumer path.
- Entry/plan: clean expected refs and installed pinned deps; contract/architecture→build boundary→journey/context→unit/audits/browser→actual6×2visual review→normal+MVP regression→doc/diff gate→atomic checkpoint. All local slices complete.
- Runnable vertical slice/E2E: actual built home→book→examples→lab by buttons/actual mouse/touch/trackpad/keyboard, native vertical scroll and Back/Forward; edit/reset/restore same example; no-JS/read-only fallback; oldSW upgrade and previously-unvisited offline lab; hidden route404/noindex.
- Evidence/PASS:446unit/56files; Astro0errors0warnings3oldhints/lint; full41pages40locales190files and MVP10HTML7indexed90files including129+129formulas; production25/25+base12/12; full264PASS/6oldauth skips/0flaky/0retry; independent16exact nodal sets/72zero residuals;134viewed captures/48newgoldens,534oldPNG+197protected SHA unchanged, no tracked source deleted; own preview/dev stopped. TESTING/current chat outputs/ElectroTutor_run4_evidence.zip.
- Interfaces/invariants: supported Astro srcDir/publicDir graph; official ClientRouter/native links; one active stage DOM; pure math/MDX/SVG/backend/OIDC/DB/Cloudflare/deps unchanged. PUBLIC_MVP_MODE is not IAM. Lab context optional/defaultfalse; source and full functionality retained.
- Fallback: SSR/native links work without JS, explicit disabled live controls; unavailable/corrupt storage never blocks solver; hidden404 online/offline after successful newSW activation; first install/update needs network; already-open legacy tabs not forcibly closed. No mock-as-live/backend/manual claims.
- Review/observations: bounded2read-only review cycles/securityGO, actual runtime diagnostics fixed noscript/prehydration tabindex/native DnD/devicon defects. Initial full Micro timeout followed unchanged3/3PASS and final fullPASS; isolated context closures retained without invented cause. No accepted test/golden weakened; invalid-example restore and auxiliary title overflow have concrete before/after browser evidence.
- User action MESH-3D-MERGE / DONE: explicit Merge RUN3D+RUN4, clean ff-only main99b9302→56e314c; sourcebranch retained; no push/deploy.
- User action MVP4-CONTACT / DONE: owner explicitly approved aleksey.zabula@gmail.com and https://t.me/toemath; actual contact page/link assertions PASS.
- User action MVP4-COMMIT / DONE_AT_ATOMIC_CHECKPOINT: one atomic RUN4 commit after mandatory local checks/doc/diff gate; exact SHA in Git log/receipt.
- User action MVP4-INTEGRATION / DONE: owner Merge RUN4+RUN5 authorization; clean ff-only main56e314c→d3da1b9, sourcebranch retained, no push/deploy. Receipt work/run5/merge-receipt.json.
- User action MVP4-DEVICE-A11Y / NOT_RUN_RELEASE_GATE: before public release, test real iOS/Android/native install/offline and Narrator route announcement/focus/keyboard/back-forward at supported widths/themes, including short viewport/keyboard. Record browser/OS, steps/screenshots/results; old manual acceptance not reused. Unlocks platform/manual release acceptance; not a missing local static primary path.
- User action MVP4-HOSTED / CONDITIONAL_NOT_RUN: after separate publication authorization, verify actual HTTPS direct URLs/hidden404/noindex/headers/sitemap/robots/manifest/update/offline on chosen host. Expected public smoke receipt and operator configuration evidence; no deployment authorized in RUN4.
- User action MVP4-LEGAL / OWNER_REVIEW_PENDING: before publication confirm applicability of operator/jurisdiction/material rights/hosting log retention; provide approved wording or recorded not-applicable rationale, without secret values. Contact/privacy app behavior is implemented, legal compliance is not invented.
- Completion sync: README/STAGES/ROADMAP/system+feature SPEC/ARCHITECTURE/DECISIONS/DESIGN/SECURITY/TESTING/TRACEABILITY/ledger updated. API/DATA_MODEL/DEPENDENCIES checked unchanged; no competing changelog/dev-log/fallback owner created. LEARNING_LOG checked unchanged; diagnostic evidence belongs to TESTING.
- Blockers: none for locally verified RUN4; public release still depends on explicit integration/publication authorization and release gates above.
- Deferred: other19topics/UK/tools remain full/dev only; no automatic publication or content rewrite. Physical/Narrator/hosted/legal gates are explicit, no silent tails.
- NEXT: none
- Next action: RUN4 integrated; selected ET-REL-005 owns release preparation. Preserve sourcebranch and artifacts.

## ET-MESH-003D — RUN3D: интерактивная mesh лаборатория

- Status: verified
- Lifecycle: completed locally on feat/mesh-lesson-run3d, source/main99b9302, existing root checkout. One authorized atomic RUN3D checkpoint contains this record, exact SHA in Git log/external receipt. RUN3D56e314c subsequently owner-accepted and ff merged local main; sourcebranch retained. No push/deploy.
- Goal/scope: FR-331..339 mesh-laboratory SPEC;4exact RUN3C presets, live R/E/J edits, actual matrix/branches/voltages/signed power/residuals. STANDARD production frontend/model slice.
- Dependencies/DAG: ET-MESH-003C verified/owner accepted/ff merged main99b9302; no future RUN4 or backend prerequisite.
- Entry: clean refs, installed pinned deps, shared symbols/Formula/islands available. No generic electrical solver found; beam private stiffness solver cannot solve mixed-unit supermesh/classify rank. New bounded numerical module necessary; accepted kernels remain unchanged.
- Plan: contract→independent reference→model/SVG/compact editor→unit/browser errors/edits→6width×2theme review→full checks→sync→atomic commit.
- Runnable vertical slice/E2E: real textbook→examples→lab/preset→edit resistor/source→immediate physical currents/voltage/matrix/power→flip source→invalid/singular/inconsistent states→reset→return same worked example.
- PASS/DoD:4defaults+modified exact nodal references, meaningful error states without stale results, all mandatory checks PASS,6width×2theme actual images reviewed and editor/figure/live readings simultaneously visible, old390PNG and protected sources unchanged.
- Interfaces: no accepted numerical kernel/backend/DB/auth/infra/deps/UK changes; exact lab-only RU route exception, old catalogue preserved. No mock solver/dummy playback/new design system.
- Temporary/fallback: none; invalid/rank/numerical failure is explicit, no arbitrary currents. No-JS baseline readable with disabled controls. Linux raster/physical devices/fullNarrator NOT_RUN unless evidence available.
- Evidence: clean ff main/source99b9302;439unit/54files,273-file Astro0errors0warnings3oldhints, lint/build41pages40locale190artifacts395keys PASS; fullChromium264PASS/6oldlive-auth skips.16independent exact nodal sets/72zero residuals, runtime Ohm/nodal/KVL/power checks, browser edits/errors/touch/keyboard/noJS PASS.48visual states minfont13.9CSSpx maxworkbench788px,144reviewed newPNG;390oldPNG/193protected hashes unchanged. Read-only review findings addressed and rereviewed; TESTING/current chat outputs/ElectroTutor_run3d_evidence.zip.
- User action MESH-3C-MERGE / DONE: explicit user ff authorization, main186013d→99b9302 PASS, sourcebranch retained; no push/deploy.
- User action MESH-3D-COMMIT / DONE_AT_ATOMIC_CHECKPOINT: one atomic commit after mandatory checks passed; exact SHA in Git log/receipt.
- User action MESH-3D-INTEGRATION / DONE: explicit owner Merge RUN3D+RUN4 request; clean ff-only main99b9302→56e314c PASS, branch retained; no push/deploy.
- Blockers: none for locally verified RUN3D; future RUN4/release and physical-device/Linux-raster/fullNarrator not claimed.
- Verification observations MESH-3D-OBS-01/02 / NON_BLOCKING: unchanged homepage touch and beam Ctrl-wheel each failed once on the same artifact, then isolated3/3PASS each; final full264PASS/0flaky/0retries used. Traces/logs retained, root cause not established. No RUN3D owner action; if reproduced during release acceptance, investigate as a separate scoped component check. No old source/test threshold changed.
- Deferred: RUN4 global horizontal sequence, release visibility/hosted acceptance, UK new resources. FullMVP PARTIAL.
- NEXT: none
- Next action: RUN3D integration completed by owner authorization; subsequent RUN4 execution follows selected ET-MVP-004, no automatic push/deploy.

## ET-MESH-003C — RUN3C: примеры решений метода контурных токов

- Status: verified
- Lifecycle: completed locally; source/main186013d, feat/mesh-lesson-run3c existing root checkout. One authorized atomic RUN3C checkpoint contains this record; exact SHA in Git log/external receipt. RUN3C99b9302 subsequently accepted and ff merged local main by owner authorization2026-11-04; sourcebranch retained. No push/deploy.
- Goal/scope:4detailed RU worked examples with progressively harder circuits, FR-321..329 specs/features/mesh-worked-examples.spec.md. STANDARD production content/frontend slice.
- Dependencies/DAG: ET-MESH-003B verified, owner accepted and ff merged main186013d; branch preserved. No future lab prerequisite.
- Entry: clean expected refs, installed pinned deps, static MDX/Katex/symbol infrastructure available; independent exact nodal reference all4cases PASS before implementation.
- Plan: contract+math/blueprints → static page/4SVG/content → bounded no-JS/journey/locale/geometry regressions → unit/types/lint/build/browser →6×2image review → sync → onecommit.
- Runnable vertical slice/E2E: actual built RU textbook → examples link →4complete static schemes/derivations/results/checks → native anchors/reload → back textbook; existing practice/progress unaffected. No mock backend required for static path.
- PASS/DoD: all4physical models/polarities/signs/branch voltages/full signed power correct, sourceJ power included; independent nodal and mesh agree; noJS/static/nooverflow; significant SVG labels>=12CSSpx,6width×2themes, reviewed bounded newPNG; old246PNG and protected source unchanged; all requiredchecks PASS.
- Interfaces/invariants: no kernels/backend/auth/DB/infra/deps change; oldRU textbook content/progress and UK/19topics/31tools preserved. One exact RU-only resource route with honest alternates, hasTranslation default true for old shell pages; no fakeUKroute.
- Temporary/fallback:none. Drawio CLI unavailable; editable XML4pages retained, real browser SVG inspected. Linux raster/physical device/fullNarrator NOT_RUN distinct from available Windows evidence.
- Documentation/security/performance/migration: SPEC/state/architecture/ADR/testing/design/content guide/traceability/readme sync. Author-trusted static MDX, no new provider/runtime; no migration.
- Evidence: merge-receipt.json main/source186013d clean; Fraction oracle all4cases beforeimplementation. 395unit/52files,264-file Astro0errors0warnings3oldhints, ESLint/build40pages39locale187artifacts395keys PASS;244Chromium PASS/6oldlive-auth skips.26exact-zero residuals,129strict formulas,6width×2theme review144bounded PNG;246oldPNG/191protected hashes unchanged. Native wheel/PageDown/Home/keyboard anchors and SVG label contrast PASS. Details TESTING/current chat outputs/ElectroTutor_run3c_evidence.zip.
- User action MESH-3B-MERGE / DONE: owner explicitly accepted RUN3B and authorized ff; maine743df5→186013d PASS, clean, feat/mesh-lesson-run3b retained. No push/deploy.
- User action MESH-3C-COMMIT / DONE_AT_ATOMIC_CHECKPOINT: one separate atomic RUN3C commit after mandatory PASS; no automatic integration.
- User action MESH-3C-INTEGRATION / DONE: explicit owner Merge RUN3C+RUN3D request; clean ff-only main186013d→99b9302 PASS, branch retained. No push/deploy.
- Deferred/overall: mesh lab subsequently verified locally by ET-MESH-003D. Horizontal context UI/RU-only release visibility/newUK translation remain future; fullMVP PARTIAL.
- Blockers: none for this locally verified slice. Future lab/global sequence/release and Linux raster/physical/Narrator coverage not claimed complete.
- NEXT: none
- Next action: none for RUN3C; accepted/ff merged main99b9302, continuation ET-MESH-003D verified separately.

## ET-MESH-003B — RUN3B: подробный русский учебник

- Status: verified
- Lifecycle: completed; implemented/validated locally on feat/mesh-lesson-run3b, existing root checkout, source main=e743df5. RUN3B commit186013d accepted and ff merged local main2026-11-04 by explicit owner authorization; sourcebranch retained. No push/deploy.
- Goal/scope: единый подробный RU textbook по11пунктам, FR-311..318 specs/features/mesh-textbook.spec.md; STANDARD production content/frontend. Без3уровней RU, нового examples-stage/lab/глобального redesign.
- Dependencies/DAG: ET-MESH-003A verified and user-authorized ff merge into main=e743df5. Initial clean tree, source branch retained. No future stage prerequisite.
- Entry: installed pinned dependencies; static Astro/MDX renderer и guest practice/progress доступны без backend. RUN3A screenshot/math baselines retained.
- Plan: contract → MDX/Astro content and small progress island → independent exact oracle → adapted RU-only contract regressions → unit/check/lint/build/browser → manual6×2 image review → sync → one commit.
- Runnable vertical slice: actual static build/owned preview → RU textbook even no JS → full derivation/scheme → vertical anchors → practice2.18 → completion/reload/account resume#step-5. UK legacy page remains available; no mocked backend proves live IAM.
- PASS/DoD: all11sections/statics visible; old level preference cannot hideRUcontent; geometry/CSS/math/polarity same physical results; six widths/two themes no overflow; new text goldens reviewed, other54PNG unchanged; circuit source/geometry unchanged, small subpixel raster deltas reviewed; independent nodal/Cramer/reversal/power PASS; required checks PASS.
- Interfaces/invariants:5step IDs, existing progress storage/grader/kernel/routes URLs unchanged. RU route presentation is static MDX/Astro, UK legacy preserved. No dependencies, DB/auth/infra changes.
- Temporary/fallback: none; native scrolling/static text without JS, storage denied keeps practice usable. Linux raster/physical mobile NOT_RUN distinct from Windows Chromium acceptance.
- Documentation/security/performance/migration: SPEC/system/content guide, architecture/design/decision/testing/traceability/README/state sync; no backend/DB migration. Smaller hydration surface; content authored locally, KaTeX only trusted MDX.
- Evidence: RUN3A ff merge receipt main/source=e743df5 clean;390unit/51files PASS,129strict KaTeX formulas, check260files0errors0warnings3old hints, lint PASS, build39pages38locale routes186artifacts395locale keys PASS; full Chromium230PASS/6oldlive skips. Independent exact Fraction14zero-residual checks incl nodal/Cramer/reversal/power/rounding.6width×2theme/132bounded PNG manually reviewed;114oldPNG+186protected files unchanged. Ordinary viewport screenshots confirm no oversized capture artifacts in actual UI. Details TESTING and current chat outputs/ElectroTutor_run3b_evidence.zip.
- User action MESH-3A-MERGE / DONE: owner explicitly authorized exact ff; switch main/merge--ff-only succeeded, clean main=e743df5, fix/mesh-lesson-run3a retained. No push/deploy.
- User action MESH-3B-COMMIT / DONE_AT_ATOMIC_CHECKPOINT: one separate atomic RUN3B commit after all mandatory PASS; exact receipt Git history/output report. No automatic merge/push/deploy.
- User action MESH-3B-INTEGRATION / DONE 2026-11-04: owner accepted RUN3B; authorized ff-only maine743df5→186013d PASS, clean refs; sourcebranch retained. No push/deploy.
- Deferred/overall: examples subsequently verified locally by ET-MESH-003C; mesh lab, horizontal sequence, release visibility/SEO remain future. UK/19topics/31tools retained; fullMVP PARTIAL.
- Blockers: none for bounded textbook. Separate full MVP/examples/lab/journey/release and Linux raster/physical device scope not claimed complete.
- NEXT: none
- Next action: none for RUN3B; accepted and ff merged main186013d, continuation selected ET-MESH-003C.

## ET-MESH-003A — RUN 3A: формулы и инженерная схема метода контурных токов

- Status: verified
- Lifecycle: completed; bounded RUN3A implemented and validated locally. One authorized atomic repair commit contains this record; receipt is Git history and external output report. Existing root checkout, branch fix/mesh-lesson-run3a; initial clean main48c3fef. Subsequently user-authorized ff merge main=e743df5 PASS2026-11-04; no push/deploy.
- Goal/scope: устранить подтверждённые RUN2 typography/diagram/mobile defects существующего RU lesson; SPEC specs/features/mesh-lesson-visual-repair.spec.md, FR-301..306. Classification STANDARD production frontend bugfix.
- Dependencies/DAG: ET-CI-001 verified; RUN2 source/math/hosted audit на48c3fef доступен. Future theory/lab stages не являются prerequisites этого bounded visual slice.
- Entry evidence: Git clean, Node/pnpm/dependencies уже установлены, Astro static source/routes и current lesson доступны; независимый KCL oracle54/11,30/11,24/11 и1656/11 W. Public backend не нужен для local lesson path.
- Plan: before capture6widths×2themes → root CSS/schematic repair → failing-to-passing regressions → fresh build/types/lint/unit/browser → manual screenshot review → canonical sync → one atomic commit.
- Runnable vertical slice/E2E: Astro build/own loopback preview → RU lesson → existing detailed mode → scheme/math/result/power/readable mobile → practice/reload. Без mock solver/backend; new lab не требуется для этого slice.
- PASS/DoD: исходные уравнения/числа сохранены; E1top+/E2top− и clockwise/I3 согласованы;320/375/390/768/1280/1920light/dark без clipping/overlap/page overflow; meaningful labels≥12CSSpx; reviewed new goldens, all relevant unit/check/lint/build/browser PASS; no source/user-data loss; commit only after all required gates.
- Interfaces/invariants: API/DB/auth/models/routes unchanged; shared RU/UK component compatibility сохраняется. Existing accepted tests/goldens не ослабляются; targeted CircuitDiagram SVG snapshot допускается обновить только после review в рамках явного исправления схемы. Старые54PNG не перегенерируются.
- Temporary/fallback: нет mock/stub implementation. Windows Chromium raster review плюс portable layout/geometry assertions; новый Linux raster baseline вне доступного Windows acceptance и не выдумывается. Fail any required local gate → no commit.
- Documentation/security/performance/migration impact: точечные SPEC/STAGES/TESTING/DESIGN/traceability/readme sync; no deps/DB migration/network write/deploy. SVG/CSS only, без нового тяжёлого runtime.
- Evidence: 389 unit/50files; check255files/0errors/0warnings/3pre-existing hints; ESLint PASS; production39pages/38locale routes/184artifacts/395locale keys PASS; full Chromium228PASS/6expected live-auth skips plus12focused visual PASS. Six widths×two themes and60new PNG manually reviewed; before/after72+72captures. Existing54PNG and187protected files SHA-256 unchanged;22of23SVGentries unchanged, only lesson entry updated after review. Independent rational KCL/KVL/power six exact-zero residuals. Read-only reviewer: no new correctness findings. Artifact/report/log references: docs/TESTING.md and current chat outputs/ElectroTutor_run3a_evidence.zip.
- Deferred/overall: полноценный эталонный модуль пока PARTIAL: подробная theory/отмена3levels в UI, examples stage, horizontal route, новая mesh lab и RU-only visibility/SEO не входят в RUN3A. Остальные19тем/31tools/UK не удаляются.
- USER action MESH-3A-COMMIT / DONE_AT_ATOMIC_CHECKPOINT: прямой RUN3A request разрешает один атомарный commit; все terminal gates PASS до staging/commit. Точный commit SHA хранится в Git log и внешнем report без self-referential hash в этом record.
- USER action MESH-3A-MERGE / DONE 2026-11-04: явный owner Merge RUN3A→RUN3B request; ff-only main48c3fef→e743df5 PASS, clean tree, source branch retained. Push/deploy NOT_RUN.
- Blockers: none for bounded RUN3A. Linux raster/physical devices/live backend/hosted validation NOT_RUN и не объявляются проверенными. UA19/manual voice не открывается повторно без affected-scenario trigger.
- NEXT: none
- Next action: owner reviews local screenshots/lesson and decides integration separately; следующий product block — подробная математическая теория и полностью проверенные примеры, без автоматического старта лаборатории/навигации.

## ET-10.3 — LessonSession lifecycle и reload

- Status: verified
- Lifecycle: completed; evidence: validated locally (historical isolated backend/live browser PASS + prior human acceptance, confirmed 2026-10-02).
- Condition: Session v1/ADR-027 и ADR-028 tooling реализованы. UA-15 clone-only forward/reverse доказал catalog/Alembic parity; UA-18 `backend:check clone` на disposable PostgreSQL закрыл composite backend gate (196 fast, 74 real integration, 9 catalog negatives, build, /live и /ready). UA-18 access/browser conflict разрешён: public lesson route виден до auth, Access shell только после server Access 200, Session payload только после отдельного authorized join/read; любой 401 скрывает обе private regions. Built Chromium 94 PASS/5 expected live-phase skips, isolated Keycloak→API→PostgreSQL authenticated Session E2E 1 PASS и live profile phase 7 PASS/3 expected phase skips; RU/UK copy, keyboard, mobile, two tabs, anonymous 401, foreign 404 и наблюдаемые browser origins проверены. Ранее выполненная и принятая пользователем manual RU/UK voice/screen-reader acceptance — PASS; canonical evidence восстановлено 2026-10-02 в `docs/TESTING.md`, `ET-10.3-UA-19`. Внешние SQL callers legacy 8-column read_booking_operation(uuid) неизвестны; original DB replacement запрещён и отделён от browser/auth gate.
- Plan: сохранять принятый UA-19 PASS; повторно проверять gate только после нового изменения voice behavior. Original DB repair остаётся отдельным compatibility decision.
- Evidence: active feature fast-forward `1722d16 → a646303` 2026-09-15, clean source checkout; read-back `docs/STAGES.md`/context route/selected adapter canonical PASS, старые STAGES/AI files отсутствуют. GitHub docs main `ac675d4` содержит более ранний product baseline ET-09.4 partial; его 85 backend fast, 39 real integration, 110 frontend unit и 46 built Chromium PASS/2 expected skips остаются историческим baseline, а remote user actions и selector сохранены в Git ancestry/`docs/notes/legacy-ai-state-evidence.md`. Approved `specs/features/lesson-sessions.spec.md` v1/ADR-027. Historical `backend:test:fast` 194 PASS/81 deselected, `backend:test:integration` 72 PASS/201 deselected, Ruff/mypy PASS; scratch DB Alembic/catalog parity и 9 rollback negatives PASS. Preserved dev DB read-only diagnose exits 1 with `status=drift`, 10 missing/3 changed/9 unexpected functions and missing CHECK; 2 accounts, reset/repair not attempted. Fresh 2026-09-22 local evidence after registered-worktree discovery fix: frozen pnpm restore, `pnpm test` 156 PASS, `pnpm lint` PASS, Astro check 98 files/0 diagnostics, build 19 pages plus locale/lesson/site audits PASS, built Chromium 92 PASS/5 expected auth skips, backend Ruff/mypy and fast suite 195 PASS/81 deselected, including targeted injected-provider-claim OIDC negatives 9 PASS. Integration runner stopped before migrations/tests because unrelated MathMorph container owns `127.0.0.1:55432`; Electro Tutor container is `Created`, preserved named volume `electro-tutor-local-postgres` remains mounted and was not deleted/reset. Backend/DB/live IdP terminal gates remain open; `verify:full` dependency audit still requires outbound approval. Selected old record/user actions и AI source SHA сохранены в `docs/notes/`, Git parent rollback.
- Recovery evidence 2026-09-22: external protected physical archive `ET-10.3-20260922T202618Z/preserved-pgdata.tar`, 99,788,800 bytes, SHA-256 `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`; tar integrity and host/container digest PASS. Original `electro-tutor-local-postgres` volume had no running writer and a stale `in production` control state; restored clone `electro-tutor-et103-clone-20260922` on separate loopback `55433` completed WAL recovery, read 2 accounts and revision `20260915_0012`. Original volume still byte-equal to backup after function rehearsal; clone volume retained, container штатно остановлен, MathMorph remains on `55432`. Protected function inventories before/reverse/abort share SHA-256 `db208bac294e7e7be59793af5a4742a99fe4b5d69931c1d13c7836eec20829d0`; canonical baseline migration `0012` PASS, incompatible return type blocked repair. Details: `docs/TESTING.md`.
- UA-13 evidence 2026-09-23: protected `ET-10.3-UA-13-20260923T002526` содержит full schema/10-function before/after inventories и canonical function reference. Ten-function JSON before/after byte-equal SHA-256 `e03cdd1a5cbef1ad6c02e12221125715479316111a1b286f11d68ed6de5b62e5`; schema-only dump совпадает после исключения двух случайных `pg_dump` restrict markers. `pg_depend` inbound 0, но repository adapter прямо вызывает функцию и требует `result_payload`; отсутствие external SQL callers не доказано. Clone catalog diagnose exits 1 с прежним drift, никаких DB repairs в UA-13. Source volume вновь byte-equal с неизменным backup; clone container штатно остановлен, MathMorph на `55432`. Подробности: `docs/TESTING.md`.
- UA-14 evidence 2026-09-23: новый read-only DB contract test на runtime clone `electro_tutor` FAIL (exit 1, вместо `result_payload` возвращается `completed_at`); финальный combined run трёх новых tests (один offline URL redirect guard) + historical booking integration + two-account HTTP replay/security PASS (5/5, exit 0): четыре DB tests на disposable canonical `electro_tutor_test` и один offline. Проверены существующий operation, payload, participant IDs, historical replay, foreign/absent operation. Ruff/mypy PASS. Прямой SQL probe отсутствующей колонки FAIL. Git history не установила происхождение 8-column реализации; CASE C — внешняя совместимость неизвестна, repair не выполнялся. `electro_tutor` query-only, `electro_tutor_test` менялся тестами; preserved source volume снова byte-equal исходному backup, SHA-256 backup неизменен; clone остановлен, MathMorph здоров на `55432`. Details/commands: `docs/TESTING.md`.
- UA-15 preflight 2026-09-24: clean `feature/et-10-3-lesson-session` на `39fc307c`; Docker Engine 29.7.2 доступен, но ни в `desktop-linux`, ни в `default` нет прежнего clone volume/container `electro-tutor-et103-clone-20260922`. Original `electro-tutor-local-postgres` volume существует без attached container; он не запускался. Защищённый каталог `ET-10.3-20260922T202618Z` существует, но его ACL запрещает текущему Windows user SID чтение `preserved-pgdata.tar`; свежие hash/integrity и clone catalog inventory недоступны. Никакие DB/backup/volume repair actions не выполнялись; clone-only rehearsal остановлен до mutation.
- UA-15 recovery 2026-09-24: archive size/SHA-256 и tar restore/compare PASS; `electro-tutor-et103-clone-20260924` восстанавливался из backup в отдельный volume на `127.0.0.1:55433`, PostgreSQL 17.6 WAL recovery PASS, original volume без attached container. Fresh drift 10 missing/3 changed/9 unexpected functions + 1 CHECK; stored literal callers, tracked inbound dependencies и active external sessions для 8-column function — 0, historical external callers UNKNOWN. Clone-only policy: exact 9-column replacement допустима только на disposable clone с обратным ходом; original требует нового compatibility decision. Closed archive сохранил 12 functions, 13 canonical созданы, column/CHECK repaired; catalog/Alembic PASS. Transactional reverse восстановил catalog digest `de9aba8fd1dde975e9d1b1440ef8bbe8c3b3222362687bdfe1947d5e2352cb0c` и полный function inventory; второй forward PASS, repaired clone container штатно остановлен, volume сохранён. Runtime projection 1 PASS; real DB integration/security 73 PASS/1 skipped (test hardcodes 55432); backend unit 196 PASS, Ruff lint/mypy PASS, но composite `backend:test:fast` FAIL на pre-existing Ruff format в accepted test. Frontend Vitest 156 PASS, Astro check 98 files/0 diagnostics, build 19 pages/99 artifacts, Chromium 92 PASS/5 auth skips; global lint FAIL на ignored backup `.venv.broken-backup-20260924-01`, targeted lint PASS. Direct clone-only HTTP `/live` и `/ready` 200; `backend:check`, outbound audit, authenticated browser и manual RU/UK открыты. Archive hash повторно совпал, original не подключался. Details: `docs/TESTING.md`.
- UA-16 evidence 2026-09-25: clean baseline HEAD 0112c9d; existing ET_TEST_POSTGRES_PORT=55433 теперь принимается test-only E2E support guard при сохранённых exact loopback/role/DB/URL checks, local profile остаётся pinned 55432. Targeted real test 1 PASS; clone integration 74 PASS/0 skipped, 205 deselected; backend:test:fast 196 PASS/83 deselected, Ruff format 77 files, Ruff lint и mypy 43 files PASS. Formatter изменил только accepted test (AST equal); pnpm lint PASS с узким ignore сохранённого .venv.broken-backup-*; backup не удалялся. pnpm audit --audit-level high exit 0, 3 moderate/0 high. Built-static Chromium 29 existing lesson/localization tests PASS; временный RU→UK→RU mobile/outbound probe 1 PASS, 390/390 без видимого overflow/fallback key, screenshots просмотрены. Observed origins: 127.0.0.1:4322 и ожидаемый fonts.googleapis.com (запрос шрифта в probe прерван); auth/API/media flows не покрыты. Astro preview не стал ready за 30s, probe обслужен временным loopback static server из существующего dist; это не live auth evidence. Static repository scan: единственный production literal caller — booking_repository.py, плюс migration/tests; дополнительных in-repo direct callers не найдено, external callers вне repository неизвестны. Clone container снова остановлен, volume сохранён; original container уже был Up/rw-mounted до проверки и не затрагивался. Details: docs/TESTING.md.
- UA-17 evidence 2026-09-25: fresh `check:context`, backend fast 196 PASS/83 deselected, Ruff/mypy, frontend 156, lint, Astro check 98/0, build 19 pages/99 artifacts, built Chromium 92 PASS/5 live-auth skips, npm audit exit 0 (3 moderate/0 high), CI workflow/hygiene PASS. Windows base-path gate первоначально FAIL (`EXDEV` C:→E:), затем выявил одну lesson→account ссылку вне base; оба дефекта исправлены, повторные artifact audit 99 и Chromium 4 PASS. Docker API недоступен; original volume/container не запускался и не мутировался, clone/hash нельзя свежо проверить. Live auth secrets отсутствуют. Details: `docs/TESTING.md`.
- UA-18 evidence 2026-09-27: стартовый HEAD `67dd000`, clean `feature/et-10-3-lesson-session`. Docker inspect: original `electro-tutor-local-postgres-1` Created, preserved volume attached only to it; historical clone `electro-tutor-et103-clone-20260922` mounted only its own volume on 55433 and still returned 8 columns without `result_payload`. A new empty `electro-tutor-et103-test-20260926` uses only its own volume plus read-only init SQL on 127.0.0.1:55434. Fresh `backend:check clone` exit 0: frozen Python restore/lock, pip-audit 0 known findings, Ruff format/lint/mypy, 196 fast, image build, Alembic 0012/check, 74 real integration without skip, 9 rolled-back catalog negatives, fresh manifest parity, catalog diagnosis current, `/live` and `/ready` 200. Original Compose start/down never called. Root Vitest 158 PASS, lint PASS, Astro check 99 files/0 diagnostics, build 19 pages/99 artifacts PASS. Fresh `test:e2e:built` FAIL 88 PASS/4 FAIL/5 expected auth skips; focused one-worker rerun FAIL 17 PASS/5 FAIL, all active access-only mocks after Session join 401. Historical UA-17 browser PASS is not promoted to current terminal PASS. No live IdP credentials were present; `test:e2e:auth` and manual UX NOT_RUN. Details: `docs/TESTING.md`.
- UA-18 continuation evidence 2026-09-27: starting HEAD `3703332`, accepted five Access cases now explicitly model Session 503 without weakening their Access assertions; separate RU/UK 401 join regressions require public heading/login CTA and both private regions hidden. Focused built Chromium 22 PASS before two added 401 cases; final `pnpm test:e2e:built` 94 PASS/5 expected live-phase SKIP, 0 FAIL/unexpected SKIP. `pnpm test` 158 PASS, `pnpm lint` PASS, `pnpm check` 100 files/0 diagnostics, `pnpm build` 19 pages/99 audited files PASS. New isolated PowerShell runner uses verified disposable `electro-tutor-et103-test-20260926` on `127.0.0.1:55434`, temporary Keycloak on `58081`, direct local API on `8000`, preview `4322`, generated in-process secrets and scoped cleanup; no original-bound Compose call. Live profile/auth 7 PASS/3 expected phase SKIP and Session 1 PASS/0 SKIP: real login, booking/grant, student/tutor join, anonymous 401, third masked 404, DB-time tutor START, reload, keyboard END, two-tab ENDED, RU/UK copy/mobile/ARIA region. `/live` and `/ready` 200. Observed browser origins only loopback `4322/58081/8000` and declared Google Fonts CSS/assets; no payment/email request observed. Docker cleanup exit 0; original ET/MathMorph/preserved DB untouched. Detail and earlier failed harness attempts: `docs/TESTING.md`.
- UA-18 terminal rerun 2026-09-27 on committed source `723fc3f`: `pnpm test:e2e:auth:isolated` exit 0 after frontend build/audits 19 pages/99 files, disposable PostgreSQL ownership/readiness, `/live` and `/ready` 200, profile phase 7 PASS/3 expected phase SKIP and unskipped Session phase 1 PASS. Read-only post-run Docker inspect: test DB exited with only its named volume and read-only init SQL; original ET container remained Created with original named volume; temporary IdP absent. No product or runner source changed after this evidence.
- Historical UA-19 automation attempt (superseded by accepted human PASS; see TESTING canonical UA-19) 2026-09-27 at clean `f0041ab`: NVDA not available in installed apps/PATH/standard install paths; Windows Narrator `Narrator.exe` 10.0.19041.4522 launched, but Computer Use could not inspect its higher-integrity window or observe spoken output. RU/UK speech/focus acceptance NOT_RUN/BLOCKED_BY_OBSERVABILITY; no product FAIL or PASS inferred. No stack, DB, browser or expensive suite was started. Existing UA-18 live evidence remains applicable because only documentation changed.
- Integration preflight 2026-09-27: UA-19 runbook committed; `origin/feature/et-10-3-lesson-session` published. `origin/main` remains `ac675d4`; local `main` has 31 unique commits and lacks 3 remote commits. Read-only `git merge-tree --write-tree origin/main feature/et-10-3-lesson-session` found eight conflicts, including this status owner, context SPEC and context-route validator; no actual merge was started. Both local and remote Pages workflow deploy on push to `main`, conflicting with this run's explicit no-deploy constraint. Integration target was not changed or pushed; ET-10.3 and UA-19 status remain unchanged.
- NEXT: none for ET-10.3 acceptance; текущий selected NEXT — ET-RC1. ET-11/ET-12 требуют отдельного выбора и проверки их SPEC/DAG.
- Live tutoring design checkpoint: draft `57b25c1` and reconciliation `932bbb2` reached canonical local `main@a7b198f` by authorized fast-forward 2026-09-28; `DESIGN_ONLY / INTEGRATED_LOCAL_MAIN`. Implementation `NOT STARTED`, push `NO`, deploy `NO`. Это отдельный draft для будущего ET-12, не текущий NEXT; media, invite flow, magic links, media grants и migrations не реализованы.
- Live tutoring findings: существующие `Booking`, `LessonAccessGrant` и `LessonSession` остаются domain authority; realtime provider отвечает только за media transport. Будущий short-lived media grant не заменяет `LessonAccessGrant`; guest invite должен разрешаться в существующий student `Account` и давать доступ только к одному lesson. Текущее окно `[starts_at - 15 min, ends_at)` несовместимо с late entry, overtime и reconnect после `ends_at`; нужна отдельная versioned policy, не настройка Jitsi.
- Live tutoring future re-entry: UA-19 PASS восстановлен; согласовать prerequisites ET-11/ET-12 и выбрать bounded `ET-12.1` provider security POC. Проверить direct URL без grant, foreign room, forged role, moderator rights, revoke behavior и trustworthy presence events. Только после PASS планировать invite/media schema и implementation; до того Jitsi integration, production code и migrations вне scope; push/deploy отдельно не разрешены.
- Blockers: none for ET-10.3 terminal acceptance. Original DB repair separately requires external SQL caller compatibility decision (UA-16); original replacement remains forbidden.
- USER action `ET-10.3-UA-18`: DONE 2026-09-27; user authorized repository-evidence-led contract reconciliation. Exact static Access fixtures now model Session unavailable, while explicit 401 tests retain private-shell hiding; built Chromium 94 PASS/5 expected phase skips.
- USER action `ET-10.3-UA-04`: DONE BY ISOLATION 2026-09-27; generated ephemeral Keycloak credentials, verified disposable PostgreSQL ownership, unskipped real Session phase PASS and runner exit 0; original-bound auth runner was not called.
- USER action `ET-10.3-UA-19`: DONE / PASS; ранее выполненная RU/UK voice/speech/focus ручная проверка принята пользователем, подтверждение 2026-10-02. Evidence: `docs/TESTING.md`, canonical UA-19 record. Unlock: ET-10.3 terminal acceptance; повтор не требуется без нового изменения voice behavior.
- USER action `ET-10.3-UA-17`: DONE BY ISOLATION 2026-09-27; Docker inspect подтвердил original container Created и отдельные clone/test mounts, новый test PostgreSQL на 55434 прошёл health/composite. Archive SHA-256 свежо не проверялся; UA-15 protected archive evidence остаётся историческим. Original volume не подключался; unlock — isolated backend composite gate.
- USER action `ET-10.3-UA-08`: DONE 2026-09-22; пользователь утвердил data-preserving backup, inventory и clone-only recovery с fail-closed checkpoint для destructive/ambiguous operations. Evidence — восстановленный archive/clone, SHA-256, WAL recovery и побайтово неизменный source; unlock — безопасная schema rehearsal на clone.
- USER action `ET-10.3-UA-12`: DONE WITH FAIL-CLOSED STOP 2026-09-22; разрешён перенос ровно 9 legacy overloads только на clone. Full inventory, closed archive и reverse `SET SCHEMA` выполнены, inventory побайтово равен; при подготовке canonical repair обнаружен несовместимый return type десятой функции, девять повторно возвращены в `public`. Evidence — protected JSON hashes и `docs/TESTING.md`; unlock — только подтверждённая rollbackability девяти, не catalog repair.
- USER action `ET-10.3-UA-13`: DONE WITH FAIL-CLOSED STOP 2026-09-23; пользователь разрешил условный clone-only анализ/перенос десятой функции. Full inventory и caller/provenance analysis выявили действующий runtime contract и несовместимую replay-семантику; перенос/repair не выполнялись. Evidence — protected JSON/schema hashes и `docs/TESTING.md`; unlock — диагностика завершена, не catalog repair.
- USER action `ET-10.3-UA-14`: DONE WITH FAIL-CLOSED STOP 2026-09-23; разрешённый contract-first анализ подтвердил canonical in-repo replay semantics и воспроизвёл 8-column drift read-only тестом. Из-за неизвестных external SQL callers нельзя доказать безопасную замену одноимённой сигнатуры; десятую функцию не перемещали, repair не выполняли. Evidence — `docs/TESTING.md` и тестовый diff; unlock — только формулировка следующего compatibility checkpoint.
- USER action `ET-10.3-UA-15`: DONE 2026-09-24; текущая Windows identity получила read-only доступ к archive. Агент независимо подтвердил size 99,788,800/SHA-256 `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`, восстановил отдельный clone, повторил inventory и exact clone-only forward/reverse; evidence — `docs/TESTING.md`. Unlock — clone-only проверки; original DB repair не разрешён.
- USER action `ET-10.3-UA-16`: READY; для будущего repair original DB владелец должен подтвердить inventory external SQL callers либо явно принять риск несовместимого 8→9-column read_booking_operation(uuid), а также установить owner/cause уже работающего original container и точный deployment/rollback/cutoff. Evidence — письменное compatibility decision и inventory с scope/rollback; unlock — отдельное разрешение на original DB repair, не автоматическое действие с volume. До этого только isolated quality gates.
- USER action `ET-10.3-UA-09`: DONE 2026-09-25; пользователь явно разрешил pnpm audit к npm registry после auto-review rejection; exit 0, 3 moderate и 0 high/critical. Evidence — docs/TESTING.md; unlock — npm dependency audit часть verify:full, без утверждения о полном backend:check.
- USER action `ET-10.3-UA-10`: DONE BY ISOLATION 2026-09-22; пользователь запретил останавливать/перенастраивать MathMorph. Его PostgreSQL остался на `127.0.0.1:55432`; Electro Tutor clone работал на `127.0.0.1:55433`, original named volume сохранён без изменений. Evidence — Docker labels, port bindings и source/archive compare; unlock — clone-only rehearsal. Для полного `backend:check` нужен isolated command surface после clone catalog parity, а не действие над MathMorph.
- USER action `ET-10.3-UA-11`: APPROVED 2026-09-29; пользователь выбрал explicit structured DEV bridge после read-only brownfield reconcile. `.codex/dev-project.toml` и exact `Global DEV bridge: enabled` добавлены без изменения product code/tests/locks/DB/auth. Ожидаемое terminal evidence — `validate_project_overlay.py`, DEV routing и project/global doctor PASS; ET-10.3 manual UX теперь PASS (UA-19); ET-14.2 policy ACCEPTED; integration remains separate agent work.
- USER action `ET-ACTIVE-DOCS-INTEGRATION`: DONE; пользователь разрешил local merge 2026-09-15; чистая `feature/et-10-3-lesson-session` перешла fast-forward `1722d16 → a646303`; read-back selected ET-10.3 adapter/context route PASS, `docs/STAGES.md` единственный active state owner; unlock — активный checkout с текущим ET-10.3 record.
- USER action `ET-ACTIVE-REMOTE-RECONCILE`: DONE; пользователь разрешил integration/push 2026-09-27. Fresh fetch подтвердил feature local=remote `91df4d3`, local `main`=`07aa04f`, `origin/main`=`ac675d4`, merge-base `e1527e6`, divergence 31/3. Отдельная `integration/et-10-3-main-reconciliation` сохранила обе main линии и опубликованную feature без rebase/force; восемь state/context conflicts разрешены построчно, current selector ET-10.3 и UA-19 сохранены. Production source/runtime относительно feature HEAD byte-equal; context/hygiene/workflow gates и 14 workflow tests PASS. Pages YAML запускает deploy после успешного verify на каждом обычном push `main`; documented GitHub `[skip ci]` на HEAD commit пропускает push workflow целиком. `main` fast-forward опубликован обычным push на `00249b1` с `[skip ci]` после повторной сверки refs; read-back GitHub для этого SHA показал 0 Actions runs и 0 deployments. Evidence — `docs/notes/et-10-3-integration-checkpoint.md`, Git parents merge commit и scoped command results этого checkpoint; unlock — product `NEXT` остаётся UA-19, без deploy.

### UA-19 — Accepted manual evidence

- Status: PASS / DONE. Canonical evidence: `docs/TESTING.md`, «ET-10.3 UA-19 — manual RU/UK voice acceptance: PASS»; пользователь подтвердил ранее выполненную и принятую проверку 2026-10-02.
- Ручной gate закрыт для RU и UK. Старый automation attempt сохранён как история в TESTING; он не является текущим blocker.
- Повторная ручная проверка нужна только после нового изменения, реально затрагивающего voice behavior/speech/focus этого flow. Documentation-only восстановление evidence не является trigger.

## ET-STAR-001 — Несимметричная звезда с нейтралью

- Status: verified
- Condition: локальная реализация звезды находится в `main` с `c19882e`; принятый static/browser contract повторно проверен 2026-09-28. `ET-10.3` и его ручной UA-19 независимы; UA-19 теперь PASS по ранее принятой ручной проверке, а не вследствие этого track.
- Dependencies: завершённые `TUTOR-03` (интерактив), `TUTOR-04` (RU/UK), `TUTOR-05` (base path) по `docs/ROADMAP.md`. Вход: чистый `main` на `dc38ee6`, существующие Astro/React/SVG/complex utilities и pnpm lockfile; worktree `worktrees/star-phasor`, ветка `feature/star-phasor-interactive`.
- Goal/scope: отдельная RU/UK страница из раздела «Интерактив»; симметричный ABC источник, комплексные Z фаз и нейтрали с R ≥ 0, три режима нейтрали, общий state алгебраических/полярных полей и drag точек, локальные вычисления, плоскость Z слева и единая топографическая диаграмма напряжений/токов справа с разными масштабами, результаты, нижние числовые настройки и четыре presets. Требования: `specs/features/star-neutral-phasors.spec.md`.
- Runnable vertical slice: `/ru/interactive/` → карточка звезды → `/ru/interactive/star-neutral/` → изменить Z_A числом/drag на левой плоскости → сразу увидеть точки N/n/A/B/C, фазные/линейные напряжения, токи от n и два масштаба на правой диаграмме, а также результаты в таблице; тот же путь доступен в `uk`. Сервер не требуется.
- PASS contract: `pnpm test` подтверждает balanced/unbalanced × ideal/open, finite KCL/Ohm, conversion и негативные случаи; `pnpm lint`, `pnpm check`, `pnpm build` подтверждают типы, локали и обе static routes; `pnpm test:e2e:built` проверяет живой browser path, обе локали, двусторонний ввод, drag, нейтраль, preset и mobile width. Проверить финальный diff и `git diff --check`.
- Evidence: implementation commit `4a2ad4a`; frozen offline `pnpm install` PASS; `pnpm test` 168 PASS; `pnpm lint` PASS; `pnpm check` 106 files/0 diagnostics; `pnpm build` 21 pages, 20 localized routes/104 audited files PASS; `pnpm check:context` PASS; built Chromium 99 PASS/5 expected unrelated live-auth phase skips, including 5/5 target cases. Desktop/mobile screenshots reviewed; staged diff/`git diff --check` PASS. Scope: local feature worktree and built static browser, no backend needed for this consumer path. Evidence level: committed and merged into local `main` at `c19882e`, not pushed/deployed. Details: `docs/TESTING.md`.
- Refinement evidence 2026-09-28: после совмещения диаграмм и ограничения R ≥ 0 повторены `pnpm test` 168 PASS, `pnpm lint` PASS, `pnpm check` 106 files/0 diagnostics, `pnpm build` 21 pages/20 localized routes/104 audited files PASS, `pnpm test:e2e:built` 99 PASS/5 expected unrelated skips и `pnpm check:context` PASS. В браузере проверены координаты N/n/A/B/C и начала векторов, разные масштабы и цвета тёмной темы; код ещё не слит.
- Temporary implementation: none. Deferred: несимметричный источник, короткое замыкание, серверное хранение и URL-state не входят в v1; конечное/почти нулевое фазное Z даёт явную ошибку вместо вымышленного тока.
- User action `ET-STAR-001-UA-01`: DONE для локального fast-forward merge `dc38ee6 → c19882e` по команде пользователя «Сливай» 2026-09-28. Clean/merged checkout, отсутствие active preview/process и регенерируемость ignored Playwright/node_modules данных проверены; `worktree_policy.py check-delete` PASS, `worktrees/star-phasor` удалён через Git и остаточный cache очищен, каталог отсутствует. Push/deploy не выполнялись.
- Verification refresh 2026-09-28: `pnpm test` 168 PASS, lint PASS, Astro check 119 files/0 errors/0 warnings, build 25 pages/24 localized routes/115 audited files PASS, built Chromium 106 PASS/5 expected unrelated live-auth skips (star cases PASS), project-base 4+1 Chromium PASS, `check:context` PASS. Scope: static local/browser path, no backend.
- User action `ET-STAR-001-UA-02`: DONE by this run's explicit direction to execute all automatable stages; current tests and browser acceptance above, documentation checkpoint committed on feature branch. Unlock — terminal `verified` projection; canonical-main documentation sync awaits `ET-LINE-001-UA-02`.
- Recovery verification 2026-10-01: исторический Git audit (184 commits/refs/reflog/all worktrees/fsck) нашёл c19882e; дополнительная потерянная версия и source regression не обнаружены. Product source c19882e совпадает с main и ET-14.2 для StarNeutral files, цветов и модели; перенос runtime changes не требуется. Изменения ET-14.x сохраняются без правок. Исторический verification checkout: worktrees/star-history-c19882e, fix/star-history-c19882e, docs checkpoint c2d2410. Frozen offline install PASS; 168 Vitest tests PASS; HTTP 200; Chromium supporting smoke и screenshot inspected; данные старого evidence остаются историческими.
- Finalization checks 2026-10-01: актуальный main source согласован в verification branch; frozen offline install PASS; pnpm test 171 PASS/21 files; lint PASS; Astro check 124 files/0 errors/0 warnings/2 pre-existing generated WASM hints; build 25 pages/24 localized routes/115 audited files PASS; E2E_SPEC=tests/e2e/star-neutral.spec.ts pnpm test:e2e:built 5/5 live built-browser PASS; check:context PASS (ET-14.2 selector/его независимый blocker сохранены); git diff --check PASS. Итоговая разница с main — только recovery/verification documentation; star source и ET-14.x code без правок.
- User action `ET-STAR-001-UA-03`: VERIFIED. Пользователь 2026-10-01 ответил «PASS» на desktop verification найденного c19882e: Z plane слева, Re≥0, объединённые voltage/current vectors справа и синхронный пересчёт при изменениях сопротивлений/нейтрали. Human visual evidence подтверждено; source не переписывается.
- Finalization result 2026-10-01: human PASS и approved recovery checkpoint merged в main@ab3a942; обычный push origin/main выполнен, git ls-remote read-back подтверждает полный SHA ab3a94212dd10c1b0baf24f21518b585ceb9bfd1. Product source не изменён. Verification preview остановлен; clean merged worktree, remote ancestry/read-back, отсутствие active target processes и preserved browser evidence проверены; worktree_policy.py check-delete PASS; worktrees/star-history-c19882e удалён через Git, каталог отсутствует. Branch cleanup разрешён UA-04 и выполняется только после remote read-back данного документационного checkpoint. Production deploy не запускался ([skip ci]). User actions для recovery: none.
- User action `ET-STAR-001-UA-04`: DONE — пользователь 2026-10-01 явно разрешил безопасные merge, push и delete. Finalization выполняется после relevant tests, сохранения main/ET-14.x facts, ancestry/read-back и guarded cleanup preflight. Production deploy не входит в scope; push checkpoint использует [skip ci].
- NEXT: ET-RC1
- Next action: none for ET-STAR-001; retain independent ET-10.3 manual gate.

## ET-LINE-001 — Численный transient симулятор длинной линии

- Status: verified
- Condition: `ET-LINE-001` реализован в local `main` через `d47cec4`; три явно разрешённых numerical contract corrections независимо физически обоснованы и проверены в `feature/line-transient-mvp`. Полный Rust, Worker/WASM, RU/UK browser и base-path acceptance прошёл 2026-09-28. Terminal `verified` относится к независимому static simulator stage; test/evidence checkpoint fast-forward интегрирован в canonical local `main@fefe168` после свежего preflight 2026-09-28. `ET-10.3` сохраняет отдельный ручной gate.
- Dependencies: завершённые TUTOR-03 interactive, TUTOR-04 RU/UK и TUTOR-05 base path. Никакой backend или будущий simulator feature не нужен для static consumer path.
- Goal/scope: `INT-009` отдельный RU/UK route круговой диаграммы и `LINE-001..010` Rust/WASM Worker transient solver, passive boundary devices, Canvas epures, playback/seek/stop, diagnostics, verification и benchmark по `specs/features/transmission-line-transient.spec.md`.
- Plan: SPEC, Rust/WASM build, ports/solver, Worker/Canvas/RU/UK routes, benchmark и browser E2E реализованы. Идеальный источник `Rs=0` стартовый, повторные отражения проверены. Physics oracles согласованы с независимой аналитикой; stage acceptance завершён. Documentation/test checkpoint достиг local `main@fefe168`; push/deploy не выполнялись.
- Runnable vertical slice: `/ru/interactive/` → «Длинная линия» → open preset `E=100 V,Rs=0 Ω,l=1000 km,v=2e8 m/s,Z0=50 Ω,N=1000` → Play → `U(x),I(x)` на Canvas, отражение от open load около `τ=5 ms`, возврат к идеальному источнику около `2τ=10 ms`, последующие проходы → Pause/Reset/Step/seek; тот же маршрут на `uk`. `Rs=50 Ω` доступен как отдельный согласованный проверочный случай. Круговая диаграмма доступна отдельной карточкой.
- PASS contract: `cargo test`/WASM build и Rust numerical reference/convergence/stability, `pnpm test`/lint/check/build, `pnpm test:e2e:built` с реальным Worker/WASM/RU/UK/Canvas, benchmark N=1000/5000/10000, final diff/context check. Ни static smoke, ни JS substitute не закрывают physics gate.
- Evidence: SPEC до кода; Rust 1.88, wasm32 artifact hash/pinned wasm-bindgen 0.2.129 PASS. Independent calculations and CFL/grid sensitivity for all three accepted assertions: `docs/notes/et-line-physics-reconciliation.md`; solver source unchanged. Full `cargo test --locked --offline` PASS: reference 8/8, source-reflection 2/2; rustfmt check/Clippy all targets PASS; `pnpm wasm:check` PASS. `pnpm test` 168 PASS, lint PASS, Astro check 119 files/0 errors/0 warnings, build 25 pages/24 localized routes/115 audited files PASS. Built Chromium 106 PASS/5 expected unrelated live-auth skips, including real Worker/WASM/Canvas. `pnpm check:base-path` build/audits plus 4 base-path and 1 Worker/WASM Chromium PASS. Native benchmark N=1000/5000/10000 recorded in `docs/TESTING.md`; O(N) storage 54.7/273.5/546.9 KiB. Browser worker transfer visible in DEV overlay. Scope: local static consumer path, no backend/live-auth claim.
- Temporary implementation: none. Deferred: lossy/heterogeneous line, nonlinear device/MNA, threads/GPU и full-history timeline по SPEC.
- User action `ET-LINE-001-UA-01`: DONE 2026-09-28 conditional approval; независимый расчёт и grid/CFL sensitivity в `docs/notes/et-line-physics-reconciliation.md` классифицируют single-point first-wave FAIL как `MODEL/DISCRETIZATION_LIMITATION`, а series RLC late-current FAIL как `TEST_CONTRACT_BUG`. Разрешена замена только двух соответствующих assertions на физически проверяемые plateau/early-transient/late-DC oracles; unlock — targeted regression и полный Rust suite, не автоматический terminal PASS.
- Prior verification baseline before approved physics reconciliation (2026-09-28): Rust 1.88 `cargo test --locked` reproduced exactly 6/8 reference PASS and the same two FAIL; source-reflection 2/2 PASS; no accepted test changed. `pnpm verify:full` exit 0: frozen install, hygiene/CI, lint, Vitest 168 PASS, Astro check 119 files/0 errors/0 warnings, root Chromium 106 PASS/5 expected live-auth skips, build 25 pages/115 audited files, production smoke 4 PASS, dependency audit 3 moderate/0 high. Project-base 4+1 Chromium PASS; context validator PASS. Rust physics gate remains FAIL. Docker engine absent, so fresh DB/IdP/restore verification NOT RUN.
- User action `ET-LINE-001-UA-02`: DONE 2026-09-28; user explicitly authorized exact `main → a7b198f`. Preflight confirmed clean expected refs and ancestry; `git merge --ff-only` PASS, `main` HEAD exactly `a7b198f`, design/reconciliation commits reachable, context/CI/hygiene validators PASS. Push/deploy NOT RUN. Unlock — canonical-main design/status integration.
- User action `ET-LINE-001-UA-03`: DONE 2026-09-28; user separately approved review of the third parallel-RLC `|U_C|>0.01 V` assertion after independent analytical and grid-sensitivity checks. Physics evidence in `docs/notes/et-line-physics-reconciliation.md`; unlock — focused and complete Rust reference validation. No terminal PASS inferred from approval alone.
- Verification completion 2026-09-28: three physical oracles passed Rust reference 8/8 and full crate tests; Clippy, rustfmt, WASM artifact hash, 168 frontend tests, lint, typecheck, production build, root built Chromium 106 PASS/5 expected live-auth skips and base-path 4+1 Chromium PASS. `ET-LINE-001` verified locally; no backend/IdP or manual screen-reader completion inferred. Final `pnpm verify:full -- --skip-install` exit 0: hygiene/CI, Astro check, lint, 168 Vitest, root built Chromium 106 PASS/5 expected skips, 25-page build, production smoke 4 PASS, dependency audit 3 moderate/0 high or critical.
- NEXT: ET-RC1
- Next action: none for ET-LINE-001; ET-14.1 verified locally; ET-14.2 policy decision is selected independently. ET-10.3-UA-19 closed PASS; no repeated human gate.
- User action `ET-LINE-001-UA-04`: DONE 2026-09-28; user approved exact `main@a7b198f → feature/line-transient-mvp@fefe168` for commits `6a0d08c`, `19b1a27`, `fefe168`. Fresh preflight: both worktrees clean, merge base `a7b198f`, remote `main` read-only HEAD unchanged at `dc38ee6`. `git merge --ff-only` PASS; local `main@fefe168` clean, all three commits reachable, context/CI/hygiene validators PASS. Push/deploy/worktree deletion NOT RUN.

## ET-14.1 — Domain events, jobs/outbox и in-app inbox

- Status: verified
- Condition: независимый platform track после terminal ET-09.2 и ET-10.1. V1 policy утверждена ADR-032 и feature SPEC. Commit `9762797` с реализацией 0013/outbox/worker/private API и RU/UK inbox достижим из текущего `main`; terminal acceptance выполнен на отдельном disposable PostgreSQL/Keycloak stack 2026-09-28. ET-10.3 manual screen-reader gate независим.
- Dependencies: ET-09.2 и ET-10.1 terminal verified; notification policy v1/ADR-032 approved.
- Goal/scope: booking.accepted transaction → durable outbox → retry-safe worker → одно owner-scoped in-app notification → RU/UK inbox → mark read. External channels, reminders и preferences принадлежат ET-14.2..4.
- Runnable vertical slice: tutor принимает REQUESTED booking; commit создаёт event; worker доставляет ровно один приватный item student; student читает его, foreign/anonymous denied; duplicate/retry и worker outage не откатывают Booking.
- PASS contract: approved SPEC/ADR, reversible 0013 migration/catalog parity, real DB worker/ownership/retention tests, RU/UK UI, live browser→Keycloak→API→PostgreSQL→worker→inbox→read, security/accessibility/fallback review, final docs/context/diff.
- Evidence 2026-09-28: новый volume/container electro-tutor-et141-test-20260928 на 127.0.0.1:55436; единственный writable data mount — его собственный volume; repository init SQL read-only. Сохранённые Electro Tutor/MathMorph containers оставались stopped/Created, original DB и volumes не монтировались/не менялись. Fresh electro_tutor_test и независимая electro_tutor_catalog_baseline мигрированы до 0013; manifest 0013 создан из fresh catalog, db-status/catalog parity PASS. Отдельная electro_tutor DB прошла 0012→0013 и Alembic check; baseline прошла реальный 0013→0012→0013 с тем же catalog manifest. 9 transactional catalog drift cases PASS. Backend 199 DB-free PASS, 75 real DB integration PASS без skip, mypy 48 files PASS, Ruff format/check src/tests PASS. Worker --once PASS; real booking/outbox/delivery/retention/IDOR integration PASS. Frontend Vitest 171 PASS, ESLint PASS, Astro check 124 files/0 errors/0 warnings (2 generated hints), build 25 pages/115-file audit PASS; static Chromium 108 PASS/5 expected live-auth skips. Isolated live Keycloak profile phase 7 PASS/3 expected phase skips, dedicated notification browser 1 PASS: Booking accepted → worker → RU inbox → keyboard mark-read/reload, UK empty/foreign 404, anonymous 401. Exact commands and limits: docs/TESTING.md.
- AUTOMATED_A11Y: PASS — RU/UK semantic controls, keyboard mark-read, visible unread state and status region exercised in component and live Chromium; no manual speech observation claimed.
- MANUAL_SCREEN_READER_GATE: PASS — owner-confirmed UA-19 / Narrator and RU/UK voice; evidence/accepted-gates-20261002.json.
- Limit: original data-bearing DB read_booking_operation(uuid) 8-column compatibility remains a separate unmodified gate. ET-14.1 is integrated in local `main`; production deploy is not evidenced. Manual ET-10.3 RU/UK voice/screen-reader gate is PASS; restored canonical evidence is in docs/TESTING.md (UA-19).
- Historical no-tails audit (2026-09-28): canonical main@9350797 clean; feature/line-transient-mvp@fefe168, design@a7b198f and detached@72212d5 reachable from main; feature/et-14-1-notifications was then the intentional clean, unmerged track. Current recovery check: `9762797` is an ancestor of `main@f25214e`; `origin/main` tracked the same SHA at audit time. The historical worktree and service inventory is not a current runtime claim.
- User action ET-14.1-UA-01: DONE 2026-09-28; approved v1 policy recorded in ADR-032/SPEC.
- User action ET-14.1-UA-02: DONE BY ISOLATION 2026-09-28; exact disposable Docker identity/mount/port and preserved-container states checked before mutation; clean/upgrade/catalog/worker/live E2E evidence above.
- NEXT: ET-RC1

## ET-14.2 — Preferences, timezone и reminders

- Status: verified
- Blockers: none for ET-14.2 product/manual acceptance. Broad preview startup issue transferred to ET-RC1 automatic gate.
- Condition: reminder implementation and terminal isolated acceptance already exist on `feature/et-14-2-reminders` (implementation `57c6867`, audited branch `850713c`). Baseline `main@09b61d1` had inbox only. User explicitly authorized local merge 2026-10-02; local main@19c6ea2 contains reminder settings and 0014; fresh post-integration live/DB checks PASS. UA-19 / Narrator and RU/UK voice manual acceptance PASS, owner-confirmed 2026-10-02.
- Dependencies: ET-14.1 verified; ADR-033 reminder policy ACCEPTED. ET-10.3 manual gate closed, not a prerequisite blocker.
- Goal/scope: approved IANA timezone, 24h/1h/15m and quiet hours -> durable owner-scoped Booking intents -> ET-14.1 worker/outbox/inbox. Cancel + new Booking, inclusive 15-minute catch-up grace; external channels deferred.
- Runnable vertical slice: implemented and verified on feature; settings and inbox at `/ru/account/` and `/uk/account/`. Local main@19c6ea2 contains both settings and inbox; integration DONE. Screens owned by `src/pages/[lang]/account.astro`, `[data-reminder-settings]` / `[data-notifications]`.
- PASS contract: approved ADR-033/booking-reminders SPEC; reversible 0014/catalog; real DB scheduler/DST/quiet-hours/cancel/ownership/idempotency; live RU/UK browser -> Keycloak -> API -> DB -> worker -> inbox. Terminal feature evidence 2026-09-29: real DB 64 PASS/17 unrelated skips; live reminder 1 PASS, live notification regression 1 PASS, auth/profile 7 PASS/3 expected skips. Fresh 2026-10-02: frontend 174 PASS, backend fast 202 PASS and Ruff/mypy PASS; ESLint, Astro 129 files/0 errors/0 warnings (2 pre-existing generated hints), production build 25 pages/115 audited files, context/CI/hygiene and root overlay PASS. Historical unchanged-source live evidence remains applicable.
- Product decision `ET-14.2-UA-01`: DONE / ACCEPTED; original approval 2026-09-28, directly reconfirmed 2026-10-02. Defaults ON/ON/OFF, explicitly confirmed IANA zone, quiet hours OFF, cancel/new Booking and 15-minute grace; no repeat product question.
- Closed manual gates: `ET-10.3-UA-19` / Windows Narrator PASS; `ET-RU-UK-VOICE` PASS. Repeat only for a concrete new change affecting accepted behavior. Confirmation is human evidence, not agent-observed speech.
- Agent task `ET-14.2-INTEGRATION`: DONE / MERGED_LOCAL_MAIN_19c6ea2; explicit user approval received 2026-10-02 («Да, сливай»). Integrate existing feature plus reconciled docs into local main, preserving both ancestries, portable DEV bridge, fast-uri 3.1.7 patch, booking race tests/evidence and star recovery. No implementation or manual screen check is delegated to the user. Fresh isolated runtime recreation, conflict resolution and post-integration checks belong to the agent.
- User action `ET-14.2-MERGE-APPROVAL`: DONE / APPROVED 2026-10-02: exact user response «Да, сливай» to docs@d6485cc + feature@0500798 -> main@09b61d1. Not a manual product gate. Auto-review rejected `git merge --no-commit --no-ff feature/et-14-2-reminders` into the prior docs branch before execution. Safe action: explicitly approve local merge of reconciled docs and reminder feature into main; expected evidence: both ancestors retained, integrated source/routes/migration 0014, current automated tests and canonical docs PASS. Unlock: agent completes integration; push/deploy/worktree deletion require separate authorization.
- REAL_MANUAL_REMAINING: none for this reconciliation scope. ET-14.3 privacy/test bot access and original DB SQL compatibility are future/external inputs, not implemented reminder screens or unperformed current manual checks.
- Evidence: `docs/TESTING.md`, `docs/evidence/manual-gates-20261002/reconciliation.json`; feature-owned approved SPEC is `feature/et-14-2-reminders:specs/features/booking-reminders.spec.md` now present in the integration tree; no product policy pending. Historical failures remain historical evidence, not reopened gates.
- Night independent criterion `ET-NIGHT-BOOKING-RACE-01` — PUBLISHED b76c93d: новый additive test на свежем собственном PostgreSQL17.6 доказал реальное ожидание Booking lock двумя authenticated connections в обеих очередностях запуска. При одной expected_version ровно один переход/version+1, другой version_conflict; operation/audit/grant/outbox и winner replay согласованы. Final race2PASS, unchanged related tests15PASS/1 explicit lifecycle-consent skip, DB-free199PASS; Ruff85files/mypy48PASS. Fresh0→0013/AlembiccheckPASS. Первоначальные instrumentation2FAIL и ошибочно смешанный unit/integration environment2FAIL сохранены; PID observation и очищенное task-local unit environment прошли без изменения accepted assertions. Только новый test/SPEC/evidence/docs; production/migrations/fixtures/locks unchanged. Собственные synthetic container/volume штатно удалены по exactCID/image/nonce; original DB не подключалась. Receipt: docs/evidence/night-20261002-booking-race/verification.json. Это не HTTP/browser E2E и не acceptance reminders/screen-reader. Normal publication b76c93d/main-origin0/0 подтверждена; exact-head Actions0/deployments0 read-back подтверждает skipci/no-deploy. NEXT для независимого criterion: нет обязательной реализации; continue other dependency-ready work; historical selected NEXT was ET-14.2-INTEGRATION; current selector/NEXT is ET-RC1/ET-18.2.
- User action `ET-NIGHT-AUDIT-UA-01`: CLOSED / DONE by current RC1 bounded runtime audit (0 known vulnerabilities after compatible PyJWT patch). Historical NIGHT auto-review rejection was an unexecuted attempt; current successful metadata-only audit/evidence supersedes its approval tail. No secrets or DB/user data transmitted. Evidence: docs/evidence/rc1/python-runtime-audit.json.
- Current integration evidence 2026-10-02: frontend174/backend202, real PostgreSQL83 with no skips, lint/typecheck/build/context/CI/hygiene PASS; live profile7PASS/3 expected skips, inbox1PASS and reminders1PASS, runner exit0. Concurrent main@8fe5ac6 accepted-gates/ADR-034/AGENTS/context SPEC commits preserved by ancestry; production source matches feature0500798; main bridge/security/race/star/voice evidence preserved. Historical preview readiness timeouts resolved in RC1; current full Chromium128 PASS/6 dedicated live skips. Not a manual gate.
- NEXT: ET-RC1-PRODUCTIZATION

- Main integration: DONE / MERGED locally 19c6ea2, 2026-10-02; includes 0500798/d6485cc/c5bdb76 and concurrent main8fe5ac6. API/0014/RU/UK account settings+inbox present in main; current live consumer PASS. No push/deploy/worktree deletion. Previous pre-integration snapshots in evidence are historical.

## Поздние этапы

- ET-10.3 acceptance verified; ET-11.1/ET-11.2 и поздние stages требуют отдельного выбора и dependency-ready SPEC/evidence, их реализация этим checkpoint не запускается.

## ET-MICRO-001 — Micro Labs на главной

- Status: verified
- Lifecycle: completed; evidence: merged, pushed, deployed and verified publicly2026-10-29.
- SPEC: specs/features/engineering-showcase.spec.md; SHOW-008..011.
- Dependencies: ET-SHOWCASE-001 verified/released, clean main e2e0497. Existing checkout/new feature/micro-labs; no worktree.
- Slice: home→14micro models/8groups→physical parameter→computed result/plot→reset/filter/permalink/locale. Neutral engineering symbols; existing3advanced routes preserved.
- Plan: pure models+invariants → reusable card/circuit/plot/time+catalog → mobile/browser/current frontend gates → commit → ONE owner publication permission → public same-path acceptance.
- Checks: KCL/KVL/power; RLC resonance/RMS; RC continuity/energy; diode piecewise intersection; star balance; first-order differential equation; motor torque/back-EMF/energy; line load boundary. Production build/unit/lint/typecheck and bounded browser.
- Blockers: none for Micro MVP. Advanced multi-line owner prompt/reference not supplied; that future scope is deferred, not a dependency. No 3D needed for chosen2D models.
- Local evidence:213unit/29files PASS, lint PASS, Astro158files/0errors/0warnings/2existingWASM hints, build25pages/126artifacts PASS.17combined browser checks PASS/37.4s; final7micro PASS/17.6s after multiline/390px formula fix. Physics14invariants/control corners PASS. Actual local Chrome desktop/mobile,14cards/8groups,390px width375,KaTeX/errors0; source-only105topics/14real/91planned. Existing accepted tests unchanged. Evidence:docs/TESTING.md.
- Documentation sync:README/STAGES/ROADMAP/TESTING/feature SPEC/index/ARCHITECTURE/ADR-037/DESIGN/SHOW ledger updated; SECURITY/API/DATA_MODEL/dependency/SW contracts checked unchanged within this frontend delta.
- ET-MICRO-PUBLISH-01 / DONE 2026-10-29: прямой ответ владельца «Разрешаю merge, push и публикацию». Clean main e2e0497 fast-forward→9cacf22fd932ff8e3e65660112094a44468e2514 без конфликтов; обычный exact-SHA push origin/main и ls-remote read-back PASS. Post-merge213tests/29files и context/diff PASS. Cloudflare Git deployment76b3eaf7-f68e-48f6-b734-31698b68da31, source main9cacf22, SUCCESS/1m26s (build1m8s/deploy12s), Node22.23.1/pnpm11.23.0. Primary https://electrotutor.pages.dev/ru/; immutable https://76b3eaf7.electrotutor.pages.dev/. Existing electrotutor-mvp/GitHub Pages/secrets unchanged. Local feature/micro-labs retained as recovery ref; remote feature not created. No cleanup approval inferred.
- NEXT: NONE

- Public evidence: fresh Chrome14cards, all14first-parameter changes and resets PASS. RC t0→5s gives0→11.919V; C2000µF givesτ2s/t5s/uC11.015V; category drive1card/searchRC1card. Direct #micro reload and ordinary RU→UK preserve selected capacitor-charge. Clean navigation browser errors0, KaTeX errors0,390px page375px/formula overflow0. Desktop/mobile public SVG/plot/formulas reviewed; actual screenshots saved in chat outputs/published-micro-labs-*.jpg. Main UI and useful calculations available without login/backend/manual configuration.
- User actions: none. Current Micro MVP released;105-topic roadmap/advanced arbitrary topology editor/3D remain future-only. Own preview4325 stopped after acceptance; pre-existing4322 preserved.

## ET-SHOWCASE-001 — Инженерная витрина главной

- Status: verified
- Lifecycle: completed; evidence: merged, pushed, released/deployed and verified publicly 2026-10-29.
- SPEC: specs/features/engineering-showcase.spec.md; approved user request2026-10-28, SHOW-001..007.
- Dependencies: ET-RC1 verified, static Pages MVP verified. Existing checkout; no additional worktree.
- Slice: RU/UK home→8featured scenes→DC/RLC/RC parameter→computed SVG/chart/result→pause/navigation/hash/reload. Other5static examples honestly labelled; catalog12/cards/8categories/search,5templates. Software/learning/booking compact blocks; no new services.
- ET-SHOWCASE-CONTACT-01 / NOT_REQUIRED: владелец ответил «всё, но пока не подключаем». Контакты, календарь и оплата не подключены; запись честно недоступна, цены/длительность не выдуманы.
- ET-SHOWCASE-PUBLISH-01 / DONE: владелец ответил «Разрешаю push и деплой» для feature8789cd5 и подготовленной сборки; сам подключил GitHub к существующему electrotutor Pages. Production source main@bbe6c0210b72ca55fc6de0400ae2ea4016d0fe7c; deployment bb3428b1-8dc9-48b5-923c-c822bc4ce346 SUCCESS; https://electrotutor.pages.dev/ru/, immutable https://bb3428b1.electrotutor.pages.dev/. Build command SITE_URL=https://electrotutor.pages.dev BASE_PATH=/ pnpm build; output dist; NODE_VERSION22.23.1/PNPM_VERSION11.23.0. Cloudflare actual Linux build PASS (36s build/7s deploy). Old electrotutor-mvp/GitHub Pages retained; secrets/backend/auth unchanged.
- ET-SHOWCASE-MERGE-01 / DONE: владелец запросил безопасный merge, затем удаление временной ветки. Local main fast-forward7d63a28→06a1802 без конфликтов; исходный feature8789cd5 и approval checkpoint сохранены в ancestry. После merge199tests/28files, build25pages/126artifacts, context/diff PASS. Local feature/return-local-dev-consumer удалена через branch -d после ancestry PASS. Независимая fix/et-fast-uri-pages сохранена.
- ET-SHOWCASE-MAIN-PUSH-01 / DONE: отдельный ответ «Разрешаю push main». Ordinary push main6cb4857 подтверждён ls-remote; feature8789cd5 ancestor PASS; remote feature/return-local-dev-consumer удалена только после read-back main. Последующий documentation deployment checkpoint bbe6c02 [skip actions] запустил Cloudflare актуального main и пропустил GitHub Actions/Pages. История не переписывалась.
- Recovery: ручная загрузка ZIP не завершилась; после owner Git connection первоначальный09b61d1 был опубликован без build. Исправлены только build/output/runtime versions. Automatic review отклонил Retry старого09b61d1; retry не выполнен. Новый production build из объединённого bbe6c02 успешно заменил старый артефакт; provider SUCCESS и public checks подтверждены.
- Local evidence: frontend199/28files PASS, lint PASS, Astro151files/0errors/0warnings/2existing generated WASM hints, production build25pages/126artifacts with locale/lesson/site audits PASS. New showcase Chromium11PASS/16.2s covers8scenes/RU-UK/light-dark/390px/1440px/short768px/no clipped content, controls/retained state/hash/reload/swipe/7.5s autoplay/offscreen/reduced motion. Existing guest lesson4PASS retained in the bounded14-test run. Physics tests cover DC KVL/power, AC instantaneous KVL/complex power, RC initial/derivative/limit, stars KCL, diode operating point, magnetic MMF and line load boundary. Existing accepted tests unchanged. One active cleaned-up RAF; KaTeX and curve points memoized; no new dependency/backend/auth/worker changes.
- Public evidence: fresh Chrome HTTPS home PASS; DC E48V→I0.48A; RLC f50→51Hz изменяет I4.545→4.442A; RC C2000µF→τ2s, running clock and pause retained0.58s PASS. Hash rc-charge reload и RU→UK с сохранением сюжета PASS; Python search1card; dark/light SVG/plots/formulas visually PASS, mobile390px pageWidth375 no overflow. KaTeX errors0, browser errors0. Actual public screenshots сохранены в chat outputs; docs/TESTING.md — canonical receipt.
- Documentation sync: README, ROADMAP, STAGES, TESTING, ARCHITECTURE, ADR-036, feature SPEC и SHOW ledger актуализированы. DESIGN/SECURITY/API/DATA_MODEL и существующие dependency/fallback/traceability sources проверены в рамках UI/deploy delta; architecture/auth/backend contracts без изменений.
- Blockers: none. User actions: none. Future185topics remain optional backlog.
- NEXT: NONE
- Next scope: current release finished; future features require a new bounded owner request.

## ET-RC1 — Productization / Release Candidate 1
- ET-MVP-CF-ADDRESS-01 / verified, released/deployed (2026-10-28): владелец запросил https://electrotutor.pages.dev/. Cloudflare Rename dialog явно сообщает «This will not impact any hostnames or deployments»; простое переименование не выполняет запрос. Та же static сборка опубликована с SITE_URL=https://electrotutor.pages.dev/, BASE_PATH=/, без backend. Основной URL https://electrotutor.pages.dev/; deployment 14ca5990-5285-40db-bb01-6e8bd481c060, immutable URL https://14ca5990.electrotutor.pages.dev/. Cloudflare121/121files/Success; Chrome home→lesson→correct2.18A→direct reload PASS, completion retained, SVG и9KaTeX/.katex-error=0, browser errors=0; canonical на новом hostname. Старый https://electrotutor-mvp.pages.dev/ru/ проверен и работает. Product source, OIDC/PKCE и backend не менялись.
- ET-MVP-CF-ADDRESS-UA-01 / DONE 2026-10-28: прямой ответ владельца «Да, создать и опубликовать». Cloudflare form подтверждает electrotutor.pages.dev; pnpm11.23 build PASS (25 pages/121 artifacts), готовый ZIP SHA256 fdf0740695a70060fe704c4c72e5a042d7dc3aa084aef5a39981c22266eb9b1f. Разрешено создать бесплатный Direct Upload Pages проект electrotutor и опубликовать существующий static MVP; старый electrotutor-mvp сохраняется. Evidence: разрешение владельца, provider hostname/deployment ID и public browser PASS выше. Первый create вернул Cloudflare unknown error; отсутствие проекта сверено по полному inventory3, единственный retry успешен. Upload задержался, затем121/121PASS без повторного create/deploy. User actions: none; blockers: none.

- ET-MVP-NOW / verified, released/deployed (2026-10-28): прямой запрос владельца запускает существующий static Web MVP на Cloudflare Pages без новых features/backend и без ожидания ET-18.2. Сценарий: / → RU home → /ru/topics/dc/mesh-current-method/ → I3=24/11 A → feedback/completion/reload. RU/UK lesson, SVG и KaTeX уже реализованы; PUBLIC_API_ORIGIN пустой, OIDC/PKCE source не меняется. Acceptance: build, главная, упражнение/корректный ответ, схемы/формулы, browser errors, reload прямой ссылки; затем те же проверки публичного HTTPS URL.
- ET-MVP-CF-LOGIN-01 / DONE: владелец подтвердил вход; активный Cloudflare account ea6e01a387850248f6cc7c60024aa57a подтверждён через Workers & Pages в браузере приложения.
- ET-MVP-CF-PUBLISH-01 / DONE 2026-10-28: прямой ответ владельца «Разрешаю создать и опубликовать» разрешает бесплатный Pages Direct Upload electrotutor-mvp в account ea6e01a387850248f6cc7c60024aa57a и публичную публикацию проверенного static dist (BASE_PATH=/, SITE_URL=https://electrotutor-mvp.pages.dev). Artifact ZIP SHA256 f1557819a9cfe1ae82397b80ca26760a295162e22d1fad8516d688cf0908f400. GitHub Pages, production secrets и backend infrastructure сохраняются. Cloudflare загрузил 121/121 файлов и подтвердил Success. Production deployment c0bbe0d0-280e-45dc-8dac-8d20d96782cf; immutable URL https://c0bbe0d0.electrotutor-mvp.pages.dev/; первый URL https://electrotutor-mvp.pages.dev/ (сохранён; основной адрес теперь https://electrotutor.pages.dev/).
- MVP local evidence: source 0d4061e, штатный pnpm11.23.0 build PASS: WASM integrity, 394 paired locale keys, 25 pages/24 localized routes/121 artifacts. Existing Playwright learning-journey --grep "public learner|explanation levels" --workers=1: 4 PASS (29.0s), без mock/backend. Chrome home/lesson/правильный ответ/прямой reload PASS; SVG/KaTeX визуально проверены, .katex-error=0, browser errors=0. Математика: 6I1−2I2=24, −2I1+8I2=12 → I3=24/11 A. Public Chrome PASS на https://electrotutor-mvp.pages.dev/: root→RU home→mesh lesson, wrong1.2/correct2.18A feedback, completion после прямого reload, RU→UK с сохранённым progress, SVG/9 KaTeX без .katex-error и browser errors. Учебный сценарий без login/backend/manual developer setup. User actions for MVP: none; blockers: none. Результат теста хранится в docs/TESTING.md.

- Status: verified
- NIGHT-ET-POSTMERGE-01 / VERIFIED_LOCAL_7D63A28: repeated frontend189/backend208 tests,
  Ruff92/mypy52/typecheck/build/context/CI/hygiene PASS on updated main. Existing original DB,
  IdP and accepted Narrator/RU/UK voice/reminder gates preserved; no repeated manual request.
- ET-STAGING-SCOPE-01 / NEEDS_DECISION: owner must distinguish bounded RC1 Web/PWA private
  staging from full ET-18.2 backend/realtime production rollout. Existing build exports25pages;
  backend runtime supports local/test/ci only. No hosted production profile or resources invented.
  Safe next action: approve bounded staging SPEC/topology, hosting/HTTPS/IAM owner, synthetic
  dataset, backup/restore proof, SLO/budget/operator and rollout/rollback acceptance. Expected
  approved contract unblocks implementation; full bundle still requires ET-18.1 dependencies.
- NIGHT-ET-HYGIENE-01 / MAINTENANCE_RULE: continue in canonical root/existing branch,
  existing worktree-policy audit and exact inactive-ref review at finalization; no duplicate
  checkout. Existing Compose bounded logs and role-helper tmpfs remain. Stop disposable test
  helpers and compare volume sets. Publication/Pages auto-deploy is a separate owner action.
- Fresh synthetic PostgreSQL17.6 tmpfs: migrations0→0014/check/catalog +83integrationPASS/
  217deselected. Original personal DB container/state unchanged, helper removed,77volume names
  unchanged. This is fresh DB integration; hosted IdP/voice acceptance not repeated.
- ET-STAGING-PLAN-01 / BLOCKED_DECISION: NEXT ET-18.2 is bounded planning only. Owner must
  confirm hosting/HTTPS/IAM/backup-restore/SLO/budget/operator contract and dependency-ready
  ET-18.1 before rollout implementation; current Settings supports only local/test/ci.
  Expected approved SPEC + concrete runtime/rollback gates; no production profile invented.
- Local Docker hygiene RC1-009: all services json-file10m×3; psql-only role helper
  tmpfs16MiB prevents anonymous volumes. Native model/helper allocation PASS; no SQL,
  schema/data/voice/auth behavior change. Evidence: docs/evidence/docker-hygiene-20261023.json.
- Night consolidation2026-10-23: canonical root/feature/return-local-dev-consumer reused;
  all4 temporary worktrees physically removed (5 ->1 total), HEADs reachable from active line,
  ignored3files/239bytes SHA-retained. All original refs plus dangling commit are in verified
  .worktree-archives/night-consolidation-20261023/all-refs.bundle (85,565,536bytes).
  Old security branch is superseded by current newer dependencies; no lock downgrade/import.
- Current cleanup checks: frozen pnpm11.23/uv0.12.3, frontend189PASS, backend208PASS/92deselected,
  Ruff/mypy/lint/check/build/context/CI/hygiene PASS; built Chromium128PASS/6dedicated-live skips.
  DB/auth/voice/manual acceptance below remains historical and is not reopened by cleanup.
  Evidence: docs/evidence/night-consolidation-20261023.json and docs/TESTING.md.
- Shared DEV repair: pnpm global config had only stale storeDir E:/DEV/dependencies/pnpm-store;
  native CLI changed it to selected C:/Users/aleks/DEV/dependencies/pnpm-store with exact backup
  and read-back. Receipt: ${DEV_ROOT}/state/pnpm-store-recovery-20261023/receipt.json.
  No package graph or Codex runtime configuration changed.
- NIGHT-ET-FINALIZE-01 / DONE_LOCAL: owner explicitly approved; main6b5af43 ->7d63a28
  via verified fast-forward. All15 exact inactive integrated refs deleted by git branch -d;
  fix/et-fast-uri-pages retained, recovery bundles verified, one checkout. Push/deploy unauthorized.

- Checkpoint: source_manifest_sha256=cd4690f47af51e0eb4574d8e8567dd61b2e25a4a7d55d8a82286b1b7cd52da90
- Candidate result: RC1_READY — локальный release candidate Web + installable PWA.
- Blockers: none
- Deployment boundary: static public MVP опубликован на Cloudflare Pages; backend production hosting/IAM/original DB compatibility remain separate ET-18.2 scope.
- Condition: approved productization-rc1.spec.md RC1-001..010 выполнены; проверен связный путь без знания внутренних stages. ET-14.2 интегрирован в main с 19c6ea2; RC1 source integrated in local main bee6ddc after explicitly authorized clean fast-forward; final documentation receipt retained in the same local ancestry.
- Dependencies: ET-10.3/ET-14.1/ET-14.2 verified; обе истории docs/reminders, DEV bridge, security fixes и принятые tests/evidence сохранены.
- Runnable vertical slice: home -> catalog -> опубликованный mesh lesson -> ответ/feedback -> completion -> reload/leave -> resume -> account/history. Реальный Keycloak -> API -> PostgreSQL: signup -> student profile -> lesson -> logout -> login -> восстановленная история/settings/inbox. Booking -> worker -> reminder/inbox terminal acceptance сохранён и проверен при reconciliation; это отдельный настоящий consumer path, не mock.
- Changes: account в общей navigation; безопасная public API configuration; bounded timeouts; честные unavailable services/contacts; практика и versioned device-only progress с гостевой/issuer+subject namespace; защита slow identity/malformed/quota/storage-denied; resume/history; raster PWA icons/offline Worker/WASM; keyboard/reduced-motion/contrast fixes; compatible dependency patches.
- Evidence: docs/evidence/rc1/readiness.json; docs/TESTING.md; derived docs/notes/productization-report.md. Frontend189 PASS, backend208 PASS, real PostgreSQL83 PASS/no skips; broad Chromium128 PASS/6 expected live-phase skips; dedicated genuine registration/return1 PASS; base-path4+1 PASS; build25 pages/24 localized routes/121 artifacts; lint/typecheck/validators/audits PASS.
- Review: two bounded independent read-only review cycles; malformed browser record and delayed identity write findings resolved and regression-tested. Accepted tests not rewritten, weakened, deleted or skipped. Protected Session speech/focus source unchanged.
- Closed user gates: ET-10.3-UA-19 / Narrator PASS; RU/UK voice PASS; ET-14.2-UA-01 policy ACCEPTED; integration approval DONE. Evidence: accepted-gates-20261002.json and manual-gates-20261002/reconciliation.json. Повтор только после конкретного изменения соответствующего behavior.
- User actions: none for historical RC1 product acceptance; local finalization DONE. ET-STAGING-SCOPE-01 and ET-STAGING-PLAN-01 above are the remaining rollout planning decisions. No remote publication, deployment or original data repair performed.
- REAL_MANUAL_REMAINING: NONE
- NEXT: ET-18.2
- Next scope: ET-MVP-NOW completed; отдельный полный backend rollout ET-18.2 требует bounded HTTPS/IAM/API/backup plan. Future features remain separate backlog.

- DEV-LDC original race admission: VERIFIED_TWO_VARIANTS — native fresh ET103 container/volume20261008/loopback55434/original readonly init SQL/new0014, original accept/cancel tests 2PASS0SKIP28.40s. Owned registry COMPLETED/SSH released/new container stopped+data retained/original19resource source-default-ledger POST unchanged. Prior full81PASS2SKIP remains its historical result; these two skipped scenarios are now covered separately. V23 tokenlost UNKNOWN_HOLD/GER-15 unchanged; frontend/auth/whole MASTER pending. Evidence ELECTRO_DISPOSABLE_RACES_TERMINAL_V1 in DEV-LDC Task.

## ET-PANORAMA-001 — Панорамный редизайн ElectroTutor

- Status: verified
- Lifecycle: completed/published with ET-VIS-001; source26985b68895d9aad648ba792cfaa2465200b8f52; Cloudflare12ca3006-7c24-41d5-82cd-4e01c2e647ca SUCCESS40s (build30s/deploy7s),2026-10-29.
- SPEC: specs/features/engineering-showcase.spec.md; SHOW-012..015; прямой запрос владельца и три приложения2026-10-29.
- Dependencies: ET-MICRO-001 verified/public. Existing checkout, clean main1a23a2e; feature/panoramic-redesign, no new worktree.
- Scope: ElectroTutor vector identity/header; dark panoramic existing analytic scenes + one lossless-line SVG projected U(x,t) surface; light compact14micro grid; existing advanced links; local drawing/erase/undo/export board; software/lesson/booking presentation. No new dependencies/backend/secret/hosting changes. Existing routes/calculations/RU-UK/hash preserved.
- Vertical slice: RU home→panorama/manual control→Micro parameter→result/plot/reset→real advanced route; draw/undo/export on local board. Mobile and dark preferences remain supported.
- Verification: pnpm test/lint/check/build; accepted micro/showcase E2E unchanged; new focused surface/boundary and board checks; desktop/mobile screenshots and browser errors. Published check only after new approval.
- Reference: attached Micro Labs image available; second historical panoramic image absent, textual composition used. Existing original analytic models reused. STUD read-only route via registry; no local source/runtime path published. Normative applicability and topology checked separately; no blanket GOST certification.
- Blockers: none for local implementation. No prices/contact/payment/provider/advanced editor invented.
- User actions: ET-PANORAMA-PUBLISH-01 / DONE. Owner explicitly approved current integration/push/deletion; provider success and public15browser PASS recorded under ET-VIS-001. No pending owner approval.
- NEXT: NONE

- Local evidence:216unit/30files PASS; lint PASS; Astro163files/0errors/0warnings/2existingWASM hints; production25pages/128artifacts PASS;21combined built Chromium PASS/43.1s, final3new PASS/6.1s after pointer fix. Neutral Ohm/RLC/RC topology and mathematical invariants checked; standards applicability bibliography only, full normative conformance NOT_RUN. Relevant-only route/implement-stage + bounded independent reviewer: no critical findings; board drawing is pointer-only (keyboard users can operate toolbar/experiments), explicit limitation retained.
- Documentation sync: README/STAGES/ROADMAP/TESTING/SHOW ledger/SPEC/system brand/ARCHITECTURE/ADR-038/DESIGN/AGENTS brand updated. SECURITY/API/DATA_MODEL/dependency/fallback/traceability owners checked within frontend scope; no provider/auth changes. Service-worker strategy/key unchanged; identity-only script-byte refresh re-runs existing CORE install to refresh SVG/PNG/manifest for installed clients. No extra worktree or architecture document.

- Final local acceptance: final10micro/panorama PASS after mobile hamburger/footer fix; existing3PWA scenarios PASS (fixture upstream4322 served same dist), local390px width375px and44px working menu, desktop4columns/light/dark reviewed. Snapshots in chat outputs/panoramic-micro-*.png; no critical scoped review findings. Own preview4328 retained for owner review until release decision; own diagnostic dev4327/test4322 stopped after verification. New public smoke PASS under ET-VIS-001.

- ET-PANORAMA-PUBLISH-01 payload: current feature/panoramic-redesign release commit, fast-forward main1a23a2e; ordinary push origin/main in ZabulaAleksey/electro-tutor; existing Git integration publishes https://electrotutor.pages.dev/ru/. Expected receipt: Cloudflare success for exact source SHA and repeat public card/surface/mobile/hash scenario. Superseded by ET-VIS-001 owner approval for exact integrated temporary-branch deletion; history rewrite/new cloud resource/secret changes remain outside scope.

## ET-VIS-001 — Общий инженерный слой визуализации

- Status: verified
- Lifecycle: completed; main merged/pushed; source26985b68895d9aad648ba792cfaa2465200b8f52; Cloudflare12ca3006-7c24-41d5-82cd-4e01c2e647ca SUCCESS40s (build30s/deploy7s),2026-10-29.
- Dependencies: ET-MICRO-001 verified; original analytic micro/advanced models available. Existing3e4f6e9 candidate is the code baseline, no future stage prerequisite.
- SPEC: specs/features/engineering-showcase.spec.md, SHOW-016..019.
- Scope: read-only scoped STUD extraction/classification; shared nice linear/log axes, SI units/display formatting, validated plot data, meaningful point readouts; representative Ohm/RC/RLC/diode/phasors/first-order Bode/existing line surface. Reuse current island and models; no new dependency/backend/worktree/MathMorph changes.
- Entry/scenario: RU/UK home→parameter→same analytic data, pleasant axes/units/characteristic point/cursor; expanded RC-filter→exact/asymptotic Bode; star advanced→undistorted complex geometry; existing surface→synchronized sections/axes/export.
- Checks: semantic AXIS/PLOT/PHYSICS/3D tests, current frontend build/lint/check, bounded accepted and new browser checks, desktop/mobile render; successful real Cloudflare URL after authorized push.
- Rule scope: universal numeric/units/provenance; contextual Bode/phase/transient; reference-specific source labels/scales; university-specific MPEI graph-paper rule optional view only. No STUD source or personal data copied to product; rule source pointers/hashes kept only in existing DESIGN/TESTING.
- Owner approval2026-10-29: «После этого разрешаю делать мердж, пуш, делете». After validated commit, fast-forward main and ordinary push ZabulaAleksey/electro-tutor origin/main (existing automatic Cloudflare publication), verify live site, delete only integrated feature/panoramic-redesign local/remote if present. No unrelated branch/resource/data deletion or secret mutation.
- User actions: none for scoped integration/publication/temporary-branch cleanup; approval above supersedes the earlier pending candidate permission.
- Blockers: none in this bounded implementation/publication. Full normative certification and future arbitrary-model solvers remain outside scope.
- Local evidence:231unit/32files, lint, Astro173files/0errors/0warnings (2known generated-WASM hints), production25pages/24localized routes/129artifacts,41built-browser scenarios PASS. Source IDs/scope/SHA in TESTING; shared-layer decision ADR-039.
- Release sequence: validated commit→authorized fast-forward/push→exact-SHA Cloudflare/public smoke→delete only integrated temporary branch.
- Hydration correction local evidence:231unit,20affected browser,type/lint/build PASS; same accepted tests. Native fieldset readiness protects model inputs until handlers mount; accessibility tree does not advertise disabled pre-hydration controls.
- Public evidence: primary https://electrotutor.pages.dev/ru/ real Chrome calculations/reset/cursor/Bode/390px width375px/0KaTeX/0console errors;15unchanged public browser scenarios PASS/24,7s, including all14controls, RU-UK/direct hash reload, exact log/cutoff, star isotropy,3D shared x/t/sections/export and board. Initial13PASS/2FAIL resolved by ready guard; no tests changed.
- Cleanup: feature/panoramic-redesign@26985b6 ancestry proved in main and safely deleted locally; remote exact name absent. Same-name temporary receipt branch holds only this final documentation synchronization and is removed after ordinary integration; no worktree or unrelated ref touched.
- Documentation synchronization: README/ROADMAP/STAGES/TESTING/requirements ledger updated to actual public release; DESIGN/ADR-039/ARCHITECTURE/SHOW SPEC retained. SECURITY/API/DATA_MODEL/dependency/fallback/traceability/LEARNING_LOG contracts checked unchanged within scope.
- NEXT: NONE


## ET-LABS-002 — Длинные линии V2, Fourier и научные Micro Labs

- Status: verified
- Condition: bounded first release publicly verified2026-10-29 at https://electrotutor.pages.dev/ru/ ; published source64a6ba0caabe4a280aa746d8b9066ff5d659114e, Cloudflarebc8455b3-824a-4ff9-a29e-9055f1f2a090 SUCCESS72s. Approved safe fast-forward integration and ordinary origin/main push completed. Source unchanged since final hosted18/18PASS; final receipt commit follows with [skip ci].
- Class/dependencies: COMPLEX production frontend/scientific models; ET-VIS-001 verified. Existing checkout, no worktree/dependency/backend/auth/MathMorph/STUD/source-project mutations.
- SPEC/decision: transmission-line-transient LINE-V2-001..007, Fourier FOUR-001..007, engineering-showcase SCI/THEME delta and ADR-040. Direct user contract supersedes FDTD-only/preset/apply/CFL primary UI; original numerical WASM retained at transmission-line-reference, accepted historical tests unchanged.
- Delivered:1..6serial ideal line sections/source-at-node/shuntR, bounded series/parallel RLC load constructor and compatible initial states; sharp resistive fronts, explicit numerical reactive states, live supported R/key events, probes/time/speed/fixed-manual-fit axes, shared2D/3D/SVG export. Fourier drawing/DFT/chain/trace/harmonics/bases/error/playground/local config/CSV.12science models, featured home selection/full filtered catalogue, RU/UK and shared semantic themes.
- Physics: stored model separate from display/clock; supported node boundaries/Kirchhoff/power/energy/initial/convergence checks; no fake unsupported curves. Numeric RLC and finite resource/tolerance limits explicitly displayed. Pure TypeScript models/shared EngineeringPlot, one bounded line Worker; legacy Rust engine retained.
- Source boundaries: STUD resolved by active env/storage/index, applicable generic engineering rules only. Long-line registry discovery is not a verified student variant. Fourier local/GitHub HEAD2bb44a18c53bf1097d27c3c2aaff3f13a3206ffe checked read-only; adapted math provenance in TESTING. No private academic content copied.
- Evidence local:283Vitest/37files PASS; Astro199files/0errors/0warnings/2pre-existing generated WASM hints; lint/context/CI/hygiene PASS; build31pages/30localized routes/146artifacts PASS. Affected browser28PASS then focused line6/Fourier7/science2PASS after final fixes;19unaffected micro/panorama/star/circular PASS. Retained-reference route-adjusted compatibility7PASS incl real Worker/WASM/offline, separately from primary acceptance.
- Evidence public: exact-SHA Cloudflare success and18/18live Chromium PASS on primary domain: Fourier RU/UK/draw/edit/bases/config, science controls/reset/hash/theme/mobile, line constructor/RLC/events/2D3D/locked axes/playback/offline, existing panorama/board exports. Cua manual normal browser/desktop/mobile/light/dark and public formula recalculation; no captured page errors. Browser failures/fixes and one nonreproduced Playground restore failure retained in TESTING, not erased.
- Review: scoped physical and import/resource reviewers; confirmed defects fixed, no remaining high-confidence blocker in supported scope.
- Deferred: arbitrary branched/lossy/nonlinear/general-SPICE lines, advanced dynamic topology events, raster/vector contour extraction and video export, extra140science topics. Not prerequisites for this bounded first release; no claim of complete future platform.
- Approval ET-LABS-PUBLISH-01: DONE explicit «После можешь делать мерже пуш делете»: safe main merge/push ZabulaAleksey/electro-tutor, existing automatic Cloudflare deploy, primary verification and deletion only integrated feature/advanced-science-labs. No force/reset/unrelated refs/resources/secrets.
- Documentation sync: README/STAGES/ROADMAP/SPEC/index/ledger/ARCHITECTURE/DESIGN/SECURITY/TESTING/ADR-040 updated; API/DATA_MODEL/DEPENDENCIES checked unchanged; FALLBACKS absent, none created. No LEARNING_LOG churn.
- Cleanup contract: only fully integrated feature/advanced-science-labs after receipt ancestry/remote read-back; remote branch was never created. No worktree or runtime data deletion; unowned pre-existing preview4321 preserved.
- User actions/blockers: none for this first release.
- NEXT: NONE
- Next action: none in bounded ET-LABS-002; future extensions require their own requested scope.

## ET-UX-003 — Student workspaces, gestures and catalogs

- Status: verified
- Lifecycle: completed/published2026-10-29; approved FF merge and ordinary origin/main push completed; source9ed98f5af48ab6d5d2863715a2e8afc527aa11b1; Cloudflare19537dec-58fb-405e-a034-38979e42270f SUCCESS49s (build38s/deploy7s). Existing feature/student-workspaces from clean synced main76b5c9d; COMPLEX production frontend/native packaging. No worktree.
- Dependencies: ET-LABS-002 verified/public. Existing models/shared presentation remain authoritative.
- Scope/SPEC: student-workspaces.spec.md UX-001..010; all attached UI master points plus latest drawing/card refinements. Standalone component library explicitly deferred by later master; no other-project/STUD writes. Web release independent of native toolchain availability.
- Plan: root shared pointer/zoom + Fourier/surfaces/docs/native; UI writer shared header/cards/catalog/home/services; board writer board/calc workspaces and guards. Non-overlapping files/contracts, no dependency changes without evidenced gap.
- Scenario: catalog -> direct tool -> draft drawing/one commit/cancel -> Ctrl-wheel/mobile zoom -> fullscreen -> save board/navigation guard; RU/UK/theme/mobile; real published same path. Native build/launch only if environment supports it.
- PASS: semantic/unit gesture math + focused browser + type/lint/build/context, relevant retained model tests; exact-SHA hosted acceptance. Android gate separately PASS/BLOCKED; no global audits.
- Approval ET-UX-PUBLISH-01: DONE explicit owner reply2026-10-29 «Разрешаю merge, push, деплой и удаление слитой ветки». After validation: safe FFmain/ordinary origin/main push ZabulaAleksey/electro-tutor, existing Cloudflare auto deploy, real URL checks, delete only integrated feature/student-workspaces. No force/other refs/cloud resources/secrets.
- User actions: none; exact release approval recorded above. Installed Android toolchain verified, real debug APK/native emulator acceptance available.
- Evidence:293unit/41files;15new browser PASS and24retained browser scenarios PASS; lint/type/context/CI/hygiene/build PASS. Two bounded reviewer cycles, confirmed storage/guard/mobile zoom defects resolved. Android debug SHA835D08B6 built/signed/installed; own emulator WebView/offline smoke PASS повторно на финальном APK. Moved MicroLabs7/7PASS.
- Documentation sync: README/STAGES/ROADMAP/SPEC/index/ledger/ARCHITECTURE/DESIGN/SECURITY/TESTING/ADR-041 updated; API/DATA_MODEL/DEPENDENCIES retained (no dependency/backend contract change); no fallback owner exists; LEARNING_LOG unchanged.
- Public evidence:30/30primary-domain Chromium PASS/27.6s; same gesture/board/catalog/Fourier/science/line scenarios incl offline Worker. Normal Chrome direct Ohm link: U48V/R60Ohm=0.8A and38.4W, reload preserves selected model, no captured errors. Initial restricted-shell run had ERR_NETWORK_ACCESS_DENIED; network-authorized identical rerun passed, no source/test changes.
- Cleanup: only integrated feature/student-workspaces after receipt ancestry/remote read-back; remote branch never created. Own ElectroTutorSmoke emulator/forward stopped, unowned preview4321 preserved. APK retained in ignored build and user chat output, no signing key/binary bundled in Git.
- Remaining: physical Android device/release signing/store NOT_RUN; standalone component library explicitly deferred; MathMorph external URL not configured, honest disabled card. No owner action required for current release.
- Follow-up: compact catalog/workspace intro CSS and heading-size regression10affected local browser PASS; final deployment receipt above;10/10primary affected browser PASS/8.6s. Final APK SHA835D08B6271A2D1404A80D0E97E2C5035DA99D722D174211F71D67D06A0713E3 signed/installed and full native WebView smoke repeated PASS.
- NEXT: NONE

## ET-BEAM-001 — Сопротивление материалов и инженерные символы

- Status: verified
- Lifecycle: completed/published; authorized main integration and ordinary push a26437b→a942ace. Sourcea942ace1688cc4eeeaf7600f42723ee87fa23ac8, Cloudflare479fd3f8-95de-48a9-8c65-420f22d0b3f4 SUCCESS,35/35primary-domain Chromium PASS/46.3s. Final documentation receipt does not change product source.
- Dependencies: ET-UX-003 and ET-LABS-002 terminal verified. No backend/new infrastructure required.
- Scope/SPEC: specs/features/beam-laboratory.spec.md BEAM-001..009 / SYMBOL-001..004; user master is approval. STUD strictly read-only.
- Environment decision ENV-01: DONE owner explicitly permits current CODEX_HOME=C:/Users/aleks/.codex for this task despite local resolver `CODEX_HOME must equal runtimeCodex namespace`; DEV_ROOT/DEV_SOURCE_ROOT/PROJECTS_ROOT confirmed, no config/runtime/environment migration. Resolver error retained as evidence, not relabelled PASS.
- Plan: pure stiffness kernel and independent numerical goldens; RU/UK editable beam + synchronized epures/persistence; canonical SVG geometry and full MicroLabs inventory/provenance; browser/geometry/visual/retained regression; docs and atomic commit.
- Runnable vertical slice: /ru/interactive/ → beam lab → preset → drag F during pointermove → reactions/N/Q/M update → sign/edit/Undo/Redo → save/load → same uk/mobile path. Static browser→local numerical kernel is the actual consumer path.
- PASS contract: numerical goldens/equilibrium/compatibility/instability, UI/persistence browser interactions, all scoped geometry/SVG/visual/card bounds gates, existing regression, lint/check/build/context, final documentation/diff review.
- Temporary implementation: none. Deferred scope: optional displacements/stress, nonlinear/frame/internal-hinge solver, formal drawing certification; missing requested verification is never considered deferred/completed.
- Evidence: main@a26437b was clean, sole checkout. Independent analytic verifier13cases/49assertions PASS (no solver import);360unit/45files PASS; Astro235files/0errors/0warnings/3pre-existing hints; lint/context/hygiene/CI contract PASS. Production39pages/38localized routes/168artifacts PASS. Initial combined Chromium50/51PASS retained as history; legacy board address fixed only after explicit approval. Final canonical affected Chromium35/35PASS/34.1s, including13beam,6visual,7Micro,3panorama,2science,4catalog. Earlier31unaffected Fourier/line/circular/star/gesture/workspace PASS retained. Extended actual shared-render suite6/6PASS includes2additional RU/UK catalog/lesson checks.26Micro PNG +1beam mobile PNG reviewed;23SVG snapshots and actual20circuit terminal graphs checked. Scoped final read-only review: no concrete P1/P2. Details and baseline failures in TESTING.
- User action TEST-CONTRACT-01: DONE2026-10-29. Owner explicitly approved exact three-file patch, including corrected board route /board/. Applied MicroLabs routes→/micro-labs/, board /ru/#engineering-board→/ru/board/, two tool-card assertions6→7. Exact diff checked against e81c241: all other numerical/control/locale/export assertions preserved. Canonical affected browser35/35PASS/34.1s; changed-file lint and whitespace PASS. Earlier temporary harness14/14PASS is superseded by canonical evidence.
- User action FINAL-01: DONE2026-10-29. Owner replied «можно Выполнлять» directly to the merge question, explicitly authorizing local main merge. Clean sole checkout, exact branch/HEAD and main ancestry verified; safe --ff-only a26437b→819896c succeeded without conflict. main tree equals tested819896c exactly. No branch/worktree deletion or push/deploy authorization inferred.
- NEXT: NONE
- Next action: NONE for approved release/cleanup. Independent backend CI follow-up CI-01 below is not silently declared PASS.
- Verification limits: straight linear Euler–Bernoulli beam, piecewise constant EI/EA; optional displacement/stress UI, frames/internal hinges/nonlinear effects absent. No matching verified individual STUD geometry established for every screen symbol; sources and chosen SVG dimensions are distinguished in audit. Linux pixel parity, physical touch device and new native APK NOT_RUN; no backend/auth changes or full backend E2E claim.
- Baseline distinction: engineering-showcase.spec.ts11/11FAIL on removed legacy carousel selectors/autoplay; owning EngineeringShowcase.tsx is unchanged from HEAD. Retained as pre-existing contract drift, not silently rewritten or reported PASS. Current consumer paths have actual browser and topology evidence above.
- Documentation synchronization: README, STAGES, ROADMAP, feature SPEC/index, ARCHITECTURE, ADR-042, DESIGN, SECURITY, DATA_MODEL, TESTING, TRACEABILITY, project-context, requirements ledger and scoped audit updated. API/DEPENDENCIES/LEARNING_LOG and existing auth/service-worker contracts checked unchanged; no additional framework/status source created. Finalization updated STAGES/ROADMAP/TESTING/ledger/feature SPEC; README/ARCHITECTURE/DECISIONS/DESIGN/SECURITY/API/DATA_MODEL/DEPENDENCIES/TRACEABILITY/project-context/audit checked current without further changes. Post-merge README/STAGES/ROADMAP/TESTING/ledger updated to actual integration; SPEC/ARCHITECTURE/DECISIONS/DESIGN/SECURITY/API/DATA_MODEL/DEPENDENCIES/TRACEABILITY/project-context/audit checked unchanged. Existing test counts and baseline limitations retained. Publication receipt updates README/STAGES/ROADMAP/TESTING/ledger; unchanged owners remain current; no source or test changes.
- Local review: own hidden preview http://127.0.0.1:4323/ru/interactive/beam/ retained (launcher PID39864); browser screenshot in task outputs. Test-owned4322 stopped by runner; unrelated4321 untouched. STUD7source hashes rechecked unchanged; no copying or writes to STUD.
- User action ET-BEAM-PUBLISH-01: DONE2026-10-29 explicit «выполни пуш, мерже, делете» permits ordinary origin/main push and deletion only integrated feature/beam-lab-engineering-symbols. Exact remote main read-backa942ace PASS; remote exact feature ref absent. No force/history rewrite/new resource/unrelated refs/credentials/STUD changes.
- Public evidence: Cloudflare-authored check123718564167 on exacta942ace says Deployed successfully and links immutable https://479fd3f8.electrotutor.pages.dev/ ; dashboard deployment479fd3f8-95de-48a9-8c65-420f22d0b3f4. Primary https://electrotutor.pages.dev/ru/interactive/beam/ ; canonical unchanged tests run against primary HTTPS35/35PASS/46.3s, including actual reactions, drag, fixed ends, persistence, mobile/dark, all Micro models and SVG goldens. Public screenshot reviewed in task outputs. Direct Wrangler OAuth API401 is recorded as unavailable; no token/config rewrite, provider evidence comes from Cloudflare check plus hosted consumer tests.
- CI-01 / FOLLOWUP / outside unchanged frontend release: GitHub Actions40950761499 FAIL at backend pip-audit; logs report certifi2026.7.22 / PYSEC-2026-4320, listed fixes2026.10.18/19. services/api/pyproject.toml, uv.lock and backend.mjs unchanged from prefeaturea26437b. Safe follow-up: separately review/update this locked backend dependency through existing uv workflow, rerun pip-audit and backend/PostgreSQL CI. Expected evidence: clean audit and successful backend gates; unlocks separate GitHub Pages pipeline. Audit not disabled or waived, no blanket all-CI-green claim; primary static Cloudflare site does not deploy this backend.
- Cleanup scope: sole canonical root checkout retained; only fully integrated exact feature/beam-lab-engineering-symbols may be removed with safe git branch -d after this receipt is merged/pushed. Remote exact name absent. No temporary worktree exists; feature/micro-labs and fix/et-fast-uri-pages are unrelated and preserved.

## ET-PAN-004 — Панорамные обложки и единый инженерный интерфейс

- Status: partial
- Lifecycle: web slice published/verified2026-10-30; source c5ac7b8fd0156239eb447bdf6b0e3de1c3af20bb, approved main merge/ordinary push, Cloudflare41ad6330 SUCCESS and61/61primary-domain browser PASS/47.1s. Overall partial only for independent controlled video; no worktree.
- Dependencies: ET-BEAM-001 / ET-UX-003 verified. Existing canonical symbols/shared numeric models and RU/UK frontend available.
- SPEC: specs/features/panoramic-visual-system.spec.md PAN-001..010. User attachment START and latest panoramic references authorize local implementation.
- Environment ENV-PAN-01: DONE owner explicitly permits current CODEX_HOME=C:/Users/aleks/.codex for this task; resolver ERROR runtimeCodex namespace retained, no runtime migration/config changes. DEV/PROJECTS roots and exact project confirmed.
- Plan: baseline/current route inventory -> original optimized art + existing design primitives -> carousel/unified catalogue/navigation -> partial eraser -> real browser/retained math/topology -> docs/reviewer/commit. Non-overlap board and catalogue writers; root owns home/carousel/integration/assets/docs.
- Runnable scenario: home panorama -> correct live lab -> parameter/result; whole topic card -> MDX; board annotation -> partial erase -> undo/save/reload. Independent video backend/provider verification gate.
- PASS: unit/lint/type/build/context, targeted browser and current physics/symbol regression, six viewport sizes/RU-UK/themes/no critical errors/screenshots. Formal GOST certificate and physical device testing not inferred.
- User action PAN-MERGE-01 / DONE2026-10-30: owner «разрешаю» directly answered the exact merge question for tested1a283b2. Sole checkout clean; main ancestor; --ff-only adcd5ae→1a283b2 succeeded without conflict; integrated source tree equals tested commit. Documentation receipt prepared in existing feature branch and integrated by fast-forward; no direct main file edits.
- User action PAN-RELEASE-01 / DONE2026-10-30: explicit owner permission for main push, electrotutor.pages.dev deploy, hosted acceptance and deletion of integrated temporary feature. Ordinary push070efe5 then minimal hydration correction c5ac7b8; exact remote main read-back PASS. Source Cloudflare deployment41ad6330-241f-4ffd-9f53-58560167b806/check123800512481 SUCCESS. Primary-domain61/61PASS; no remaining owner action for web publication. Only integrated feature/panoramic-visual-system cleanup authorized; no force/unrelated refs/resources/secrets.
- Video gate PAN-VIDEO-01 / BLOCKED_BY_PROVIDER: current create-meeting-provider only instantiates public meet.jit.si adapter with prejoinPageEnabled; no configured controlled tenant/JWT issuance/guest-moderator guarantees. Two-client microphone/camera/screenshare acceptance NOT_RUN. Existing classroom code retained; service shows unavailable. Optional owner action: choose/provide approved controlled meeting provider and server token path for separate video acceptance; no secrets in this record.
- Temporary implementation: none; authored illustrative art labelled as such and never used as solver output.
- NEXT: PAN-VIDEO-01
- Next action: none for published web slice after approved safe feature cleanup. PAN-VIDEO-01 remains an independent future provider decision; do not silently launch AV/backend work.

- Evidence2026-10-30:381unit/49files PASS, including independent beam goldens13cases/49assertions and retained model/topology checks. Final affected Chromium61/61PASS/39.9s (panorama5/catalogue3/eraser4 plus retained board/beam/Fourier/science/Micro/star/circular/line/visual scenarios). Lint PASS; Astro251files/0errors/0warnings/3existing hints; production39pages/38localized routes/184artifacts PASS. Six widths360–1920/RU-UK/themes and real touch events tested; desktop/mobile/catalogue screenshots reviewed. Physical hardware, new APK, controlled two-client video NOT_RUN.
- Scope/evidence boundaries: old home duplicate-gallery assertions are superseded by explicit PAN-002; accepted test files/goldens unchanged. Two `shared scene glyphs` tests selecting removed home gallery excluded from affected suite, not reported PASS. Historical11legacy carousel failures already recorded in ET-BEAM remain distinct; no blanket all-E2E/CI claim. Initial final attempts58/60 then59/60 retained; advanced links moved into first catalogue page and negative first RAF phase fixed in Fourier with a new adversarial clock test. Isolated unchanged beam golden PASS with network-font access; restricted-font mismatch was environmental, golden unchanged.
- Review: two scoped read-only cycles; corrected draft tool changes, whole-board eraser budgets/preallocation/path limit, previous-image preload and inappropriate science/topic-photo associations. No third review/audit. One drawing surface retains local touch-action:none for actual freehand strokes; document/page outside remains scrollable, no global gesture interception.
- Art/STUD: original authored illustrative covers4×3WebP640/1280/1920, total~1MB; public provenance/SHA manifest, no raster formulas/private source paths/third-party assets. Existing STUD scoped notation/verification rules read-only and hashes rechecked, engineering-symbol-audit records applicability; no whole-GOST certificate claimed. Existing canonical symbols reused; TechnicalThumbnail tests independently inspect rendered terminal connectivity and no element bypass.
- Documentation synchronization: README/STAGES/ROADMAP/SPEC/index/ARCHITECTURE/ADR-043/DESIGN/SECURITY/TESTING/TRACEABILITY/ledger/audit updated. API/DATA_MODEL/DEPENDENCIES/project-context/LEARNING_LOG checked without changes; backend/auth/PKCE, storage schema and service-worker policy preserved. ENV-PAN-01 explicit exception recorded above; no root migration. Local preview retained; primary HTTPS publication and exact-source acceptance now verified in public receipt below. Post-merge synchronization: README/STAGES/ROADMAP/TESTING/ledger updated; SPEC/index/ARCHITECTURE/DECISIONS/DESIGN/SECURITY/API/DATA_MODEL/DEPENDENCIES/TRACEABILITY/project-context/audit checked current without source changes. Existing381unit/61browser/build evidence applies to identical integrated code, not a new test run.

- Release checkpoint:382unit/50files PASS; lint/check252files/0errors/0warnings/3existing hints PASS. Only Catalogue readiness plus one semantic test changed; all scientific models/accepted browser tests unchanged. GitHub verify40974322893 failed at unchanged backend certifi pip-audit (same CI-01); static Cloudflare deployment independently succeeded, no all-CI-green claim.

- Public receipt: https://electrotutor.pages.dev/ru/ and immutable https://41ad6330.electrotutor.pages.dev/ . Same accepted targeted61browser scenarios ran against primary HTTPS, not localhost; early SSR catalogue click corrected by readiness gate,382unit/50files PASS,9/9repeated catalogue browser PASS before corrected publication. Full public final61/61PASS/47.1s; previous60/61 failure retained in TESTING. Desktop/mobile public screenshots reviewed. New origin resources/credentials/backend changes absent.
- Release synchronization: README/STAGES/ROADMAP/TESTING/feature SPEC/TRACEABILITY/ledger updated to actual publication; ARCHITECTURE/DECISIONS/DESIGN/SECURITY/API/DATA_MODEL/DEPENDENCIES/project-context/audit checked current. Source/test/asset tree unchanged by final receipt. Documentation-only receipt uses established [skip ci] prefix to avoid a duplicate deployment loop; source check failure remains visible.
- CI-01 continuation: GitHub Actions40974854026 FAIL at unchanged backend certifi2026.7.22/PYSEC-2026-4320 pip-audit (fixes reported2026.10.18/19); no skip/waiver/backend dependency change. Static Cloudflare site and actual hosted consumer checks independently PASS.
- Cleanup contract/evidence: sole canonical root checkout, clean task source, feature fully reachable from main; remote exact feature ref absent on ls-remote. After this receipt is merged/pushed, only safe git branch -d feature/panoramic-visual-system is authorized. No temporary worktree or runtime data deletion; unrelated feature/micro-labs and fix/et-fast-uri-pages preserved.

## ET-CI-001 — Certifi backend CI repair

- Status: verified
- Lifecycle: завершён адресный production CI repair2026-10-30; source `c9a43fbe0149aae5072b02cd04d7268bc743397a`, [GitHub Actions](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/41025558068) verify/deploy SUCCESS; Cloudflare `a1db51d3-6979-4112-a33e-a007055ef99b` SUCCESS. Работа в единственном существующем checkout, без новых worktree.
- Contract/scope: certifi2026.7.22→2026.10.23, остальные72Python package records идентичны; обязательные Node HIGH patches source-map-js1.2.2/sharp0.35.5/Vite8.2.4/Zod4.6.6/Undici8.12.2; разрешённое согласование E2E с текущим UI/локалью; readout/click, reference-line mobile и SSR readiness fixes. CI browser pinned to reviewed Noble image digest, locked core read-only, loopback/always cleanup; actual SVG saveAs exports. Расчётные ядра/API/DB schema/auth не менялись; quality/audit/deploy thresholds/order/permissions сохранены.
- Acceptance: actual main-only GitHub workflow прошёл backend API/PostgreSQL gates, frozen restores, runtime audit и полный frontend quality gate. Точные counts и terminal receipt — docs/TESTING.md. Локально Ruff92/mypy52,208fast+83PostgreSQL+9catalog, HTTP live/ready200, Alembic0014/catalog parity;389unit, lint/types254files/build PASS. Node audit HIGH exit0,4LOW/5MODERATE остаются видимыми.
- Hosted evidence: https://electrotutor.pages.dev/ru/ и immutable https://a1db51d3.electrotutor.pages.dev/ . Primary https://electrotutor.pages.dev on c9a43fb/Cloudflare a1db51d3: same13canonical engineering/catalog/panorama browser scenarios13/13PASS/32.1s; separate RU/UK reference-line mobile390px direct/reload/WASM-ready/error-free probes2/2PASS. Real calculated values, axes/cursors/SVG export, catalogue, readiness/swipe/autoplay/reduced-motion, six widths/themes and direct URLs verified on HTTPS. Проверены реальные расчёты, графики/курсоры, одиночный click после blur, каталог/мобильная навигация и reference-line mobile bounds. Cloudflare success отдельно от GitHub verify/deploy.
- User action CI-TEST-CONTRACT-01 / DONE: прямое разрешение2026-10-30 на актуализацию UI/locale E2E;222сценария и6ранее существующих live-phase skips сохранены, новых skips/only нет. Числовые/физические проверки и все27Windows PNG goldens сохранены; FDTD работает в реальном опубликованном WASM Worker, offline constructor проверяет60V/1.2A. Static identity204fixture — только UI fallback evidence, не backend/session E2E.
- User action CI-INTEGRATE-01 / DONE: прямое «Разрешаю merge, push, публикацию и удаление слитой ветки»; обычные main pushes без force. После документационного receipt разрешён только safe branch -d fix/backend-certifi-ci с ancestry/clean/remote read-back; remote task ref отсутствует. Никаких новых обязательных действий владельца.
- User action CI-VISUAL-BASELINE-01 / DONE: прямое «Разрешаю отдельные Linux-эталоны»; добавлены27просмотренных Linux PNG, существующие Windows bytes/thresholds сохранены. Owner pause/resume выполнены; временный browser container убран. Ubuntu26.04/Noble24.04 raster mismatch resolved by pinned browser environment, без повторной замены PNG. Actual GitHub pinned-browser run проверил прежние SVG exports через saveAs и readiness gesture oracle.
- Safety: одноразовые labelled electro-tutor-et103-test-20261030 container/volume на127.0.0.1:55439 удалены после ownership/sole-user checks; preserved volumes/данные/другие проекты не затронуты. CODEX_HOME exception сохранён без конфигурационной миграции.
- Completion sync: README/STAGES/ROADMAP/TESTING/DEPENDENCIES/SECURITY/project-context Backend DX Delta/requirements ledger и PAN test-contract note обновлены; ARCHITECTURE/DECISIONS/DESIGN/API/DATA_MODEL/LEARNING_LOG проверены без изменений. Предыдущие failed/interrupted runs сохранены как non-PASS. Временный ограниченный public-PNG upload удалён после диагностики. Финальный receipt только документационный, [skip ci] избегает повторного deploy; exact-source pipeline указан выше.
- Deferred:4LOW/5MODERATE — вне HIGH threshold; live IdP/manual hardware/native/video gates не заявлены закрытыми этим CI repair.
- NEXT: none
- Next action: none for CI repair; после receipt push выполнить только разрешённое удаление слитой task branch.
