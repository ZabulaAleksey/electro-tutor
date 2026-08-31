import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.config import Settings
from electro_tutor_api.errors import ServiceDependencyError
from electro_tutor_api.main import create_app

BASE = {
    "runtime_database_url": "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor",
}


@pytest.fixture
def app():
    return create_app(Settings(**BASE, profile="test"))


@pytest.mark.asyncio
async def test_live_has_request_id_and_no_store(app, caplog) -> None:
    caplog.set_level("INFO", logger="electro_tutor_api.request")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/live", headers={"X-Request-ID": "test-01"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-01"
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {"status": "ok"}
    assert "runtime-password" not in caplog.text


@pytest.mark.asyncio
async def test_invalid_request_id_is_replaced(app) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/live", headers={"X-Request-ID": "bad value"})
    assert response.status_code == 200
    assert "\n" not in response.headers["X-Request-ID"]


@pytest.mark.asyncio
async def test_oversized_request_is_rejected_with_bounded_error(app) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/health/live",
            content=b"x" * 65_537,
            headers={"X-Request-ID": "oversized-01"},
        )
    assert response.status_code == 413
    assert response.json()["error"] == {
        "code": "request_too_large",
        "message": "Request body is too large.",
        "request_id": "oversized-01",
        "details": {},
    }
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.asyncio
async def test_chunked_oversized_request_is_rejected(app) -> None:
    async def chunks():
        yield b"x" * 40_000
        yield b"y" * 40_000

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/health/live", content=chunks())
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"


@pytest.mark.asyncio
async def test_cors_is_default_deny(app) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/health/live", headers={"Origin": "https://untrusted.example"}
        )
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_ready_reports_redacted_database_failure(app) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "password" not in response.text


@pytest.mark.asyncio
async def test_ready_reports_schema_drift() -> None:
    async def drift() -> str:
        raise ServiceDependencyError("schema_mismatch", "schema")

    app = create_app(Settings(**BASE, profile="test"), check_database=drift)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "schema_mismatch",
        "message": "Service is not ready.",
        "request_id": response.headers["X-Request-ID"],
        "details": {"dependency": "schema"},
    }


def test_docs_are_disabled_outside_explicit_local_profile() -> None:
    app = create_app(Settings(**BASE, profile="ci"))
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


def test_openapi_contains_versioned_health_contract() -> None:
    app = create_app(Settings(**BASE, profile="local", docs_enabled=True))
    schema = app.openapi()
    assert schema["openapi"].startswith("3.")
    assert "/api/v1/health/live" in schema["paths"]
    assert "/api/v1/health/ready" in schema["paths"]
