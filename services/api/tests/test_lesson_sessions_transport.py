from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_session import LessonSession
from electro_tutor_api.main import create_app

BASE = {
    "runtime_database_url": "postgresql+asyncpg://electro_tutor_runtime:local-only@127.0.0.1:55432/electro_tutor",
    "auth_database_url": "postgresql+asyncpg://electro_tutor_auth_runtime:local-only@127.0.0.1:55432/electro_tutor",
}
ACCOUNT = uuid4()
IDENTITY = uuid4()
BOOKING = uuid4()
SESSION = uuid4()


class FakeAuth:
    async def principal(self, token: str | None) -> Principal | None:
        if token != "valid":
            return None
        return Principal(
            ACCOUNT,
            IDENTITY,
            "https://issuer.invalid",
            "subject",
            None,
            datetime(2030, 1, 1, tzinfo=UTC),
        )

    def session_credential(self, token: str | None) -> SessionCredential | None:
        return SessionCredential.from_token(token) if token == "valid" else None


class FakeSessionService:
    def __init__(self) -> None:
        self.writes: list[tuple[str, UUID, int | None, UUID]] = []

    async def mutate(
        self,
        _principal: Principal,
        _credential: SessionCredential,
        *,
        action: str,
        resource_id: UUID,
        expected_version: int | None,
        key: UUID,
        request_id: str | None,
    ) -> LessonSession:
        self.writes.append((action, resource_id, expected_version, key))
        return _session()

    async def read(
        self, _principal: Principal, _credential: SessionCredential, _session_id: UUID
    ) -> LessonSession:
        return _session()


def _session() -> LessonSession:
    return LessonSession(
        SESSION,
        BOOKING,
        "READY",
        "READY",
        1,
        "student",
        ("SESSION_VIEW",),
        datetime(2026, 9, 15, tzinfo=UTC),
        None,
        None,
        None,
    )


@pytest.mark.asyncio
async def test_session_private_dto_and_write_origin_validation() -> None:
    settings = Settings(profile="test", **BASE)
    service = FakeSessionService()
    app = create_app(
        settings,
        check_database=lambda: None,
        auth_service=FakeAuth(),
        profile_service=object(),
        lesson_session_service=service,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set(settings.session_cookie_name, "valid", path="/api/v1")
        route = f"/api/v1/bookings/{BOOKING}/lesson-session"
        key = str(uuid4())
        denied = [
            ({"Idempotency-Key": key}, {}, 403),
            ({"Idempotency-Key": key, "Origin": "null"}, {}, 403),
            ({"Idempotency-Key": key, "Origin": "https://foreign.invalid"}, {}, 403),
            ({"Idempotency-Key": key, "Origin": settings.allowed_web_origins[0]}, "form", 422),
            ({"Origin": settings.allowed_web_origins[0]}, {}, 422),
            ({"Idempotency-Key": "invalid", "Origin": settings.allowed_web_origins[0]}, {}, 422),
        ]
        for headers, body, status in denied:
            response = await (
                client.post(
                    route,
                    content="x=y",
                    headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
                )
                if body == "form"
                else client.post(route, json=body, headers=headers)
            )
            assert response.status_code == status, response.text
        assert service.writes == []
        created = await client.post(
            route,
            json={},
            headers={"Origin": settings.allowed_web_origins[0], "Idempotency-Key": key},
        )
        assert created.status_code == 200, created.text
        assert set(created.json()) == {
            "id",
            "booking_id",
            "status",
            "effective_status",
            "version",
            "participant_role",
            "capabilities",
            "created_at",
            "started_at",
            "ended_at",
            "cancelled_at",
            "current_topic_id",
        }
        assert created.json()["current_topic_id"] is None
        assert created.headers["Cache-Control"] == "no-store"
        assert service.writes == [("create", BOOKING, None, UUID(key))]
        read = await client.get(f"/api/v1/lesson-sessions/{SESSION}")
        assert read.status_code == 200
