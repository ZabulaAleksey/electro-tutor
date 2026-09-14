from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from electro_tutor_api.application.auth import AuthFlowError, LoginComplete, LoginStart
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.booking import (
    BOOKING_SNAPSHOT_VERSION,
    CANCELLATION_POLICY_CODE,
    Booking,
    BookingParticipantRole,
    BookingSnapshot,
    BookingStatus,
    BookingTransitionCommand,
    PaymentMode,
    TutorOffer,
    TutorOfferStatus,
    TutorOfferTerms,
)
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.errors import (
    BookingNotFoundError,
    CapabilityRequiredError,
    TutorOfferNotFoundError,
    VersionConflictError,
)
from electro_tutor_api.main import create_app

BASE = {
    "runtime_database_url": (
        "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor"
    ),
    "auth_database_url": (
        "postgresql+asyncpg://electro_tutor_auth_runtime:auth-password@"
        "127.0.0.1:55432/electro_tutor"
    ),
}
ACCOUNT_ID = UUID("11111111-1111-4111-8111-111111111111")
TUTOR_ID = ACCOUNT_ID
STUDENT_ID = UUID("33333333-3333-4333-8333-333333333333")
OFFER_ID = UUID("44444444-4444-4444-8444-444444444444")
BOOKING_ID = UUID("55555555-5555-4555-8555-555555555555")
OPERATION_ID = "aaaaaaaa-6666-4666-8666-666666666666"
NOW = datetime(2026, 9, 14, tzinfo=UTC)


class FakeAuthService:
    async def principal(self, session_token: str | None) -> Principal | None:
        if session_token != "valid-session":
            return None
        return Principal(
            account_id=ACCOUNT_ID,
            identity_id=UUID("22222222-2222-4222-8222-222222222222"),
            issuer="https://issuer.invalid",
            subject="subject",
            email=None,
            session_expires_at=NOW + timedelta(minutes=5),
        )

    @staticmethod
    def session_credential(session_token: str | None) -> SessionCredential | None:
        return SessionCredential.from_token(session_token) if session_token else None

    async def begin_login(self, _return_to: str) -> LoginStart:
        raise AssertionError("not used")

    async def complete_login(self, **_kwargs: object) -> LoginComplete:
        raise AssertionError("not used")

    async def logout(self, _session_token: str | None, _redirect: str) -> str:
        raise AuthFlowError("not_used", "not used")


def terms(title: str = "Circuit analysis") -> TutorOfferTerms:
    return TutorOfferTerms.from_input(
        title=title,
        starts_at=datetime(2027, 1, 15, 10, tzinfo=UTC),
        time_zone="UTC",
        duration_minutes=60,
        minimum_notice_minutes=30,
        payment_mode=PaymentMode.FREE,
        amount_minor=0,
        currency=None,
    )


def offer(status: TutorOfferStatus = TutorOfferStatus.ACTIVE, version: int = 2) -> TutorOffer:
    return TutorOffer(
        id=OFFER_ID,
        tutor_account_id=TUTOR_ID,
        status=status,
        version=version,
        terms=terms(),
        created_at=NOW,
        updated_at=NOW,
        published_at=NOW if status is not TutorOfferStatus.DRAFT else None,
        retired_at=NOW if status is TutorOfferStatus.RETIRED else None,
    )


def booking(status: BookingStatus = BookingStatus.REQUESTED, version: int = 1) -> Booking:
    snapshot = BookingSnapshot(
        snapshot_version=BOOKING_SNAPSHOT_VERSION,
        offer_version=2,
        offer_title="Circuit analysis",
        starts_at=datetime(2027, 1, 15, 10, tzinfo=UTC),
        ends_at=datetime(2027, 1, 15, 11, tzinfo=UTC),
        tutor_time_zone="UTC",
        student_time_zone="Europe/Kyiv",
        duration_minutes=60,
        minimum_notice_minutes=30,
        payment_mode=PaymentMode.FREE,
        amount_minor=0,
        currency=None,
        currency_exponent=None,
        cancellation_policy_code=CANCELLATION_POLICY_CODE,
    )
    return Booking(
        id=BOOKING_ID,
        offer_id=OFFER_ID,
        tutor_account_id=TUTOR_ID,
        student_account_id=STUDENT_ID,
        status=status,
        version=version,
        snapshot=snapshot,
        requested_at=NOW,
        accepted_at=NOW if status is BookingStatus.ACCEPTED else None,
    )


