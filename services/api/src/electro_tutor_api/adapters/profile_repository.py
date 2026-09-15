from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.profile import StudentProfile, TutorProfile
from electro_tutor_api.errors import AuditUnavailableError


class PostgresProfileRepository:
    """Connection-scoped facade over least-privilege profile database functions."""

    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def create_student(self, display_name: str) -> tuple[StudentProfile, bool]:
        result = await self._connection.execute(
            text("SELECT * FROM public.create_student_profile(CAST(:display_name AS text))"),
            {"display_name": display_name},
        )
        row = result.mappings().one()
        return _student_from_row(row), row["created"]

    async def get_student(self, *, for_update: bool = False) -> StudentProfile | None:
        del for_update
        result = await self._connection.execute(
            text("SELECT * FROM public.read_student_profile()"),
        )
        row = result.mappings().one_or_none()
        return None if row is None else _student_from_row(row)

    async def update_student(self, display_name: str) -> StudentProfile | None:
        result = await self._connection.execute(
            text("SELECT * FROM public.update_student_profile(CAST(:display_name AS text))"),
            {"display_name": display_name},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _student_from_row(row)

    async def create_tutor(
        self,
        display_name: str,
        *,
        correlation_id: UUID | None,
        request_id: str | None,
    ) -> tuple[TutorProfile, bool]:
        try:
            result = await self._connection.execute(
                text(
                    "SELECT * FROM public.create_tutor_profile("
                    "CAST(:display_name AS text), "
                    "CAST(:correlation_id AS uuid), CAST(:request_id AS text))"
                ),
                {
                    "display_name": display_name,
                    "correlation_id": correlation_id,
                    "request_id": request_id,
                },
            )
        except SQLAlchemyError as exc:
            raise AuditUnavailableError() from exc
        row = result.mappings().one()
        return _tutor_from_row(row), row["created"]

    async def get_tutor(self, *, for_update: bool = False) -> TutorProfile | None:
        del for_update
        result = await self._connection.execute(
            text("SELECT * FROM public.read_tutor_profile()"),
        )
        row = result.mappings().one_or_none()
        return None if row is None else _tutor_from_row(row)

    async def update_tutor(self, display_name: str) -> TutorProfile | None:
        result = await self._connection.execute(
            text("SELECT * FROM public.update_tutor_profile(CAST(:display_name AS text))"),
            {"display_name": display_name},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _tutor_from_row(row)


def _student_from_row(row: Any) -> StudentProfile:
    return StudentProfile(
        account_id=row["account_id"],
        display_name=row["display_name"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _tutor_from_row(row: Any) -> TutorProfile:
    return TutorProfile(
        account_id=row["account_id"],
        display_name=row["display_name"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
