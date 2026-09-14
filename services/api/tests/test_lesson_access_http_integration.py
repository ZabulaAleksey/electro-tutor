from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import create_async_engine
from test_booking_http_integration import issue_booking_grant, seed_session, terms_payload

from electro_tutor_api.config import Settings
from electro_tutor_api.main import create_app

PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
MIGRATION_URL = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)


def integration_settings() -> Settings:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    auth = os.getenv("ET_AUTH_DATABASE_URL")
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if (runtime, auth, migration) != (
        f"postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:{PORT}/electro_tutor_test",
        f"postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@127.0.0.1:{PORT}/electro_tutor_test",
        MIGRATION_URL,
    ):
        pytest.skip("lesson access HTTP tests require exact disposable PostgreSQL roles")
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("lesson access HTTP tests require exact disposable DB consent")
    return Settings(profile="test", runtime_database_url=runtime, auth_database_url=auth)


def assert_error(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_lesson_access_http_real_participants_foreign_and_revoked() -> None:
    settings = integration_settings()
    inspector = create_async_engine(MIGRATION_URL)
    token_tutor = f"lesson-access-http-tutor-{uuid4()}"
    token_student = f"lesson-access-http-student-{uuid4()}"
    token_foreign = f"lesson-access-http-foreign-{uuid4()}"
    try:
        tutor_id = await seed_session(inspector, token_tutor)
        await seed_session(inspector, token_student)
        await seed_session(inspector, token_foreign)
        await issue_booking_grant(inspector, tutor_id)
        app = create_app(settings)
        starts_at = (datetime.now(UTC) + timedelta(days=3)).astimezone(ZoneInfo("Europe/Kyiv"))
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                created = await client.post(
                    "/api/v1/tutor-offers",
                    json=terms_payload(starts_at, title="Access HTTP"),
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert created.status_code == 201, created.text
                offer = created.json()
                published = await client.post(
                    f"/api/v1/tutor-offers/{offer['id']}/publish",
                    json={"expected_version": offer["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert published.status_code == 200

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                requested = await client.post(
                    f"/api/v1/tutor-offers/{offer['id']}/bookings",
                    json={
                        "observed_offer_version": published.json()["version"],
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert requested.status_code == 201
                booking = requested.json()

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                accepted = await client.post(
                    f"/api/v1/bookings/{booking['id']}/accept",
                    json={"expected_version": booking["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert accepted.status_code == 200
                accepted_body = accepted.json()

                tutor_access = await client.get(f"/api/v1/bookings/{booking['id']}/lesson-access")
                assert tutor_access.status_code == 200
                assert tutor_access.json()["participant_role"] == "tutor"
                assert "account_id" not in tutor_access.text

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                student_access = await client.get(f"/api/v1/bookings/{booking['id']}/lesson-access")
                assert student_access.status_code == 200
                assert student_access.json()["participant_role"] == "student"
                assert student_access.json()["capabilities"] == ["LESSON_SHELL_ENTER"]

                client.cookies.set(settings.session_cookie_name, token_foreign, path="/api/v1")
                foreign_access = await client.get(f"/api/v1/bookings/{booking['id']}/lesson-access")
                assert_error(foreign_access, 404, "booking_not_found")

                client.cookies.delete(settings.session_cookie_name)
                anonymous = await client.get(f"/api/v1/bookings/{booking['id']}/lesson-access")
                assert_error(anonymous, 401, "authentication_required")

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                malformed = await client.get("/api/v1/bookings/not-a-uuid/lesson-access")
                assert_error(malformed, 422, "invalid_request")

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                cancelled = await client.post(
                    f"/api/v1/bookings/{booking['id']}/cancel",
                    json={"expected_version": accepted_body["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert cancelled.status_code == 200

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                revoked = await client.get(f"/api/v1/bookings/{booking['id']}/lesson-access")
                assert_error(revoked, 403, "lesson_access_revoked")
    finally:
        await inspector.dispose()
