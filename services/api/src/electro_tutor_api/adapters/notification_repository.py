from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.notification import Notification
from electro_tutor_api.errors import NotificationUnavailableError


class PostgresNotificationRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def list(self, *, limit: int, offset: int) -> list[Notification]:
        try:
            result = await self._connection.execute(
                text("SELECT * FROM public.list_notifications(:limit,:offset)"),
                {"limit": limit, "offset": offset},
            )
            return [Notification(**row) for row in result.mappings()]
        except SQLAlchemyError as exc:
            raise NotificationUnavailableError() from exc

    async def unread_count(self) -> int:
        try:
            value = await self._connection.scalar(
                text("SELECT public.count_unread_notifications()")
            )
            return int(value)
        except SQLAlchemyError as exc:
            raise NotificationUnavailableError() from exc

    async def mark_read(self, notification_id: UUID) -> bool:
        try:
            value = await self._connection.scalar(
                text("SELECT public.mark_notification_read(CAST(:id AS uuid))"),
                {"id": notification_id},
            )
            return value is True
        except SQLAlchemyError as exc:
            raise NotificationUnavailableError() from exc
