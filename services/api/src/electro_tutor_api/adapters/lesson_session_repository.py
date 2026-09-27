from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.lesson_session import LessonSession
from electro_tutor_api.errors import (
    AuditUnavailableError,
    AuthenticationRequiredError,
    BookingTimeElapsedError,
    IdempotencyConflictError,
    LessonAccessExpiredError,
    LessonAccessNotYetValidError,
    LessonAccessPolicyUnavailableError,
    LessonAccessRevokedError,
    VersionConflictError,
)


class LessonSessionNotFoundError(RuntimeError):
    pass


class InvalidLessonSessionTransitionError(RuntimeError):
    pass


class PostgresLessonSessionRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def read(self, session_id: UUID) -> LessonSession:
        return await self._one(
            "SELECT public.read_lesson_session(CAST(:id AS uuid))",
            {"id": session_id},
        )

    async def mutate(
        self,
        *,
        booking_id: UUID | None,
        session_id: UUID | None,
        action: str,
        expected_version: int | None,
        key: UUID,
        digest: str,
        correlation_id: UUID,
        request_id: str | None,
    ) -> LessonSession:
        return await self._one(
            "SELECT public.mutate_lesson_session(CAST(:booking_id AS uuid),"
            "CAST(:session_id AS uuid),CAST(:action AS text),CAST(:expected AS integer),"
            "CAST(:key AS uuid),CAST(:digest AS text),CAST(:correlation AS uuid),"
            "CAST(:request_id AS text))",
            {
                "booking_id": booking_id,
                "session_id": session_id,
                "action": action,
                "expected": expected_version,
                "key": key,
                "digest": digest,
                "correlation": correlation_id,
                "request_id": request_id,
            },
        )

    async def _one(self, statement: str, parameters: dict[str, object]) -> LessonSession:
        try:
            result = await self._connection.execute(text(statement), parameters)
            payload = result.scalar_one()
        except SQLAlchemyError as exc:
            _raise_error(exc)
        return LessonSession(
            id=UUID(payload["id"]),
            booking_id=UUID(payload["booking_id"]),
            status=payload["status"],
            effective_status=payload["effective_status"],
            version=payload["version"],
            participant_role=payload["participant_role"],
            capabilities=tuple(payload["capabilities"]),
            created_at=datetime.fromisoformat(payload["created_at"]),
            started_at=_date(payload["started_at"]),
            ended_at=_date(payload["ended_at"]),
            cancelled_at=_date(payload["cancelled_at"]),
        )


def _date(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value is not None else None


def _raise_error(exc: SQLAlchemyError) -> None:
    message = str(getattr(exc, "orig", exc))
    markers: tuple[tuple[str, type[RuntimeError]], ...] = (
        ("lesson_session_not_found", LessonSessionNotFoundError),
        ("lesson_access_policy_unavailable", LessonAccessPolicyUnavailableError),
        ("lesson_access_not_yet_valid", LessonAccessNotYetValidError),
        ("lesson_access_expired", LessonAccessExpiredError),
        ("lesson_access_revoked", LessonAccessRevokedError),
        ("idempotency_conflict", IdempotencyConflictError),
        ("version_conflict", VersionConflictError),
        ("invalid_lesson_session_transition", InvalidLessonSessionTransitionError),
        ("booking_time_elapsed", BookingTimeElapsedError),
    )
    if "28000" in message or "active session required" in message:
        raise AuthenticationRequiredError() from exc
    for marker, error_type in markers:
        if marker in message:
            raise error_type() from exc
    raise AuditUnavailableError() from exc
