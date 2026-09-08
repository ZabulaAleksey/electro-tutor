from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from uuid import UUID, uuid4

from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.audit import (
    AuditAction,
    AuditActor,
    AuditResult,
    AuditSubjectType,
    NewAuditEvent,
    TrustedAuditService,
)
from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityCode,
    CapabilityGrant,
    CapabilityOperationKind,
    IssueCapabilityCommand,
    RevokeCapabilityCommand,
    TrustedAuthorityService,
    TutorProfileOperation,
)
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.errors import (
    AccountNotFoundError,
    AuthorityDeniedError,
    AuthorityOperationReservationConflict,
    CapabilityAlreadyGrantedError,
    CapabilityAlreadyRevokedError,
    CapabilityGrantNotFoundError,
    IdempotencyConflictError,
)

UnitOfWorkFactory = Callable[[], AuditUnitOfWork]

_REQUIRED_CAPABILITY: dict[TutorProfileOperation, CapabilityCode] = {
    TutorProfileOperation.CREATE_OWN: CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
    TutorProfileOperation.READ_OWN: CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
    TutorProfileOperation.UPDATE_OWN: CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
}
AUTHORIZATION_MATRIX_VERSION = 1


class CapabilityGrantService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def issue(
        self, command: IssueCapabilityCommand, actor: AuthorityActor
    ) -> CapabilityGrant:
        _require_trusted_actor(actor)
        grant_id = uuid4()
        digest = _issue_intent_digest(command)
        try:
            async with self._unit_of_work() as unit:
                await unit.capability_grants.reserve_operation(
                    operation_id=command.operation_id,
                    operation_kind=CapabilityOperationKind.ISSUE,
                    intent_digest=digest,
                    grant_id=grant_id,
                )
                if not await unit.capability_grants.lock_account(command.subject_account_id):
                    raise AccountNotFoundError()
                if (
                    await unit.capability_grants.get_active(
                        command.subject_account_id, command.capability_code, for_update=True
                    )
                    is not None
                ):
                    raise CapabilityAlreadyGrantedError()
                grant = await unit.capability_grants.insert_grant(
                    grant_id=grant_id,
                    subject_account_id=command.subject_account_id,
                    capability_code=command.capability_code,
                    actor=actor,
                    operation_id=command.operation_id,
                )
                await unit.audit_events.append(_grant_audit(command, grant, actor))
                return grant
        except AuthorityOperationReservationConflict:
            return await self._reconcile(
                command.operation_id, CapabilityOperationKind.ISSUE, digest
            )

    async def revoke(
        self, command: RevokeCapabilityCommand, actor: AuthorityActor
    ) -> CapabilityGrant:
        _require_trusted_actor(actor)
        digest = _revoke_intent_digest(command)
        try:
            async with self._unit_of_work() as unit:
                await unit.capability_grants.reserve_operation(
                    operation_id=command.operation_id,
                    operation_kind=CapabilityOperationKind.REVOKE,
                    intent_digest=digest,
                    grant_id=command.grant_id,
                )
                if not await unit.capability_grants.lock_account(command.subject_account_id):
                    raise AccountNotFoundError()
                existing = await unit.capability_grants.get_grant(command.grant_id, for_update=True)
                if (
                    existing is None
                    or existing.subject_account_id != command.subject_account_id
                    or existing.capability_code is not command.capability_code
                ):
                    raise CapabilityGrantNotFoundError()
                if not existing.is_active:
                    raise CapabilityAlreadyRevokedError()
                grant = await unit.capability_grants.revoke_grant(
                    grant_id=command.grant_id,
                    actor=actor,
                    operation_id=command.operation_id,
                )
                await unit.audit_events.append(_revoke_audit(command, grant, actor))
                return grant
        except AuthorityOperationReservationConflict:
            return await self._reconcile(
                command.operation_id, CapabilityOperationKind.REVOKE, digest
            )

    async def _reconcile(
        self,
        operation_id: UUID,
        operation_kind: CapabilityOperationKind,
        intent_digest: str,
    ) -> CapabilityGrant:
        async with self._unit_of_work() as unit:
            operation = await unit.capability_grants.get_operation(operation_id)
            if (
                operation is None
                or operation.operation_kind is not operation_kind
                or operation.intent_digest != intent_digest
            ):
                raise IdempotencyConflictError()
            grant = await unit.capability_grants.get_grant(operation.grant_id)
            if grant is None:
                raise IdempotencyConflictError()
            return grant


