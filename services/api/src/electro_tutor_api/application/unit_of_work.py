from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from electro_tutor_api.domain.audit import AuditEvent, NewAuditEvent
from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityCode,
    CapabilityGrant,
    CapabilityOperationKind,
    CapabilityOperationRecord,
)


class AuditEventRepository(Protocol):
    async def append(self, event: NewAuditEvent) -> AuditEvent: ...


class CapabilityGrantRepository(Protocol):
    async def reserve_operation(
        self,
        *,
        operation_id: UUID,
        operation_kind: CapabilityOperationKind,
        intent_digest: str,
        grant_id: UUID,
    ) -> None: ...

    async def get_operation(self, operation_id: UUID) -> CapabilityOperationRecord | None: ...

    async def lock_account(self, account_id: UUID) -> bool: ...

    async def insert_grant(
        self,
        *,
        grant_id: UUID,
        subject_account_id: UUID,
        capability_code: CapabilityCode,
        actor: AuthorityActor,
        operation_id: UUID,
    ) -> CapabilityGrant: ...

    async def get_grant(
        self, grant_id: UUID, *, for_update: bool = False
    ) -> CapabilityGrant | None: ...

    async def get_active(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> CapabilityGrant | None: ...

    async def revoke_grant(
        self,
        *,
        grant_id: UUID,
        actor: AuthorityActor,
        operation_id: UUID,
    ) -> CapabilityGrant: ...


class AuditUnitOfWork(Protocol):
    audit_events: AuditEventRepository
    capability_grants: CapabilityGrantRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...
