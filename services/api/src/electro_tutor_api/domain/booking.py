from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from electro_tutor_api.request_id import REQUEST_ID_PATTERN

_WHITESPACE_RUN = re.compile(r"\s+")
_MAX_TITLE_CODE_POINTS = 120
_MIN_DURATION_MINUTES = 15
_MAX_DURATION_MINUTES = 480
_MAX_NOTICE_MINUTES = 10_080
_MAX_AMOUNT_MINOR = 100_000_000


class BookingValidationError(ValueError):
    code = "invalid_request"
    status_code = 422


class TutorOfferStatus(StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    RETIRED = "RETIRED"


class PaymentMode(StrEnum):
    FREE = "FREE"
    EXTERNAL = "EXTERNAL"


class Currency(StrEnum):
    UAH = "UAH"
    EUR = "EUR"
    USD = "USD"


class BookingStatus(StrEnum):
    REQUESTED = "REQUESTED"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    CANCELLED = "CANCELLED"


class BookingParticipantRole(StrEnum):
    STUDENT = "student"
    TUTOR = "tutor"


class BookingOperationAction(StrEnum):
    TUTOR_OFFER_CREATE = "tutor_offer.create"
    TUTOR_OFFER_REVISE = "tutor_offer.revise"
    TUTOR_OFFER_PUBLISH = "tutor_offer.publish"
    TUTOR_OFFER_RETIRE = "tutor_offer.retire"
    BOOKING_REQUEST = "booking.request"
    BOOKING_ACCEPT = "booking.accept"
    BOOKING_DECLINE = "booking.decline"
    BOOKING_CANCEL = "booking.cancel"


class BookingOperationTargetType(StrEnum):
    TUTOR_OFFER = "tutor_offer"
    BOOKING = "booking"


CANCELLATION_POLICY_CODE = "participant_before_start_v1"
BOOKING_SNAPSHOT_VERSION = 1


def normalize_offer_title(value: str) -> str:
    if not isinstance(value, str):
        raise BookingValidationError("title must be a string")
    normalized = unicodedata.normalize("NFC", value)
    if any(unicodedata.category(character).startswith("C") for character in normalized):
        raise BookingValidationError("title must not contain control characters")
    normalized = _WHITESPACE_RUN.sub(" ", normalized.strip())
    if not 1 <= len(normalized) <= _MAX_TITLE_CODE_POINTS:
        raise BookingValidationError(f"title must contain 1..{_MAX_TITLE_CODE_POINTS} code points")
    return normalized


def normalize_time_zone(value: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 255:
        raise BookingValidationError("time_zone must be an IANA identifier")
    try:
        zone = ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise BookingValidationError("time_zone must be an available IANA identifier") from exc
    if zone.key != value:
        raise BookingValidationError("time_zone must be a canonical IANA identifier")
    return value


def normalize_start_instant(value: datetime, time_zone: str) -> datetime:
    """Validate the supplied numeric offset against its IANA zone and return UTC."""

    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise BookingValidationError("starts_at must include a numeric UTC offset")
    zone_name = normalize_time_zone(time_zone)
    try:
        expected_offset = value.astimezone(ZoneInfo(zone_name)).utcoffset()
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise BookingValidationError("time zone data is unavailable") from exc
    if expected_offset != value.utcoffset():
        raise BookingValidationError("starts_at offset does not match time_zone")
    return value.astimezone(UTC)


def _strict_int(name: str, value: int, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise BookingValidationError(f"{name} must be an integer")
    if not minimum <= value <= maximum:
        raise BookingValidationError(f"{name} must be between {minimum} and {maximum}")
    return value


def _validate_uuid(name: str, value: UUID) -> None:
    if not isinstance(value, UUID):
        raise BookingValidationError(f"{name} must be UUID")


def _validate_request_id(value: str | None) -> None:
    if value is not None and (
        not isinstance(value, str) or REQUEST_ID_PATTERN.fullmatch(value) is None
    ):
        raise BookingValidationError("request_id must follow the API request ID contract")


def _validate_utc_datetime(name: str, value: datetime | None, *, optional: bool = False) -> None:
    if value is None:
        if optional:
            return
        raise BookingValidationError(f"{name} must be a UTC datetime")
    if not isinstance(value, datetime) or value.tzinfo is not UTC:
        raise BookingValidationError(f"{name} must be normalized to UTC")


@dataclass(frozen=True)
class TutorOfferTerms:
    title: str
    starts_at: datetime
    ends_at: datetime
    time_zone: str
    duration_minutes: int
    minimum_notice_minutes: int
    payment_mode: PaymentMode
    amount_minor: int
    currency: Currency | None
    currency_exponent: int | None

    @classmethod
    def from_input(
        cls,
        *,
        title: str,
        starts_at: datetime,
        time_zone: str,
        duration_minutes: int,
        minimum_notice_minutes: int,
        payment_mode: PaymentMode,
        amount_minor: int,
        currency: Currency | None,
    ) -> TutorOfferTerms:
        normalized_title = normalize_offer_title(title)
        normalized_start = normalize_start_instant(starts_at, time_zone)
        duration = _strict_int(
            "duration_minutes",
            duration_minutes,
            _MIN_DURATION_MINUTES,
            _MAX_DURATION_MINUTES,
        )
        if duration % _MIN_DURATION_MINUTES:
            raise BookingValidationError("duration_minutes must be a multiple of 15")
        notice = _strict_int(
            "minimum_notice_minutes", minimum_notice_minutes, 0, _MAX_NOTICE_MINUTES
        )
        if not isinstance(payment_mode, PaymentMode):
            raise BookingValidationError("payment_mode must be allowlisted")
        if payment_mode is PaymentMode.FREE:
            if amount_minor != 0 or currency is not None:
                raise BookingValidationError("FREE requires zero amount and no currency")
            exponent = None
        else:
            _strict_int("amount_minor", amount_minor, 1, _MAX_AMOUNT_MINOR)
            if not isinstance(currency, Currency):
                raise BookingValidationError("EXTERNAL requires an allowlisted currency")
            exponent = 2
        return cls(
            title=normalized_title,
            starts_at=normalized_start,
            ends_at=normalized_start + timedelta(minutes=duration),
            time_zone=time_zone,
            duration_minutes=duration,
            minimum_notice_minutes=notice,
            payment_mode=payment_mode,
            amount_minor=amount_minor,
            currency=currency,
            currency_exponent=exponent,
        )

    def __post_init__(self) -> None:
        if self.title != normalize_offer_title(self.title):
            raise BookingValidationError("title must be normalized")
        if self.starts_at.tzinfo is not UTC or self.ends_at.tzinfo is not UTC:
            raise BookingValidationError("offer instants must be normalized to UTC")
        normalize_time_zone(self.time_zone)
        duration = _strict_int(
            "duration_minutes",
            self.duration_minutes,
            _MIN_DURATION_MINUTES,
            _MAX_DURATION_MINUTES,
        )
        if duration % _MIN_DURATION_MINUTES or self.ends_at != self.starts_at + timedelta(
            minutes=duration
        ):
            raise BookingValidationError("offer interval must match duration_minutes")
        _strict_int("minimum_notice_minutes", self.minimum_notice_minutes, 0, _MAX_NOTICE_MINUTES)
        if not isinstance(self.payment_mode, PaymentMode):
            raise BookingValidationError("payment_mode must be allowlisted")
        if self.payment_mode is PaymentMode.FREE:
            if (self.amount_minor, self.currency, self.currency_exponent) != (0, None, None):
                raise BookingValidationError("FREE money fields are invalid")
        elif (
            isinstance(self.amount_minor, bool)
            or not isinstance(self.amount_minor, int)
            or not 1 <= self.amount_minor <= _MAX_AMOUNT_MINOR
            or not isinstance(self.currency, Currency)
            or self.currency_exponent != 2
        ):
            raise BookingValidationError("EXTERNAL money fields are invalid")


@dataclass(frozen=True)
class TutorOffer:
    id: UUID
    tutor_account_id: UUID
    status: TutorOfferStatus
    version: int
    terms: TutorOfferTerms
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    retired_at: datetime | None = None

    def __post_init__(self) -> None:
        _validate_uuid("id", self.id)
        _validate_uuid("tutor_account_id", self.tutor_account_id)
        if not isinstance(self.status, TutorOfferStatus):
            raise BookingValidationError("offer status must be allowlisted")
        _strict_int("version", self.version, 1, 2_147_483_647)
        if not isinstance(self.terms, TutorOfferTerms):
            raise BookingValidationError("terms must be TutorOfferTerms")
        _validate_utc_datetime("created_at", self.created_at)
        _validate_utc_datetime("updated_at", self.updated_at)
        _validate_utc_datetime("published_at", self.published_at, optional=True)
        _validate_utc_datetime("retired_at", self.retired_at, optional=True)
        if self.status is TutorOfferStatus.DRAFT and (
            self.published_at is not None or self.retired_at is not None
        ):
            raise BookingValidationError("DRAFT offer cannot have transition timestamps")
        if self.status is TutorOfferStatus.ACTIVE and (
            self.published_at is None or self.retired_at is not None
        ):
            raise BookingValidationError("ACTIVE offer timestamps are invalid")
        if self.status is TutorOfferStatus.RETIRED and self.retired_at is None:
            raise BookingValidationError("RETIRED offer requires retired_at")


@dataclass(frozen=True)
class BookingSnapshot:
    snapshot_version: int
    offer_version: int
    offer_title: str
    starts_at: datetime
    ends_at: datetime
    tutor_time_zone: str
    student_time_zone: str
    duration_minutes: int
    minimum_notice_minutes: int
    payment_mode: PaymentMode
    amount_minor: int
    currency: Currency | None
    currency_exponent: int | None
    cancellation_policy_code: str = CANCELLATION_POLICY_CODE

    def __post_init__(self) -> None:
        if self.snapshot_version != BOOKING_SNAPSHOT_VERSION:
            raise BookingValidationError("unsupported booking snapshot version")
        _strict_int("offer_version", self.offer_version, 1, 2_147_483_647)
        if self.offer_title != normalize_offer_title(self.offer_title):
            raise BookingValidationError("snapshot offer title must be normalized")
        if self.starts_at.tzinfo is not UTC or self.ends_at.tzinfo is not UTC:
            raise BookingValidationError("snapshot instants must be normalized to UTC")
        normalize_time_zone(self.tutor_time_zone)
        normalize_time_zone(self.student_time_zone)
        TutorOfferTerms(
            title=self.offer_title,
            starts_at=self.starts_at,
            ends_at=self.ends_at,
            time_zone=self.tutor_time_zone,
            duration_minutes=self.duration_minutes,
            minimum_notice_minutes=self.minimum_notice_minutes,
            payment_mode=self.payment_mode,
            amount_minor=self.amount_minor,
            currency=self.currency,
            currency_exponent=self.currency_exponent,
        )
        if self.cancellation_policy_code != CANCELLATION_POLICY_CODE:
            raise BookingValidationError("unsupported cancellation policy")


@dataclass(frozen=True)
class Booking:
    id: UUID
    offer_id: UUID
    tutor_account_id: UUID
    student_account_id: UUID
    status: BookingStatus
    version: int
    snapshot: BookingSnapshot
    requested_at: datetime
    accepted_at: datetime | None = None
    declined_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancelled_by: BookingParticipantRole | None = None

    def __post_init__(self) -> None:
        for name in ("id", "offer_id", "tutor_account_id", "student_account_id"):
            _validate_uuid(name, getattr(self, name))
        if self.tutor_account_id == self.student_account_id:
            raise BookingValidationError("booking participants must be distinct")
        if not isinstance(self.status, BookingStatus):
            raise BookingValidationError("booking status must be allowlisted")
        _strict_int("version", self.version, 1, 2_147_483_647)
        if not isinstance(self.snapshot, BookingSnapshot):
            raise BookingValidationError("snapshot must be BookingSnapshot")
        for name in ("requested_at", "accepted_at", "declined_at", "cancelled_at"):
            _validate_utc_datetime(name, getattr(self, name), optional=name != "requested_at")
        if self.cancelled_by is not None and not isinstance(
            self.cancelled_by, BookingParticipantRole
        ):
            raise BookingValidationError("cancelled_by must be a participant role")
        if self.status is BookingStatus.REQUESTED and any(
            value is not None
            for value in (self.accepted_at, self.declined_at, self.cancelled_at, self.cancelled_by)
        ):
            raise BookingValidationError("REQUESTED booking cannot have transition fields")
        if self.status is BookingStatus.ACCEPTED and (
            self.accepted_at is None
            or self.declined_at is not None
            or self.cancelled_at is not None
            or self.cancelled_by is not None
        ):
            raise BookingValidationError("ACCEPTED booking transition fields are invalid")
        if self.status is BookingStatus.DECLINED and (
            self.declined_at is None
            or self.accepted_at is not None
            or self.cancelled_at is not None
            or self.cancelled_by is not None
        ):
            raise BookingValidationError("DECLINED booking transition fields are invalid")
        if self.status is BookingStatus.CANCELLED and (
            self.cancelled_at is None or self.cancelled_by is None or self.declined_at is not None
        ):
            raise BookingValidationError("CANCELLED booking transition fields are invalid")


@dataclass(frozen=True)
class BookingOperationRecord:
    operation_id: UUID
    actor_account_id: UUID
    action: BookingOperationAction
    target_type: BookingOperationTargetType
    target_id: UUID
    intent_digest: str
    result_version: int
    completed_at: datetime
    result: TutorOffer | Booking

    def __post_init__(self) -> None:
        _validate_uuid("operation_id", self.operation_id)
        _validate_uuid("actor_account_id", self.actor_account_id)
        _validate_uuid("target_id", self.target_id)
        if not isinstance(self.action, BookingOperationAction):
            raise BookingValidationError("operation action must be allowlisted")
        if not isinstance(self.target_type, BookingOperationTargetType):
            raise BookingValidationError("operation target type must be allowlisted")
        if not re.fullmatch(r"[0-9a-f]{64}", self.intent_digest):
            raise BookingValidationError("intent_digest must be lowercase SHA-256")
        _strict_int("result_version", self.result_version, 1, 2_147_483_647)
        _validate_utc_datetime("completed_at", self.completed_at)
        if self.target_type is BookingOperationTargetType.TUTOR_OFFER:
            if not isinstance(self.result, TutorOffer):
                raise BookingValidationError("offer operation result must be TutorOffer")
        elif not isinstance(self.result, Booking):
            raise BookingValidationError("booking operation result must be Booking")
        if self.result.id != self.target_id or self.result.version != self.result_version:
            raise BookingValidationError("operation result must match target id and version")


@dataclass(frozen=True)
class OperationContext:
    operation_id: UUID
    correlation_id: UUID
    request_id: str | None = None

    def __post_init__(self) -> None:
        _validate_uuid("operation_id", self.operation_id)
        _validate_uuid("correlation_id", self.correlation_id)
        _validate_request_id(self.request_id)


@dataclass(frozen=True)
class CreateTutorOfferCommand:
    offer_id: UUID
    terms: TutorOfferTerms
    operation: OperationContext

    def __post_init__(self) -> None:
        _validate_uuid("offer_id", self.offer_id)
        if not isinstance(self.terms, TutorOfferTerms):
            raise BookingValidationError("terms must be TutorOfferTerms")
        if not isinstance(self.operation, OperationContext):
            raise BookingValidationError("operation must be OperationContext")


@dataclass(frozen=True)
class ReviseTutorOfferCommand:
    offer_id: UUID
    expected_version: int
    terms: TutorOfferTerms
    operation: OperationContext

    def __post_init__(self) -> None:
        _validate_uuid("offer_id", self.offer_id)
        _strict_int("expected_version", self.expected_version, 1, 2_147_483_647)
        if not isinstance(self.terms, TutorOfferTerms):
            raise BookingValidationError("terms must be TutorOfferTerms")
        if not isinstance(self.operation, OperationContext):
            raise BookingValidationError("operation must be OperationContext")


@dataclass(frozen=True)
class TutorOfferTransitionCommand:
    offer_id: UUID
    expected_version: int
    operation: OperationContext

    def __post_init__(self) -> None:
        _validate_uuid("offer_id", self.offer_id)
        _strict_int("expected_version", self.expected_version, 1, 2_147_483_647)
        if not isinstance(self.operation, OperationContext):
            raise BookingValidationError("operation must be OperationContext")


@dataclass(frozen=True)
class RequestBookingCommand:
    booking_id: UUID
    offer_id: UUID
    observed_offer_version: int
    student_time_zone: str
    operation: OperationContext

    def __post_init__(self) -> None:
        _validate_uuid("booking_id", self.booking_id)
        _validate_uuid("offer_id", self.offer_id)
        _strict_int("observed_offer_version", self.observed_offer_version, 1, 2_147_483_647)
        object.__setattr__(self, "student_time_zone", normalize_time_zone(self.student_time_zone))
        if not isinstance(self.operation, OperationContext):
            raise BookingValidationError("operation must be OperationContext")


@dataclass(frozen=True)
class BookingTransitionCommand:
    booking_id: UUID
    expected_version: int
    operation: OperationContext

    def __post_init__(self) -> None:
        _validate_uuid("booking_id", self.booking_id)
        _strict_int("expected_version", self.expected_version, 1, 2_147_483_647)
        if not isinstance(self.operation, OperationContext):
            raise BookingValidationError("operation must be OperationContext")


def operation_intent_digest(
    action: BookingOperationAction,
    command: CreateTutorOfferCommand
    | ReviseTutorOfferCommand
    | TutorOfferTransitionCommand
    | RequestBookingCommand
    | BookingTransitionCommand,
) -> str:
    if not isinstance(action, BookingOperationAction):
        raise BookingValidationError("operation action must be allowlisted")
    payload: dict[str, object] = {"version": 1, "action": action.value}
    if isinstance(command, CreateTutorOfferCommand):
        payload.update(_terms_intent(command.terms))
    elif isinstance(command, ReviseTutorOfferCommand):
        payload.update(
            {"offer_id": str(command.offer_id), "expected_version": command.expected_version}
        )
        payload.update(_terms_intent(command.terms))
    elif isinstance(command, TutorOfferTransitionCommand):
        payload.update(
            {"offer_id": str(command.offer_id), "expected_version": command.expected_version}
        )
    elif isinstance(command, RequestBookingCommand):
        payload.update(
            {
                "offer_id": str(command.offer_id),
                "observed_offer_version": command.observed_offer_version,
                "student_time_zone": command.student_time_zone,
            }
        )
    elif isinstance(command, BookingTransitionCommand):
        payload.update(
            {"booking_id": str(command.booking_id), "expected_version": command.expected_version}
        )
    else:
        raise BookingValidationError("unsupported booking operation command")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("ascii")).hexdigest()


def _terms_intent(terms: TutorOfferTerms) -> dict[str, object]:
    return {
        "title": terms.title,
        "starts_at": terms.starts_at.isoformat(),
        "ends_at": terms.ends_at.isoformat(),
        "time_zone": terms.time_zone,
        "duration_minutes": terms.duration_minutes,
        "minimum_notice_minutes": terms.minimum_notice_minutes,
        "payment_mode": terms.payment_mode.value,
        "amount_minor": terms.amount_minor,
        "currency": terms.currency.value if terms.currency else None,
        "currency_exponent": terms.currency_exponent,
    }
