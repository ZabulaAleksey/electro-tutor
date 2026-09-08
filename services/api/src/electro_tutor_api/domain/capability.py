from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from electro_tutor_api.request_id import REQUEST_ID_PATTERN


class CapabilityCode(StrEnum):
    TUTOR_PROFILE_MANAGE_OWN = "TUTOR_PROFILE_MANAGE_OWN"


class CapabilityScopeKind(StrEnum):
    ACCOUNT = "account"


class CapabilityOperationKind(StrEnum):
    ISSUE = "issue"
    REVOKE = "revoke"


class TrustedAuthorityService(StrEnum):
    TUTOR_PROVISIONER = "tutor-provisioner"


_AUTHORITY_ACTOR_FACTORY_TOKEN = object()


@dataclass(frozen=True, init=False)
class AuthorityActor:
    """Server-created authority actor; Principal/request data cannot construct it."""

    actor_type: str
    actor_id: str

    def __new__(cls, token: object = None) -> AuthorityActor:
        if token is not _AUTHORITY_ACTOR_FACTORY_TOKEN:
            raise TypeError("AuthorityActor must be created by its trusted factory")
        return super().__new__(cls)

    @classmethod
    def from_trusted_service(cls, service: TrustedAuthorityService) -> AuthorityActor:
        if not isinstance(service, TrustedAuthorityService):
            raise CapabilityValidationError("authority service must be allowlisted")
        actor = cls(_AUTHORITY_ACTOR_FACTORY_TOKEN)
        object.__setattr__(actor, "actor_type", "service")
        object.__setattr__(actor, "actor_id", service.value)
        return actor


class CapabilityReason(StrEnum):
    PROVISIONED = "provisioned"
    RECONCILED = "reconciled"
    REVOKED = "revoked"
    TEST = "test"


@dataclass(frozen=True)
class IssueCapabilityCommand:
    subject_account_id: UUID
    capability_code: CapabilityCode
    operation_id: UUID
    correlation_id: UUID
    reason: CapabilityReason = CapabilityReason.PROVISIONED
    request_id: str | None = None

    def __post_init__(self) -> None:
        _validate_command(
            self.subject_account_id,
            self.capability_code,
            self.operation_id,
            self.correlation_id,
            self.reason,
            self.request_id,
        )


@dataclass(frozen=True)
class RevokeCapabilityCommand:
    subject_account_id: UUID
    grant_id: UUID
    capability_code: CapabilityCode
    operation_id: UUID
    correlation_id: UUID
    reason: CapabilityReason = CapabilityReason.REVOKED
    request_id: str | None = None

    def __post_init__(self) -> None:
        _validate_command(
            self.subject_account_id,
            self.capability_code,
            self.operation_id,
            self.correlation_id,
            self.reason,
            self.request_id,
        )
        if not isinstance(self.grant_id, UUID):
            raise CapabilityValidationError("grant_id must be UUID")


@dataclass(frozen=True)
class CapabilityGrant:
    id: UUID
    subject_account_id: UUID
    capability_code: CapabilityCode
    scope_kind: CapabilityScopeKind
    scope_id: UUID
    issued_at: datetime
    issued_by_actor_type: str
    issued_by_actor_id: str
    issue_operation_id: UUID
    revoked_at: datetime | None
    revoked_by_actor_type: str | None
    revoked_by_actor_id: str | None
    revoke_operation_id: UUID | None

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None


@dataclass(frozen=True)
class CapabilityOperationRecord:
    operation_id: UUID
    operation_kind: CapabilityOperationKind
    intent_digest: str
    grant_id: UUID


class TutorProfileOperation(StrEnum):
    CREATE_OWN = "tutor_profile.create_own"
    READ_OWN = "tutor_profile.read_own"
    UPDATE_OWN = "tutor_profile.update_own"


class CapabilityValidationError(ValueError):
    pass


def _validate_command(
    subject_account_id: UUID,
    capability_code: CapabilityCode,
    operation_id: UUID,
    correlation_id: UUID,
    reason: CapabilityReason,
    request_id: str | None,
) -> None:
    if not isinstance(subject_account_id, UUID):
        raise CapabilityValidationError("subject_account_id must be UUID")
    if not isinstance(capability_code, CapabilityCode):
        raise CapabilityValidationError("capability_code must be allowlisted")
    if not isinstance(operation_id, UUID):
        raise CapabilityValidationError("operation_id must be UUID")
    if not isinstance(correlation_id, UUID):
        raise CapabilityValidationError("correlation_id must be UUID")
    if not isinstance(reason, CapabilityReason):
        raise CapabilityValidationError("reason must be allowlisted")
    if request_id is not None and (
        not isinstance(request_id, str) or REQUEST_ID_PATTERN.fullmatch(request_id) is None
    ):
        raise CapabilityValidationError("request_id must follow the API request ID contract")
