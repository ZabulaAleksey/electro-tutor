# ET-LINE-001 — независимая проверка трёх численных assertions

Дата: 2026-09-28. Scope: два исходных FAIL и третий, проявившийся после исправления второго в `transient-core/tests/reference.rs` на `main@a7b198f`. Расчёт выполнен до изменения accepted tests. Конфигурация взята из исходного теста и `specs/features/transmission-line-transient.spec.md`.

## 1. Первая волна в середине линии

Исходный assertion: в `propagation_speed_and_characteristic_relation` после `advance_to(0.003)` один узел `V[500]` сетки `N=1000` обязан дать `50 ± 1 V`. Фактически `52.014588360 V`.

Физическая модель: `E=100 V` (DC step), `Rs=50 Ω`, `Z0=50 Ω`, `l=1,000,000 m`, `v=200,000,000 m/s`, open load; нулевые initial states, положительный ток source→load. Время до середины `2.5 ms`, до нагрузки `5 ms`, возврат отражения к середине `7.5 ms`. До отражений аналитическое напряжение первой волны `E Z0/(Rs+Z0)=50 V`, ток `50/Z0=1 A`. Это мгновенные значения, не RMS и не peak. На `t=3 ms` середина должна быть за фронтом; ошибка определения физической контрольной точки отсутствует.

Численный шаг теста: `dx=1000 m`, `dt=0.9 dx/v=4.5 µs`; `advance_to(3 ms)` округляет вверх до `3.0015 ms`. Staggered current находится на половинном шаге от voltage. Один point sample несёт дисперсионное ringing от идеального скачка: при `N=1000`, CFL `0.5/0.9/0.95`, `V[500]` = `47.957805/52.014588/49.631232 V`; при CFL `0.9`, `N=1600/3200/6400` = `50.662376/51.416073/50.918231 V`. Это чувствительность к сетке и sampling phase, без монотонной pointwise сходимости. Тот же solver в физически фиксированном plateau window `x∈[0.2l,0.4l)` при `N=1000,CFL=0.9` даёт mean `V=49.997651 V`, mean `I=1.000005 A`; при `N=6400,CFL=0.9` — `50.000250 V`, `0.999992 A`.

