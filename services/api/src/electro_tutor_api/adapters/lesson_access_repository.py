from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.lesson_access import (
    LessonAccessCapability,
    LessonAccessDecision,
    LessonAccessParticipantRole,
    LessonAccessStatus,
)
from electro_tutor_api.errors import (
    AuditUnavailableError,
    BookingNotFoundError,
    LessonAccessPolicyUnavailableError,
    LessonAccessUnavailableError,
)


class PostgresLessonAccessGrantRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def authorize_for_current_session(self, booking_id: UUID) -> LessonAccessDecision:
        try:
            result = await self._connection.execute(
                text("SELECT * FROM public.authorize_lesson_access(CAST(:booking_id AS uuid))"),
                {"booking_id": booking_id},
            )
        except SQLAlchemyError as exc:
            _raise_lesson_access_error(exc)
        return _decision_from_row(result.mappings().one())


def _decision_from_row(row: Mapping[str, Any] | RowMapping) -> LessonAccessDecision:
    return LessonAccessDecision(
        grant_id=row["grant_id"],
        booking_id=row["booking_id"],
        status=LessonAccessStatus(row["status"]),
        participant_role=LessonAccessParticipantRole(row["participant_role"]),
        valid_from=row["valid_from"],
        valid_until=row["valid_until"],
        capabilities=(LessonAccessCapability.LESSON_SHELL_ENTER,),
    )


def _raise_lesson_access_error(exc: SQLAlchemyError) -> None:
    message = str(getattr(exc, "orig", exc))
    for marker, error_type in (
        ("booking_not_found", BookingNotFoundError),
        ("lesson_access_unavailable", LessonAccessUnavailableError),
        ("lesson_access_policy_unavailable", LessonAccessPolicyUnavailableError),
    ):
        if marker in message:
            raise error_type() from exc
    raise AuditUnavailableError() from exc
