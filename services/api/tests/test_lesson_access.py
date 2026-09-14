from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest

from electro_tutor_api.application.lesson_access import LessonAccessGrantService
from electro_tutor_api.domain.audit import (
    AuditAction,
    AuditActor,
    AuditResult,
    AuditSubjectType,
    AuditValidationError,
    NewAuditEvent,
    TrustedAuditService,
)
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_access import (
    LESSON_ACCESS_CAPABILITY_SET,
    LESSON_ACCESS_POLICY_VERSION,
    LessonAccessCapability,
    LessonAccessDecision,
    LessonAccessGrant,
    LessonAccessParticipantRole,
    LessonAccessRevokeReason,
    LessonAccessSource,
    LessonAccessStatus,
    LessonAccessValidationError,
)
from electro_tutor_api.errors import (
    AuthenticationRequiredError,
    LessonAccessExpiredError,
    LessonAccessNotYetValidError,
    LessonAccessRevokedError,
)


def principal() -> Principal:
    return Principal(
        account_id=uuid4(),
        identity_id=uuid4(),
        issuer="https://lesson-access.invalid",
        subject=str(uuid4()),
        email=None,
        session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )


def decision(status: LessonAccessStatus = LessonAccessStatus.ACTIVE) -> LessonAccessDecision:
    starts_at = datetime.now(UTC) - timedelta(minutes=5)
    return LessonAccessDecision(
        grant_id=uuid4(),
        booking_id=uuid4(),
        status=status,
        participant_role=LessonAccessParticipantRole.STUDENT,
        valid_from=starts_at,
        valid_until=starts_at + timedelta(hours=1),
        capabilities=(LessonAccessCapability.LESSON_SHELL_ENTER,),
    )


class FakeAccessRepository:
    def __init__(self, result: LessonAccessDecision) -> None:
        self.result = result
        self.booking_id = None

    async def authorize_for_current_session(self, booking_id: object) -> LessonAccessDecision:
        self.booking_id = booking_id
        return self.result


class FakeUnitOfWork:
    def __init__(self, actor: Principal, result: LessonAccessDecision) -> None:
        self.session_principal = actor
        self.lesson_access_grants = FakeAccessRepository(result)
        self.audit_events = self.booking_operations = self.bookings = cast(Any, None)
        self.capability_grants = self.profiles = self.tutor_offers = cast(Any, None)

    async def __aenter__(self) -> FakeUnitOfWork:
        return self

    async def __aexit__(self, *_args: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_service_returns_only_active_server_decision() -> None:
    actor = principal()
    expected = decision()
    unit = FakeUnitOfWork(actor, expected)
    service = LessonAccessGrantService(lambda _credential: cast(Any, unit))
    actual = await service.authorize(actor, SessionCredential(digest="a" * 64), expected.booking_id)
    assert actual is expected
    assert unit.lesson_access_grants.booking_id == expected.booking_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "error_type"),
    [
        (LessonAccessStatus.NOT_YET_VALID, LessonAccessNotYetValidError),
        (LessonAccessStatus.EXPIRED, LessonAccessExpiredError),
        (LessonAccessStatus.REVOKED, LessonAccessRevokedError),
    ],
)
async def test_service_denies_non_active_status(
    status: LessonAccessStatus, error_type: type[RuntimeError]
) -> None:
    actor = principal()
    expected = decision(status)
    service = LessonAccessGrantService(
        lambda _credential: cast(Any, FakeUnitOfWork(actor, expected))
    )
    with pytest.raises(error_type):
        await service.authorize(actor, SessionCredential(digest="b" * 64), expected.booking_id)


@pytest.mark.asyncio
async def test_service_rejects_unbound_or_missing_principal() -> None:
    actor = principal()
    other = principal()
    expected = decision()
    service = LessonAccessGrantService(
        lambda _credential: cast(Any, FakeUnitOfWork(actor, expected))
    )
    with pytest.raises(AuthenticationRequiredError):
        await service.authorize(other, SessionCredential(digest="c" * 64), expected.booking_id)
    with pytest.raises(AuthenticationRequiredError):
        await service.authorize(None, SessionCredential(digest="d" * 64), expected.booking_id)


def test_grant_enforces_versioned_policy_and_complete_fixed_revoke_tuple() -> None:
    now = datetime.now(UTC)
    grant = LessonAccessGrant(
        id=uuid4(),
        booking_id=uuid4(),
        source=LessonAccessSource.BOOKING_FREE,
        policy_version=LESSON_ACCESS_POLICY_VERSION,
        capability_set_code=LESSON_ACCESS_CAPABILITY_SET,
        valid_from=now,
        valid_until=now + timedelta(hours=1),
        issued_at=now,
        issue_operation_id=uuid4(),
    )
    actor_id = str(uuid4())
    revoked = replace(
        grant,
        revoked_at=now + timedelta(minutes=1),
        revoked_by_actor_type="account",
        revoked_by_actor_id=actor_id,
        revoke_operation_id=uuid4(),
        revoke_reason=LessonAccessRevokeReason.BOOKING_CANCELLED,
    )
    assert revoked.revoke_reason is LessonAccessRevokeReason.BOOKING_CANCELLED
    with pytest.raises(LessonAccessValidationError):
        replace(grant, revoked_at=now + timedelta(minutes=1))
    with pytest.raises(LessonAccessValidationError):
        replace(grant, capability_set_code="PLATFORM")


def test_access_audit_contract_has_exact_live_and_backfill_provenance() -> None:
    now_id = uuid4()
    backfill = NewAuditEvent(
        actor=AuditActor.from_trusted_service(TrustedAuditService.LESSON_ACCESS_MIGRATION),
        subject_type=AuditSubjectType.LESSON_ACCESS_GRANT,
        subject_id=str(uuid4()),
        action=AuditAction.LESSON_ACCESS_GRANT_ISSUED,
        result=AuditResult.SUCCEEDED,
        correlation_id=uuid4(),
        operation_id=now_id,
        metadata={
            "source": "BOOKING_EXTERNAL",
            "policy_version": "1",
            "capability_set_code": "LESSON_SHELL_V1",
            "issuance_reason": "migration_backfill",
        },
    )
    assert backfill.request_id is None
    with pytest.raises(AuditValidationError):
        NewAuditEvent(
            actor=backfill.actor,
            subject_type=backfill.subject_type,
            subject_id=backfill.subject_id,
            action=backfill.action,
            result=backfill.result,
            correlation_id=backfill.correlation_id,
            operation_id=uuid4(),
            metadata=backfill.metadata | {"issuance_reason": "PLATFORM"},
        )
    with pytest.raises(AuditValidationError):
        NewAuditEvent(
            actor=backfill.actor,
            subject_type=AuditSubjectType.TUTOR_PROFILE,
            subject_id=str(uuid4()),
            action=AuditAction.TUTOR_PROFILE_CREATED,
            result=AuditResult.SUCCEEDED,
            correlation_id=uuid4(),
            operation_id=uuid4(),
            metadata={"profile_type": "tutor", "reason_category": "test"},
        )