class CapabilityEvaluator:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def has_capability(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
    ) -> bool:
        async with self._unit_of_work() as unit:
            return await self.has_capability_in(unit, account_id, capability_code)

    async def has_capability_in(
        self,
        unit: AuditUnitOfWork,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> bool:
        if not isinstance(account_id, UUID) or not isinstance(capability_code, CapabilityCode):
            return False
        return (
            await unit.capability_grants.get_active(
                account_id, capability_code, for_update=for_update
            )
            is not None
        )

    async def authorize(
        self,
        principal: Principal | None,
        operation: TutorProfileOperation,
        resource_owner_account_id: UUID,
    ) -> bool:
        async with self._unit_of_work() as unit:
            return await self.authorize_in(unit, principal, operation, resource_owner_account_id)

    async def authorize_in(
        self,
        unit: AuditUnitOfWork,
        principal: Principal | None,
        operation: TutorProfileOperation,
        resource_owner_account_id: UUID,
        *,
        for_update: bool = False,
    ) -> bool:
        if not isinstance(principal, Principal):
            return False
        if not isinstance(operation, TutorProfileOperation):
            return False
        if principal.account_id != resource_owner_account_id:
            return False
        required = _REQUIRED_CAPABILITY.get(operation)
        if required is None:
            return False
        return await self.has_capability_in(
            unit, principal.account_id, required, for_update=for_update
        )


def _require_trusted_actor(actor: AuthorityActor) -> None:
    expected = TrustedAuthorityService.TUTOR_PROVISIONER.value
    if (
        not isinstance(actor, AuthorityActor)
        or actor.actor_type != "service"
        or actor.actor_id != expected
    ):
        raise AuthorityDeniedError()


def _audit_actor(actor: AuthorityActor) -> AuditActor:
    _require_trusted_actor(actor)
    return AuditActor.from_trusted_service(TrustedAuditService.TUTOR_PROVISIONER)


def _grant_audit(
    command: IssueCapabilityCommand,
    grant: CapabilityGrant,
    actor: AuthorityActor,
) -> NewAuditEvent:
    return NewAuditEvent(
        actor=_audit_actor(actor),
        subject_type=AuditSubjectType.CAPABILITY_GRANT,
        subject_id=str(grant.id),
        action=AuditAction.TUTOR_CAPABILITY_GRANTED,
        result=AuditResult.SUCCEEDED,
        request_id=command.request_id,
        correlation_id=command.correlation_id,
        operation_id=command.operation_id,
        metadata={
            "capability_code": grant.capability_code.value,
            "grant_id": str(grant.id),
            "reason_category": command.reason.value,
            "scope_id": str(grant.scope_id),
            "scope_kind": grant.scope_kind.value,
        },
    )


def _revoke_audit(
    command: RevokeCapabilityCommand,
    grant: CapabilityGrant,
    actor: AuthorityActor,
) -> NewAuditEvent:
    return NewAuditEvent(
        actor=_audit_actor(actor),
        subject_type=AuditSubjectType.CAPABILITY_GRANT,
        subject_id=str(grant.id),
        action=AuditAction.TUTOR_CAPABILITY_REVOKED,
        result=AuditResult.SUCCEEDED,
        request_id=command.request_id,
        correlation_id=command.correlation_id,
        operation_id=command.operation_id,
        metadata={
            "capability_code": grant.capability_code.value,
            "grant_id": str(grant.id),
            "reason_category": command.reason.value,
            "scope_id": str(grant.scope_id),
            "scope_kind": grant.scope_kind.value,
        },
    )


def _intent_digest(payload: dict[str, str]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("ascii")).hexdigest()


def _issue_intent_digest(command: IssueCapabilityCommand) -> str:
    return _intent_digest(
        {
            "version": "1",
            "action": "issue",
            "subject_account_id": str(command.subject_account_id),
            "capability_code": command.capability_code.value,
            "scope_kind": "account",
            "scope_id": str(command.subject_account_id),
            "reason": command.reason.value,
        }
    )


def _revoke_intent_digest(command: RevokeCapabilityCommand) -> str:
    return _intent_digest(
        {
            "version": "1",
            "action": "revoke",
            "grant_id": str(command.grant_id),
            "subject_account_id": str(command.subject_account_id),
            "capability_code": command.capability_code.value,
            "reason": command.reason.value,
        }
    )
