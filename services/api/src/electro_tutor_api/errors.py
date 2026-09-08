from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    request_id: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorBody


class ServiceDependencyError(RuntimeError):
    """An internal safe category; database details never leave the service."""

    def __init__(self, code: str, dependency: str) -> None:
        super().__init__(code)
        self.code = code
        self.dependency = dependency


class AuditUnavailableError(RuntimeError):
    """A critical mutation cannot complete without durable audit evidence."""

    code = "audit_unavailable"
    message = "Critical operation could not be durably audited."
    status_code = 503

    def __init__(self) -> None:
        super().__init__(self.code)


class AuthorityDeniedError(RuntimeError):
    code = "authority_denied"
    message = "Trusted provisioning authority is required."
    status_code = 403


class IdempotencyConflictError(RuntimeError):
    code = "idempotency_conflict"
    message = "The operation identifier was already used for a different intent."
    status_code = 409


class AuthorityOperationReservationConflict(RuntimeError):
    """Internal retry signal raised after a concurrent operation-id winner."""


class CapabilityGrantNotFoundError(RuntimeError):
    code = "capability_grant_not_found"
    status_code = 404


class CapabilityAlreadyGrantedError(RuntimeError):
    code = "capability_already_granted"
    status_code = 409


class CapabilityAlreadyRevokedError(RuntimeError):
    code = "capability_already_revoked"
    status_code = 409


class AccountNotFoundError(RuntimeError):
    code = "account_not_found"
    status_code = 404
