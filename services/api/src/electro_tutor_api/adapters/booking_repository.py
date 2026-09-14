from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.domain.booking import (
    Booking,
    BookingOperationAction,
    BookingOperationRecord,
    BookingOperationTargetType,
    BookingParticipantRole,
    BookingSnapshot,
    BookingStatus,
    BookingTransitionCommand,
    CreateTutorOfferCommand,
    Currency,
    PaymentMode,
    RequestBookingCommand,
    ReviseTutorOfferCommand,
    TutorOffer,
    TutorOfferStatus,
    TutorOfferTerms,
    TutorOfferTransitionCommand,
)
from electro_tutor_api.errors import (
    AuditUnavailableError,
    BookingNotFoundError,
    BookingOperationReservationConflict,
    BookingOverlapError,
    BookingTimeElapsedError,
    CapabilityRequiredError,
    IdempotencyConflictError,
    InvalidBookingTransitionError,
    OfferChangedError,
    OfferUnavailableError,
    SelfBookingForbiddenError,
    TutorOfferNotFoundError,
    VersionConflictError,
)


class PostgresBookingOperationRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def get(self, operation_id: UUID) -> BookingOperationRecord | None:
        result = await self._connection.execute(
            text("SELECT * FROM public.read_booking_operation(CAST(:operation_id AS uuid))"),
            {"operation_id": operation_id},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _operation_from_row(row)


class PostgresTutorOfferRepository:
    def __init__(
        self, connection: AsyncConnection, operations: PostgresBookingOperationRepository
    ) -> None:
        self._connection = connection
        self._operations = operations

    async def create(self, command: CreateTutorOfferCommand, intent_digest: str) -> TutorOffer:
        replay = await self._offer_replay(
            command.operation.operation_id,
            BookingOperationAction.TUTOR_OFFER_CREATE,
            intent_digest,
            expected_target=None,
        )
        if replay is not None:
            return replay
        terms = command.terms
        row = await self._one(
            "SELECT * FROM public.create_tutor_offer("
            "CAST(:id AS uuid),CAST(:title AS text),CAST(:starts_at AS timestamptz),"
            "CAST(:ends_at AS timestamptz),CAST(:time_zone AS text),CAST(:notice AS integer),"
            "CAST(:payment_mode AS text),CAST(:amount AS bigint),CAST(:currency AS text),"
            "CAST(:exponent AS smallint),CAST(:operation_id AS uuid),CAST(:digest AS text),"
            "CAST(:correlation_id AS uuid),CAST(:request_id AS text))",
            _offer_parameters(command.offer_id, terms, command.operation, intent_digest),
        )
        return _offer_from_row(row)

    async def get(self, offer_id: UUID) -> TutorOffer | None:
        result = await self._connection.execute(
            text("SELECT * FROM public.read_tutor_offer(CAST(:offer_id AS uuid))"),
            {"offer_id": offer_id},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _offer_from_row(row)

    async def list_own(self) -> list[TutorOffer]:
        result = await self._connection.execute(
            text("SELECT * FROM public.list_own_tutor_offers()")
        )
        return [_offer_from_row(row) for row in result.mappings().all()]

    async def revise(self, command: ReviseTutorOfferCommand, intent_digest: str) -> TutorOffer:
        replay = await self._offer_replay(
            command.operation.operation_id,
            BookingOperationAction.TUTOR_OFFER_REVISE,
            intent_digest,
            expected_target=command.offer_id,
        )
        if replay is not None:
            return replay
        terms = command.terms
        parameters = _offer_parameters(
            command.offer_id, terms, command.operation, intent_digest
        ) | {"expected": command.expected_version}
        row = await self._one(
            "SELECT * FROM public.revise_tutor_offer("
            "CAST(:id AS uuid),CAST(:expected AS integer),CAST(:title AS text),"
            "CAST(:starts_at AS timestamptz),CAST(:ends_at AS timestamptz),"
            "CAST(:time_zone AS text),CAST(:notice AS integer),CAST(:payment_mode AS text),"
            "CAST(:amount AS bigint),CAST(:currency AS text),CAST(:exponent AS smallint),"
            "CAST(:operation_id AS uuid),CAST(:digest AS text),CAST(:correlation_id AS uuid),"
            "CAST(:request_id AS text))",
            parameters,
        )
        return _offer_from_row(row)

    async def publish(self, command: TutorOfferTransitionCommand, intent_digest: str) -> TutorOffer:
        return await self._transition(
            "publish_tutor_offer",
            BookingOperationAction.TUTOR_OFFER_PUBLISH,
            command,
            intent_digest,
        )

    async def retire(self, command: TutorOfferTransitionCommand, intent_digest: str) -> TutorOffer:
        return await self._transition(
            "retire_tutor_offer", BookingOperationAction.TUTOR_OFFER_RETIRE, command, intent_digest
        )

    async def _transition(
        self,
        function: str,
        action: BookingOperationAction,
        command: TutorOfferTransitionCommand,
        intent_digest: str,
    ) -> TutorOffer:
        replay = await self._offer_replay(
            command.operation.operation_id, action, intent_digest, expected_target=command.offer_id
        )
        if replay is not None:
            return replay
        row = await self._one(
            f"SELECT * FROM public.{function}(CAST(:id AS uuid),CAST(:expected AS integer),"
            "CAST(:operation_id AS uuid),CAST(:digest AS text),CAST(:correlation_id AS uuid),"
            "CAST(:request_id AS text))",
            {
                "id": command.offer_id,
                "expected": command.expected_version,
                "operation_id": command.operation.operation_id,
                "digest": intent_digest,
                "correlation_id": command.operation.correlation_id,
                "request_id": command.operation.request_id,
            },
        )
        return _offer_from_row(row)

    async def _offer_replay(
        self,
        operation_id: UUID,
        action: BookingOperationAction,
        intent_digest: str,
        *,
        expected_target: UUID | None,
    ) -> TutorOffer | None:
        operation = await self._operations.get(operation_id)
        if operation is None:
            return None
        if (
            operation.action is not action
            or operation.target_type is not BookingOperationTargetType.TUTOR_OFFER
            or operation.intent_digest != intent_digest
            or (expected_target is not None and operation.target_id != expected_target)
        ):
            raise IdempotencyConflictError()
        offer = operation.result
        if not isinstance(offer, TutorOffer):
            raise IdempotencyConflictError()
        return offer

    async def _one(self, statement: str, parameters: Mapping[str, object]) -> RowMapping:
        try:
            result = await self._connection.execute(text(statement), parameters)
        except SQLAlchemyError as exc:
            _raise_booking_error(exc)
        return result.mappings().one()


class PostgresBookingRepository:
    def __init__(
        self, connection: AsyncConnection, operations: PostgresBookingOperationRepository
    ) -> None:
        self._connection = connection
        self._operations = operations

    async def request(self, command: RequestBookingCommand, intent_digest: str) -> Booking:
        replay = await self._booking_replay(
            command.operation.operation_id,
            BookingOperationAction.BOOKING_REQUEST,
            intent_digest,
            expected_target=None,
        )
        if replay is not None:
            return replay
        row = await self._one(
            "SELECT * FROM public.request_booking("
            "CAST(:id AS uuid),CAST(:offer_id AS uuid),CAST(:observed AS integer),"
            "CAST(:student_zone AS text),CAST(:operation_id AS uuid),CAST(:digest AS text),"
            "CAST(:correlation_id AS uuid),CAST(:request_id AS text))",
            {
                "id": command.booking_id,
                "offer_id": command.offer_id,
                "observed": command.observed_offer_version,
                "student_zone": command.student_time_zone,
                "operation_id": command.operation.operation_id,
                "digest": intent_digest,
                "correlation_id": command.operation.correlation_id,
                "request_id": command.operation.request_id,
            },
        )
        return _booking_from_row(row)

    async def get(self, booking_id: UUID) -> Booking | None:
        result = await self._connection.execute(
            text("SELECT * FROM public.read_booking(CAST(:booking_id AS uuid))"),
            {"booking_id": booking_id},
        )
        row = result.mappings().one_or_none()
        return None if row is None else _booking_from_row(row)

    async def list_own(self, role: BookingParticipantRole) -> list[Booking]:
        result = await self._connection.execute(
            text("SELECT * FROM public.list_own_bookings(CAST(:role AS text))"),
            {"role": role.value},
        )
        return [_booking_from_row(row) for row in result.mappings().all()]

    async def accept(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        return await self._transition(
            "accept_booking", BookingOperationAction.BOOKING_ACCEPT, command, intent_digest
        )

    async def decline(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        return await self._transition(
            "decline_booking", BookingOperationAction.BOOKING_DECLINE, command, intent_digest
        )

    async def cancel(self, command: BookingTransitionCommand, intent_digest: str) -> Booking:
        return await self._transition(
            "cancel_booking", BookingOperationAction.BOOKING_CANCEL, command, intent_digest
        )

    async def _transition(
        self,
        function: str,
        action: BookingOperationAction,
        command: BookingTransitionCommand,
        intent_digest: str,
    ) -> Booking:
        replay = await self._booking_replay(
            command.operation.operation_id,
            action,
            intent_digest,
            expected_target=command.booking_id,
        )
        if replay is not None:
            return replay
        row = await self._one(
            f"SELECT * FROM public.{function}(CAST(:id AS uuid),CAST(:expected AS integer),"
            "CAST(:operation_id AS uuid),CAST(:digest AS text),CAST(:correlation_id AS uuid),"
            "CAST(:request_id AS text))",
            {
                "id": command.booking_id,
                "expected": command.expected_version,
                "operation_id": command.operation.operation_id,
                "digest": intent_digest,
                "correlation_id": command.operation.correlation_id,
                "request_id": command.operation.request_id,
            },
        )
        return _booking_from_row(row)

    async def _booking_replay(
        self,
        operation_id: UUID,
        action: BookingOperationAction,
        intent_digest: str,
        *,
        expected_target: UUID | None,
    ) -> Booking | None:
        operation = await self._operations.get(operation_id)
        if operation is None:
            return None
        if (
            operation.action is not action
            or operation.target_type is not BookingOperationTargetType.BOOKING
            or operation.intent_digest != intent_digest
            or (expected_target is not None and operation.target_id != expected_target)
        ):
            raise IdempotencyConflictError()
        booking = operation.result
        if not isinstance(booking, Booking):
            raise IdempotencyConflictError()
        return booking

    async def _one(self, statement: str, parameters: Mapping[str, object]) -> RowMapping:
        try:
            result = await self._connection.execute(text(statement), parameters)
        except SQLAlchemyError as exc:
            _raise_booking_error(exc)
        return result.mappings().one()


def _offer_parameters(
    offer_id: UUID, terms: TutorOfferTerms, operation: Any, intent_digest: str
) -> dict[str, object]:
    return {
        "id": offer_id,
        "title": terms.title,
        "starts_at": terms.starts_at,
        "ends_at": terms.ends_at,
        "time_zone": terms.time_zone,
        "notice": terms.minimum_notice_minutes,
        "payment_mode": terms.payment_mode.value,
        "amount": terms.amount_minor,
        "currency": terms.currency.value if terms.currency else None,
        "exponent": terms.currency_exponent,
        "operation_id": operation.operation_id,
        "digest": intent_digest,
        "correlation_id": operation.correlation_id,
        "request_id": operation.request_id,
    }


def _offer_from_row(row: Mapping[str, Any] | RowMapping) -> TutorOffer:
    return TutorOffer(
        id=row["id"],
        tutor_account_id=row["tutor_account_id"],
        status=TutorOfferStatus(row["status"]),
        version=row["version"],
        terms=TutorOfferTerms(
            title=row["title"],
            starts_at=row["starts_at"],
            ends_at=row["ends_at"],
            time_zone=row["time_zone"],
            duration_minutes=row["duration_minutes"],
            minimum_notice_minutes=row["minimum_notice_minutes"],
            payment_mode=PaymentMode(row["payment_mode"]),
            amount_minor=row["amount_minor"],
            currency=Currency(row["currency"]) if row["currency"] else None,
            currency_exponent=row["currency_exponent"],
        ),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        published_at=row["published_at"],
        retired_at=row["retired_at"],
    )


def _booking_from_row(row: Mapping[str, Any] | RowMapping) -> Booking:
    return Booking(
        id=row["id"],
        offer_id=row["offer_id"],
        tutor_account_id=row["tutor_account_id"],
        student_account_id=row["student_account_id"],
        status=BookingStatus(row["status"]),
        version=row["version"],
        snapshot=BookingSnapshot(
            snapshot_version=row["snapshot_version"],
            offer_version=row["offer_version"],
            offer_title=row["offer_title"],
            starts_at=row["starts_at"],
            ends_at=row["ends_at"],
            tutor_time_zone=row["tutor_time_zone"],
            student_time_zone=row["student_time_zone"],
            duration_minutes=row["duration_minutes"],
            minimum_notice_minutes=row["minimum_notice_minutes"],
            payment_mode=PaymentMode(row["payment_mode"]),
            amount_minor=row["amount_minor"],
            currency=Currency(row["currency"]) if row["currency"] else None,
            currency_exponent=row["currency_exponent"],
            cancellation_policy_code=row["cancellation_policy_code"],
        ),
        requested_at=row["requested_at"],
        accepted_at=row["accepted_at"],
        declined_at=row["declined_at"],
        cancelled_at=row["cancelled_at"],
        cancelled_by=(
            BookingParticipantRole(row["cancelled_by_role"]) if row["cancelled_by_role"] else None
        ),
    )


def _operation_from_row(row: Mapping[str, Any] | RowMapping) -> BookingOperationRecord:
    payload = _decoded_result_payload(row["result_payload"])
    target_type = BookingOperationTargetType(row["target_type"])
    result = (
        _offer_from_row(payload)
        if target_type is BookingOperationTargetType.TUTOR_OFFER
        else _booking_from_row(payload)
    )
    return BookingOperationRecord(
        operation_id=row["operation_id"],
        actor_account_id=row["actor_account_id"],
        action=BookingOperationAction(row["action"]),
        target_type=target_type,
        target_id=row["target_id"],
        intent_digest=row["intent_digest"],
        result_version=row["result_version"],
        completed_at=row["completed_at"],
        result=result,
    )


def _decoded_result_payload(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AuditUnavailableError()
    payload = dict(value)
    for key in ("id", "offer_id", "tutor_account_id", "student_account_id"):
        item = payload.get(key)
        if isinstance(item, str):
            payload[key] = UUID(item)
    for key in (
        "starts_at",
        "ends_at",
        "created_at",
        "updated_at",
        "published_at",
        "retired_at",
        "requested_at",
        "accepted_at",
        "declined_at",
        "cancelled_at",
    ):
        item = payload.get(key)
        if isinstance(item, str):
            payload[key] = datetime.fromisoformat(item)
    return payload


def _raise_booking_error(exc: SQLAlchemyError) -> None:
    message = str(getattr(exc, "orig", exc))
    if "uq_audit_events_operation_id" in message or "pk_booking_operations" in message:
        raise BookingOperationReservationConflict() from exc
    mapping: tuple[tuple[str, type[RuntimeError]], ...] = (
        ("booking_operation_replay", BookingOperationReservationConflict),
        ("idempotency_conflict", IdempotencyConflictError),
        ("capability_required", CapabilityRequiredError),
        ("tutor_offer_not_found", TutorOfferNotFoundError),
        ("booking_not_found", BookingNotFoundError),
        ("offer_changed", OfferChangedError),
        ("version_conflict", VersionConflictError),
        ("invalid_booking_transition", InvalidBookingTransitionError),
        ("invalid_offer_transition", OfferUnavailableError),
        ("booking_time_elapsed", BookingTimeElapsedError),
        ("booking_overlap", BookingOverlapError),
        ("self_booking_forbidden", SelfBookingForbiddenError),
        ("offer_unavailable", OfferUnavailableError),
    )
    for marker, error_type in mapping:
        if marker in message:
            raise error_type() from exc
    raise AuditUnavailableError() from exc
