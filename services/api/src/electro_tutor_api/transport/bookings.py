from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, Request
from pydantic import BaseModel, ConfigDict, StrictInt, ValidationError, field_validator

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.booking import (
    Booking,
    BookingParticipantRole,
    BookingSnapshot,
    BookingTransitionCommand,
    BookingValidationError,
    Currency,
    OperationContext,
    PaymentMode,
    ReviseTutorOfferCommand,
    TutorOffer,
    TutorOfferTerms,
    TutorOfferTransitionCommand,
)
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.errors import AuthenticationRequiredError

_OFFSET_RFC3339 = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]+)?[+-][0-9]{2}:[0-9]{2}$"
)


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TutorOfferWriteRequest(_StrictRequest):
    title: str
    starts_at: datetime
    time_zone: str
    duration_minutes: StrictInt
    minimum_notice_minutes: StrictInt
    payment_mode: Literal["FREE", "EXTERNAL"]
    amount_minor: StrictInt
    currency: Literal["UAH", "EUR", "USD"] | None = None

    @field_validator("starts_at", mode="before")
    @classmethod
    def require_offset_rfc3339(cls, value: object) -> object:
        if not isinstance(value, str) or _OFFSET_RFC3339.fullmatch(value) is None:
            raise ValueError("starts_at must be RFC3339 text with a numeric offset")
        return value


class TutorOfferReviseRequest(TutorOfferWriteRequest):
    expected_version: StrictInt


class ExpectedVersionRequest(_StrictRequest):
    expected_version: StrictInt


class BookingRequestRequest(_StrictRequest):
    observed_offer_version: StrictInt
    student_time_zone: str


class TutorOfferResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    status: str
    version: int
    title: str
    starts_at: datetime
    ends_at: datetime
    time_zone: str
    duration_minutes: int
    minimum_notice_minutes: int
    payment_mode: str
    amount_minor: int
    currency: str | None
    currency_exponent: int | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    retired_at: datetime | None


class BookingSnapshotResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshot_version: int
    offer_version: int
    offer_title: str
    starts_at: datetime
    ends_at: datetime
    tutor_time_zone: str
    student_time_zone: str
    duration_minutes: int
    minimum_notice_minutes: int
    payment_mode: str
    amount_minor: int
    currency: str | None
    currency_exponent: int | None
    cancellation_policy_code: str


class BookingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    offer_id: UUID
    status: str
    version: int
    snapshot: BookingSnapshotResponse
    requested_at: datetime
    accepted_at: datetime | None
    declined_at: datetime | None
    cancelled_at: datetime | None
    cancelled_by: str | None


def _mutation_openapi(model: type[BaseModel]) -> dict[str, object]:
    return {
        "parameters": [
            {
                "name": "Idempotency-Key",
                "in": "header",
                "required": True,
                "schema": {"type": "string", "format": "uuid"},
            }
        ],
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": model.model_json_schema()}},
        },
    }


@dataclass(frozen=True)
class BookingRequestContext:
    principal: Principal
    credential: SessionCredential


def _offer_response(offer: TutorOffer) -> TutorOfferResponse:
    terms = offer.terms
    return TutorOfferResponse(
        id=offer.id,
        status=offer.status.value,
        version=offer.version,
        title=terms.title,
        starts_at=terms.starts_at,
        ends_at=terms.ends_at,
        time_zone=terms.time_zone,
        duration_minutes=terms.duration_minutes,
        minimum_notice_minutes=terms.minimum_notice_minutes,
        payment_mode=terms.payment_mode.value,
        amount_minor=terms.amount_minor,
        currency=terms.currency.value if terms.currency else None,
        currency_exponent=terms.currency_exponent,
        created_at=offer.created_at,
        updated_at=offer.updated_at,
        published_at=offer.published_at,
        retired_at=offer.retired_at,
    )


def _snapshot_response(snapshot: BookingSnapshot) -> BookingSnapshotResponse:
    return BookingSnapshotResponse(
        snapshot_version=snapshot.snapshot_version,
        offer_version=snapshot.offer_version,
        offer_title=snapshot.offer_title,
        starts_at=snapshot.starts_at,
        ends_at=snapshot.ends_at,
        tutor_time_zone=snapshot.tutor_time_zone,
        student_time_zone=snapshot.student_time_zone,
        duration_minutes=snapshot.duration_minutes,
        minimum_notice_minutes=snapshot.minimum_notice_minutes,
        payment_mode=snapshot.payment_mode.value,
        amount_minor=snapshot.amount_minor,
        currency=snapshot.currency.value if snapshot.currency else None,
        currency_exponent=snapshot.currency_exponent,
        cancellation_policy_code=snapshot.cancellation_policy_code,
    )


