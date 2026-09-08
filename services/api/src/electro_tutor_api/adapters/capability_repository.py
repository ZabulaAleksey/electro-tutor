from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityCode,
    CapabilityGrant,
    CapabilityOperationKind,
    CapabilityOperationRecord,
    CapabilityScopeKind,
)
from electro_tutor_api.errors import (
    AuthorityOperationReservationConflict,
    CapabilityAlreadyGrantedError,
)


class PostgresCapabilityGrantRepository:
    """Connection-scoped authority storage; never owns or commits a transaction."""

    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def reserve_operation(
        self,
        *,
        operation_id: UUID,
        operation_kind: CapabilityOperationKind,
        intent_digest: str,
        grant_id: UUID,
    ) -> None:
        try:
            await self._connection.execute(
                text(
                    "INSERT INTO capability_grant_operations "
                    "(operation_id, operation_kind, intent_digest, grant_id) "
                    "VALUES (:operation_id, :operation_kind, :intent_digest, :grant_id)"
                ),
                {
                    "operation_id": operation_id,
                    "operation_kind": operation_kind.value,
                    "intent_digest": intent_digest,
                    "grant_id": grant_id,
                },
            )
        except IntegrityError as exc:
            if _constraint_name(exc) == "pk_capability_grant_operations":
                raise AuthorityOperationReservationConflict() from exc
            raise

    async def get_operation(self, operation_id: UUID) -> CapabilityOperationRecord | None:
        result = await self._connection.execute(
            text(
                "SELECT operation_id, operation_kind, intent_digest, grant_id "
                "FROM capability_grant_operations WHERE operation_id = :operation_id"
            ),
            {"operation_id": operation_id},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        return CapabilityOperationRecord(
            operation_id=row["operation_id"],
            operation_kind=CapabilityOperationKind(row["operation_kind"]),
            intent_digest=row["intent_digest"],
            grant_id=row["grant_id"],
        )

    async def lock_account(self, account_id: UUID) -> bool:
        await self._lock_account_scope(account_id)
        result = await self._connection.execute(
            text("SELECT id FROM accounts WHERE id = :account_id"),
            {"account_id": account_id},
        )
        return result.scalar_one_or_none() is not None

    async def insert_grant(
        self,
        *,
        grant_id: UUID,
        subject_account_id: UUID,
        capability_code: CapabilityCode,
        actor: AuthorityActor,
        operation_id: UUID,
    ) -> CapabilityGrant:
        try:
            result = await self._connection.execute(
                text(
                    """
                    INSERT INTO capability_grants (
                        id, subject_account_id, capability_code, scope_kind, scope_id,
                        issued_by_actor_type, issued_by_actor_id, issue_operation_id
                    ) VALUES (
                        :id, :account_id, :capability_code, 'account', :account_id,
                        :actor_type, :actor_id, :operation_id
                    )
                    RETURNING *
                    """
                ),
                {
                    "id": grant_id,
                    "account_id": subject_account_id,
                    "capability_code": capability_code.value,
                    "actor_type": actor.actor_type,
                    "actor_id": actor.actor_id,
                    "operation_id": operation_id,
                },
            )
        except IntegrityError as exc:
            if _constraint_name(exc) == "uq_capability_grants_active_scope":
                raise CapabilityAlreadyGrantedError() from exc
            raise
        return _grant_from_row(result.mappings().one())

    async def get_grant(
        self, grant_id: UUID, *, for_update: bool = False
    ) -> CapabilityGrant | None:
        lock_clause = " FOR UPDATE" if for_update else ""
        result = await self._connection.execute(
            text("SELECT * FROM capability_grants WHERE id = :grant_id" + lock_clause),
            {"grant_id": grant_id},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _grant_from_row(row)

    async def get_active(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> CapabilityGrant | None:
        if for_update:
            locked = await self._connection.scalar(
                text(
                    "SELECT public.lock_active_capability_grant("
                    "CAST(:account_id AS uuid), CAST(:capability_code AS text))"
                ),
                {"account_id": account_id, "capability_code": capability_code.value},
            )
            if locked is not True:
                return None
        result = await self._connection.execute(
            text(
                "SELECT * FROM capability_grants "
                "WHERE subject_account_id = :account_id "
                "AND capability_code = :capability_code AND scope_kind = 'account' "
                "AND scope_id = :account_id AND revoked_at IS NULL"
            ),
            {"account_id": account_id, "capability_code": capability_code.value},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _grant_from_row(row)

    async def revoke_grant(
        self,
        *,
        grant_id: UUID,
        actor: AuthorityActor,
        operation_id: UUID,
    ) -> CapabilityGrant:
        result = await self._connection.execute(
            text(
                """
                UPDATE capability_grants
                SET revoked_at = CURRENT_TIMESTAMP,
                    revoked_by_actor_type = :actor_type,
                    revoked_by_actor_id = :actor_id,
                    revoke_operation_id = :operation_id
                WHERE id = :grant_id AND revoked_at IS NULL
                RETURNING *
                """
            ),
            {
                "grant_id": grant_id,
                "actor_type": actor.actor_type,
                "actor_id": actor.actor_id,
                "operation_id": operation_id,
            },
        )
        return _grant_from_row(result.mappings().one())

    async def _lock_account_scope(self, account_id: UUID) -> None:
        await self._connection.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(CAST(:account_id AS text), 0))"),
            {"account_id": str(account_id)},
        )


def _grant_from_row(row: Any) -> CapabilityGrant:
    return CapabilityGrant(
        id=row["id"],
        subject_account_id=row["subject_account_id"],
        capability_code=CapabilityCode(row["capability_code"]),
        scope_kind=CapabilityScopeKind(row["scope_kind"]),
        scope_id=row["scope_id"],
        issued_at=row["issued_at"],
        issued_by_actor_type=row["issued_by_actor_type"],
        issued_by_actor_id=row["issued_by_actor_id"],
        issue_operation_id=row["issue_operation_id"],
        revoked_at=row["revoked_at"],
        revoked_by_actor_type=row["revoked_by_actor_type"],
        revoked_by_actor_id=row["revoked_by_actor_id"],
        revoke_operation_id=row["revoke_operation_id"],
    )


def _constraint_name(error: IntegrityError) -> str | None:
    current: BaseException | None = error
    for _ in range(5):
        if current is None:
            return None
        name = getattr(current, "constraint_name", None)
        if name:
            return str(name)
        current = current.__cause__ or current.__context__
    return None
