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


class BookingOperationReservationConflict(RuntimeError):
    """Internal retry signal raised after a concurrent booking-operation winner."""


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


class AuthenticationRequiredError(RuntimeError):
    code = "authentication_required"
    status_code = 401


class CapabilityRequiredError(RuntimeError):
    code = "capability_required"
    status_code = 403


class ProfileNotFoundError(RuntimeError):
    code = "profile_not_found"
    status_code = 404


class ProfileAlreadyExistsError(RuntimeError):
    code = "profile_already_exists"
    status_code = 409


class TutorOfferNotFoundError(RuntimeError):
    code = "tutor_offer_not_found"
    status_code = 404


class BookingNotFoundError(RuntimeError):
    code = "booking_not_found"
    status_code = 404


class OfferChangedError(RuntimeError):
    code = "offer_changed"
    status_code = 409


class VersionConflictError(RuntimeError):
    code = "version_conflict"
    status_code = 409


class InvalidBookingTransitionError(RuntimeError):
    code = "invalid_booking_transition"
    status_code = 409


class BookingTimeElapsedError(RuntimeError):
    code = "booking_time_elapsed"
    status_code = 409


class BookingOverlapError(RuntimeError):
    code = "booking_overlap"
    status_code = 409


class SelfBookingForbiddenError(RuntimeError):
    code = "self_booking_forbidden"
    status_code = 409


class OfferUnavailableError(RuntimeError):
    code = "offer_unavailable"
    status_code = 409
