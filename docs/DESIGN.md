# Дизайн и UX «Потенциала»

Документ фиксирует существующий визуальный стандарт. Он не требует переделывать
работающий интерфейс, но служит каноном для новых страниц и компонентов.

## Характер

Интерфейс сочетает инженерную строгость с тёплой учебной подачей: светлый
бумажный фон, тонкие разделители, спокойный зелёный бренд и яркие смысловые
акценты для электрических величин. Название продукта в интерфейсе —
«Потенциал» / «Потенціал»; имя репозитория — `electro-tutor`.

## Токены

Базовые токены определены в `src/styles.css`:

| Роль | Светлая тема | Тёмная тема |
|---|---|---|
| Основной текст `--ink` | `#25302d` | `#eef2ef` |
| Вторичный текст `--muted` | `#66706c` | `#a7b0ac` |
| Фон `--paper` | `#f5f3ee` | `#121715` |
| Поверхность `--white` | `#fdfcf9` | `#19201d` |
| Разделитель `--line` | `#dcd9d1` | `#313a36` |
| Оранжевый | `#e66820` | `#ff8a45` |
| Зелёный | `#246b54` | `#56b992` |
| Синий | `#236bfe` | `#67a0ff` |
| Фиолетовый | `#7555c8` | `#a489ef` |

Акцентные цвета обозначают смысл и не меняются местами между уроками. Для SVG
используются переменные темы, а не `filter: invert()`.

## Интерактив звезды

Вверху плоскость Z слева и совмещённая топографическая диаграмма напряжений и
токов справа; на узком экране они складываются вертикально. Результаты
следуют за диаграммами, числовые настройки находятся внизу. На плоскости Z
доступно только R ≥ 0. Источник UA/UB/UC красный, линейные UAB/UBC/UCA
зелёные, фазные напряжения потребителя Ua/Ub/Uc синие, смещение UₙN
жёлтое, токи фиолетовые. Масштабы В и А показаны отдельно. Значения цветов
для обеих тем принадлежат `src/components/StarDiagramColors.css`.

## Интерактив длинной линии

Три интерактива имеют отдельные карточки и RU/UK страницы. В лаборатории
длинной линии сначала видны управление, схема «источник → линия → нагрузка»
и два Canvas графика: красное напряжение `U(x)`, синий ток `I(x)`.
Диагностика и производные шаги сетки идут под графиками; числовые параметры
расположены ниже. Под курсором выводятся координата и оба значения. Зелёный
элемент управления обозначает действие, а не физическую величину. Множитель
воспроизведения меняет только визуальный темп, что явно отделено от `CFL`.
Стартовый идеальный источник имеет `Rs=0`; диагностика показывает коэффициент
отражения у источника `Γs=-1`. Изменение `Rs` применяется вместе с остальными
числовыми параметрами.

## Типографика

- основной интерфейс: `DM Sans`, затем системный sans-serif;
- заголовки: `Manrope`, затем sans-serif;
- формульные или выразительные акценты: Georgia/serif;
- математическая круговая диаграмма использует отдельные правила из
  `CircularDiagramMath.css`.

Первый рендер использует системный fallback. `DM Sans` и `Manrope` загружаются
как progressive enhancement и не должны блокировать содержимое; если web-font
недоступен, fallback не должен ломать размеры и переносы.

## Layout и интервалы

- основной максимальный контейнер — около `1240px`;
- учебный текст ограничен примерно `850px`;
- настольные страницы используют сетки и тонкие вертикальные границы;
- большие секции имеют заметный вертикальный ритм, карточки — компактные gap и
  умеренные скругления;
- компонентный CSS находится рядом с крупным TSX, общие правила — в
  `styles.css` и `pwa.css`.

Breakpoint-логика фактически использует `1080px`, `900px` и `600px`. На узких
экранах многоколоночные сетки становятся одноколоночными, меню — мобильным, а
второстепенные метаданные каталога могут скрываться.

## Навигация и общие элементы

`BaseLayout.astro` является единственным production-макетом и содержит:

- логотип и подзаголовок;
- desktop/mobile navigation;
- установку PWA;
- переключатель темы;
- ссылку парной локали;
- footer.

Активный пункт навигации должен соответствовать маршруту. Новый верхнеуровневый
раздел добавляется одновременно в тип `active`, массив nav и обе локали.

## Страницы и reusable-паттерны

