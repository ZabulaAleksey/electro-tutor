from __future__ import annotations

import json
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from types import MappingProxyType
from uuid import UUID

from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.request_id import REQUEST_ID_PATTERN


class AuditActorType(StrEnum):
    ACCOUNT = "account"
    SERVICE = "service"


class TrustedAuditService(StrEnum):
    TUTOR_PROVISIONER = "tutor-provisioner"


@dataclass(frozen=True, init=False)
class AuditActor:
    actor_type: AuditActorType
    actor_id: str

    @classmethod
    def from_principal(cls, principal: Principal) -> AuditActor:
        if not isinstance(principal, Principal):
            raise AuditValidationError("account audit actor must come from Principal")
        return cls._create(AuditActorType.ACCOUNT, str(principal.account_id))

    @classmethod
    def from_trusted_service(cls, service: TrustedAuditService) -> AuditActor:
        if not isinstance(service, TrustedAuditService):
            raise AuditValidationError("service audit actor must be allowlisted")
        return cls._create(AuditActorType.SERVICE, service.value)

    @classmethod
    def _create(cls, actor_type: AuditActorType, actor_id: str) -> AuditActor:
        actor = object.__new__(cls)
        object.__setattr__(actor, "actor_type", actor_type)
        object.__setattr__(actor, "actor_id", actor_id)
        return actor


class AuditSubjectType(StrEnum):
    ACCOUNT = "account"
    CAPABILITY_GRANT = "capability_grant"
    TUTOR_PROFILE = "tutor_profile"


class AuditAction(StrEnum):
    TUTOR_CAPABILITY_GRANTED = "tutor_capability.granted"
    TUTOR_CAPABILITY_REVOKED = "tutor_capability.revoked"
    TUTOR_PROFILE_CREATED = "tutor_profile.created"


class AuditResult(StrEnum):
    SUCCEEDED = "succeeded"
    DENIED = "denied"
    FAILED = "failed"


type AuditMetadataScalar = str
type AuditMetadata = Mapping[str, AuditMetadataScalar]

_METADATA_KEYS_BY_ACTION: dict[AuditAction, frozenset[str]] = {
    AuditAction.TUTOR_CAPABILITY_GRANTED: frozenset(
        {"capability_code", "grant_id", "reason_category", "scope_id", "scope_kind"}
    ),
    AuditAction.TUTOR_CAPABILITY_REVOKED: frozenset(
        {"capability_code", "grant_id", "reason_category", "scope_id", "scope_kind"}
    ),
    AuditAction.TUTOR_PROFILE_CREATED: frozenset({"profile_type", "reason_category"}),
}
_MAX_METADATA_KEYS = 16
_MAX_METADATA_BYTES = 4096
_MAX_IDENTIFIER_LENGTH = 128
_UUID_METADATA_KEYS = frozenset({"grant_id", "scope_id"})
_REASON_CATEGORIES = frozenset({"profile_created", "provisioned", "reconciled", "revoked", "test"})


class AuditValidationError(ValueError):
    """The server attempted to construct an audit event outside the approved schema."""


def serialized_metadata_bytes(metadata: AuditMetadata) -> int:
    serialized = json.dumps(
        metadata,
        ensure_ascii=False,
        separators=(", ", ": "),
        sort_keys=True,
    )
    return len(serialized.encode("utf-8"))


def _validated_identifier(name: str, value: str) -> str:
    if not isinstance(value, str):
        raise AuditValidationError(f"{name} must be a string")
    if not value or len(value) > _MAX_IDENTIFIER_LENGTH:
        raise AuditValidationError(f"{name} must contain 1..{_MAX_IDENTIFIER_LENGTH} characters")
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise AuditValidationError(f"{name} must not contain control characters")
    return value


def _validated_metadata(
    action: AuditAction, metadata: AuditMetadata
) -> dict[str, AuditMetadataScalar]:
    copied = dict(metadata)
    if len(copied) > _MAX_METADATA_KEYS:
        raise AuditValidationError(f"metadata must contain at most {_MAX_METADATA_KEYS} keys")
    allowed_keys = _METADATA_KEYS_BY_ACTION[action]
    for key in copied:
        if not isinstance(key, str) or key not in allowed_keys:
            raise AuditValidationError(f"metadata key is not allowed for {action.value}: {key!r}")
    if serialized_metadata_bytes(copied) > _MAX_METADATA_BYTES:
        raise AuditValidationError(
            f"serialized metadata must not exceed {_MAX_METADATA_BYTES} bytes"
        )
    for key, value in copied.items():
        if not isinstance(value, str):
            raise AuditValidationError(f"metadata value for {key!r} must be a typed string")
        if key == "capability_code" and value != "TUTOR_PROFILE_MANAGE_OWN":
            raise AuditValidationError("capability_code is not allowlisted")
        if key == "scope_kind" and value != "account":
            raise AuditValidationError("scope_kind is not allowlisted")
        if key == "profile_type" and value != "tutor":
            raise AuditValidationError("profile_type is not allowlisted")
        if key == "reason_category" and value not in _REASON_CATEGORIES:
            raise AuditValidationError("reason_category is not allowlisted")
        if key in _UUID_METADATA_KEYS:
            try:
                parsed = UUID(value)
            except (TypeError, ValueError) as exc:
                raise AuditValidationError(f"{key} must be a canonical UUID") from exc
            if str(parsed) != value:
                raise AuditValidationError(f"{key} must be a canonical UUID")
    return copied


@dataclass(frozen=True)
class NewAuditEvent:
    """Server-created input; database-controlled envelope fields are intentionally absent."""

    actor: AuditActor
    subject_type: AuditSubjectType
    subject_id: str
    action: AuditAction
    result: AuditResult
    correlation_id: UUID
    operation_id: UUID
    request_id: str | None = None
    metadata: AuditMetadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.actor, AuditActor):
            raise AuditValidationError("actor must be created by an AuditActor factory")
        if not isinstance(self.subject_type, AuditSubjectType):
            raise AuditValidationError("subject_type must be an AuditSubjectType")
        if not isinstance(self.action, AuditAction):
            raise AuditValidationError("action must be an AuditAction")
        if not isinstance(self.result, AuditResult):
            raise AuditValidationError("result must be an AuditResult")
        if not isinstance(self.correlation_id, UUID) or not isinstance(self.operation_id, UUID):
            raise AuditValidationError("correlation_id and operation_id must be UUID values")
        _validated_identifier("actor_id", self.actor.actor_id)
        validated_subject = _validated_identifier("subject_id", self.subject_id)
        try:
            parsed_subject = UUID(validated_subject)
        except (TypeError, ValueError) as exc:
            raise AuditValidationError("subject_id must be a canonical UUID") from exc
        if str(parsed_subject) != validated_subject:
            raise AuditValidationError("subject_id must be a canonical UUID")
        if self.request_id is not None:
            _validated_identifier("request_id", self.request_id)
            if REQUEST_ID_PATTERN.fullmatch(self.request_id) is None:
                raise AuditValidationError("request_id must follow the API request ID contract")
        object.__setattr__(
            self,
            "metadata",
            MappingProxyType(_validated_metadata(self.action, self.metadata)),
        )


@dataclass(frozen=True)
class AuditEvent:
    event_id: UUID
    schema_version: int
    occurred_at: datetime
    actor_type: AuditActorType
    actor_id: str
    subject_type: AuditSubjectType
    subject_id: str
    action: AuditAction
    result: AuditResult
    correlation_id: UUID
    operation_id: UUID
    request_id: str | None
    metadata: AuditMetadata

    def __post_init__(self) -> None:
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))
