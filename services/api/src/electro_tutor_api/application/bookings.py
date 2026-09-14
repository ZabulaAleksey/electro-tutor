from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast
from uuid import UUID, uuid4

from electro_tutor_api.application.capabilities import CapabilityEvaluator
from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.booking import (
    Booking,
    BookingOperationAction,
    BookingOperationTargetType,
    BookingParticipantRole,
    BookingTransitionCommand,
    CreateTutorOfferCommand,
    OperationContext,
    RequestBookingCommand,
    ReviseTutorOfferCommand,
    TutorOffer,
    TutorOfferTerms,
    TutorOfferTransitionCommand,
    operation_intent_digest,
)
from electro_tutor_api.domain.capability import CapabilityCode
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.errors import (
    AuthenticationRequiredError,
    BookingNotFoundError,
    BookingOperationReservationConflict,
    CapabilityRequiredError,
    IdempotencyConflictError,
    TutorOfferNotFoundError,
)

UnitOfWorkFactory = Callable[[SessionCredential], AuditUnitOfWork]


class BookingService:
    def __init__(
        self,
        unit_of_work: UnitOfWorkFactory,
        capability_evaluator: CapabilityEvaluator | None = None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._capability_evaluator = capability_evaluator or CapabilityEvaluator(
            cast(Any, unit_of_work)
        )

    async def create_tutor_offer(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        terms: TutorOfferTerms,
        operation: OperationContext,
    ) -> TutorOffer:
        actor = _require_principal(principal)
        command = CreateTutorOfferCommand(uuid4(), terms, operation)
        try:
            async with self._unit_of_work(credential) as unit:
                _require_bound_principal(unit, actor)
                await self._require_tutor_capability(unit, actor)
                return await unit.tutor_offers.create(
                    command,
                    operation_intent_digest(BookingOperationAction.TUTOR_OFFER_CREATE, command),
                )
        except BookingOperationReservationConflict:
            result = await self._reconcile_operation(
                actor, credential, BookingOperationAction.TUTOR_OFFER_CREATE, command
            )
            assert isinstance(result, TutorOffer)
            return result

    async def read_tutor_offer(
        self, principal: Principal | None, credential: SessionCredential, offer_id: UUID
    ) -> TutorOffer:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            offer = await unit.tutor_offers.get(offer_id)
            if offer is None:
                raise TutorOfferNotFoundError()
            return offer

    async def list_own_tutor_offers(
        self, principal: Principal | None, credential: SessionCredential
    ) -> list[TutorOffer]:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.tutor_offers.list_own()

    async def revise_tutor_offer(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: ReviseTutorOfferCommand,
    ) -> TutorOffer:
        return await self._mutate_offer(
            principal,
            credential,
            command,
            BookingOperationAction.TUTOR_OFFER_REVISE,
        )

    async def publish_tutor_offer(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: TutorOfferTransitionCommand,
    ) -> TutorOffer:
        return await self._mutate_offer(
            principal,
            credential,
            command,
            BookingOperationAction.TUTOR_OFFER_PUBLISH,
        )

    async def retire_tutor_offer(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: TutorOfferTransitionCommand,
    ) -> TutorOffer:
        return await self._mutate_offer(
            principal,
            credential,
            command,
            BookingOperationAction.TUTOR_OFFER_RETIRE,
        )

    async def request_booking(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        *,
        offer_id: UUID,
        observed_offer_version: int,
        student_time_zone: str,
        operation: OperationContext,
    ) -> Booking:
        actor = _require_principal(principal)
        command = RequestBookingCommand(
            uuid4(), offer_id, observed_offer_version, student_time_zone, operation
        )
        try:
            async with self._unit_of_work(credential) as unit:
                _require_bound_principal(unit, actor)
                return await unit.bookings.request(
                    command,
                    operation_intent_digest(BookingOperationAction.BOOKING_REQUEST, command),
                )
        except BookingOperationReservationConflict:
            result = await self._reconcile_operation(
                actor, credential, BookingOperationAction.BOOKING_REQUEST, command
            )
            assert isinstance(result, Booking)
            return result

    async def read_booking(
        self, principal: Principal | None, credential: SessionCredential, booking_id: UUID
    ) -> Booking:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            booking = await unit.bookings.get(booking_id)
            if booking is None:
                raise BookingNotFoundError()
            return booking

    async def list_own_bookings(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        role: BookingParticipantRole,
    ) -> list[Booking]:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.bookings.list_own(role)

    async def accept_booking(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: BookingTransitionCommand,
    ) -> Booking:
        return await self._mutate_booking_as_tutor(
            principal, credential, command, BookingOperationAction.BOOKING_ACCEPT
        )

    async def decline_booking(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: BookingTransitionCommand,
    ) -> Booking:
        return await self._mutate_booking_as_tutor(
            principal, credential, command, BookingOperationAction.BOOKING_DECLINE
        )

    async def cancel_booking(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: BookingTransitionCommand,
    ) -> Booking:
        actor = _require_principal(principal)
        try:
            async with self._unit_of_work(credential) as unit:
                _require_bound_principal(unit, actor)
                if await unit.bookings.get(command.booking_id) is None:
                    raise BookingNotFoundError()
                return await unit.bookings.cancel(
                    command,
                    operation_intent_digest(BookingOperationAction.BOOKING_CANCEL, command),
                )
        except BookingOperationReservationConflict:
            result = await self._reconcile_operation(
                actor, credential, BookingOperationAction.BOOKING_CANCEL, command
            )
            assert isinstance(result, Booking)
            return result

    async def _mutate_offer(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: ReviseTutorOfferCommand | TutorOfferTransitionCommand,
        action: BookingOperationAction,
    ) -> TutorOffer:
        actor = _require_principal(principal)
        try:
            async with self._unit_of_work(credential) as unit:
                _require_bound_principal(unit, actor)
                offer = await unit.tutor_offers.get(command.offer_id)
                if offer is None or offer.tutor_account_id != actor.account_id:
                    raise TutorOfferNotFoundError()
                await self._require_tutor_capability(unit, actor)
                digest = operation_intent_digest(action, command)
                if action is BookingOperationAction.TUTOR_OFFER_REVISE:
                    assert isinstance(command, ReviseTutorOfferCommand)
                    return await unit.tutor_offers.revise(command, digest)
                assert isinstance(command, TutorOfferTransitionCommand)
                if action is BookingOperationAction.TUTOR_OFFER_PUBLISH:
                    return await unit.tutor_offers.publish(command, digest)
                return await unit.tutor_offers.retire(command, digest)
        except BookingOperationReservationConflict:
            result = await self._reconcile_operation(actor, credential, action, command)
            assert isinstance(result, TutorOffer)
            return result

    async def _mutate_booking_as_tutor(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        command: BookingTransitionCommand,
        action: BookingOperationAction,
    ) -> Booking:
        actor = _require_principal(principal)
        try:
            async with self._unit_of_work(credential) as unit:
                _require_bound_principal(unit, actor)
                if await unit.bookings.get(command.booking_id) is None:
                    raise BookingNotFoundError()
                await self._require_tutor_capability(unit, actor)
                digest = operation_intent_digest(action, command)
                if action is BookingOperationAction.BOOKING_ACCEPT:
                    return await unit.bookings.accept(command, digest)
                return await unit.bookings.decline(command, digest)
        except BookingOperationReservationConflict:
            result = await self._reconcile_operation(actor, credential, action, command)
            assert isinstance(result, Booking)
            return result

    async def _reconcile_operation(
        self,
        actor: Principal,
        credential: SessionCredential,
        action: BookingOperationAction,
        command: CreateTutorOfferCommand
        | ReviseTutorOfferCommand
        | TutorOfferTransitionCommand
        | RequestBookingCommand
        | BookingTransitionCommand,
    ) -> TutorOffer | Booking:
        digest = operation_intent_digest(action, command)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            record = await unit.booking_operations.get(command.operation.operation_id)
            expected_target = (
                BookingOperationTargetType.TUTOR_OFFER
                if action.value.startswith("tutor_offer.")
                else BookingOperationTargetType.BOOKING
            )
            if (
                record is None
                or record.actor_account_id != actor.account_id
                or record.action is not action
                or record.target_type is not expected_target
                or record.intent_digest != digest
            ):
                raise IdempotencyConflictError()
            result = record.result
            if expected_target is BookingOperationTargetType.TUTOR_OFFER and not isinstance(
                result, TutorOffer
            ):
                raise IdempotencyConflictError()
            if expected_target is BookingOperationTargetType.BOOKING and not isinstance(
                result, Booking
            ):
                raise IdempotencyConflictError()
            return result

    async def _require_tutor_capability(self, unit: AuditUnitOfWork, principal: Principal) -> None:
        if not await self._capability_evaluator.has_capability_in(
            unit,
            principal.account_id,
            CapabilityCode.TUTOR_BOOKING_MANAGE_OWN,
            for_update=True,
        ):
            raise CapabilityRequiredError()


def _require_principal(principal: Principal | None) -> Principal:
    if not isinstance(principal, Principal):
        raise AuthenticationRequiredError()
    return principal


def _require_bound_principal(unit: AuditUnitOfWork, principal: Principal) -> None:
    resolved = unit.session_principal
    if (
        not isinstance(resolved, Principal)
        or resolved.account_id != principal.account_id
        or resolved.identity_id != principal.identity_id
    ):
        raise AuthenticationRequiredError()
