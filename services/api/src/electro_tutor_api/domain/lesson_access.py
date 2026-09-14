from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

LESSON_ACCESS_POLICY_VERSION = 1
LESSON_ACCESS_CAPABILITY_SET = "LESSON_SHELL_V1"


class LessonAccessValidationError(ValueError):
    code = "invalid_request"
    status_code = 422


class LessonAccessSource(StrEnum):
    BOOKING_FREE = "BOOKING_FREE"
    BOOKING_EXTERNAL = "BOOKING_EXTERNAL"


class LessonAccessStatus(StrEnum):
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"
    NOT_YET_VALID = "NOT_YET_VALID"
    ACTIVE = "ACTIVE"


class LessonAccessParticipantRole(StrEnum):
    STUDENT = "student"
    TUTOR = "tutor"


class LessonAccessCapability(StrEnum):
    LESSON_SHELL_ENTER = "LESSON_SHELL_ENTER"


class LessonAccessRevokeReason(StrEnum):
    BOOKING_CANCELLED = "BOOKING_CANCELLED"


@dataclass(frozen=True)
class LessonAccessGrant:
    id: UUID
    booking_id: UUID
    source: LessonAccessSource
    policy_version: int
    capability_set_code: str
    valid_from: datetime
    valid_until: datetime
    issued_at: datetime
    issue_operation_id: UUID
    revoked_at: datetime | None = None
    revoked_by_actor_type: str | None = None
    revoked_by_actor_id: str | None = None
    revoke_operation_id: UUID | None = None
    revoke_reason: LessonAccessRevokeReason | None = None

    def __post_init__(self) -> None:
        _uuid("id", self.id)
        _uuid("booking_id", self.booking_id)
        _uuid("issue_operation_id", self.issue_operation_id)
        if not isinstance(self.source, LessonAccessSource):
            raise LessonAccessValidationError("source must be allowlisted")
        if self.policy_version != LESSON_ACCESS_POLICY_VERSION:
            raise LessonAccessValidationError("policy_version is unsupported")
        if self.capability_set_code != LESSON_ACCESS_CAPABILITY_SET:
            raise LessonAccessValidationError("capability_set_code is unsupported")
        for name in ("valid_from", "valid_until", "issued_at"):
            _utc(name, getattr(self, name))
        if self.valid_from >= self.valid_until:
            raise LessonAccessValidationError("validity interval must be non-empty")
        revoke_tuple = (
            self.revoked_at,
            self.revoked_by_actor_type,
            self.revoked_by_actor_id,
            self.revoke_operation_id,
            self.revoke_reason,
        )
        if any(value is not None for value in revoke_tuple):
            if any(value is None for value in revoke_tuple):
                raise LessonAccessValidationError("revoke tuple must be complete")
            _utc("revoked_at", self.revoked_at)
            _uuid("revoke_operation_id", self.revoke_operation_id)
            if self.revoked_by_actor_type != "account":
                raise LessonAccessValidationError("revoke actor type is unsupported")
            assert self.revoked_by_actor_id is not None
            try:
                actor_id = UUID(self.revoked_by_actor_id)
            except ValueError as exc:
                raise LessonAccessValidationError("revoke actor id must be a UUID") from exc
            if str(actor_id) != self.revoked_by_actor_id:
                raise LessonAccessValidationError("revoke actor id must be canonical")
            if self.revoke_reason is not LessonAccessRevokeReason.BOOKING_CANCELLED:
                raise LessonAccessValidationError("revoke reason is unsupported")
            assert self.revoked_at is not None
            if self.revoked_at < self.issued_at:
                raise LessonAccessValidationError("revoke time cannot precede issue time")


@dataclass(frozen=True)
class LessonAccessDecision:
    grant_id: UUID
    booking_id: UUID
    status: LessonAccessStatus
    participant_role: LessonAccessParticipantRole
    valid_from: datetime
    valid_until: datetime
    capabilities: tuple[LessonAccessCapability, ...]

    def __post_init__(self) -> None:
        _uuid("grant_id", self.grant_id)
        _uuid("booking_id", self.booking_id)
        if not isinstance(self.status, LessonAccessStatus):
            raise LessonAccessValidationError("status must be allowlisted")
        if not isinstance(self.participant_role, LessonAccessParticipantRole):
            raise LessonAccessValidationError("participant_role must be allowlisted")
        _utc("valid_from", self.valid_from)
        _utc("valid_until", self.valid_until)
        if self.valid_from >= self.valid_until:
            raise LessonAccessValidationError("validity interval must be non-empty")
        if self.capabilities != (LessonAccessCapability.LESSON_SHELL_ENTER,):
            raise LessonAccessValidationError("capability set must match LESSON_SHELL_V1")


def _uuid(name: str, value: object) -> None:
    if not isinstance(value, UUID):
        raise LessonAccessValidationError(f"{name} must be a UUID")


def _utc(name: str, value: object) -> None:
    if not isinstance(value, datetime) or value.tzinfo is not UTC:
        raise LessonAccessValidationError(f"{name} must be normalized to UTC")
