# Интерактив переходного процесса в длинной линии

Статус: утверждённый contract по пользовательскому MASTER PROMPT от 2026-09-28.
Область: static RU/UK Electro Tutor, без backend и сохранения пользовательского state.

## Requirements

- `INT-009`: в разделе «Интерактив» три отдельные карточки и локализованные
  маршруты: круговая диаграмма четырёхполюсника, звезда с нейтралью, длинная
  линия. Круговая диаграмма получает отдельную страницу; встроенная версия
  на индексной странице остаётся для совместимости существующих share links,
  keyboard и RU/UK browser contracts.
- `LINE-001`: production physics — Rust/`wasm-bindgen` в одном Web Worker.
  Численный solver использует только текущее распределённое состояние,
  O(N) памяти и O(N) работы на шаг; ни список отражений, ни история кадров,
  ни analytic travelling-wave engine в расчёте не допускаются.
- `LINE-002`: однородная lossless линия длиной `l` из `N` ячеек с
  `V[0..N]`, `I[0..N-1]` (токи source→load) и отдельными per-cell `L`,
  per-node `C` с half-cell ёмкостью на концах. `L'=Z0/v`,
  `C'=1/(Z0v)`, `dx=l/N`, `dt=cfl·dx/v`; default CFL=0.9.
  Explicit staggered leapfrog обновляет токи, затем напряжения.
  Внутренние единицы SI, `f64`, непрерывные буферы.
- `LINE-003`: левый порт — DC step `Vs(t)` с `E`, `Rs`, `switchTime`.
  Для `Rs>0` граничный ток следует `(Vs−V0)/Rs`; для `Rs=0` действует
  идеальная Dirichlet-граница, без искусственного малого сопротивления.
  Source port отделён от конкретной формы сигнала и может позже принять
  sinusoid/pulse/arbitrary waveform.
- `LINE-004`: правый порт — отдельная boundary-device abstraction.
  Поддержаны open, short, R, L, C, RL, RC, RLC; для смешанных нагрузок
  серия обязательна, parallel желательна. Состояние реактивных ветвей
  `iL`/`uC`, включая заданные initial values, сохраняется между шагами.
  API должен позволять future nonlinear residual `F(u,i,x,t)=0`,
  не внедряя MNA/Newton в MVP. Решение границы должно быть конечным,
  без отрицательных R/L/C и без surrogate open/short.
- `LINE-005`: конфигурация валидируется до запуска (конечные положительные
  `l,v,Z0,N`, пассивные параметры, конечное stop time, CFL≤0.95).
  Ошибки WASM/worker и численной неустойчивости видимы; нет подмены solver
  демонстрационной анимацией. Диагностика включает `dx,dt,CFL,τ`, порты,
  min/max V/I и энергию линии.
- `LINE-006`: worker владеет solver state, reset, step, play/pause, stop-at,
  fast-forward и deterministic seek. Seek назад = reset + повторное
  интегрирование; полная история не хранится. Physics `dt` не зависит от
  FPS и playback rate. Не более одного ожидающего render snapshot;
  промежуточные кадры можно отбрасывать.
- `LINE-007`: React UI показывает source/line/load параметры только по
  применимости, `U(x)` и `I(x)` через Canvas 2D, схему SOURCE→LOAD,
  текущие `t`, портовые значения и состояние нагрузки. Есть Play, Pause,
  Reset, Step, Stop At, seek и визуальный множитель скорости. Hover показывает
  `x,U(x),I(x)`. Большие массивы не проходят через React state.
- `LINE-008`: Rust reference tests: propagation near `τ=l/v`,
  `U/I≈Z0` до отражений, matched/open/short/mismatched R по аналитическим
  oracles, C/L/RLC continuity/evolution, N=100/200/400/800 convergence
  по одинаковым физическим x/t, finite/energy stability, deterministic
  reset+seek, invalid inputs и O(N) memory. Browser E2E проходит оба
  сценария open/C/L с реальным WASM Worker и RU/UK.
- `LINE-009`: reproducible microbenchmark для N=1000/5000/10000 отдельно
  измеряет steps/s, simulated seconds/s, snapshot и worker transfer;
  результаты не обещают постоянную производительность на каждом устройстве.
- `LINE-010`: data layout и портовые interfaces не блокируют future
  spatial `R',L',G',C'`, неравномерный `dx[k]`, нелинейный one-port и
  общий transient circuit engine. Lossy/nonlinear/multiline mode не входит
  в MVP.

## Численная схема и границы

`I_k^{n+1/2}=I_k^{n-1/2}+dt/L_k·(V_k^n−V_{k+1}^n)`.
Для внутренних узлов
`V_k^{n+1}=V_k^n+dt/C_k·(I_{k−1}^{n+1/2}−I_k^{n+1/2})`.
Концы используют ту же ёмкость узла и токи портов. Пассивные linear
boundary devices дают midpoint companion `i=G·v_mid+b` плюс свой
минимальный state; интерфейс сохраняет место для nonlinear residual.
Вместо решения плотной глобальной системы вычисляется только локальная
формула каждого endpoint. `Rs=0` и short load — точные voltage constraints.

В default initial state все распределённые значения нулевые. При
ненулевом initial voltage идеального C terminal node должен начинать с
`uC(0)`, чтобы удовлетворить физическому voltage constraint; остальные
узлы остаются нулевыми. Reset возвращает согласованное initial state.

## Приёмка

Сценарий: `E=100 V, Rs=50 Ω, l=1000 km, v=2e8 m/s, Z0=50 Ω,
N=1000, open, stop=20 ms`. UI показывает `τ=5 ms`; фронт достигает
нагрузки около 5 ms, терминал меняется, затем пространственный pattern
возвращается к источнику. C и L load дают непрерывные state trajectories.
Спецификация подтверждается Rust tests, собранным WASM Worker в Chromium,
quality gates и benchmark. UI/worker не объявляют completion при одной
статической или mock проверке.

Вне MVP: lossy и неоднородная линия, нелинейные приборы, circuit MNA/DAE,
WebGPU/threads/SharedArrayBuffer, сохранённые simulation checkpoints.