def _booking_response(booking: Booking) -> BookingResponse:
    return BookingResponse(
        id=booking.id,
        offer_id=booking.offer_id,
        status=booking.status.value,
        version=booking.version,
        snapshot=_snapshot_response(booking.snapshot),
        requested_at=booking.requested_at,
        accepted_at=booking.accepted_at,
        declined_at=booking.declined_at,
        cancelled_at=booking.cancelled_at,
        cancelled_by=booking.cancelled_by.value if booking.cancelled_by else None,
    )


def _operation(request: Request) -> OperationContext:
    raw = request.headers.get("Idempotency-Key")
    if raw is None:
        raise BookingValidationError("missing Idempotency-Key")
    try:
        operation_id = UUID(raw)
    except ValueError as exc:
        raise BookingValidationError("invalid Idempotency-Key") from exc
    if raw != str(operation_id):
        raise BookingValidationError("Idempotency-Key must be a canonical UUID")
    return OperationContext(operation_id, uuid4(), request.state.request_id)


def _candidate_operation_id(request: Request) -> UUID | None:
    raw = request.headers.get("Idempotency-Key")
    if raw is None:
        return None
    try:
        operation_id = UUID(raw)
    except ValueError:
        return None
    return operation_id if raw == str(operation_id) else None


async def _payload[RequestModel: _StrictRequest](
    request: Request, model: type[RequestModel]
) -> RequestModel:
    try:
        value = await request.json()
        return model.model_validate(value)
    except (TypeError, ValueError, ValidationError) as exc:
        raise BookingValidationError("booking request body is invalid") from exc


def _terms(payload: TutorOfferWriteRequest) -> TutorOfferTerms:
    return TutorOfferTerms.from_input(
        title=payload.title,
        starts_at=payload.starts_at,
        time_zone=payload.time_zone,
        duration_minutes=payload.duration_minutes,
        minimum_notice_minutes=payload.minimum_notice_minutes,
        payment_mode=PaymentMode(payload.payment_mode),
        amount_minor=payload.amount_minor,
        currency=Currency(payload.currency) if payload.currency else None,
    )


