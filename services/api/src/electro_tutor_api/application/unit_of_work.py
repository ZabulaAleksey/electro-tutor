from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from electro_tutor_api.domain.audit import AuditEvent, NewAuditEvent
from electro_tutor_api.domain.booking import (
    Booking,
    BookingOperationRecord,
    BookingParticipantRole,
    BookingTransitionCommand,
    CreateTutorOfferCommand,
    RequestBookingCommand,
    ReviseTutorOfferCommand,
    TutorOffer,
    TutorOfferTransitionCommand,
)
from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityCode,
    CapabilityGrant,
    CapabilityOperationKind,
    CapabilityOperationRecord,
)
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.domain.lesson_access import LessonAccessDecision
from electro_tutor_api.domain.profile import StudentProfile, TutorProfile


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


class ProfileRepository(Protocol):
    async def create_student(self, display_name: str) -> tuple[StudentProfile, bool]: ...

    async def get_student(self, *, for_update: bool = False) -> StudentProfile | None: ...

    async def update_student(self, display_name: str) -> StudentProfile | None: ...

    async def create_tutor(
        self,
        display_name: str,
        *,
        correlation_id: UUID | None,
        request_id: str | None,
    ) -> tuple[TutorProfile, bool]: ...

    async def get_tutor(self, *, for_update: bool = False) -> TutorProfile | None: ...

    async def update_tutor(self, display_name: str) -> TutorProfile | None: ...


class TutorOfferRepository(Protocol):
    """Session-bound offer operations; every mutation includes ledger + audit."""

    async def create(self, command: CreateTutorOfferCommand, intent_digest: str) -> TutorOffer: ...

    async def get(self, offer_id: UUID) -> TutorOffer | None: ...

    async def list_own(self) -> list[TutorOffer]: ...

    async def revise(self, command: ReviseTutorOfferCommand, intent_digest: str) -> TutorOffer:
        """Lock active booking capability before the offer row."""
        ...

    async def publish(self, command: TutorOfferTransitionCommand, intent_digest: str) -> TutorOffer:
        """Lock active booking capability before the offer row."""
        ...

    async def retire(self, command: TutorOfferTransitionCommand, intent_digest: str) -> TutorOffer:
        """Lock active booking capability before the offer row."""
        ...


class BookingRepository(Protocol):
    """Session-bound booking operations with contractually ordered database locks."""

    async def request(self, command: RequestBookingCommand, intent_digest: str) -> Booking:
        """Lock the offer before validating and copying its immutable snapshot."""
        ...

    async def get(self, booking_id: UUID) -> Booking | None: ...

    async def list_own(self, role: BookingParticipantRole) -> list[Booking]: ...

    async def accept(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        """After grant lock, lock booking then sorted participant advisory locks."""
        ...

    async def decline(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        """After grant lock, lock the booking and apply the transition atomically."""
        ...

    async def cancel(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        """Lock booking, then sorted participant locks when cancelling ACCEPTED."""
        ...


class BookingOperationRepository(Protocol):
    async def get(self, operation_id: UUID) -> BookingOperationRecord | None: ...


class LessonAccessGrantRepository(Protocol):
    async def authorize_for_current_session(self, booking_id: UUID) -> LessonAccessDecision: ...


class AuditUnitOfWork(Protocol):
    audit_events: AuditEventRepository
    booking_operations: BookingOperationRepository
    bookings: BookingRepository
    capability_grants: CapabilityGrantRepository
    lesson_access_grants: LessonAccessGrantRepository
    profiles: ProfileRepository
    session_principal: Principal | None
    tutor_offers: TutorOfferRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...
