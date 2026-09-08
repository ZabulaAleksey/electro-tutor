from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.application.auth import AuthFlowError, LoginComplete, LoginStart
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.main import create_app

BASE = {
    "runtime_database_url": (
        "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor"
    ),
}


class FakeAuthService:
    async def begin_login(self, return_to: str) -> LoginStart:
        if return_to != "http://127.0.0.1:4322/ru/account/":
            raise AuthFlowError("invalid_return_url", "Login return URL is not allowed.")
        return LoginStart(
            authorization_url="http://127.0.0.1:58081/realms/electro-tutor-dev/auth",
            transaction_id=UUID("11111111-1111-4111-8111-111111111111"),
        )

    async def complete_login(self, **kwargs: object) -> LoginComplete:
        if kwargs.get("transaction_id") is None or kwargs.get("state") is None:
            raise AuthFlowError("invalid_auth_transaction", "Login transaction is missing.")
        return LoginComplete(
            return_to="http://127.0.0.1:4322/ru/account/",
            session_token="new-opaque-session",
        )

    async def principal(self, session_token: str | None) -> Principal | None:
        if session_token != "valid-session":
            return None
        return Principal(
            account_id=UUID("11111111-1111-4111-8111-111111111111"),
            identity_id=UUID("22222222-2222-4222-8222-222222222222"),
            issuer="http://127.0.0.1:58081/realms/electro-tutor-dev",
            subject="stable-subject",
            email="test@invalid.example",
            session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )

    async def logout(self, session_token: str | None, post_logout_redirect_uri: str) -> str:
        assert session_token == "valid-session"
        assert post_logout_redirect_uri == "http://127.0.0.1:4322/"
        return "http://127.0.0.1:58081/realms/electro-tutor-dev/logout"


@pytest.fixture
def app():
    return create_app(  # type: ignore[arg-type]
        Settings(**BASE, profile="test"), auth_service=FakeAuthService()
    )


@pytest.mark.asyncio
async def test_login_cookie_is_http_only_lax_and_callback_scoped(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
    ) as client:
        response = await client.get(
            "/api/v1/auth/login",
            params={"return_to": "http://127.0.0.1:4322/ru/account/"},
            follow_redirects=False,
        )
    assert response.status_code == 302
    cookie = response.headers["set-cookie"]
    assert "et_auth_tx=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/api/v1/auth/callback" in cookie
    assert "Secure" not in cookie


@pytest.mark.asyncio
async def test_callback_without_originating_transaction_is_rejected(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
    ) as client:
        response = await client.get(
            "/api/v1/auth/callback", params={"code": "code", "state": "state"}
        )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_auth_transaction"


@pytest.mark.asyncio
async def test_me_requires_valid_tutor_session(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
    ) as client:
        anonymous = await client.get("/api/v1/me")
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        authenticated = await client.get("/api/v1/me")
    assert anonymous.status_code == 401
    assert authenticated.status_code == 200
    assert authenticated.json()["subject"] == "stable-subject"
    assert "account_id" not in authenticated.json()


@pytest.mark.asyncio
async def test_logout_rejects_cross_origin_and_clears_tutor_cookie(app) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000"
    ) as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        rejected = await client.post(
            "/api/v1/auth/logout",
            params={"post_logout_redirect_uri": "http://127.0.0.1:4322/"},
            headers={"Origin": "https://attacker.example"},
        )
        response = await client.post(
            "/api/v1/auth/logout",
            params={"post_logout_redirect_uri": "http://127.0.0.1:4322/"},
            headers={"Origin": "http://127.0.0.1:4322"},
            follow_redirects=False,
        )
    assert rejected.status_code == 403
    assert response.status_code == 303
    assert response.headers["location"].startswith("http://127.0.0.1:58081/")
    assert 'et_session=""' in response.headers["set-cookie"]
