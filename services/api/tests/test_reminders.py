from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from typing import Any, cast
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.application.reminders import ReminderSettingsService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.reminder import ReminderSettings, ReminderSettingsValidationError
from electro_tutor_api.errors import AuthenticationRequiredError
from electro_tutor_api.main import create_app

ACCOUNT = UUID("11111111-1111-4111-8111-111111111111")
IDENTITY = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 9, 29, tzinfo=UTC)
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


class FakeRepository:
    def __init__(self) -> None:
        self.settings = ReminderSettings()
        self.calls = 0

    async def get(self) -> ReminderSettings:
        self.calls += 1
        return self.settings

    async def put(self, settings: ReminderSettings) -> ReminderSettings:
        self.calls += 1
        self.settings = settings
        return settings


class FakeUnit:
    def __init__(self, actor: Principal) -> None:
        self.session_principal = actor
        self.reminder_settings = FakeRepository()

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


def test_settings_validate_iana_zone_and_quiet_range() -> None:
    ReminderSettings(
        "Europe/Kyiv", quiet_hours_enabled=True, quiet_hours_start=time(22), quiet_hours_end=time(8)
    ).validate()
    for invalid in (
        ReminderSettings("Not/AZone"),
        ReminderSettings("Europe/Kyiv", quiet_hours_enabled=True),
        ReminderSettings("Europe/Kyiv", quiet_hours_start=time(22)),
        ReminderSettings("Europe/Kyiv", quiet_hours_start=time(8), quiet_hours_end=time(8)),
    ):
        with pytest.raises(ReminderSettingsValidationError):
            invalid.validate()


@pytest.mark.asyncio
async def test_settings_reject_unbound_principal_before_repository_call() -> None:
    unit = FakeUnit(principal(UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")))
    service = ReminderSettingsService(lambda _credential: cast(Any, unit))
    with pytest.raises(AuthenticationRequiredError):
        await service.get(principal(), SessionCredential.from_token("valid"))
    assert unit.reminder_settings.calls == 0


@pytest.mark.asyncio
async def test_settings_http_owner_defaults_validation_and_origin() -> None:
    unit = FakeUnit(principal())
    service = ReminderSettingsService(lambda _credential: cast(Any, unit))
    settings = Settings(profile="test", **BASE)  # type: ignore[arg-type]
    app = create_app(
        settings,
        check_database=healthy,
        auth_service=cast(Any, FakeAuth()),
        profile_service=cast(Any, object()),
        reminder_settings_service=service,
    )
    payload = {
        "time_zone": "Europe/Kyiv",
        "remind_24h": True,
        "remind_1h": False,
        "remind_15m": True,
        "quiet_hours_enabled": True,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        anonymous = await client.get("/api/v1/reminder-settings/me")
        client.cookies.set(settings.session_cookie_name, "valid", path="/api/v1")
        defaults = await client.get("/api/v1/reminder-settings/me")
        denied = await client.put("/api/v1/reminder-settings/me", json=payload)
        invalid_time = await client.put(
            "/api/v1/reminder-settings/me",
            json={**payload, "quiet_hours_start": "25:00"},
            headers={"Origin": settings.allowed_web_origins[0]},
        )
        invalid_zone = await client.put(
            "/api/v1/reminder-settings/me",
            json={**payload, "time_zone": "Not/AZone"},
            headers={"Origin": settings.allowed_web_origins[0]},
        )
        saved = await client.put(
            "/api/v1/reminder-settings/me",
            json=payload,
            headers={"Origin": settings.allowed_web_origins[0]},
        )
        persisted = await client.get("/api/v1/reminder-settings/me")
    assert anonymous.status_code == 401
    assert defaults.json() == {
        "time_zone": None,
        "remind_24h": True,
        "remind_1h": True,
        "remind_15m": False,
        "quiet_hours_enabled": False,
        "quiet_hours_start": None,
        "quiet_hours_end": None,
    }
    assert denied.status_code == 403
    assert invalid_time.status_code == 422
    assert invalid_zone.status_code == 422
    assert saved.status_code == 200 and saved.json() == payload
    assert persisted.json() == payload
    assert unit.reminder_settings.calls == 3
