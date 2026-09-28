from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.application.notifications import NotificationService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.notification import Notification
from electro_tutor_api.errors import AuthenticationRequiredError
from electro_tutor_api.main import create_app

ACCOUNT = UUID("11111111-1111-4111-8111-111111111111")
IDENTITY = UUID("22222222-2222-4222-8222-222222222222")
BOOKING = UUID("33333333-3333-4333-8333-333333333333")
NOTIFICATION = UUID("44444444-4444-4444-8444-444444444444")
NOW = datetime(2026, 9, 28, tzinfo=UTC)
BASE = {
    "runtime_database_url": (
        "postgresql+asyncpg://electro_tutor_runtime:test@127.0.0.1:55432/electro_tutor_test"
    ),
    "auth_database_url": (
        "postgresql+asyncpg://electro_tutor_auth_runtime:test@127.0.0.1:55432/electro_tutor_test"
    ),
}


def principal(account: UUID = ACCOUNT) -> Principal:
    return Principal(
        account, IDENTITY, "https://issuer.invalid", "subject", None, NOW + timedelta(hours=1)
    )


ITEM = Notification(NOTIFICATION, "booking.accepted", BOOKING, NOW, NOW + timedelta(days=30), None)


class FakeRepository:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    async def list(self, *, limit: int, offset: int) -> list[Notification]:
        self.calls.append(("list", (limit, offset)))
        return [ITEM]

    async def unread_count(self) -> int:
        self.calls.append(("count", None))
        return 1

    async def mark_read(self, notification_id: UUID) -> bool:
        self.calls.append(("read", notification_id))
        return notification_id == NOTIFICATION


class FakeUnit:
    def __init__(self, actor: Principal) -> None:
        self.session_principal = actor
        self.notifications = FakeRepository()

    async def __aenter__(self) -> FakeUnit:
        return self

    async def __aexit__(self, *_args: object) -> bool:
        return False


class FakeAuth:
    async def principal(self, token: str | None) -> Principal | None:
        return principal() if token == "valid" else None

    def session_credential(self, token: str | None) -> SessionCredential | None:
        return SessionCredential.from_token(token) if token == "valid" else None


async def healthy() -> str:
    return "head"


@pytest.mark.asyncio
async def test_service_rejects_unbound_account_before_any_repository_call() -> None:
    unit = FakeUnit(principal(UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")))
    service = NotificationService(lambda _credential: cast(Any, unit))
    with pytest.raises(AuthenticationRequiredError):
        await service.list(principal(), SessionCredential.from_token("valid"), limit=20, offset=0)
    assert unit.notifications.calls == []


@pytest.mark.asyncio
async def test_private_notification_http_contract_and_origin_guard() -> None:
    unit = FakeUnit(principal())
    service = NotificationService(lambda _credential: cast(Any, unit))
    settings = Settings(profile="test", **BASE)  # type: ignore[arg-type]
    app = create_app(
        settings,
        check_database=healthy,
        auth_service=cast(Any, FakeAuth()),
        profile_service=cast(Any, object()),
        notification_service=service,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/v1/notifications")).status_code == 401
        client.cookies.set(settings.session_cookie_name, "valid", path="/api/v1")
        listed = await client.get("/api/v1/notifications?limit=20&offset=0")
        counted = await client.get("/api/v1/notifications/unread-count")
        invalid_page = await client.get("/api/v1/notifications?limit=51")
        denied = await client.post(f"/api/v1/notifications/{NOTIFICATION}/read")
        invalid_id = await client.post(
            "/api/v1/notifications/not-a-uuid/read",
            headers={"Origin": settings.allowed_web_origins[0]},
        )
        unknown = await client.post(
            f"/api/v1/notifications/{BOOKING}/read",
            headers={"Origin": settings.allowed_web_origins[0]},
        )
        marked = await client.post(
            f"/api/v1/notifications/{NOTIFICATION}/read",
            headers={"Origin": settings.allowed_web_origins[0]},
        )
    assert listed.status_code == 200
    assert listed.headers["Cache-Control"] == "no-store"
    assert listed.json() == {
        "items": [
            {
                "id": str(NOTIFICATION),
                "type": "booking.accepted",
                "booking_id": str(BOOKING),
                "created_at": "2026-09-28T00:00:00Z",
                "expires_at": "2026-10-28T00:00:00Z",
                "read_at": None,
            }
        ],
        "limit": 20,
        "offset": 0,
    }
    assert "account_id" not in listed.text
    assert counted.json() == {"count": 1}
    assert invalid_page.status_code == 422
    assert denied.status_code == 403
    assert invalid_id.status_code == 422
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "notification_not_found"
    assert marked.status_code == 204
    assert unit.notifications.calls == [
        ("list", (20, 0)),
        ("count", None),
        ("read", BOOKING),
        ("read", NOTIFICATION),
    ]
