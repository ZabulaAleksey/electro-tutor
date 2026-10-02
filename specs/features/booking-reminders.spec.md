# ET-14.2 — Настройки и внутренние напоминания о Booking

Статус: approved product contract 2026-09-28, ADR-033. Текущий execution
state и evidence принадлежат `../../docs/STAGES.md`. ET-14.1 — обязательная
delivery/inbox основа; ручная приёмка ET-10.3 не является зависимостью.

## Поведение

- `REM-001`: authenticated Account явно сохраняет IANA timezone и независимо
  управляет 24h, 1h и 15m напоминаниями. Defaults: 24h и 1h ON, 15m OFF.
  Quiet hours OFF; при включении сохраняются start/end local time, включая
  диапазон через полночь. Browser timezone может быть только предложением,
  которое пользователь подтверждает. Пока timezone не сохранена, scheduler
  не угадывает её и UI предлагает завершить настройку.
- `REM-002`: при успешном Booking ACCEPTED создаются отдельные pending intents
  для каждого включённого offset и каждого участника с сохранённой timezone.
  Booking `starts_at` остаётся immutable UTC instant. `planned_at` — именно
  `starts_at - offset`; quiet hours сдвигают `due_at` к ближайшему окончанию
  интервала в timezone получателя, сохраняя исходный offset. Если окончание
  quiet hours не раньше начала Booking, intent становится skipped.
- `REM-003`: worker доставляет due intent через существующий ET-14.1 outbox
  и inbox только если Booking всё ещё ACCEPTED, `starts_at > server now` и
  `server now <= due_at + 15 minutes`. Более позднее исполнение пропускается.
  Ровно на границе +15 min доставка разрешена. Retry/concurrent poll не
  создают второй item; failure после claim безопасно повторяется.
- `REM-004`: отмена Booking до начала атомарно отменяет pending intents;
  доставленная история остаётся по 30-day policy ET-14.1. Существующий
  Booking contract запрещает reschedule-in-place: перенос — отмена старого
  Booking и request/accept нового immutable Booking. Старые pending intents
  отменяются, новые получают новый Booking ID; повторные переходы не создают
  duplicate intents.
- `REM-005`: изменение timezone/settings пересчитывает ещё pending intents
  для будущих ACCEPTED Booking, не изменяя сам Booking. Уже доставленные
  записи не дублируются. Чужие settings/Booking и anonymous недоступны;
  foreign resource masking следует Booking API. In-app сообщение хранит
  machine type и Booking UUID, а RU/UK текст создаётся в presentation layer.

## Границы времени и отказ

Временные значения Booking и jobs хранятся как `timestamptz` UTC instants.
Quiet hours сравниваются с local wall time получателя по IANA zone на момент
планирования/пересчёта. На DST gap/fold используется time-zone database
PostgreSQL и детерминированный результат её `AT TIME ZONE`; тесты фиксируют
реальный transition в `Europe/Warsaw` и `America/New_York`, включая ambiguous
и nonexistent wall times. Ручные UTC-offset таблицы запрещены.

Cancellation/reschedule и delivery сериализуются на Booking/job rows;
stale intent не превращается в outbox event. Worker outage сохраняет durable
pending state. Scheduled/delivered/skipped/cancelled/retryable различимы в
storage/diagnostics без приватного payload. Внешние каналы, arbitrary offsets,
push/email/SMS/Telegram и новая event bus не входят в stage.

## Acceptance

1. Reversible migration, independent clean-head catalog manifest, clean
   bootstrap и upgrade существующей disposable 0013 DB; original DB не менять.
2. Unit/reference checks для 24h/1h/15m, toggles, quiet hours до/после
   Booking, overnight interval, +5/+15/>15 min, started Booking и DST gap/fold.
3. Real PostgreSQL transaction checks: accept, cancel, replacement Booking,
   repeated transition, concurrent workers, retry/partial failure, settings
   revision, own/foreign/anonymous access и no duplicate inbox item.
4. RU/UK settings UI: explicit timezone confirmation, persistence, keyboard,
   accessible labels, loading/error/empty states; browser→Keycloak→API→DB→
   worker→localized reminder acceptance без mock как terminal evidence.
5. Worker/outbox diagnostics без private payload; frontend/backend suites,
   project validators, diff/secrets audit и документация синхронизированы.
