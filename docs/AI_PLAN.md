# Текущий AI-план

## ET-08 — Завершение public release hardening

- Stage ID: `ET-08`

Статус: `PLANNED`

Цель: после validated-locally `TUTOR-06` подтвердить единый GitHub Pages release
contour и закрыть public static release до backend platform track.

### Dependencies и входные предпосылки

- `TUTOR-06` завершён и validated locally;
- production inputs и Pages URL подтверждены существующим evidence;
- любые новые live проверки, merge, push и deploy требуют отдельного разрешения.

### Runnable slice и scenario

Source change проходит full local/CI verify и создаёт checked Pages artifact;
затем RU/UK, PWA, responsive и security release checklist подтверждает
наблюдаемый результат без обхода красных gates.

### Scope и PASS evidence

- выполнить release checklist и installed service-worker update verification;
- сопоставить workflow run URL, commit SHA и artifact scope, если пользователь
  разрешит внешний запуск;
- повторить unit/integration/component, full Chromium E2E, production-like build
  и artifact audits;
- синхронизировать только изменившиеся repository facts.

### Non-goals и blocker

- backend, auth, native media, payments и AI deferred к будущим stages;
- production deploy не входит в автоматическое продолжение;
- без явного разрешения external live evidence остаётся `NOT RUN`, а stage не
  повышается до released/deployed.
