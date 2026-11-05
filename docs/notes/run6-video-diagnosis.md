# Видеорепетиторство: техническая диагностика RUN6

Канонический текущий status/owner actions — STAGES ET-NAV-006; это диагностическая записка, а не второй план.

## Два разных пути

Гостевой /[lang]/classroom/ использует Classroom.tsx → create-meeting-provider → JitsiMeetingAdapter → публичный meet.jit.si/external_api.js. Код создаёт room/invite в браузере и не требует FastAPI/OIDC/PostgreSQL. В full режиме ссылка снова доступна в меню «Репетиторство» и сервисах. В публичном MVP маршрут физически отсутствует; запрет iframe/media/camera/microphone в его CSP/Permissions-Policy сохранён намеренно.

Защищённый /[lang]/lesson/ — Booking/Grant/Session с OIDC и серверным lifecycle; медиасвязи и гостевого media invite там нет. Это NOT_IMPLEMENTED, а не та же Jitsi-комната. Историческая voice/Narrator приёмка не доказывает видеосвязь.

## Реальное наблюдение

На свежей prechange full-сборке две независимые Chromium-сессии открыли один случайный audit invite и настоящий Jitsi prejoin без регистрации ElectroTutor. Первому анонимному участнику Jitsi отказал conference.connectionError.membersOnly: нужен модератор, предложен Log-in. conferenceJoined/participantJoined не получены, peerConnections=0, inbound/outbound RTP=0. Наличие iframe/SDK/ссылки не повышено до PASS связи. Браузер использовал синтетические устройства только для prejoin; физические микрофон/камера/демонстрация экрана NOT_RUN. NAT/STUN/TURN после admission также NOT_RUN; локального signaling/TURN/tenant/JWT в проекте нет. Provider server logs недоступны; точная причина установлена по реальному provider response, не по догадке о backend.

Структурированное evidence без room/секретов — docs/evidence/run6-video-diagnosis.json. Внешний task archive хранит publishable cropped provider blocker; сырые room/frame screenshots и provider logs в публичный handoff не включены.

Официальная инструкция https://jitsi.github.io/handbook/docs/user-guide/user-guide-start-a-jitsi-meeting/ подтверждает authentication/wait-for-moderator для первого участника. https://jitsi.github.io/handbook/docs/devops-guide/authentication/ описывает admission authenticated creator→anonymous guests. Эти docs и реальный отказ согласованы; это не доказательство доступности media после логина.

## Конкретное продолжение

1. Преподаватель входит в Jitsi официальным способом и начинает комнату; обход авторизации не выполнять.
2. Второй независимый браузер ученика открывает тот же invite без учётной записи ElectroTutor; требуются conferenceJoined и participant events в обеих сессиях.
3. Подтвердить growing inbound/outbound RTP, двусторонний звук/видео и реальную демонстрацию экрана. Лишь после admission исследовать ICE candidate pair/NAT/TURN при отказе.
4. Для управляемого репетиторства отдельно выбрать trusted media provider/tenant, host identity, guest grant, token issuer и signaling/TURN ownership. Это отдельная SPEC/owner approval, не настройка навигации.
5. Локальная будущая UX-коррекция: показывать connected по provider conferenceJoined/error events, а не по созданию SDK object. В RUN6 этот RTC-код не менялся; SDK-ready не принят как успешная конференция.

Для шага1 новые ресурсы ElectroTutor не требуются; в RUN6 создано0платных ресурсов/подписок. Self-hosting смета не составлена; публичные JaaS цены приведены ниже как варианты, без согласования/подключения тарифа. У публичного внешнего сервиса нет собственного application access control; существующий unpinned top-level Jitsi SDK остаётся documented full-only trust boundary.

## Варианты и публичные цены, проверено2026-11-05

| Вариант | Стоимость/граница | Следующий безопасный шаг |
|---|---|---|
| Внешняя встреча meet.jit.si | Free hosted service по [Jitsi FAQ](https://jitsi.org/user-faq/); собственных cloud resources ElectroTutor не нужно | Учитель проходит официальный host login, затем повторный реальный guest/AV test; доступность/квоты провайдера не гарантируем |
| Controlled embedding JaaS | [8x8 pricing](https://cpaas.8x8.com/en/pricing/jitsi-as-a-service-pricing/): Developer25MAU free, Basic300MAU $99/month; указан overage $0.99/MAU | Отдельное решение владельца, tenant/key/token issuer +small pilot; никаких регистраций/подписок в RUN6 |
| Self-hosted Jitsi | Размеры server/TURN/bandwidth/operations ещё не выбраны, точная стоимость NOT_ESTIMATED | Сначала concurrency/region/SLA/spec и проверяемая смета, затем отдельное разрешение на infrastructure |

[Официальная страница JaaS](https://jitsi.org/jaas/) отдельно сообщает, что прежнее embedding через meet.jit.si больше не является поддерживаемым способом интеграции и направляет к JaaS. Поэтому host login рассматривается как диагностический шаг и вариант внешней встречи; он не объявлен гарантированным исправлением встроенного classroom. Подтверждённый runtime blocker RUN6 остаётся membersOnly; дополнительные provider-policy ограничения отделены от этого факта. MAU — месячно активные пользователи; платный тариф/налоги/региональные условия аккаунта не принимались и не проверялись. Все новые ресурсы/подписки в RUN6:0.
