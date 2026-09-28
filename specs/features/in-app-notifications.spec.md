# ET-14.1 — Внутренние уведомления v1

Статус: approved product contract 2026-09-28, ADR-032. Stage acceptance и
текущий NEXT принадлежат `../../docs/STAGES.md`. Этап независим от ручного
screen-reader gate ET-10.3; prerequisites — ET-09.2 и ET-10.1.

## Обязательное поведение

- `INAPP-001`: успешный `REQUESTED → ACCEPTED` Booking в одной транзакции
  фиксирует durable `booking.accepted` event для student Account. Повтор
  idempotency key и retry не создают второй item. Failed Booking не создаёт
  event/item. Ошибка worker после commit не откатывает Booking.
- `INAPP-002`: worker материализует одну owner-scoped in-app запись из события.
  У неё есть server ID, recipient Account ID, machine type `booking.accepted`,
  structured bounded payload (booking ID), `created_at`, `expires_at`, nullable
  `read_at` и stable business dedup key. `expires_at = created_at + 30 days`.
  Source event и notification не содержат Booking title, Session payload,
  token или готовый HTML. Retries reconcile before create; worker outage
  сохраняет pending event, а не теряет его.
- `INAPP-003`: authenticated owner получает paginated list и unread count.
  Read item остаётся в списке до expiry. Item с `expires_at <= server now`
  исключается из list/count и не может быть открыт/изменён через API; bounded
  maintenance удаляет истёкшие строки без воздействия на Booking. Не создавать
  user delete или mark-all endpoint в v1.
- `INAPP-004`: authenticated owner отмечает один item прочитанным; повтор
  идемпотентен. Foreign/unknown ID маскируется одинаково, list/count никогда
  не включают чужие записи. Сервер выводит owner из session, не из client
  body/query. Внешние URL из payload никогда не используются для navigation.
- `INAPP-005`: RU/UK inbox отображает empty/loading/error, unread/read и
  локализованное сообщение по type, со ссылкой на разрешённый внутренний
  Booking route. Link остаётся под обычной Booking authorization. Клавиатура
  достигает всех controls, unread state имеет доступное имя и не кодируется
  одним цветом. Realtime не обязателен; refetch после navigation допустим.

## Границы и отказ

Единственная production boundary создания event — транзакционный trigger
успешного Booking transition; materialization выполняет отдельный worker
через ограниченные DB functions. Booking не знает provider SDK. PostgreSQL
и existing Alembic discipline остаются authoritative. Outbox/job retries bounded;
после exhausted attempts запись остаётся диагностируемой и подлежит
reconciliation. Exactly-once claim запрещён. External channels, preferences,
reminders, WebSocket и новые категории не входят в v1. Internal navigation
типизирована; недоверенный payload не выбирает origin/path.

## Acceptance

1. Clean DB bootstrap и upgrade через versioned migration; index/catalog
   parity, timestamp/expiry/owner constraints и rollback review.
2. Real PostgreSQL transaction test: Booking accepted + event атомарны;
   duplicate, worker retry/outage/restart создают один inbox item; failed
   transition ничего не публикует.
3. API tests с двумя Account: own list/count/read, pagination, repeated read,
   expiry cutoff, invalid/foreign IDs и no IDOR.
4. RU/UK component и built browser→API→DB→worker→inbox→read E2E; keyboard,
   accessible names, loading/error/empty и safe navigation.
5. Service/worker observability без private payload; deployment config и
   failure behavior документированы. Backend/frontend suites, context
   validator, diff/secrets audit PASS. Mock-only path не закрывает stage.
