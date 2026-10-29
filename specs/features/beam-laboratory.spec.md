# Сопротивление материалов и канонические инженерные символы

Статус: Утверждённый пользовательский master contract 2026-10-29.
Stage: ET-BEAM-001. COMPLEX, production frontend/numerical model.

## Границы и математический contract

- BEAM-001: отдельное чистое программное ядро плоской прямой балки Эйлера–Бернулли, малые перемещения, линейная упругость; ось x слева направо, y вверх, внешний момент против часовой стрелки положителен. SI внутри: m, N, N·m, EI в N·m², EA в N. Локализация и m/mm/cm — только граница UI.
- BEAM-002: произвольные положения опор/нагрузок и кусочно-постоянные положительные EI/EA. Fixed удерживает u,v,θ; pin — u,v; roller — v. Свободный конец не имеет связи. Консоли слева/справа, pin+roller, fixed+roller, fixed+fixed и промежуточные опоры рассчитываются одной моделью прямой жёсткости, без подмены статически неопределимых схем простой балкой. Узлы включают все границы участков/нагрузок/опоры; изгиб — Hermite 4×4, ось — линейный элемент 2×2. Линейная нагрузка имеет согласованный вектор узловых сил.
- BEAM-003: точечные поперечная/осевая силы, внешний момент и линейная распределённая нагрузка на произвольном интервале, включая постоянную/треугольную/трапециевидную; суперпозиция нескольких нагрузок. Максимум 32 нагрузки, 12 опор, 16 участков; схема ограничена разумными конечными числами. Нестабильность, singular/ill-conditioned solve, разрывы участков, повторные опоры и invalid JSON дают объяснение, без фиктивного решения.
- BEAM-004: N положительно при растяжении, Q равна сумме вертикальных внешних сил слева, M положительно при провисании. Между сосредоточенными воздействиями N′=0, Q′=q, M′=Q. В точке силы ΔQ=Fy, ΔN=−Fx; в точке внешнего момента ΔM=−M0. Реакции входят в те же суммы. Внутренние значения на опоре/нагрузке имеют явно различимые пределы слева/справа. Точные интегралы линейной нагрузки задают Q (квадратично) и M (кубически), а не усреднение FEM узловых напряжений.
- BEAM-005: проверяются суммарные Fx/Fy/M и residual решённой свободной системы/опорные ограничения; независимое интегрирование восстановленных M/EI и N/EA воспроизводит узловые перемещения/повороты. Кривые N/Q/M имеют общий x и вертикально совмещённые сечения, положительные/отрицательные области, точные скачки, найденные программно нули и extrema, единицы/подписи. Показываются отдельные эпюры по выбору. Перемещения/напряжения не обязательны для v1; пластичность, большие деформации, сдвиг Тимошенко, внутренние шарниры, рамы и нелинейные контакты — вне области v1; структура типов оставляет развитие.

## UI, состояние и интеграция

- BEAM-006: существующие RU/UK Astro routes/menu/auth/theme сохраняются; новая лаборатория доступна из /interactive/. Верх — инструменты и балка, центр — большая схема, ниже — синхронные эпюры. Основные numeric inputs рядом с выбранным элементом; дополнительные свойства в одном немодальном редакторе. Подсказка системы знаков, presets одним нажатием.
- BEAM-007: добавление нажатием и перетаскиванием с панели; mouse/touch drag вдоль балки пересчитывает результат во время движения. Координаты ограничиваются концами, элемент сохраняется за пределами viewport. Numeric эквивалент каждого drag, направление/знак, координаты и интенсивности распределённой нагрузки, удаление одним действием, выбор виден. Величины конечны, invalid ввод не уничтожает последнее корректное состояние.
- BEAM-008: вертикальный общий курсор и точные N/Q/M в любом сечении; реакции/значения/эпюры переключаются; Reset/Undo/Redo/автомасштаб. Один drag — одна запись истории, cancel восстанавливает начало. Ctrl-wheel/zoom и горизонтальная прокрутка наследуют существующий gesture contract, не захватывают обычный scroll страницы.
- BEAM-009: versioned JSON save/load и локальное сохранение, только проверенные входы, без доверия к импортированным результатам. Ограничения размера/числа сущностей/чисел; recovery с понятной RU/UK ошибкой, сохранение текущей схемы при отказе. Без сетевого сервиса и изменений auth.

## Инженерная графика

- SYMBOL-001: аудит всех 14 electrical MicroLabs, 12 scientific MicroLabs и используемых общих карточек. Каждая запись описывает смысл, дисциплину, применимость конкретного стандарта/редакции или отсутствие нормативной графической нормы, STUD reference/SHA, геометрию/нарушения/исправление. STUD строго read-only; исходные учебные работы не переносятся в DEV.
- SYMBOL-002: общая SVG библиотека геометрии с терминалами/пропорциями/линиями/происхождением; resistor/capacitor/diode/source/motor и fixed/pin/roller семантически различны. Full/thumbnail/export масштабируют группу равномерно, без изменения пропорций. Размеры в SVG units не объявляются нормативными mm без подтверждённого основания. Диапазон стандарта не подменяется единственным размером.
- SYMBOL-003: ГОСТ 2.7xx применяется по типу символа, 2.301/302/303/304/307 — по назначению документа, а не ко всем web карточкам механически. Текущая редакция/источник проверяются. Нет заявления полной сертификации ЕСКД по одной похожей форме. Точки соединения/неподключённые пересечения, направления и терминалы проверяются отдельно от физики модели.
- SYMBOL-004: geometry/unit checks, SVG snapshots и reviewed visual goldens, bounds/legibility на реальных карточках, responsive/light/dark, соответствие выбранным подтверждённым STUD образцам. Существующие принятые tests/fixtures не ослабляются. Новые миниатюры требуют этих gates.

## Приёмка и trace

BEAM-001..005 → numerical kernel + independent JSON goldens: tip force/moment/UDL консоли, центр/произвольное положение силы двухопорной, distributed, multiple, combined axial/transverse/moment, fixed-fixed. Обе ориентации консоли, variable EI, intermediate supports, jumps/continuity, equilibrium/compatibility, unstable/invalid. Goldens записываются из независимых аналитических формул, не solver outputs.
BEAM-006..009 → React/browser→pure local kernel path, actual pointer drag with intermediate updates, inline changes, UI controls/history/cancel, shared cursor, presets, persistence/invalid import, RU/UK/mobile/theme/keyboard.
SYMBOL-001..004 → audited inventory/provenance, geometry/SVG snapshots, independent screenshot review and retained MicroLabs/browser regressions.
Commands come from existing package manifest: pnpm test/lint/check/build/check:context/test:e2e:built. Actual counts and limitations live in TESTING/STAGES. No PASS before execution. Existing routes and accepted tests preserved. No new dependencies expected.

## Security, rollout, rollback

Local browser calculation only. Imports bounded before parse and validated before state mutation. No HTML evaluation, external fetching or secret handling. Numerical failure is visible and hides stale epures. Feature branch only; merge/push/PR/deploy require separate explicit permission. Rollback is reverting feature commits; prior routes/data/storage namespaces preserved.