- главная: двухколоночный hero, преимущества и карточки тем;
- каталог: разделы curriculum, доступность и длительность темы;
- урок: sidebar, ограниченная колонка текста, формулы, схема, уровни объяснения;
- интерактив: панель ввода, SVG-график и live readout;
- кабинет: форма входа, hint/notice и область видеовстречи;
- услуги: карточки предложений и отдельный блок расписания;
- системные элементы: `.button.primary`, `.button.ghost`, `.eyebrow`,
  `.section-kicker`, карточки и notices.

## Состояния

- loading: кабинет показывает текст подключения и блокирует повторный вход;
- error: кабинет показывает локализованное нейтральное сообщение;
- empty/unavailable: каталог и услуги используют «Скоро»/integration note;
- singular: круговая диаграмма явно сообщает об идеальной вырожденной точке;
- invalid URL state: круговая диаграмма восстанавливает безопасные defaults и
  показывает компактное локализованное status-сообщение без блокировки UI;
- offline: отдельная страница service worker;
- PWA install: browser prompt либо инструкция iOS в dialog.

Новая функция должна определить loading, error, empty и disabled состояния,
если они применимы, на RU и UK.

### ET-10.1 Booking states

Authenticated tutor management extends the account surface; student receives a
static localized booking shell addressed by opaque offer UUID. UI never shows
Account IDs. Required RU/UK states: loading, empty, draft, active, stale offer,
requested, accepted, declined, cancelled, overlap/version conflict, permission
denied and retryable dependency failure.

FREE is labelled as free without currency. EXTERNAL formats the immutable minor
amount/currency and always includes a visible statement that Electro Tutor does
not process or confirm external settlement/refund. Snapshot time is formatted
through `Intl` in selected locale with an explicit IANA zone. Mobile layout,
keyboard focus, field labels, status announcement and text expansion remain
required browser checks.

### ET-10.2 Protected lesson entry states

A new localized static lesson shell reads an opaque Booking UUID only from the
`#booking=` URL fragment, clears it from the visible address after bootstrap and
reveals no private data before its API authorization check. The identifier is
not placed in a query string or referrer. It is deliberately
separate from the existing public Jitsi classroom and does not load media.
Accepted Booking cards may link to this shell.
Same-document fragment navigation counts as a new entry check, not an inert
hash change. The active region disappears before the new server response;
invalid fragments close it without exposing Booking data.

Required RU/UK states are signed out, loading, active access, not yet valid,
expired, revoked/unavailable, not found/foreign and retryable dependency error.
Only `ACTIVE` exposes the media-less lesson entry region. Status changes use an
appropriate live region; late private responses after logout or session expiry
must not restore access. Mobile, keyboard, text-expansion and both-theme checks
remain required.

### ET-10.3 Session lifecycle states

The same RU/UK protected shell joins from `#booking=` and then keeps an
opaque `#session=` fragment so reload obtains current server state. The
Session region remains hidden until an exact validated DTO arrives. Student
first sees READY/waiting; tutor sees READY and a server-derived START control
only when scheduled time permits. Tutor ACTIVE has END; ENDED/CANCELLED have
no transition controls. A refresh control rechecks the server for scheduled
START or another tab's change, without client-clock authorization. Signed-out,
foreign, expired/revoked, malformed or unavailable responses hide Session,
clear previous private DOM metadata and announce localized failure/retry.
No media iframe is added. Current ET-10.3 acceptance evidence and the
remaining literal human screen-reader gate are tracked in `docs/STAGES.md`.

## Темы и сохраняемое состояние

Светлая и тёмная темы должны иметь достаточный контраст. Выбор темы хранится в
`potential-theme`. Интерактивные настройки, query/hash и позиция просмотра не
должны неожиданно сбрасываться при локализованной навигации.

## Доступность

- интерактивные элементы используют нативные `button`, `a`, `input`, `dialog`;
- icon-only controls имеют `aria-label`;
- SVG-инструменты имеют `role="img"` и локализованный label;
- динамический readout использует `aria-live` там, где это полезно;
- фокус, клавиатура, reduced motion и контраст проверяются в браузере перед
  значимым UI-релизом.

Последний пункт является стандартом проверки; полная автоматическая проверка
доступности пока не настроена.

## Правила изменения дизайна

1. Сначала переиспользовать токены и существующий паттерн.
2. Новую семантическую роль цвета документировать здесь.
3. Проверять RU/UK, обе темы и мобильную ширину.
4. Не переносить важный индексируемый текст целиком в React.
5. Существенное изменение визуального языка фиксировать в `DECISIONS.md`.
