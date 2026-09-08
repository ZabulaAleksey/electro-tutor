from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.audit import (
    AuditAction,
    AuditActorType,
    AuditEvent,
    AuditResult,
    AuditSubjectType,
    NewAuditEvent,
)
from electro_tutor_api.errors import AuditUnavailableError


class PostgresAuditEventRepository:
    """Connection-scoped audit storage; transaction ownership belongs to the UoW."""

    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def append(self, event: NewAuditEvent) -> AuditEvent:
        try:
            result = await self._connection.execute(
                text(
                    """
                    INSERT INTO audit_events (
                        actor_type, actor_id, subject_type, subject_id, action, result,
                        request_id, correlation_id, operation_id, metadata
                    ) VALUES (
                        :actor_type, :actor_id, :subject_type, :subject_id, :action, :result,
                        :request_id, :correlation_id, :operation_id, CAST(:metadata AS jsonb)
                    )
                    RETURNING event_id, schema_version, occurred_at, actor_type, actor_id,
                              subject_type, subject_id, action, result, request_id,
                              correlation_id, operation_id, metadata
                    """
                ),
                {
                    "actor_type": event.actor.actor_type.value,
                    "actor_id": event.actor.actor_id,
                    "subject_type": event.subject_type.value,
                    "subject_id": event.subject_id,
                    "action": event.action.value,
                    "result": event.result.value,
                    "request_id": event.request_id,
                    "correlation_id": event.correlation_id,
                    "operation_id": event.operation_id,
                    "metadata": json.dumps(dict(event.metadata), ensure_ascii=False),
                },
            )
        except SQLAlchemyError as exc:
            raise AuditUnavailableError() from exc
        return _event_from_row(result.mappings().one())

    async def get(self, event_id: UUID) -> AuditEvent | None:
        result = await self._connection.execute(
            text("SELECT * FROM audit_events WHERE event_id = :event_id"),
            {"event_id": event_id},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _event_from_row(row)

    async def for_correlation(self, correlation_id: UUID) -> tuple[AuditEvent, ...]:
        result = await self._connection.execute(
            text(
                "SELECT * FROM audit_events WHERE correlation_id = :correlation_id "
                "ORDER BY occurred_at, event_id"
            ),
            {"correlation_id": correlation_id},
        )
        return tuple(_event_from_row(row) for row in result.mappings())


def _event_from_row(row: Any) -> AuditEvent:
    return AuditEvent(
        event_id=row["event_id"],
        schema_version=row["schema_version"],
        occurred_at=row["occurred_at"],
        actor_type=AuditActorType(row["actor_type"]),
        actor_id=row["actor_id"],
        subject_type=AuditSubjectType(row["subject_type"]),
        subject_id=row["subject_id"],
        action=AuditAction(row["action"]),
        result=AuditResult(row["result"]),
        request_id=row["request_id"],
        correlation_id=row["correlation_id"],
        operation_id=row["operation_id"],
        metadata=dict(row["metadata"]),
    )
