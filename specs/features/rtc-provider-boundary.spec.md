# RTC provider boundary

Статус: Утверждено пользователем 2026-09-13

Версия: 1.0

## Цель

Сохранить текущее поведение публичного кабинета, но локализовать Jitsi IFrame API в сменном
infrastructure adapter. React-компонент зависит только от system-owned meeting port и не знает
provider domain, script URL, constructor, command names или vendor types.

## Требования

- `RTC-001`: application/UI использует `MeetingProvider` и `MeetingSession` с canonical join
  request, capabilities и lifecycle `join → command → dispose`.
- `RTC-002`: Jitsi domain, script URL, global constructor, options и command translation находятся
  только в Jitsi adapter и его тестах.
- `RTC-003`: provider выбирается в одном composition root; scattered provider conditionals
  запрещены.
- `RTC-004`: adapter нормализует load/join/command/dispose failures в provider-neutral
  `MeetingError`, ограничивает ожидание script load, допускает retry после load timeout/failure и
  делает успешный `dispose` идемпотентным.
- `RTC-005`: whiteboard отображается только при объявленной capability. Invite URL, room
  normalization, explicit join, muted camera/microphone defaults и RU/UK strings не меняются.
- `RTC-006`: общий contract suite проходит для fake provider и Jitsi adapter с injected SDK loader;
  structural guard запрещает vendor leakage обратно в `Classroom.tsx`.

## Security и fallback

Script загружается только после явного join. Публичная Jitsi-комната не становится access control;
room/query обязаны не содержать PII или tokens, unknown query/hash не попадают в invite, а
display name остаётся ограниченным недоверенным пользовательским вводом.
Недоступный provider или command возвращает canonical error и существующее локализованное notice.
Смена provider, собственный RTC backend, secrets, migration и deploy не входят в этап.

## Критерии приёмки

- `AC-RTC-A`: `Classroom.tsx` не содержит `Jitsi`, `meet.jit.si`, `external_api.js`,
  `toggleWhiteboard` или vendor constructor/API type.
- `AC-RTC-B`: Jitsi adapter сохраняет room prefix, display name, parent host, размеры и muted
  defaults текущего MVP.
- `AC-RTC-C`: whiteboard command переводится внутри adapter; capability доступна consumer до
  показа кнопки.
- `AC-RTC-D`: repeated successful dispose вызывает vendor dispose ровно один раз; failed dispose
  остаётся retryable, а текущий Jitsi adapter гарантирует удаление provider DOM/iframe из host,
  даже если vendor dispose падает. Отложенный join после leave/unmount не оживляет UI и уничтожает
  session; UI не показывает состояние выхода без подтверждённого teardown.
- `AC-RTC-E`: load, timeout, constructor, command и dispose errors имеют стабильные
  provider-neutral codes; failed/settled script не блокирует повторную загрузку.
- `AC-RTC-F`: focused contract/structural tests, `pnpm test`, `pnpm check`, `pnpm lint` и
  `pnpm build` проходят.
- `AC-RTC-G`: architecture, ADR, security, testing, roadmap и selected STAGES синхронизированы с
  проверенным repository state.

## Traceability

| Requirement | Implementation | Evidence |
|---|---|---|
| `RTC-001`, `RTC-003` | `src/classroom/meeting.ts`, `src/classroom/create-meeting-provider.ts` | meeting contract tests |
| `RTC-002`, `RTC-004` | `src/classroom/jitsi-meeting-adapter.ts` | injected adapter tests + structural guard |
| `RTC-005` | `src/components/Classroom.tsx` | component boundary test + check/build |
| `RTC-006` | `src/classroom/meeting.test.ts` | focused and full Vitest suites |