class FakeBookingService:
    def __init__(self) -> None:
        self.failure: Exception | None = None
        self.preflight_failure: Exception | None = None
        self.calls: list[str] = []

    def _preflight(self, name: str) -> None:
        self.calls.append(name)
        if self.preflight_failure:
            raise self.preflight_failure

    def _result(self, name: str, value: TutorOffer | Booking) -> TutorOffer | Booking:
        self.calls.append(name)
        if self.failure:
            raise self.failure
        return value

    async def preflight_create_tutor_offer(self, *_args: object) -> None:
        self._preflight("preflight_create")

    async def preflight_mutate_tutor_offer(self, *_args: object) -> None:
        self._preflight("preflight_offer")

    async def preflight_request_booking(self, *_args: object) -> None:
        self._preflight("preflight_request")

    async def preflight_mutate_booking_as_tutor(self, *_args: object) -> None:
        self._preflight("preflight_booking_tutor")

    async def preflight_cancel_booking(self, *_args: object) -> None:
        self._preflight("preflight_booking_cancel")

    async def create_tutor_offer(self, *_args: object) -> TutorOffer:
        return self._result("create", offer(TutorOfferStatus.DRAFT, 1))  # type: ignore[return-value]

    async def list_own_tutor_offers(self, *_args: object) -> list[TutorOffer]:
        return [offer()]

    async def read_tutor_offer(self, *_args: object) -> TutorOffer:
        return self._result("read_offer", offer())  # type: ignore[return-value]

    async def revise_tutor_offer(self, *_args: object) -> TutorOffer:
        return self._result("revise", offer())  # type: ignore[return-value]

    async def publish_tutor_offer(self, *_args: object) -> TutorOffer:
        return self._result("publish", offer())  # type: ignore[return-value]

    async def retire_tutor_offer(self, *_args: object) -> TutorOffer:
        return self._result("retire", offer(TutorOfferStatus.RETIRED, 3))  # type: ignore[return-value]

    async def request_booking(self, *_args: object, **_kwargs: object) -> Booking:
        return self._result("request", booking())  # type: ignore[return-value]

    async def list_own_bookings(
        self, _principal: object, _credential: object, role: BookingParticipantRole
    ) -> list[Booking]:
        self.calls.append(f"list_{role.value}")
        return [booking()]

    async def read_booking(self, *_args: object) -> Booking:
        return self._result("read_booking", booking())  # type: ignore[return-value]

    async def accept_booking(
        self, _principal: object, _credential: object, command: BookingTransitionCommand
    ) -> Booking:
        del command
        return self._result("accept", booking(BookingStatus.ACCEPTED, 2))  # type: ignore[return-value]

    async def decline_booking(self, *_args: object) -> Booking:
        return self._result("decline", booking())  # type: ignore[return-value]

    async def cancel_booking(self, *_args: object) -> Booking:
        return self._result("cancel", booking())  # type: ignore[return-value]


class FakeProfileService:
    pass


async def healthy() -> str:
    return "head"


def app_for(service: FakeBookingService) -> FastAPI:
    settings = Settings(**BASE, profile="test")  # type: ignore[arg-type]
    return create_app(
        settings,
        check_database=healthy,
        auth_service=FakeAuthService(),  # type: ignore[arg-type]
        profile_service=FakeProfileService(),  # type: ignore[arg-type]
        booking_service=service,  # type: ignore[arg-type]
    )


