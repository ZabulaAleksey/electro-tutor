from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient, Response

from electro_tutor_api.application.auth import AuthFlowError, LoginComplete, LoginStart
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_access import (
    LessonAccessCapability,
    LessonAccessDecision,
    LessonAccessParticipantRole,
    LessonAccessStatus,
)
from electro_tutor_api.errors import (
    BookingNotFoundError,
    LessonAccessExpiredError,
    LessonAccessNotYetValidError,
    LessonAccessPolicyUnavailableError,
    LessonAccessRevokedError,
    LessonAccessUnavailableError,
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
BOOKING_ID = UUID("55555555-5555-4555-8555-555555555555")
NONCANONICAL_UUID = UUID("abcdefab-cdef-4abc-8def-abcdefabcdef")
ACCOUNT_ID = UUID("11111111-1111-4111-8111-111111111111")
IDENTITY_ID = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 9, 14, 10, tzinfo=UTC)


class FakeAuthService:
    async def principal(self, session_token: str | None) -> Principal | None:
        if session_token != "valid-session":
            return None
        return Principal(
            account_id=ACCOUNT_ID,
            identity_id=IDENTITY_ID,
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


class FakeAccessService:
    def __init__(self) -> None:
        self.failure: Exception | None = None
        self.calls: list[UUID] = []

    async def authorize(
        self,
        _principal: Principal,
        _credential: SessionCredential,
        booking_id: UUID,
    ) -> LessonAccessDecision:
        self.calls.append(booking_id)
        if self.failure is not None:
            raise self.failure
        return LessonAccessDecision(
            grant_id=UUID("66666666-6666-4666-8666-666666666666"),
            booking_id=booking_id,
            status=LessonAccessStatus.ACTIVE,
            participant_role=LessonAccessParticipantRole.STUDENT,
            valid_from=NOW - timedelta(minutes=15),
            valid_until=NOW + timedelta(hours=1),
            capabilities=(LessonAccessCapability.LESSON_SHELL_ENTER,),
        )


class FakeProfileService:
    pass


class FakeBookingService:
    pass


async def healthy() -> str:
    return "head"


def app_for(service: FakeAccessService):
    settings = Settings(**BASE, profile="test")  # type: ignore[arg-type]
    return create_app(
        settings,
        check_database=healthy,
        auth_service=FakeAuthService(),  # type: ignore[arg-type]
        profile_service=FakeProfileService(),  # type: ignore[arg-type]
        booking_service=FakeBookingService(),  # type: ignore[arg-type]
        lesson_access_service=service,  # type: ignore[arg-type]
    )


def assert_error(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    payload = response.json()
    assert payload["error"]["code"] == code
    assert response.headers["Cache-Control"] == "no-store"
    assert payload["error"]["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.asyncio
async def test_lesson_access_active_response_is_private_and_server_derived() -> None:
    service = FakeAccessService()
    app = app_for(service)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        response = await client.get(f"/api/v1/bookings/{BOOKING_ID}/lesson-access")

    assert response.status_code == 200
    assert response.json() == {
        "grant_id": "66666666-6666-4666-8666-666666666666",
        "booking_id": str(BOOKING_ID),
        "status": "ACTIVE",
        "participant_role": "student",
        "valid_from": "2026-09-14T09:45:00Z",
        "valid_until": "2026-09-14T11:00:00Z",
        "capabilities": ["LESSON_SHELL_ENTER"],
    }
    assert "account_id" not in response.text
    assert response.headers["Cache-Control"] == "no-store"
    assert service.calls == [BOOKING_ID]


@pytest.mark.asyncio
async def test_lesson_access_precedence_auth_then_canonical_uuid() -> None:
    service = FakeAccessService()
    app = app_for(service)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        anonymous = await client.get("/api/v1/bookings/not-a-uuid/lesson-access")
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        malformed = await client.get("/api/v1/bookings/not-a-uuid/lesson-access")
        noncanonical = await client.get(
            f"/api/v1/bookings/{str(NONCANONICAL_UUID).upper()}/lesson-access"
        )

    assert_error(anonymous, 401, "authentication_required")
    assert_error(malformed, 422, "invalid_request")
    assert_error(noncanonical, 422, "invalid_request")
    assert service.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "status", "code"),
    [
        (BookingNotFoundError(), 404, "booking_not_found"),
        (LessonAccessNotYetValidError(), 403, "lesson_access_not_yet_valid"),
        (LessonAccessExpiredError(), 403, "lesson_access_expired"),
        (LessonAccessRevokedError(), 403, "lesson_access_revoked"),
        (LessonAccessUnavailableError(), 403, "lesson_access_unavailable"),
        (LessonAccessPolicyUnavailableError(), 503, "lesson_access_policy_unavailable"),
    ],
)
async def test_lesson_access_errors_keep_stable_private_contract(
    failure: Exception, status: int, code: str
) -> None:
    service = FakeAccessService()
    service.failure = failure
    app = app_for(service)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        response = await client.get(f"/api/v1/bookings/{BOOKING_ID}/lesson-access")

    assert_error(response, status, code)
    assert "database" not in response.text.lower()
    assert "account_id" not in response.text


def test_lesson_access_openapi_exposes_only_private_get_route() -> None:
    schema = app_for(FakeAccessService()).openapi()
    path = "/api/v1/bookings/{booking_id}/lesson-access"
    assert set(schema["paths"][path]) == {"get"}
    assert schema["paths"][path]["get"]["responses"]["200"]["content"]
