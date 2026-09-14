from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
from datetime import UTC, datetime, timedelta, timezone, tzinfo
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfoNotFoundError

import pytest

import electro_tutor_api.domain.booking as booking_domain
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.domain.booking import (
    BOOKING_SNAPSHOT_VERSION,
    CANCELLATION_POLICY_CODE,
    Booking,
    BookingOperationAction,
    BookingOperationRecord,
    BookingOperationTargetType,
    BookingParticipantRole,
    BookingSnapshot,
    BookingStatus,
    BookingTransitionCommand,
    BookingValidationError,
    CreateTutorOfferCommand,
    Currency,
    OperationContext,
    PaymentMode,
    RequestBookingCommand,
    ReviseTutorOfferCommand,
    TutorOffer,
    TutorOfferStatus,
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


class FakeZoneInfo(tzinfo):
    def __init__(self, key: str, offset: timedelta) -> None:
        self.key = key
        self._offset = offset

    def utcoffset(self, _dt: datetime | None) -> timedelta:
        return self._offset

    def dst(self, _dt: datetime | None) -> timedelta:
        return timedelta(0)

    def tzname(self, _dt: datetime | None) -> str:
        return self.key


@pytest.fixture(autouse=True)
def available_iana_zones(monkeypatch: pytest.MonkeyPatch) -> None:
    zones = {
        "UTC": FakeZoneInfo("UTC", timedelta(0)),
        "Europe/Kyiv": FakeZoneInfo("Europe/Kyiv", timedelta(hours=3)),
    }

    def load_zone(key: str) -> FakeZoneInfo:
        try:
            return zones[key]
        except KeyError as exc:
            raise ZoneInfoNotFoundError(key) from exc

    monkeypatch.setattr(booking_domain, "ZoneInfo", load_zone)


def principal(account_id: UUID | None = None) -> Principal:
    return Principal(
        account_id=account_id or uuid4(),
        identity_id=uuid4(),
        issuer="https://issuer.invalid",
        subject=str(uuid4()),
        email=None,
        session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )


def credential() -> SessionCredential:
    return SessionCredential(digest="a" * 64)


def operation() -> OperationContext:
    return OperationContext(uuid4(), uuid4(), "booking-unit-test")


def terms(
    *,
    title: str = "Tutor session",
    payment_mode: PaymentMode = PaymentMode.FREE,
    amount_minor: int = 0,
    currency: Currency | None = None,
) -> TutorOfferTerms:
    return TutorOfferTerms.from_input(
        title=title,
        starts_at=datetime(2026, 10, 15, 18, tzinfo=UTC),
        time_zone="UTC",
        duration_minutes=60,
        minimum_notice_minutes=30,
        payment_mode=payment_mode,
        amount_minor=amount_minor,
        currency=currency,
    )


def offer(owner: UUID, *, offer_terms: TutorOfferTerms | None = None) -> TutorOffer:
    now = datetime.now(UTC)
    return TutorOffer(
        id=uuid4(),
        tutor_account_id=owner,
        status=TutorOfferStatus.DRAFT,
        version=1,
        terms=offer_terms or terms(),
        created_at=now,
        updated_at=now,
    )


def booking(tutor: UUID, student: UUID, source: TutorOffer) -> Booking:
    snapshot = BookingSnapshot(
        snapshot_version=BOOKING_SNAPSHOT_VERSION,
        offer_version=source.version,
        offer_title=source.terms.title,
        starts_at=source.terms.starts_at,
        ends_at=source.terms.ends_at,
        tutor_time_zone=source.terms.time_zone,
        student_time_zone="UTC",
        duration_minutes=source.terms.duration_minutes,
        minimum_notice_minutes=source.terms.minimum_notice_minutes,
        payment_mode=source.terms.payment_mode,
        amount_minor=source.terms.amount_minor,
        currency=source.terms.currency,
        currency_exponent=source.terms.currency_exponent,
        cancellation_policy_code=CANCELLATION_POLICY_CODE,
    )
    return Booking(
        id=uuid4(),
        offer_id=source.id,
        tutor_account_id=tutor,
        student_account_id=student,
        status=BookingStatus.REQUESTED,
        version=1,
        snapshot=snapshot,
        requested_at=datetime.now(UTC),
    )


class FakeCapabilityRepository:
    def __init__(self, active_accounts: set[UUID], calls: list[str]) -> None:
        self.active_accounts = active_accounts
        self.calls = calls

    async def get_active(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> object | None:
        assert capability_code is CapabilityCode.TUTOR_BOOKING_MANAGE_OWN
        assert for_update is True
        self.calls.append("grant-lock")
        return object() if account_id in self.active_accounts else None


class FakeOfferRepository:
    def __init__(self, calls: list[str], stored: TutorOffer | None = None) -> None:
        self.calls = calls
        self.stored = stored
        self.last_command: object | None = None
        self.last_digest: str | None = None

    async def create(self, command: CreateTutorOfferCommand, digest: str) -> TutorOffer:
        self.calls.append("offer-create")
        self.last_command, self.last_digest = command, digest
        now = datetime.now(UTC)
        self.stored = TutorOffer(
            command.offer_id,
            UUID(int=1),
            TutorOfferStatus.DRAFT,
            1,
            command.terms,
            now,
            now,
        )
        return self.stored

    async def get(self, offer_id: UUID) -> TutorOffer | None:
        self.calls.append("offer-read")
        if self.stored is None or self.stored.id != offer_id:
            return None
        return self.stored

    async def list_own(self) -> list[TutorOffer]:
        self.calls.append("offer-list")
        return [self.stored] if self.stored else []

    async def revise(self, command: ReviseTutorOfferCommand, digest: str) -> TutorOffer:
        self.calls.append("offer-revise")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored

    async def publish(self, command: TutorOfferTransitionCommand, digest: str) -> TutorOffer:
        self.calls.append("offer-publish")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored

    async def retire(self, command: TutorOfferTransitionCommand, digest: str) -> TutorOffer:
        self.calls.append("offer-retire")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored


class FakeBookingRepository:
    def __init__(
        self,
        calls: list[str],
        stored: Booking | None = None,
        *,
        conflict_action: BookingOperationAction | None = None,
    ) -> None:
        self.calls = calls
        self.stored = stored
        self.conflict_action = conflict_action
        self.last_command: object | None = None
        self.last_digest: str | None = None

    async def request(self, command: RequestBookingCommand, digest: str) -> Booking:
        self.calls.append("booking-request-offer-lock")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored

    async def get(self, booking_id: UUID) -> Booking | None:
        self.calls.append("booking-read")
        if self.stored is None or self.stored.id != booking_id:
            return None
        return self.stored

    async def list_own(self, role: BookingParticipantRole) -> list[Booking]:
        self.calls.append(f"booking-list-{role.value}")
        return [self.stored] if self.stored else []

    async def accept(self, command: BookingTransitionCommand, digest: str) -> Booking:
        self.calls.append("booking-accept-locks")
        self.last_command, self.last_digest = command, digest
        if self.conflict_action is BookingOperationAction.BOOKING_ACCEPT:
            raise BookingOperationReservationConflict()
        assert self.stored is not None
        return self.stored

    async def decline(self, command: BookingTransitionCommand, digest: str) -> Booking:
        self.calls.append("booking-decline-lock")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored

    async def cancel(self, command: BookingTransitionCommand, digest: str) -> Booking:
        self.calls.append("booking-cancel-locks")
        self.last_command, self.last_digest = command, digest
        assert self.stored is not None
        return self.stored


class FakeOperationRepository:
    def __init__(self, calls: list[str], record: BookingOperationRecord | None) -> None:
        self.calls = calls
        self.record = record

    async def get(self, operation_id: UUID) -> BookingOperationRecord | None:
        self.calls.append("operation-read")
        if self.record is None or self.record.operation_id != operation_id:
            return None
        return self.record


class FakeUnitOfWork:
    def __init__(
        self,
        bound_principal: Principal,
        offers: FakeOfferRepository,
        bookings: FakeBookingRepository,
        capabilities: FakeCapabilityRepository,
        booking_operations: FakeOperationRepository,
    ) -> None:
        self.session_principal = bound_principal
        self.tutor_offers = offers
        self.bookings = bookings
        self.capability_grants = capabilities
        self.audit_events = cast(Any, None)
        self.booking_operations = booking_operations
        self.profiles = cast(Any, None)

    async def __aenter__(self) -> FakeUnitOfWork:
        return self

    async def __aexit__(self, *_args: object) -> bool:
        return False


def service(
    bound_principal: Principal,
    *,
    active_accounts: set[UUID] | None = None,
    stored_offer: TutorOffer | None = None,
    stored_booking: Booking | None = None,
    operation_record: BookingOperationRecord | None = None,
    conflict_action: BookingOperationAction | None = None,
) -> tuple[BookingService, FakeOfferRepository, FakeBookingRepository, list[str]]:
    calls: list[str] = []
    offers = FakeOfferRepository(calls, stored_offer)
    bookings = FakeBookingRepository(calls, stored_booking, conflict_action=conflict_action)
    capabilities = FakeCapabilityRepository(active_accounts or set(), calls)
    operations = FakeOperationRepository(calls, operation_record)
    return (
        BookingService(
            lambda _credential: cast(
                Any,
                FakeUnitOfWork(bound_principal, offers, bookings, capabilities, operations),
            )
        ),
        offers,
        bookings,
        calls,
    )


def test_offer_input_normalizes_nfc_whitespace_offset_and_server_owned_money() -> None:
    free = terms(title="  Jose\u0301   lesson ")
    assert free.title == "José lesson"
    assert free.starts_at == datetime(2026, 10, 15, 18, tzinfo=UTC)
    assert free.ends_at - free.starts_at == timedelta(minutes=60)
    assert (free.amount_minor, free.currency, free.currency_exponent) == (0, None, None)

    external = terms(payment_mode=PaymentMode.EXTERNAL, amount_minor=12_345, currency=Currency.UAH)
    assert external.currency_exponent == 2


@pytest.mark.parametrize(
    "kwargs",
    [
        {"title": ""},
        {"title": "x" * 121},
        {"title": "line\nbreak"},
        {"payment_mode": PaymentMode.FREE, "amount_minor": 1},
        {"payment_mode": PaymentMode.EXTERNAL, "amount_minor": 0},
        {"payment_mode": PaymentMode.EXTERNAL, "amount_minor": 1, "currency": None},
    ],
)
def test_offer_input_rejects_out_of_contract_title_and_money(kwargs: dict[str, object]) -> None:
    with pytest.raises(BookingValidationError):
        terms(**kwargs)  # type: ignore[arg-type]


def test_offer_input_rejects_mismatched_offset_unknown_zone_and_untyped_integers() -> None:
    values: dict[str, object] = {
        "title": "Offer",
        "starts_at": datetime(2026, 10, 15, 18, tzinfo=timezone(timedelta(hours=2))),
        "time_zone": "UTC",
        "duration_minutes": 60,
        "minimum_notice_minutes": 30,
        "payment_mode": PaymentMode.FREE,
        "amount_minor": 0,
        "currency": None,
    }
    with pytest.raises(BookingValidationError, match="offset"):
        TutorOfferTerms.from_input(**values)  # type: ignore[arg-type]
    values["time_zone"] = "Unknown/Nowhere"
    with pytest.raises(BookingValidationError, match="IANA"):
        TutorOfferTerms.from_input(**values)  # type: ignore[arg-type]
    values.update(
        starts_at=datetime(2026, 10, 15, 18, tzinfo=UTC),
        time_zone="UTC",
        duration_minutes=True,
    )
    with pytest.raises(BookingValidationError, match="integer"):
        TutorOfferTerms.from_input(**values)  # type: ignore[arg-type]


def test_time_zone_database_unavailability_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(_key: str) -> FakeZoneInfo:
        raise ZoneInfoNotFoundError("unavailable")

    monkeypatch.setattr(booking_domain, "ZoneInfo", unavailable)
    with pytest.raises(BookingValidationError, match="available IANA"):
        terms()


def test_snapshot_and_commands_are_frozen_and_versioned() -> None:
    tutor, student = uuid4(), uuid4()
    source = offer(tutor)
    created = booking(tutor, student, source)
    assert created.snapshot.snapshot_version == 1
    assert created.snapshot.cancellation_policy_code == "participant_before_start_v1"
    with pytest.raises(FrozenInstanceError):
        created.snapshot.offer_title = "mutated"  # type: ignore[misc]
    with pytest.raises(BookingValidationError):
        Booking(
            **{
                **created.__dict__,
                "student_account_id": tutor,
            }
        )


def test_operation_digest_is_normalized_stable_and_action_scoped() -> None:
    offer_id, operation_context = uuid4(), operation()
    first = ReviseTutorOfferCommand(offer_id, 1, terms(title="Name"), operation_context)
    second = ReviseTutorOfferCommand(offer_id, 1, terms(title=" Name "), operation_context)
    digest = operation_intent_digest(BookingOperationAction.TUTOR_OFFER_REVISE, first)
    assert digest == operation_intent_digest(BookingOperationAction.TUTOR_OFFER_REVISE, second)
    assert digest != operation_intent_digest(
        BookingOperationAction.TUTOR_OFFER_PUBLISH,
        TutorOfferTransitionCommand(offer_id, 1, operation_context),
    )
    assert operation_intent_digest(
        BookingOperationAction.BOOKING_CANCEL,
        BookingTransitionCommand(uuid4(), 1, operation_context),
    ) != operation_intent_digest(
        BookingOperationAction.BOOKING_DECLINE,
        BookingTransitionCommand(uuid4(), 1, operation_context),
    )


@pytest.mark.asyncio
async def test_create_offer_requires_bound_session_and_exact_capability_before_mutation() -> None:
    actor = principal()
    booking_service, offers, _, calls = service(actor, active_accounts={actor.account_id})
    created = await booking_service.create_tutor_offer(actor, credential(), terms(), operation())
    assert isinstance(offers.last_command, CreateTutorOfferCommand)
    assert created.id == offers.last_command.offer_id
    assert calls == ["grant-lock", "offer-create"]
    assert offers.last_digest == operation_intent_digest(
        BookingOperationAction.TUTOR_OFFER_CREATE, offers.last_command
    )

    denied, _, _, denied_calls = service(actor)
    with pytest.raises(CapabilityRequiredError):
        await denied.create_tutor_offer(actor, credential(), terms(), operation())
    assert denied_calls == ["grant-lock"]

    with pytest.raises(AuthenticationRequiredError):
        await booking_service.create_tutor_offer(None, credential(), terms(), operation())

    mismatched = principal(actor.account_id)
    unbound, _, _, unbound_calls = service(mismatched, active_accounts={actor.account_id})
    with pytest.raises(AuthenticationRequiredError):
        await unbound.create_tutor_offer(actor, credential(), terms(), operation())
    assert unbound_calls == []


@pytest.mark.asyncio
async def test_offer_mutation_resolves_visible_resource_before_capability_and_lock_order() -> None:
    actor = principal()
    source = offer(actor.account_id)
    booking_service, _, _, calls = service(
        actor, active_accounts={actor.account_id}, stored_offer=source
    )
    command = TutorOfferTransitionCommand(source.id, source.version, operation())
    await booking_service.publish_tutor_offer(actor, credential(), command)
    assert calls == ["offer-read", "grant-lock", "offer-publish"]

    missing, _, _, missing_calls = service(actor, active_accounts={actor.account_id})
    with pytest.raises(TutorOfferNotFoundError):
        await missing.publish_tutor_offer(actor, credential(), command)
    assert missing_calls == ["offer-read"]

    foreign = principal()
    foreign_offer = offer(uuid4())
    foreign_command = TutorOfferTransitionCommand(
        foreign_offer.id, foreign_offer.version, operation()
    )
    for active_accounts in (set(), {foreign.account_id}):
        foreign_service, _, _, foreign_calls = service(
            foreign,
            active_accounts=active_accounts,
            stored_offer=foreign_offer,
        )
        with pytest.raises(TutorOfferNotFoundError):
            await foreign_service.publish_tutor_offer(foreign, credential(), foreign_command)
        assert foreign_calls == ["offer-read"]


@pytest.mark.asyncio
async def test_request_is_session_bound_and_delegates_offer_lock_without_capability() -> None:
    student, tutor = principal(), uuid4()
    source = offer(tutor)
    stored = booking(tutor, student.account_id, source)
    booking_service, _, bookings, calls = service(student, stored_booking=stored)
    returned = await booking_service.request_booking(
        student,
        credential(),
        offer_id=source.id,
        observed_offer_version=source.version,
        student_time_zone="UTC",
        operation=operation(),
    )
    assert returned == stored
    assert calls == ["operation-read", "booking-request-offer-lock"]
    assert isinstance(bookings.last_command, RequestBookingCommand)
    assert bookings.last_command.booking_id != stored.id


@pytest.mark.asyncio
async def test_tutor_transition_checks_visibility_then_capability_then_repository_locks() -> None:
    tutor = principal()
    source = offer(tutor.account_id)
    stored = booking(tutor.account_id, uuid4(), source)
    booking_service, _, _, calls = service(
        tutor, active_accounts={tutor.account_id}, stored_booking=stored
    )
    command = BookingTransitionCommand(stored.id, stored.version, operation())
    await booking_service.accept_booking(tutor, credential(), command)
    assert calls == ["booking-read", "grant-lock", "booking-accept-locks"]

    missing, _, _, missing_calls = service(tutor, active_accounts={tutor.account_id})
    with pytest.raises(BookingNotFoundError):
        await missing.accept_booking(tutor, credential(), command)
    assert missing_calls == ["booking-read"]

    student = principal(stored.student_account_id)
    for active_accounts in (set(), {student.account_id}):
        student_service, _, _, student_calls = service(
            student,
            active_accounts=active_accounts,
            stored_booking=stored,
        )
        with pytest.raises(CapabilityRequiredError):
            await student_service.accept_booking(student, credential(), command)
        assert student_calls == ["booking-read"]


@pytest.mark.asyncio
async def test_transport_preflights_preserve_auth_resource_action_capability_order() -> None:
    tutor = principal()
    source = replace(
        offer(tutor.account_id),
        status=TutorOfferStatus.ACTIVE,
        published_at=datetime.now(UTC),
    )
    stored = booking(tutor.account_id, uuid4(), source)
    booking_service, _, _, calls = service(
        tutor,
        active_accounts={tutor.account_id},
        stored_offer=source,
        stored_booking=stored,
    )
    await booking_service.preflight_create_tutor_offer(tutor, credential())
    await booking_service.preflight_mutate_tutor_offer(tutor, credential(), source.id)
    await booking_service.preflight_request_booking(tutor, credential(), source.id)
    await booking_service.preflight_mutate_booking_as_tutor(tutor, credential(), stored.id)
    await booking_service.preflight_cancel_booking(tutor, credential(), stored.id)
    assert calls == [
        "grant-lock",
        "offer-read",
        "grant-lock",
        "offer-read",
        "booking-read",
        "grant-lock",
        "booking-read",
    ]


@pytest.mark.asyncio
async def test_request_preflight_allows_own_historical_replay_after_offer_retirement() -> None:
    student = principal()
    source = replace(
        offer(uuid4()),
        status=TutorOfferStatus.RETIRED,
        published_at=datetime.now(UTC),
        retired_at=datetime.now(UTC),
    )
    stored = booking(source.tutor_account_id, student.account_id, source)
    context = operation()
    request_command = RequestBookingCommand(uuid4(), source.id, source.version, "UTC", context)
    record = BookingOperationRecord(
        operation_id=context.operation_id,
        actor_account_id=student.account_id,
        action=BookingOperationAction.BOOKING_REQUEST,
        target_type=BookingOperationTargetType.BOOKING,
        target_id=stored.id,
        intent_digest=operation_intent_digest(
            BookingOperationAction.BOOKING_REQUEST, request_command
        ),
        result_version=stored.version,
        completed_at=datetime.now(UTC),
        result=stored,
    )
    booking_service, _, _, calls = service(
        student,
        stored_offer=source,
        stored_booking=stored,
        operation_record=record,
    )

    await booking_service.preflight_request_booking(
        student, credential(), source.id, context.operation_id
    )
    assert calls == ["offer-read", "operation-read"]

    assert (
        await booking_service.request_booking(
            student,
            credential(),
            offer_id=source.id,
            observed_offer_version=source.version,
            student_time_zone="UTC",
            operation=context,
        )
        == stored
    )
    assert calls == ["offer-read", "operation-read", "operation-read"]

    with pytest.raises(TutorOfferNotFoundError):
        await booking_service.preflight_request_booking(student, credential(), source.id, uuid4())


@pytest.mark.asyncio
async def test_participant_cancel_does_not_require_tutor_capability() -> None:
    student, tutor = principal(), uuid4()
    source = offer(tutor)
    stored = booking(tutor, student.account_id, source)
    booking_service, _, _, calls = service(student, stored_booking=stored)
    command = BookingTransitionCommand(stored.id, stored.version, operation())
    assert await booking_service.cancel_booking(student, credential(), command) == stored
    assert calls == ["booking-read", "booking-cancel-locks"]


@pytest.mark.asyncio
async def test_operation_retry_replays_historical_result_after_later_transition() -> None:
    tutor = principal()
    source = offer(tutor.account_id)
    stored = booking(tutor.account_id, uuid4(), source)
    context = operation()
    command = BookingTransitionCommand(stored.id, stored.version, context)
    digest = operation_intent_digest(BookingOperationAction.BOOKING_ACCEPT, command)
    record = BookingOperationRecord(
        operation_id=context.operation_id,
        actor_account_id=tutor.account_id,
        action=BookingOperationAction.BOOKING_ACCEPT,
        target_type=BookingOperationTargetType.BOOKING,
        target_id=stored.id,
        intent_digest=digest,
        result_version=stored.version,
        completed_at=datetime.now(UTC),
        result=stored,
    )
    later = replace(
        stored,
        status=BookingStatus.ACCEPTED,
        version=2,
        accepted_at=datetime.now(UTC),
    )
    booking_service, _, _, calls = service(
        tutor,
        active_accounts={tutor.account_id},
        stored_booking=later,
        operation_record=record,
        conflict_action=BookingOperationAction.BOOKING_ACCEPT,
    )
    assert await booking_service.accept_booking(tutor, credential(), command) == stored
    assert calls == [
        "booking-read",
        "grant-lock",
        "booking-accept-locks",
        "operation-read",
    ]


@pytest.mark.asyncio
async def test_operation_reconcile_rejects_cross_actor_and_changed_intent() -> None:
    tutor = principal()
    source = offer(tutor.account_id)
    stored = booking(tutor.account_id, uuid4(), source)
    context = operation()
    command = BookingTransitionCommand(stored.id, stored.version, context)
    record = BookingOperationRecord(
        operation_id=context.operation_id,
        actor_account_id=uuid4(),
        action=BookingOperationAction.BOOKING_ACCEPT,
        target_type=BookingOperationTargetType.BOOKING,
        target_id=stored.id,
        intent_digest=operation_intent_digest(BookingOperationAction.BOOKING_ACCEPT, command),
        result_version=stored.version,
        completed_at=datetime.now(UTC),
        result=stored,
    )
    booking_service, _, _, _ = service(
        tutor,
        active_accounts={tutor.account_id},
        stored_booking=stored,
        operation_record=record,
        conflict_action=BookingOperationAction.BOOKING_ACCEPT,
    )
    with pytest.raises(IdempotencyConflictError):
        await booking_service.accept_booking(tutor, credential(), command)
