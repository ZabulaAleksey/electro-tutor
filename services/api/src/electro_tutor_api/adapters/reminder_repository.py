from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.reminder import ReminderSettings
from electro_tutor_api.errors import NotificationUnavailableError


class PostgresReminderSettingsRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def get(self) -> ReminderSettings:
        try:
            result = await self._connection.execute(
                text("SELECT * FROM public.get_reminder_settings()")
            )
            row = result.mappings().one()
            return ReminderSettings(**row)
        except SQLAlchemyError as exc:
            raise NotificationUnavailableError() from exc

    async def put(self, settings: ReminderSettings) -> ReminderSettings:
        settings.validate()
        try:
            await self._connection.execute(
                text(
                    "SELECT public.put_reminder_settings("
                    "CAST(:time_zone AS text),:remind_24h,:remind_1h,:remind_15m,"
                    ":quiet_hours_enabled,CAST(:quiet_hours_start AS time),"
                    "CAST(:quiet_hours_end AS time))"
                ),
                {
                    "time_zone": settings.time_zone,
                    "remind_24h": settings.remind_24h,
                    "remind_1h": settings.remind_1h,
                    "remind_15m": settings.remind_15m,
                    "quiet_hours_enabled": settings.quiet_hours_enabled,
                    "quiet_hours_start": settings.quiet_hours_start,
                    "quiet_hours_end": settings.quiet_hours_end,
                },
            )
            return settings
        except SQLAlchemyError as exc:
            raise NotificationUnavailableError() from exc