**Классификация: `MODEL/DISCRETIZATION_LIMITATION`.** Непрерывное 50 V ожидание верно, однако точечная tolerance ±1 V для диспергирующей lossless leapfrog схемы и discontinuous step не следует из SPEC. [Purdue lecture on Yee/FDTD grid dispersion](https://engineering.purdue.edu/wcchew/ece604s21/Lecture%20Notes/Lect37.pdf) описывает искажение широкополосного импульса даже при устойчивом CFL. Implementation меняет только текущие состояния с заданными `L′,C′`, и spatial average/characteristic relation соответствует независимой аналитике. Контракт будет проверять mean в полностью пройденном окне `0.2l..0.4l`, ожидая `50 ± 0.5 V` и `1 ± 0.02 A`; отдельные arrival, load-open и `Z0` assertions сохраняются. Это ловит неверную амплитуду источника, импеданс или отсутствие распространения, не подстраивая tolerance под `52.014588`.

## 2. Series RLC после 20 ms

Исходный assertion в `series_and_parallel_rlc_remain_finite`: для **обеих** топологий после `advance_to(0.02)` должно быть `|I_L|>0.01 A`. Series solver при `N=500,CFL=0.9` даёт `I_L=-0.000112910 A` в фактические `20.007 ms`.

Условия: source `E=100 V`, matched `Rs=Z0=50 Ω`; линия та же, front arrives load at `5 ms`. Series load `R=50 Ω`, `L=0.02 H`, `C=10 µF`; начальные `I_L=0 A`, `U_C=0 V`. До обратного влияния источника нагрузка видит Thevenin `100 V` и `Z0=50 Ω`; matched source поглощает возвращающуюся волну. Поэтому для времени `s=t−5 ms` суммарное сопротивление `R_total=Z0+R=100 Ω`, `α=R_total/(2L)=2500 s⁻¹`, `ω0=1/√(LC)=2236.06798 s⁻¹`. Корни overdamped response: `r1=-1381.96601 s⁻¹`, `r2=-3618.03399 s⁻¹`; `i(s)=E/[L(r1−r2)]·(e^(r1s)−e^(r2s))`. Размерность коэффициента — A. [MIT OCW series RLC lecture](https://ocw.mit.edu/courses/6-071j-introduction-to-electronics-signals-and-measurement-spring-2006/resources/16_transint_rlc2/) даёт ту же классификацию overdamped step response.

Аналитика: peak `0.762385 A` через `0.430409 ms` после прихода; в `5.5 ms` `I_L≈0.754155 A`, `U_C≈29.0474 V`; в `20 ms` `I_L≈2.2×10⁻⁹ A`, `U_C≈100.0000 V`. Series capacitor блокирует установившийся DC ток. Solver при `N=500,CFL=0.9`: `I_L=0.752736 A` в `5.508 ms`, `U_C=29.6471 V`; в `20.007 ms` `I_L=-0.000112910 A`, `U_C=100.000009 V`. При `N=1000,CFL=0.9` late `I_L=-0.000029926 A`, при `N=2000,CFL=0.9` `+0.000009647 A`: остаток убывает при refinement. CFL `0.5` даёт тот же ранний transient и near-zero late current. Знак late residual — numerical, не направление устойчивого DC тока. Все значения мгновенные; peak/RMS conversion неприменима.

**Классификация: `TEST_CONTRACT_BUG`.** Старое `|I_L|>0.01 A` на `20 ms` неверно для series topology. Новая series приёмка проверит ранний ток в `5.5 ms` против независимой аналитики `0.754 A ± 0.05 A`, а в `20 ms` — `|I_L|<0.005 A` и `U_C≈100 V ± 0.5 V`. Ранняя точка ловит «мёртвый»/обойдённый L branch, поздняя — отсутствие series-C/DC-blocking; допуски больше измеренной discretization error и меньше физической амплитуды. Для parallel topology прежняя ненулевая late-current проверка сохраняется.

## 3. Parallel RLC capacitor voltage после 20 ms

Старый assertion в том же тесте для обеих топологий требовал `|U_C|>0.01 V` после `advance_to(0.02)`. Он был скрыт предыдущим series-current FAIL и проявился после разрешённой правки. Пользователь отдельно разрешил пересмотреть именно этот третий contract 2026-09-28.

Начальные условия и source/line прежние. Parallel нагрузка: `R=50 Ω`, `L=0.02 H`, `C=10 µF`, нулевые начальные `U_C` и `I_L`. С момента прихода `s=t−5 ms`, KCL с Thevenin `E=100 V`, `Z0=50 Ω` даёт `C v″ + (1/Z0+1/R) v′ + v/L = 0`, `v(0)=0`, `v′(0)=E/(Z0 C)=200000 V/s`. Размерности: `v′` V/s; коэффициенты `α=(1/Z0+1/R)/(2C)=2000 s⁻¹`, `ω0=1/√(LC)=2236.068 s⁻¹`, `ωd=√(ω0²−α²)=1000 s⁻¹`. Отсюда `U_C(s)=200 exp(−2000s) sin(1000s) V`. В `5.5 ms` (s=0.5 ms) аналитика даёт `35.27 V`, в `20 ms` (s=15 ms) — приблизительно `1.2×10⁻¹¹ V`; DC current через inductor стремится к `E/Z0=2 A`. Это мгновенные значения, не RMS/peak; sign of late numerical residual не имеет физического значения.

Solver `N=500,CFL=0.9`: в фактические `5.508 ms` `U_C=35.23827 V`, `I_L=0.662853 A`; в `20.007 ms` `U_C=−0.000124547 V`, `I_L=1.999999769 A`. Late `U_C` при `N=1000/2000,CFL=0.9` равно `0.000445276/0.000047694 V`, то есть сохраняет малый, меняющий знак фазовый residual около нуля. Разность в ранней контрольной точке менее `0.1%`; выбранная tolerance `±2 V` допускает discretization/sample timing, но существенно меньше `35 V`. Late `|U_C|<0.01 V` и `I_L=2±0.05 A` ловят ошибку DC topology, а ранняя проверка ловит обойдённый/мёртвый capacitor branch.

**Классификация: `TEST_CONTRACT_BUG`.** Старое условие `|U_C|>0.01 V` на `20 ms` физически неверно для parallel RLC с индуктивным short на DC. Замена проверяет ранний capacitor transient и позднее near-zero voltage вместе с DC current. Третий test contract изменён только после отдельного разрешения пользователя.

## Воспроизведение

Независимые scalar analytic values вычислены `work/physics_probe/analytic.py`; sensitivity снималась отдельным внешним Rust probe, который вызывает public solver API без изменения repository test/source. Конфигурации `N=100..6400`, CFL `0.5/0.9/0.95` для первой волны; `N=100..2000`, CFL `0.5/0.9` для RLC. Эти work scripts находятся вне product Git и не являются acceptance tests. После правки необходимы полный `cargo test`, WASM hash/build, affected frontend/Worker browser и final diff.