def build_booking_router(
    auth_service: AuthService,
    booking_service: BookingService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        session_token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> BookingRequestContext:
        principal = await auth_service.principal(session_token)
        credential = auth_service.session_credential(session_token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return BookingRequestContext(principal, credential)

    authenticated_dependency = Depends(authenticated)

    @router.post(
        "/tutor-offers",
        response_model=TutorOfferResponse,
        status_code=201,
        openapi_extra=_mutation_openapi(TutorOfferWriteRequest),
    )
    async def create_offer(
        request: Request,
        context: BookingRequestContext = authenticated_dependency,
    ) -> TutorOfferResponse:
        await booking_service.preflight_create_tutor_offer(context.principal, context.credential)
        payload = await _payload(request, TutorOfferWriteRequest)
        operation = _operation(request)
        offer = await booking_service.create_tutor_offer(
            context.principal, context.credential, _terms(payload), operation
        )
        return _offer_response(offer)

    @router.get("/tutor-offers/me", response_model=list[TutorOfferResponse])
    async def list_own_offers(
        context: BookingRequestContext = authenticated_dependency,
    ) -> list[TutorOfferResponse]:
        offers = await booking_service.list_own_tutor_offers(context.principal, context.credential)
        return [_offer_response(offer) for offer in offers]

    @router.get("/tutor-offers/{offer_id}", response_model=TutorOfferResponse)
    async def read_offer(
        offer_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> TutorOfferResponse:
        offer = await booking_service.read_tutor_offer(
            context.principal, context.credential, offer_id
        )
        return _offer_response(offer)

    @router.put(
        "/tutor-offers/{offer_id}",
        response_model=TutorOfferResponse,
        openapi_extra=_mutation_openapi(TutorOfferReviseRequest),
    )
    async def revise_offer(
        request: Request,
        offer_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> TutorOfferResponse:
        await booking_service.preflight_mutate_tutor_offer(
            context.principal, context.credential, offer_id
        )
        payload = await _payload(request, TutorOfferReviseRequest)
        command = ReviseTutorOfferCommand(
            offer_id, payload.expected_version, _terms(payload), _operation(request)
        )
        return _offer_response(
            await booking_service.revise_tutor_offer(context.principal, context.credential, command)
        )

    async def transition_offer(
        request: Request,
        offer_id: UUID,
        context: BookingRequestContext,
        *,
        publish: bool,
    ) -> TutorOfferResponse:
        await booking_service.preflight_mutate_tutor_offer(
            context.principal, context.credential, offer_id
        )
        payload = await _payload(request, ExpectedVersionRequest)
        command = TutorOfferTransitionCommand(
            offer_id, payload.expected_version, _operation(request)
        )
        if publish:
            offer = await booking_service.publish_tutor_offer(
                context.principal, context.credential, command
            )
        else:
            offer = await booking_service.retire_tutor_offer(
                context.principal, context.credential, command
            )
        return _offer_response(offer)

    @router.post(
        "/tutor-offers/{offer_id}/publish",
        response_model=TutorOfferResponse,
        openapi_extra=_mutation_openapi(ExpectedVersionRequest),
    )
    async def publish_offer(
        request: Request,
        offer_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> TutorOfferResponse:
        return await transition_offer(request, offer_id, context, publish=True)

    @router.post(
        "/tutor-offers/{offer_id}/retire",
        response_model=TutorOfferResponse,
        openapi_extra=_mutation_openapi(ExpectedVersionRequest),
    )
    async def retire_offer(
        request: Request,
        offer_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> TutorOfferResponse:
        return await transition_offer(request, offer_id, context, publish=False)

    @router.post(
        "/tutor-offers/{offer_id}/bookings",
        response_model=BookingResponse,
        status_code=201,
        openapi_extra=_mutation_openapi(BookingRequestRequest),
    )
    async def request_booking(
        request: Request,
        offer_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> BookingResponse:
        await booking_service.preflight_request_booking(
            context.principal,
            context.credential,
            offer_id,
            _candidate_operation_id(request),
        )
        payload = await _payload(request, BookingRequestRequest)
        booking = await booking_service.request_booking(
            context.principal,
            context.credential,
            offer_id=offer_id,
            observed_offer_version=payload.observed_offer_version,
            student_time_zone=payload.student_time_zone,
            operation=_operation(request),
        )
        return _booking_response(booking)

    @router.get(
        "/bookings/me",
        response_model=list[BookingResponse],
        openapi_extra={
            "parameters": [
                {
                    "name": "role",
                    "in": "query",
                    "required": True,
                    "schema": {
                        "type": "string",
                        "enum": [role.value for role in BookingParticipantRole],
                    },
                }
            ]
        },
    )
    async def list_own_bookings(
        request: Request,
        context: BookingRequestContext = authenticated_dependency,
    ) -> list[BookingResponse]:
        raw_role = request.query_params.get("role")
        try:
            if raw_role is None:
                raise ValueError("missing role")
            role = BookingParticipantRole(raw_role)
        except (TypeError, ValueError) as exc:
            raise BookingValidationError("role must be student or tutor") from exc
        bookings = await booking_service.list_own_bookings(
            context.principal, context.credential, role
        )
        return [_booking_response(booking) for booking in bookings]

    @router.get("/bookings/{booking_id}", response_model=BookingResponse)
    async def read_booking(
        booking_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> BookingResponse:
        booking = await booking_service.read_booking(
            context.principal, context.credential, booking_id
        )
        return _booking_response(booking)

    async def transition_booking(
        request: Request,
        booking_id: UUID,
        context: BookingRequestContext,
        *,
        action: str,
    ) -> BookingResponse:
        if action in {"accept", "decline"}:
            await booking_service.preflight_mutate_booking_as_tutor(
                context.principal, context.credential, booking_id
            )
        else:
            await booking_service.preflight_cancel_booking(
                context.principal, context.credential, booking_id
            )
        payload = await _payload(request, ExpectedVersionRequest)
        command = BookingTransitionCommand(
            booking_id, payload.expected_version, _operation(request)
        )
        if action == "accept":
            booking = await booking_service.accept_booking(
                context.principal, context.credential, command
            )
        elif action == "decline":
            booking = await booking_service.decline_booking(
                context.principal, context.credential, command
            )
        else:
            booking = await booking_service.cancel_booking(
                context.principal, context.credential, command
            )
        return _booking_response(booking)

    @router.post(
        "/bookings/{booking_id}/accept",
        response_model=BookingResponse,
        openapi_extra=_mutation_openapi(ExpectedVersionRequest),
    )
    async def accept_booking(
        request: Request,
        booking_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> BookingResponse:
        return await transition_booking(request, booking_id, context, action="accept")

    @router.post(
        "/bookings/{booking_id}/decline",
        response_model=BookingResponse,
        openapi_extra=_mutation_openapi(ExpectedVersionRequest),
    )
    async def decline_booking(
        request: Request,
        booking_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> BookingResponse:
        return await transition_booking(request, booking_id, context, action="decline")

    @router.post(
        "/bookings/{booking_id}/cancel",
        response_model=BookingResponse,
        openapi_extra=_mutation_openapi(ExpectedVersionRequest),
    )
    async def cancel_booking(
        request: Request,
        booking_id: UUID,
        context: BookingRequestContext = authenticated_dependency,
    ) -> BookingResponse:
        return await transition_booking(request, booking_id, context, action="cancel")

    return router
