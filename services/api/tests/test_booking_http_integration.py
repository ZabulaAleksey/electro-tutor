from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import SessionCredential
from electro_tutor_api.main import create_app

PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
RUNTIME_URL = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
AUTH_URL = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
MIGRATION_URL = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)


def integration_settings() -> Settings:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    auth = os.getenv("ET_AUTH_DATABASE_URL")
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if (runtime, auth, migration) != (RUNTIME_URL, AUTH_URL, MIGRATION_URL):
        pytest.skip("booking HTTP tests require exact disposable PostgreSQL roles")
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("booking HTTP tests require exact disposable DB consent")
    return Settings(profile="test", runtime_database_url=runtime, auth_database_url=auth)


async def seed_session(engine: AsyncEngine, token: str) -> UUID:
    account_id = uuid4()
    identity_id = uuid4()
    credential = SessionCredential.from_token(token)
    async with engine.begin() as connection:
        await connection.execute(text("INSERT INTO accounts(id) VALUES (:id)"), {"id": account_id})
        await connection.execute(
            text(
                "INSERT INTO external_identities(id,account_id,issuer,subject,email) "
                "VALUES (:id,:account,:issuer,:subject,NULL)"
            ),
            {
                "id": identity_id,
                "account": account_id,
                "issuer": f"https://booking-http-{uuid4()}.invalid",
                "subject": str(uuid4()),
            },
        )
        await connection.execute(
            text(
                "INSERT INTO application_sessions(token_digest,identity_id,expires_at) "
                "VALUES (:digest,:identity,:expires)"
            ),
            {
                "digest": credential.digest,
                "identity": identity_id,
                "expires": datetime.now(UTC) + timedelta(minutes=15),
            },
        )
    return account_id


async def issue_booking_grant(engine: AsyncEngine, account_id: UUID) -> UUID:
    grant_id = uuid4()
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                "issue_operation_id) VALUES (:id,:account,'TUTOR_BOOKING_MANAGE_OWN',"
                "'account',:account,'service','tutor-provisioner',:operation)"
            ),
            {"id": grant_id, "account": account_id, "operation": uuid4()},
        )
    return grant_id


async def revoke_booking_grant(engine: AsyncEngine, grant_id: UUID) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE capability_grants SET revoked_at=CURRENT_TIMESTAMP,"
                "revoked_by_actor_type='service',revoked_by_actor_id='tutor-provisioner',"
                "revoke_operation_id=:operation WHERE id=:grant"
            ),
            {"operation": uuid4(), "grant": grant_id},
        )