def assert_error(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    payload = response.json()
    assert payload["error"]["code"] == code
    assert response.headers["Cache-Control"] == "no-store"
    assert payload["error"]["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.asyncio
async def test_booking_routes_happy_path_redacts_internal_accounts() -> None:
    service = FakeBookingService()
    app = app_for(service)
    headers = {"Idempotency-Key": OPERATION_ID}
    offer_body = {
        "title": " Circuit   analysis ",
        "starts_at": "2027-01-15T10:00:00+00:00",
        "time_zone": "UTC",
        "duration_minutes": 60,
        "minimum_notice_minutes": 30,
        "payment_mode": "FREE",
        "amount_minor": 0,
        "currency": None,
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        created = await client.post("/api/v1/tutor-offers", json=offer_body, headers=headers)
        revised = await client.put(
            f"/api/v1/tutor-offers/{OFFER_ID}",
            json={**offer_body, "expected_version": 1},
            headers=headers,
        )
        requested = await client.post(
            f"/api/v1/tutor-offers/{OFFER_ID}/bookings",
            json={"observed_offer_version": 2, "student_time_zone": "Europe/Kyiv"},
            headers=headers,
        )
        accepted = await client.post(
            f"/api/v1/bookings/{BOOKING_ID}/accept",
            json={"expected_version": 1},
            headers=headers,
        )
        read = await client.get(f"/api/v1/bookings/{BOOKING_ID}")

    assert created.status_code == 201
    assert revised.status_code == 200
    assert requested.status_code == 201
    assert accepted.status_code == read.status_code == 200
    assert accepted.json()["snapshot"] == read.json()["snapshot"]
    for response in (created, revised, requested, accepted, read):
        assert response.headers["Cache-Control"] == "no-store"
        assert "account_id" not in response.text
        assert str(TUTOR_ID) not in response.text
        assert str(STUDENT_ID) not in response.text


@pytest.mark.asyncio
async def test_booking_mutation_precedence_auth_resource_capability_then_body() -> None:
    service = FakeBookingService()
    app = app_for(service)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        anonymous = await client.put(
            f"/api/v1/tutor-offers/{OFFER_ID}",
            content=b'{"title":',
            headers={"Content-Type": "application/json"},
        )
        anonymous_invalid_path = await client.get("/api/v1/tutor-offers/not-a-uuid")
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        invalid_path = await client.get("/api/v1/tutor-offers/not-a-uuid")
        service.preflight_failure = TutorOfferNotFoundError()
        hidden = await client.put(
            f"/api/v1/tutor-offers/{OFFER_ID}",
            content=b'{"title":',
            headers={"Content-Type": "application/json"},
        )
        service.preflight_failure = CapabilityRequiredError()
        forbidden = await client.put(
            f"/api/v1/tutor-offers/{OFFER_ID}",
            content=b'{"title":',
            headers={"Content-Type": "application/json"},
        )
        service.preflight_failure = None
        malformed = await client.put(
            f"/api/v1/tutor-offers/{OFFER_ID}",
            content=b'{"title":',
            headers={"Content-Type": "application/json"},
        )

    assert_error(anonymous, 401, "authentication_required")
    assert_error(anonymous_invalid_path, 401, "authentication_required")
    assert_error(invalid_path, 422, "invalid_request")
    assert_error(hidden, 404, "tutor_offer_not_found")
    assert_error(forbidden, 403, "capability_required")
    assert_error(malformed, 422, "invalid_request")
    assert service.calls == ["preflight_offer", "preflight_offer", "preflight_offer"]


@pytest.mark.asyncio
async def test_booking_strict_body_canonical_idempotency_and_conflict_mapping() -> None:
    service = FakeBookingService()
    app = app_for(service)
    path = f"/api/v1/bookings/{BOOKING_ID}/accept"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        unknown = await client.post(
            path,
            json={"expected_version": 1, "account_id": str(STUDENT_ID)},
            headers={"Idempotency-Key": OPERATION_ID},
        )
        missing_key = await client.post(path, json={"expected_version": 1})
        noncanonical = await client.post(
            path,
            json={"expected_version": 1},
            headers={"Idempotency-Key": OPERATION_ID.upper()},
        )
        service.failure = VersionConflictError()
        conflict = await client.post(
            path,
            json={"expected_version": 1},
            headers={"Idempotency-Key": OPERATION_ID},
        )
        numeric_start = await client.post(
            "/api/v1/tutor-offers",
            json={
                "title": "Numeric timestamp",
                "starts_at": 1_800_000_000,
                "time_zone": "UTC",
                "duration_minutes": 60,
                "minimum_notice_minutes": 0,
                "payment_mode": "FREE",
                "amount_minor": 0,
                "currency": None,
            },
            headers={"Idempotency-Key": OPERATION_ID},
        )
        invalid_rfc3339 = []
        for starts_at in (
            "2027-01-15T10:00+00:00",
            "2027-01-15 10:00:00+00:00",
        ):
            invalid_rfc3339.append(
                await client.post(
                    "/api/v1/tutor-offers",
                    json={
                        "title": "Invalid timestamp",
                        "starts_at": starts_at,
                        "time_zone": "UTC",
                        "duration_minutes": 60,
                        "minimum_notice_minutes": 0,
                        "payment_mode": "FREE",
                        "amount_minor": 0,
                        "currency": None,
                    },
                    headers={"Idempotency-Key": OPERATION_ID},
                )
            )

    assert_error(unknown, 422, "invalid_request")
    assert_error(missing_key, 422, "invalid_request")
    assert_error(noncanonical, 422, "invalid_request")
    assert_error(conflict, 409, "version_conflict")
    assert_error(numeric_start, 422, "invalid_request")
    for response in invalid_rfc3339:
        assert_error(response, 422, "invalid_request")


@pytest.mark.asyncio
async def test_booking_read_and_list_denials_and_role_validation() -> None:
    service = FakeBookingService()
    app = app_for(service)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        service.failure = BookingNotFoundError()
        hidden = await client.get(f"/api/v1/bookings/{BOOKING_ID}")
        service.failure = None
        invalid_role = await client.get("/api/v1/bookings/me?role=owner")
        own = await client.get("/api/v1/bookings/me?role=student")

    assert_error(hidden, 404, "booking_not_found")
    assert_error(invalid_role, 422, "invalid_request")
    assert own.status_code == 200
    assert "account_id" not in own.text
    assert service.calls[-1] == "list_student"


def test_booking_openapi_describes_all_private_routes_and_headers() -> None:
    schema = app_for(FakeBookingService()).openapi()
    mutation_paths = {
        "/api/v1/tutor-offers": "post",
        "/api/v1/tutor-offers/{offer_id}": "put",
        "/api/v1/tutor-offers/{offer_id}/publish": "post",
        "/api/v1/tutor-offers/{offer_id}/retire": "post",
        "/api/v1/tutor-offers/{offer_id}/bookings": "post",
        "/api/v1/bookings/{booking_id}/accept": "post",
        "/api/v1/bookings/{booking_id}/decline": "post",
        "/api/v1/bookings/{booking_id}/cancel": "post",
    }
    for path, method in mutation_paths.items():
        operation = schema["paths"][path][method]
        assert operation["requestBody"]["required"] is True
        assert any(
            parameter["name"] == "Idempotency-Key" and parameter["required"] is True
            for parameter in operation["parameters"]
        )
    assert {
        "/api/v1/tutor-offers/me",
        "/api/v1/bookings/me",
        "/api/v1/bookings/{booking_id}",
    } <= set(schema["paths"])
    serialized = str(schema["components"]["schemas"]["BookingResponse"])
    assert "account_id" not in serialized
    assert "#/$defs/" not in str(schema)


@pytest.mark.asyncio
async def test_booking_cors_preflight_allows_idempotency_key() -> None:
    app = app_for(FakeBookingService())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/v1/tutor-offers",
            headers={
                "Origin": "http://127.0.0.1:4321",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key,x-request-id",
            },
        )
    assert response.status_code == 200
    assert "idempotency-key" in response.headers["Access-Control-Allow-Headers"].lower()
