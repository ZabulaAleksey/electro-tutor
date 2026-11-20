# ElectroTutor · Phase 0 · сверка production

Дата 20 ноября 2026 года. Исходная точка `main` и `origin/main` — `a7a8095ee59692f5eda7a9cf11d8d7f1c63df15b`. GitHub Compare подтвердил один документационный коммит после квалифицированного runtime `f3123c3b7eaa5878ab0cc3783829314f875f505a`. Код, зависимости и workflow этих ревизий идентичны. До ветвления рабочее дерево чистое.

## Артефакты

| Хост | Переходная линия | AC, LC graph, электрические сети | Бандл переходного опыта |
| --- | --- | --- | --- |
| [electrotutor.org](https://electrotutor.org/ru/interactive/transmission-line/) | 200, старый холст, открытый конец, ссылка AC отсутствует | 404 / 404 / 404 | `C8T7K4In`, SHA-256 `95b9e8a1a40ac5ed8df6352ac929aed27853af5050be0ccd606c18130d735dd7` |
| [electrotutor.pages.dev](https://electrotutor.pages.dev/ru/interactive/transmission-line/) | 200, тот же старый холст | 404 / 404 / 404 | `C8T7K4In`, SHA-256 совпадает с основным доменом |
| [Точная выкладка 9a6a2dfd](https://9a6a2dfd.electrotutor.pages.dev/ru/interactive/transmission-line/) | 200, общий редактор, эпюры, ссылка AC | 200 / 200 / 200 | `DM4nm1Pd`, SHA-256 `9a7a8cb83a2aa7ea38571bfd33cc75c5f20f5abc256cb625c925c4b42a5e3bb4` |
| [GitHub Pages](https://zabulaaleksey.github.io/electro-tutor/ru/interactive/transmission-line/) | 200, общий редактор, эпюры, ссылка AC | 200 / 200 / 200 | `BafF1yzl`, SHA-256 `61437f03b5ae5c73707e80ed8eda50cac1436a66aae267d03a53ea9bd44ce7f2`, base `/electro-tutor/` |
| Локальный `pnpm build` из чистого `a7a8095` | Статический route с островом и ссылкой AC | Все три HTML сгенерированы | `CkFHwIUg`, SHA-256 `1f87d1251e1a89e2cae255ed02f3ca3ddabd9188bf3c3c97aaa27da8bc3b843a` |

У всех маршрутов префикс `/ru/interactive/`. Три сравнительных slug — `transmission-line-steady/`, `reactive-two-port-graph/` и `power-system/`. Локальная сборка PASS, 104 страницы Astro, 105 HTML после release-аудита, 102 локализованных маршрута. Побайтовое совпадение локального бандла с хостами не установлено. Разные build host, параметры origin/base и asset generation учитываются при сравнении.

Основной домен отдаёт старый HTML при прямом запросе, в чистом профиле Chromium и с отдельным URL-параметром. Ответ на навигацию имеет `CF-Cache-Status: DYNAMIC` и `Cache-Control: public, max-age=0, must-revalidate`. JS возвращает тот же digest и при `cache: no-store`. `sw.js` совпал побайтно с точной выкладкой, SHA-256 `55d27425cbe6909e2ab7d9df36add430e7c940a556d8a8357f8742c42e1de753`. Несовпадение воспроизводится вне клиентского service worker. Активный deployment ID старого артефакта и история его назначения aliases у провайдера пока не установлены.

[Резервный артефакт 5cd42ef5](https://5cd42ef5.electrotutor.pages.dev/ru/interactive/transmission-line/) отвечает на всех четырёх маршрутах. В принятом receipt он привязан к `eff12b6373dd08094edd8fed0136821517018b33`. Проверенный release `f3123c3` остаётся доступным по неизменяемому адресу `9a6a2dfd`. Исторический Stage 0 `22cc6eb6` жив и имеет другой JS `B_325otS`. Эти точки сохранены без отката или записи в hosting.

## Пользовательская проверка

1. Открыть опубликованный переходный опыт в чистом профиле Chromium. В кадре виден источник 100 В, TL1 50 Ω, 1000 км и разомкнутый конец. Стартовый ключ и резистор из LINE-UX-035 отсутствуют. Скриншоты записаны как `phase0-transient-desktop.png` и `phase0-transient-mobile.png`.
2. На 390 × 844 нажать «Пуск», увидеть время 7,667 ms, нажать «Стоп», увидеть 0 ms. Пространственные графики расположены за пределами первого экрана. Панель фиксирована, её прямоугольник x=0, y=756, ширина 390, высота 88 CSS px.
3. Открыть точную выкладку и GitHub Pages. Общий редактор и эпюры есть. `.network-dock` остаётся `position: fixed` и на этих сборках. Проверки Stage 32 подтверждали опубликованные сценарии в момент выпуска, но их два smoke-сценария не задают требование об отсутствии перекрытия и не могут обнаружить последующее расхождение aliases.
4. Референс владельца от 20 ноября. Символ TL в общем редакторе — толстый прямой отрезок с подводами. Стрелка направления тока на втором референсе расположена отдельно от символа.

Хеши скриншотов. Desktop `263e5a5164f673bb53ae9e58aeb8931398665857e1436f03ebaea8de8a60c2f8`. Mobile `6759e49dca7ff08e63512c625a9b90e5dc392499451bcc6944ed33c20eaf783a`.

## Матрица обязанностей Stage 0–32

Основание — сохранившиеся stage records, канонические SPEC и явно перечисленные обязанности v3. 20 ноября владелец подтвердил действующие SPEC и матрицу Stage 0–32 как основу. Оригинальный текст v2 по точному поиску Drive не обнаружен. Ссылки на код и тесты обозначают обнаруженное покрытие, а не новый PASS. Для строк 5–8 основной маршрут переходный, 9–11 синусоидальный, 12–16 LC graph, 17–30 электрические сети. Для 1–4 и 31–32 применимы четыре режима и общий редактор.

| Stage | Обязанность | Код и проверка | Действие | Текущее наблюдение |
| --- | --- | --- | --- | --- |
| 0 | Базовая сверка | Маршруты, HTML, asset SHA-256 | Открыть публичные адреса | Расхождение воспроизведено |
| 1 | Инвентаризация редактора | `src/circuit/CircuitEditor.tsx`, `src/transient/useLineOperations.tsx` | Открыть схему и палитру | Новый редактор виден на GitHub Pages и точной выкладке. Основной домен показывает прежний холст |
| 2 | Граф, 100 элементов и JSON round-trip | `src/circuit/topology.ts`, `topology-contract.test.ts`, `tests/e2e/circuit-editor.spec.ts` | Собрать и экспортировать граф, переместить элементы | Код и тест найдены, полный живой прогон не выполнен |
| 3 | Ветвление T, П, лестница, мост и параллельные RLC | `src/circuit/drawing.ts`, `recursive-branching.test.ts`, `tests/e2e/circuit-branching.spec.ts` | Создать ответвления и подключить элементы без импорта | Код найден, сборка всех эталонов в UI не проверена |
| 4 | Один редактор и разные адаптеры | `src/circuit/editor-mode.ts`, `tests/e2e/power-system-cross-mode.spec.ts` | Перейти между четырьмя опытами | На основном домене общий редактор не смонтирован, три маршрута возвращают 404 |
| 5 | Стартовая схема, ключ и окончание линии | `src/transient/circuit-adapter.ts`, `src/components/TransmissionNetworkLab.tsx` | Открыть чистый опыт, изменить нагрузку или ключ | На основном домене другая стартовая схема с обрывом. На GitHub Pages виден стартовый ключ и резистор |
| 6 | RLC-редукция и запрет небезопасного упрощения | `src/circuit/rlc-reduction.ts`, `rlc-reduction.test.ts` | Сравнить эквивалент и исходные ветви | Код и тест найдены, свежей численной проверки нет |
| 7 | Граф → расчёт переходного процесса | `src/transient/circuit-adapter.ts`, `circuit-adapter-stage7.test.ts`, `network.worker.ts` | Изменить граф и дождаться пересчёта либо диагностики | Пуск и сброс старого режима проверены. Передача произвольного графа на основном домене отсутствует |
| 8 | Совместный обзор схемы, U(x) и I(x), управление | `src/components/TransmissionNetworkLab.css`, `tests/e2e/transmission-workbench.spec.ts` | Запустить опыт, прокрутить и сравнить кривые | На момент проверки виден fixed-плеер на обеих ревизиях. На основном домене U(x) ниже первого мобильного экрана |
| 9 | Синусоидальная RLGC-линия, нагрузка, КЗ и обрыв | `src/steady-line/line.ts`, `line.test.ts` | Изменить нагрузку и наблюдать эпюры | Основной домен 404. Код и тест найдены |
| 10 | ABCD и каскады | `src/steady-line/cascade.ts`, `cascade.test.ts` | Добавить последовательно Z и поперечно Y | Основной домен 404. Код и тест найдены |
| 11 | Вектор в точке x | `src/steady-line/phasors.ts`, `tests/e2e/transmission-line-steady.spec.ts` | Нажать на эпюру и сверить модуль и фазу | Основной домен 404. Код и тест найдены |
| 12 | Рациональная Z(s), X(ω), полюсы и нули | `src/models/reactive-lc-graph.ts`, `tests/e2e/reactive-lc-graph.spec.ts` | Изменить сеть и сверить формулу и график | Основной домен 404. Код и тест найдены |
| 13 | Foster I | `src/models/reactive-foster-i.ts`, `tests/e2e/reactive-foster-i.spec.ts` | Переключить представление, сравнить Z | Основной домен 404. Код и тест найдены |
| 14 | Foster II | `src/models/reactive-foster-ii.ts`, `tests/e2e/reactive-foster-ii.spec.ts` | Переключить представление, сравнить Z | Основной домен 404. Код и тест найдены |
| 15 | Cauer I | `src/models/reactive-cauer-i.ts`, `tests/e2e/reactive-cauer-i.spec.ts` | Раскрыть шаги лестницы и сравнить Z | Основной домен 404. Код и тест найдены |
| 16 | Cauer II | `src/models/reactive-cauer-ii.ts`, `tests/e2e/reactive-cauer-ii.spec.ts` | Раскрыть шаги лестницы и сравнить Z | Основной домен 404. Код и тест найдены |
| 17 | Физическая сеть и рабочая топология | `src/power-system/network.ts`, `topology.ts` | Собрать однолинейную схему | Основной домен 404. Код найден |
| 18 | Каталог и проверка единиц | `src/power-system/catalogue.ts`, `catalogue.test.ts` | Проверить паспортные данные и ошибочный тип | Основной домен 404. Код и тест найдены |
| 19 | Basic, Advanced, пользовательский тип, override/reset | `src/power-system/configuration.ts`, `tests/e2e/power-system-config.spec.ts` | Выбрать тип, переопределить параметр и сбросить | Основной домен 404. Код и тест найдены |
| 20 | П-схема и 1/2 параллельных цепи | `src/power-system/line-equivalent.ts`, `tests/e2e/power-system-line.spec.ts` | Изменить длину и число цепей, открыть эквивалент | Основной домен 404. Код и тест найдены |
| 21 | Трансформатор, ветвь ХХ, tap/shift, 1/n | `src/power-system/transformer-equivalent.ts`, `tests/e2e/power-system-transformer.spec.ts` | Выбрать тип и число аппаратов, открыть эквивалент | Основной домен 404. Код и тест найдены |
| 22 | Источник и P+Q / P+cosφ | `src/power-system/injections.ts`, `tests/e2e/power-system-injections.spec.ts` | Переключить представление и проверить знак Q | Основной домен 404. Код и тест найдены |
| 23 | Радиальный режим и потери | `src/power-system/radial-flow.ts`, `tests/e2e/power-system-radial.spec.ts` | Изменить нагрузку и сравнить U, P, Q и потери | Основной домен 404. Код и тест найдены |
| 24 | Предварительный расчёт кольца и точки раздела | `src/power-system/ring-preliminary.ts`, `tests/e2e/power-system-ring.spec.ts` | Сравнить однородное и неоднородное кольцо | Основной домен 404. Код и тест найдены |
| 25 | Уточнение потерь в кольце и сходимость | `src/power-system/ring-refinement.ts`, `tests/e2e/power-system-ring-loss.spec.ts` | Перенести расчётный разрез и сверить баланс | Основной домен 404. Код и тест найдены |
| 26 | Общий AC Ybus и некорректная сеть | `src/power-system/ac-power-flow.ts`, `tests/e2e/power-system-ac.spec.ts` | Рассчитать многоконтурную сеть и проверить отказ | Основной домен 404. Код и тест найдены |
| 27 | Сопоставление двух расчётов кольца | `src/power-system/ring-agreement.ts`, `tests/e2e/power-system-agreement.spec.ts` | Сравнить узловые и ветвевые результаты | Основной домен 404. Код и тест найдены |
| 28 | Слои, направления по знаку, loading и warnings | `src/power-system/flow-overlay.ts`, `tests/e2e/power-system-overlay.spec.ts` | Переключить P/Q/U/потери/загрузку | Основной домен 404. Код и тест найдены |
| 29 | Физический ключ и условный разрез | `src/power-system/normally-open.ts`, `tests/e2e/power-system-switching.spec.ts` | Отключить ветвь и отдельно перенести разрез | Основной домен 404. Код и тест найдены |
| 30 | Мобильная однолинейная схема | `src/components/PowerSystemLab.css`, `tests/e2e/power-system-mobile.spec.ts` | Коснуться ветви и прочитать U/P/Q | Основной домен 404. Мобильные действия не повторены |
| 31 | Четыре режима, негативные случаи и локализация | `tests/e2e/power-system-cross-mode.spec.ts`, `package.json` | Пройти опыты на обоих хостах | Публичная приёмка FAIL. Текущий проект RU/UK, EN зарезервирован на уровне типа |
| 32 | Release, безопасность, откат и пользовательская приёмка | `scripts/full-verify.mjs`, `.github/workflows/pages.yml`, `docs/evidence/picomatch-remediation.json` | Сверить артефакты и действия на каждом хосте | Текущие aliases отдают другой артефакт. Ранее принятый CI сохраняется как историческое evidence |

## Состояние

Phase 0 установила две причины пользовательского FAIL. Cloudflare production aliases отдают другой артефакт. На текущей сборке фиксированная панель перекрывает страницу. Владелец подтвердил основание матрицы, поэтому эти дефекты можно исправлять. Cloudflare Dashboard требует входа. Точный ID того, что назначено aliases сейчас, и история переключения остаются ограничением релизной приёмки.

Локальная правка LINE-UX-038 проверена отдельно. RED 2/2 на старой капсуле, GREEN 19/19 в Chromium, production build, целевой ESLint и Astro check с 0 errors, 0 warnings и 3 прежними hints. Локальные кадры `line-symbol-desktop.png` (SHA-256 `5dacca581c8276666335a410df74d9177380c7ecae66064b28d5cab7fd6beddf`) и `line-symbol-mobile.png` (SHA-256 `bdc800c1e9807e5b46e0ac743ead012ac3007929bb65e334c5d53eadcf887e0d`). Остальные дефекты интерфейса видны на этих кадрах.