def assert_error(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    assert response.headers["Cache-Control"] == "no-store"


def terms_payload(starts_at: datetime, *, title: str) -> dict[str, object]:
    return {
        "title": title,
        "starts_at": starts_at.isoformat(),
        "time_zone": "Europe/Kyiv",
        "duration_minutes": 60,
        "minimum_notice_minutes": 30,
        "payment_mode": "FREE",
        "amount_minor": 0,
        "currency": None,
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_booking_http_real_two_account_snapshot_and_authorization() -> None:
    settings = integration_settings()
    inspector = create_async_engine(MIGRATION_URL)
    token_tutor = f"booking-http-tutor-{uuid4()}"
    token_student = f"booking-http-student-{uuid4()}"
    token_foreign = f"booking-http-foreign-{uuid4()}"
    try:
        tutor_id = await seed_session(inspector, token_tutor)
        student_id = await seed_session(inspector, token_student)
        foreign_id = await seed_session(inspector, token_foreign)
        grant_id = await issue_booking_grant(inspector, tutor_id)
        app = create_app(settings)
        starts_at = (datetime.now(UTC) + timedelta(days=3)).astimezone(ZoneInfo("Europe/Kyiv"))
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                missing_offer = await client.get(f"/api/v1/tutor-offers/{uuid4()}")
                assert_error(missing_offer, 404, "tutor_offer_not_found")

                created = await client.post(
                    "/api/v1/tutor-offers",
                    json=terms_payload(starts_at, title="HTTP snapshot"),
                    headers={"Idempotency-Key": str(uuid4()), "X-Request-ID": "http-offer-create"},
                )
                assert created.status_code == 201, created.text
                offer = created.json()
                assert "account_id" not in offer

                published = await client.post(
                    f"/api/v1/tutor-offers/{offer['id']}/publish",
                    json={"expected_version": offer["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert published.status_code == 200
                active = published.json()

                revised = await client.put(
                    f"/api/v1/tutor-offers/{active['id']}",
                    json={
                        **terms_payload(starts_at, title="HTTP snapshot revised"),
                        "expected_version": active["version"],
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert revised.status_code == 200
                active = revised.json()

                self_request = await client.post(
                    f"/api/v1/tutor-offers/{active['id']}/bookings",
                    json={
                        "observed_offer_version": active["version"],
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert_error(self_request, 409, "self_booking_forbidden")

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                stale_request = await client.post(
                    f"/api/v1/tutor-offers/{active['id']}/bookings",
                    json={
                        "observed_offer_version": active["version"] - 1,
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert_error(stale_request, 409, "offer_changed")

                request_key = str(uuid4())
                requested_offer_version = active["version"]
                booking_request = await client.post(
                    f"/api/v1/tutor-offers/{active['id']}/bookings",
                    json={
                        "observed_offer_version": requested_offer_version,
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": request_key},
                )
                assert booking_request.status_code == 201
                booking = booking_request.json()
                assert booking["status"] == "REQUESTED"

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                revised_before_retire = await client.put(
                    f"/api/v1/tutor-offers/{active['id']}",
                    json={
                        **terms_payload(starts_at, title="HTTP snapshot revised again"),
                        "expected_version": active["version"],
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert revised_before_retire.status_code == 200
                active = revised_before_retire.json()
                retired = await client.post(
                    f"/api/v1/tutor-offers/{active['id']}/retire",
                    json={"expected_version": active["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert retired.status_code == 200

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                replay = await client.post(
                    f"/api/v1/tutor-offers/{active['id']}/bookings",
                    json={
                        "observed_offer_version": requested_offer_version,
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": request_key},
                )
                assert replay.status_code == 201
                assert replay.json() == booking
                assert "account_id" not in replay.text

                foreign_booking = await client.get(f"/api/v1/bookings/{uuid4()}")
                assert_error(foreign_booking, 404, "booking_not_found")

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                tutor_read = await client.get(f"/api/v1/bookings/{booking['id']}")
                assert tutor_read.status_code == 200
                accepted = await client.post(
                    f"/api/v1/bookings/{booking['id']}/accept",
                    json={"expected_version": booking["version"]},
                    headers={
                        "Idempotency-Key": str(uuid4()),
                        "X-Request-ID": "http-booking-accept",
                    },
                )
                assert accepted.status_code == 200
                accepted_body = accepted.json()
                assert accepted_body["status"] == "ACCEPTED"

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                student_read = await client.get(f"/api/v1/bookings/{booking['id']}")
                assert student_read.status_code == 200
                assert student_read.json() == accepted_body
                assert student_id != tutor_id
                assert str(tutor_id) not in student_read.text
                assert str(student_id) not in student_read.text

                student_list = await client.get("/api/v1/bookings/me?role=student")
                assert student_list.status_code == 200
                assert student_list.json() == [accepted_body]

                bad_role = await client.get("/api/v1/bookings/me")
                assert_error(bad_role, 422, "invalid_request")

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                second_created = await client.post(
                    "/api/v1/tutor-offers",
                    json=terms_payload(starts_at + timedelta(days=2), title="Second offer"),
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert second_created.status_code == 201
                second_offer = second_created.json()
                second_published = await client.post(
                    f"/api/v1/tutor-offers/{second_offer['id']}/publish",
                    json={"expected_version": second_offer["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert second_published.status_code == 200
                second_active = second_published.json()

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                second_request = await client.post(
                    f"/api/v1/tutor-offers/{second_active['id']}/bookings",
                    json={
                        "observed_offer_version": second_active["version"],
                        "student_time_zone": "Europe/Kyiv",
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert second_request.status_code == 201
                second_booking = second_request.json()

                await revoke_booking_grant(inspector, grant_id)
                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                denied_revise = await client.put(
                    f"/api/v1/tutor-offers/{second_active['id']}",
                    json={
                        **terms_payload(starts_at + timedelta(days=2), title="Denied revise"),
                        "expected_version": second_active["version"],
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert_error(denied_revise, 403, "capability_required")
                for action in ("accept", "decline"):
                    denied_transition = await client.post(
                        f"/api/v1/bookings/{second_booking['id']}/{action}",
                        json={"expected_version": second_booking["version"]},
                        headers={"Idempotency-Key": str(uuid4())},
                    )
                    assert_error(denied_transition, 403, "capability_required")

                client.cookies.set(settings.session_cookie_name, token_foreign, path="/api/v1")
                for method, action in (
                    ("GET", ""),
                    ("POST", "/accept"),
                    ("POST", "/decline"),
                    ("POST", "/cancel"),
                ):
                    foreign_response = await client.request(
                        method,
                        f"/api/v1/bookings/{booking['id']}{action}",
                        json={"expected_version": accepted_body["version"]}
                        if method == "POST"
                        else None,
                        headers={"Idempotency-Key": str(uuid4())} if method == "POST" else None,
                    )
                    assert_error(foreign_response, 404, "booking_not_found")
                assert foreign_id != tutor_id and foreign_id != student_id

                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                second_read = await client.get(f"/api/v1/bookings/{second_booking['id']}")
                assert second_read.status_code == 200
                assert second_read.json() == second_booking

                client.cookies.set(settings.session_cookie_name, token_tutor, path="/api/v1")
                cancelled = await client.post(
                    f"/api/v1/bookings/{booking['id']}/cancel",
                    json={"expected_version": accepted_body["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert cancelled.status_code == 200
                assert cancelled.json()["status"] == "CANCELLED"
                client.cookies.set(settings.session_cookie_name, token_student, path="/api/v1")
                student_cancelled_read = await client.get(f"/api/v1/bookings/{booking['id']}")
                assert student_cancelled_read.status_code == 200
                assert student_cancelled_read.json() == cancelled.json()
    finally:
        await inspector.dispose()
