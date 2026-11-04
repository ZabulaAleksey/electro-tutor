# Метод контурных токов — визуальное и инженерное исправление RUN 3A

Статус: утверждённый bounded contract по прямому запросу владельца 2026-11-04.
Stage: ET-MESH-003A. Базовый source: 48c3fef; findings: RUN 2 от 2026-11-04.
STANDARD production frontend bugfix; новые dependencies, backend и architecture boundary не нужны.

## Требования

- FR-301: декоративные CSS selectors не меняют регистр, размеры atoms, baseline, дроби/индексы/степени/матрицы/скобки KaTeX. Результат I3 и m=b-n+1 читаемы в light/dark; корень проблемы исправляется ограничением selectors, не скрытием текста.
- FR-302: весь опубликованный пример сохраняет исходные значения E1=24 V, E2=12 V, R1=4 Ω, R2=6 Ω, R3=2 Ω, систему [[6,-2],[-2,8]] и ответы I1=54/11 A, I2=30/11 A, I3=24/11 A, P=1656/11 W≈150.55 W. Разрешено только семантически эквивалентное разбиение длинных формул на строки/блоки.
- FR-303: схема задаёт E1 верх+, E2 верх−, оба контурных тока clockwise и I3 сверху вниз общей ветви; узлы/подписи не пересекают проводники/дуги. Порты canonical glyphs соединены, dark leads различимы. Не заявлять полную ГОСТ-сертификацию только по форме glyph.
- FR-304: на320/375/390/768/1280/1920px в обеих темах формулы не обрезаны, document overflow отсутствует; все существенные подписи схемы читаемы (минимум12CSSpx на этих viewport без масштабирования). Допустимы только явно обозначенные interactive overflow areas, которых статическому уроку не требуется.
- FR-305: новые регрессионные проверки воспроизводят selector/layout/polarity/size defects до исправления и проходят после. Before/after screenshots шести ширин просмотрены. Новые raster baselines принимаются только после просмотра; сохранённые numeric contracts и27старых Windows/27Linux PNG не меняются. Одна прежняя SVG-string snapshot записи CircuitDiagram согласованно меняется после проверки новой схемы, остальные snapshots сохраняются.
- FR-306: сохранить UK-пару, остальные19тем/31tools/routes, ядра, FastAPI/PostgreSQL/OIDC и инфраструктуру. Нет новых горизонтальных stages/mesh simulation, общего редизайна, install, merge/push/deploy. Один атомарный commit только после обязательных checks; failing gate запрещает commit.

## Runnable acceptance

Настоящий Astro build → own loopback preview → RU lesson → выбор существующего подробного режима → просмотр схемы/уравнений/итога/мощности на6viewport×2themes → корректный practice answer/переход/reload. Данный статический consumer path не требует API/DB. RU/UK route/practice регрессии сохраняются; mocks не подменяют вычислительную проверку.

Checks: pnpm test (relevant/full), pnpm check, pnpm lint, pnpm build, existing browser suites и новый mesh visual test; независимый rational KCL/KVL/power oracle из RUN2 повторяется. Форматирование snapshot только после image/markup review.

## Scope и дальнейшая работа

Первый публичный MVP — один русский модуль, но RUN3A исправляет только представление и схему существующего урока. Подробная теория без3levels (отмена требования принята владельцем), horizontal Учебник→Примеры→Лаборатория, новая mesh lab и release visibility/SEO остаются отдельными следующими задачами, не gates этого slice и не объявляются реализованными.

Windows Chromium — доступный raster acceptance environment. Portable geometry/semantic/layout assertions выполняются на всех browser-host platforms. Linux raster baselines не выдумываются на Windows: существующие Linux PNG сохранены, новые Windows raster assets имеют честный platform scope; Linux capture/geometry остаются исполняемыми. Полная Linux raster parity не заявляется.
