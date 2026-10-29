# Аудит инженерных миниатюр ElectroTutor

Scope ET-BEAM-001:14 electrical MicroLabs,12 scientific MicroLabs, ToolArt,7электрических SceneVisual и CircuitDiagram урока.
Результат — канонические геометрические определения и проверяемая топология/рендер.
Это экранные учебные схемы, а не комплект конструкторской документации.

## Источники и применимость

Проверка карточек Росстандарта выполнена2026-10-29. Указание «действует» относится
к карточке/дате, не назначает юрисдикцию продукту RU/UK и не означает norm-control
всех чертёжных требований. Тексты и размеры не достраиваются из названия стандарта.

| Документ / подтверждённый источник | Применимость |
|---|---|
| [ГОСТ2.728-74](https://protect.gost.ru/gost/details/ba115ccd-e5aa-4ba1-a672-b17170f1a7f2), изменения1/2 | Форма R/C. Для постоянного R соотношение10:4 независимо подтверждено учебным первоисточником [КПИ,2011, с.10](https://ng-kg.kpi.ua/files/Pervertun_Nadkernichna1.pdf#page=10). Body40×16SVG units; это выбранный равномерный экранный масштаб, не физические миллиметры. PDF screenshot fetch вернул cache miss; текстовый слой с10/4 прочитан, отсутствие raster не скрывается. |
| [ГОСТ2.730-73](https://protect.gost.ru/gost/details/8e7d0ff4-ab0d-44b5-8efd-b0fcdb13950b) | Общая форма/полярность диода.20×16 — выбранная геометрия профиля, не утверждение единственного нормативного размера. |
| [ГОСТ2.721-74](https://protect.gost.ru/gost/details/c153a749-14f2-49e8-8544-acc32ab35406) | Общие графические обозначения/стрелки/соединения. Геометрический crossing сам по себе не создаёт соединение; используются terminal/T joins и точки узлов. |
| [Официальный индекс2.7xx](https://protect.gost.ru/gost?month=0&page=9&search=&year=0) |2.702-2011 — electrical scheme rules;2.722-68 — machines;2.723-68 — inductors. Упрощённый ideal source, M и три воздушные дуги L — семантические учебные профили, без заявления полного машинного/обмоточного чертежа или нормативных размеров. |
| [ГОСТ2.747-68, Изм.1](https://protect.gost.ru/gost/changesdetails/f08b7d37-9e7b-4bad-88ba-045d87b093bf) | Проверен scope размеров UGO; исключённые/заменённые позиции не используются как текущий источник R/C. |
| [2.301-68](https://protect.gost.ru/gost/details/aa681f87-ff49-4115-ad25-169e15d2af06), [2.302-68](https://protect.gost.ru/gost/details/b8e1f82a-8ad2-4133-8c49-2570711b7e22) | Формат листа и чертёжный масштаб не применяются механически к responsive web-card. Для formal print/export потребовались бы выбранный лист/масштаб и отдельный layout gate. Новые Р2.301/302-2026 приняты, ввод2027; у2.302-2026 дата01.10.2027, досрочное применение разрешено. |
| [2.303-68](https://protect.gost.ru/gost/details/09645eb7-ee23-467a-a319-25b3112a7227), [Р2.303-2026](https://protect.gost.ru/gost/details/74a6410b-9422-4c9c-b9ee-2798a92f2d6a) | Сопоставлены типы/назначение линий; новый Р вводится01.10.2027 с правом досрочного применения. UI stroke1.7SVG units — выбранный профиль, не универсальное значение в mm. |
| [2.304-81](https://protect.gost.ru/gost/details/2acb3258-c28c-4e4a-b7ac-208043f2d95e), [его отмена в РФ с01.10.2027](https://protect.gost.ru/gost/changesdetails/129283d4-ae9b-4e2e-abd0-af1627846674) | Проверена область шрифтов; web Manrope не выдаётся за чертёжный шрифт. Проверяется фактическая читаемость/единый размер подписей. |
| [2.307-2011](https://protect.gost.ru/gost/details/62de9da6-e1a7-4023-955e-7dd9777eaab6) | Сопоставлены размерные линии/единицы, без производственных допусков для учебной балки. В карточке указана будущая РФ замена Р2.307-2026; не используется отменённый2.307-68. |

Fixed/pin/roller и стрелки балки — расчётные учебные обозначения с явным смыслом
связей, а не механическое применение электрических2.7xx. В профиле triangle±16/24,
rollersr4, ground hatch45°/pitch8SVG units. Это выбранные размеры; нормативные mm
для этих механических glyphs не придуманы. Граничные условия проверяет solver.

## STUD: read-only provenance

`STUD_ROOT=C:/Users/aleks/Admin`, STUD_STORAGE прочитан; `stud_paths.py --root … check`
вернул ADMITTED для выбранного владельца. Прочитаны AGENTS/index и scoped правила
DOM-EE-N, EE-CIR-012..015, FMT-FIG-015/CIR-001..002. Они задают нотацию,
разделение topology/math/visual gates, единый кегль и зазоры; не задают произвольные
универсальные размеры всех web-symbols. University/task deltas не наследуются.

| Read-only source относительно STUD_ROOT | SHA256 |
|---|---|
| AGENTS.md |4865aece544c95a12ab27f064d06beccbc7149c5d44562a629fc75bd01f3068e|
| .codex/00_SYSTEM/STUD_RULES_INDEX.md |f73aec5bc38bc1a715cce5cc2f709a3065902c7ff75ac6f65fcf0fbc70310b45|
| .codex/00_SYSTEM/STUD_STORAGE.json |2950650b2f07e9d05d8ac5afca40e55962fc1ba3774e68f622442ce6b77cf84b|
| .codex/13_DOMAINS/electrical_engineering/NOTATION_DEFAULTS.md |2d5f5c5f510a769ae0bb545781da62daf84de0f92328bf9093b611543d0a8a4b|
| .codex/13_DOMAINS/electrical_engineering/CIRCUIT_VERIFICATION.md |4d9a93112b505c69361541e2f02e6c5e70ac4e0b2848c54a0a9d5acf68dd9536|
| .codex/05_FORMATTING/FIGURE_POLICY.md |3aeb7915abb352053aeda7fe693a8cec755f816582f1aac63cbbf31bfca71905|

Дополнительно прочитан `.templates/Преобразовательная техника v1.0.drawio`,
SHA256b62a89ad5e1b79385d02f3a608012e5a1412e1db636dd2ec758b92d873c9f38f.
В5175mxCell не обнаружено семантических resistor/capacitor/diode IDs/styles/labels;
это не основание автоматически объявить любую отдельную геометрию эталоном.
Файл не переносился, не изменялся; его полная визуальная/электрическая эквивалентность
не заявляется. Подходящий проверенный STUD template, соответствующий именно каждой
из26моделей, не установлен; используется scoped STUD policy + явно указанный
нормативный/учебный первоисточник. Это отличается от фиктивного «STUD match PASS».

## Инвентарь и исправления

Обозначения профиля: R40×16(10:4), C32/8(plate/gap, выбранный профиль), D20×16;
источникиr22, L3дуги18×13, Mr22. Размеры и выводы — один owner `symbols.tsx`.
Схемы используют SVG380×145,14-unit подписи,stroke1.7×scale. Terminal span
меняет только длину проводников; тело не растягивается. Ниже «STUD policy» означает
перечисленные owners, а не притворное совпадение с отдельной учебной работой.

| ID | Что / дисциплина | Стандарт/эталон | Нарушение → исправление |
|---|---|---|---|
| ohm-law | Источник напряжения и R / DC |2.728 + STUD policy | R58×18 отличался от10:4 → тело40×16 + leads, source glyph, сохранён loop. |
| voltage-divider | Два последовательных R / DC |2.728/2.721 + policy | Локальные дубликаты → одинаковые R, выводы115–173/235–293, node204 сохранён. |
| current-divider | Источник тока, две параллельные ветви / DC |2.728/2.721 + policy | Правая ветвь была закорочена непрерывным проводом, R22×30 растянут → разрыв54–84, вертикальные канонические R, отдельный current source. |
| maximum-power | Внутренний r и нагрузка RL / DC |2.728 + policy | Общая форма разного размера → R10:4 с разными labels, без объединения смысла r/RL. |
| rlc-resonance | Последовательная RLC / AC |2.728/2.723 + policy | R50×18, независимые C/L → общий R с terminal span50, цельно масштабированный C/L; действительный loop сохранён. |
| sine-rms | Синусоидальный сигнал / AC |График, электрический UGO не назначается | Геометрия без электрической цепи; единые SVG подписи/границы/визуальный golden, форма узнаваема. |
| three-phase-star | Четырёхпроводная Y / трёхфазные цепи |2.728/2.721 + policy | R58×14 и неполная маркировка T-узла → три R10:4, точка на joinC/N(309,104), A/B/C/N сохранены. |
| capacitor-charge | RC с E / переходный процесс |2.728 + policy | Дублирующий C, разные пропорции → общий C/voltage source/R; физический time model сохранён. |
| capacitor-discharge | Замкнутая RC без E / переходный процесс |2.728 + policy | Общие R/C, нет добавленного источника; проверены полярность/направление стрелки. |
| diode-operating-point | Источник/R/диод / электроника |2.730/2.728 + policy | Независимый triangle/bar → общий D с однозначным анодом/катодом и терминалами235/258. |
| rc-low-pass | RC, синусоидальный источник / электроника |2.728 + policy | Общий C/R/AC source; выход uC сохранён, сетка и Bode остаются прежними. |
| first-order-step | Ступень/апериодическое звено / управление |Функциональная схема, не резистор | Прямоугольник K/τ сохранён именно как block, не подменён UGO-R; подписи/стрелка/bounds checked. |
| dc-motor-start | Якорная цепь/нагрузочный момент / привод |2.722 scoped, ideal motor profile | Локальные R/M/source → общие glyphs; не заявлена полная схема обмоток. |
| line-load-reflection | Rs/линия/RL / волновые цепи |2.728/2.721 + policy | Несогласованные50×18/20×31 тела → общий горизонтальный/вертикальный R, точные терминалы, направления падающей/отражённой волн. |
| derivative-tangent | f(x), касательная / математика |STUD axis/label policy, не2.7xx | Читаемые отдельные legends вместо слитых подписей; actual plot golden. |
| definite-integral | Площадь под f / математика |Axis/label policy | Legend wrap, область/оси/единицы сохранены; golden. |
| complex-vector | Комплексный вектор / математика |Axis/vector policy, не электросхема | Re/Im и модули сохранены; отдельный SVG golden/bounds. |
| projectile | Траектория / механика |Axis/units, не опора балки | Legend wrap, x/y(m), физические samples сохранены. |
| pendulum | θ(t) / механика |Axis/units | Legend wrap, t(s)/θ(rad), samples и fixed domain сохранены. |
| bernoulli | v в сечениях / гидромеханика |Axis/units, не electrical2.7xx | Legends/границы; не выдаётся за hydraulic piping drawing. |
| pipe-loss | p−p0(x) / гидромеханика |Axis/SI | MPa-prefix и actual samples сохранены, legend wrap. |
| standing-wave | ξ(x)/ξ0 / акустика |Axis/units | Единый legend и screenshot, без electrical symbols. |
| beats | Амплитудная огибающая/несущая / акустика |Axis/units | Signed modulation неверно показывалась с labelAenv≥0 → displayabs(points), исходный model/carrier не изменён; legend wrap. |
| ideal-gas | p(V) / термодинамика |Axis/SI | Legend wrap, p/kPa и V/m³, sample values сохранены. |
| snell-refraction | Лучи/нормаль/граница / оптика |Оптическая учебная схема | Локальная физическая SVG, electrical2.7xx не назначается; bounds/golden без изменения модели. |
| mass-spring | x(t) / механика |Axis/units | Legend wrap, actual samples/constant parameter frame сохранены. |
| ToolArt circuit | Схема в общей карточке |Тот же R/source profile | Исходные terminal gap/source diameter сохранены с общей геометрией. |
| ToolArt beam / BeamDiagram | Балка/связи/нагрузки |Расчётные mechanical glyphs | Одна pin/roller/fixed геометрия, ground45°, arrowheads; fixed-right зеркален fixed-left, не механически эквивалентен шарниру. |

Итого:14 electrical миниатюр приведены к единой геометрии/масштабу (12схем и2сигнальных
иллюстрации);12scientific проверены,10получили общую аккуратную легенду,1из них —
исправление смысла огибающей.2специальных SVG science оставлены после проверки. Итого изменены24из26Microминиатюр;2проверены без изменения графики. Дополнительно7электрических SceneVisual и схема урока переведены на общие glyphs; generalZ и referenceEMF выделены по смыслу, а не названию.

## Независимые gates

- `symbols.test.tsx`: ratio/body/terminals/stroke во всех3modes,2orientation/3scales;
  distinct supports/sources;23SVG snapshots (14Micro +8Scene +1lesson).
- `symbol-topology.test.tsx`: из actual rendered SVG извлекаются внешние проводники
  и terminal pins всех12Micro +7Scene +1lesson electrical circuits; проверяются dangling terminal,
  wire-bypass и степени узлов (series loop, parallel3/3, Y1/1/1/3). Геометрическое
  пересечение само по себе не склеивается; действительные T/endpoint joins учитываются.
- Прежний узкий `circuit-render.test.ts` сохранён и запускается отдельно.
- `engineering-symbol-visual.spec.ts`:26PNG goldens и actual scheme-label bounds/
  >=8px на390/900/1440px, page overflow, dark layout; просмотр каждого в contact sheet.
- Дополнительные2браузерных сценария проверяют actual shared glyphs в текущих RU/UK карточках и уроке на390/1440px.7SceneVisual и lesson визуально просмотрены отдельно; общего reference SVG для Z и E с R не смешивают. Магнитопровод/обмотка и блоки NetworkEditor имеют другой смысл и сохранены.
- PNG reference environment: bundled Chromium/Windows и локальные web-fonts;
  platform-neutral filenames исключают заведомое отсутствие fixture в Linux CI,
  но Linux pixel parity НЕ заявляется (Docker Engine недоступен). SVG/numerical
  reference checks независимы от OS. Production/publication отдельно не выполнялись.

Результаты запусков и оставшиеся gates принадлежат `docs/TESTING.md` и выбранному
record `docs/STAGES.md`, не этому аудиту.
