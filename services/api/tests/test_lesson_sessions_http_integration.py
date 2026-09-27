from __future__ import annotations

# Exact SQL audit/ACL queries are intentionally kept contiguous.
# ruff: noqa: E501
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from test_booking_http_integration import (
    MIGRATION_URL,
    assert_error,
    integration_settings,
    issue_booking_grant,
    seed_session,
    terms_payload,
)

from electro_tutor_api.main import create_app


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_http_session_origin_masking_reload_replay_and_cancel() -> None:
    settings = integration_settings()
    inspector = create_async_engine(MIGRATION_URL)
    tutor_token = f"session-http-tutor-{uuid4()}"
    student_token = f"session-http-student-{uuid4()}"
    foreign_token = f"session-http-foreign-{uuid4()}"
    try:
        tutor_id = await seed_session(inspector, tutor_token)
        await seed_session(inspector, student_token)
        await seed_session(inspector, foreign_token)
        await issue_booking_grant(inspector, tutor_id)
        app = create_app(settings)
        origin = settings.allowed_web_origins[0]
        starts = (datetime.now(UTC) + timedelta(minutes=10)).astimezone(ZoneInfo("Europe/Kyiv"))
        offer_payload = terms_payload(starts, title="Session HTTP")
        offer_payload["minimum_notice_minutes"] = 0
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                client.cookies.set(settings.session_cookie_name, tutor_token, path="/api/v1")
                offer = (
                    await client.post(
                        "/api/v1/tutor-offers",
                        json=offer_payload,
                        headers={"Idempotency-Key": str(uuid4())},
                    )
                ).json()
                published = (
                    await client.post(
                        f"/api/v1/tutor-offers/{offer['id']}/publish",
                        json={"expected_version": offer["version"]},
                        headers={"Idempotency-Key": str(uuid4())},
                    )
                ).json()
                client.cookies.set(settings.session_cookie_name, student_token, path="/api/v1")
                booking = (
                    await client.post(
                        f"/api/v1/tutor-offers/{offer['id']}/bookings",
                        json={
                            "observed_offer_version": published["version"],
                            "student_time_zone": "Europe/Kyiv",
                        },
                        headers={"Idempotency-Key": str(uuid4())},
                    )
                ).json()
                client.cookies.set(settings.session_cookie_name, tutor_token, path="/api/v1")
                accept_key = str(uuid4())
                accepted = (
                    await client.post(
                        f"/api/v1/bookings/{booking['id']}/accept",
                        json={"expected_version": booking["version"]},
                        headers={"Idempotency-Key": accept_key},
                    )
                ).json()
                async with inspector.connect() as connection:
                    audit_before = await connection.scalar(
                        text(
                            "SELECT count(*) FROM audit_events WHERE subject_type='lesson_session'"
                        )
                    )
                route = f"/api/v1/bookings/{booking['id']}/lesson-session"
                headers = {"Origin": origin, "Idempotency-Key": str(uuid4())}
                reused = await client.post(
                    route, json={}, headers={"Origin": origin, "Idempotency-Key": accept_key}
                )
                assert_error(reused, 409, "idempotency_conflict")
                for bad_headers, body, status, code in (
                    ({"Idempotency-Key": headers["Idempotency-Key"]}, {}, 403, "origin_denied"),
                    (
                        {"Origin": "null", "Idempotency-Key": headers["Idempotency-Key"]},
                        {},
                        403,
                        "origin_denied",
                    ),
                    (
                        {
                            "Origin": "https://foreign.invalid",
                            "Idempotency-Key": headers["Idempotency-Key"],
                        },
                        {},
                        403,
                        "origin_denied",
                    ),
                    ({"Origin": origin}, {}, 422, "invalid_request"),
                ):
                    assert_error(
                        await client.post(route, json=body, headers=bad_headers), status, code
                    )
                assert_error(
                    await client.post(
                        route,
                        content="a=b",
                        headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
                    ),
                    422,
                    "invalid_request",
                )
                preflight = await client.options(
                    route,
                    headers={
                        "Origin": "https://foreign.invalid",
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers": "Content-Type,Idempotency-Key",
                    },
                )
                assert preflight.status_code == 400
                async with inspector.connect() as connection:
                    assert (
                        await connection.scalar(
                            text("SELECT count(*) FROM lesson_sessions WHERE booking_id=:id"),
                            {"id": booking["id"]},
                        )
                        == 0
                    )
                    assert (
                        await connection.scalar(
                            text(
                                "SELECT count(*) FROM audit_events WHERE subject_type='lesson_session'"
                            )
                        )
                        == audit_before
                    )
                client.cookies.set(settings.session_cookie_name, student_token, path="/api/v1")
                created = await client.post(route, json={}, headers=headers)
                assert created.status_code == 200, created.text
                session = created.json()
                assert session["status"] == "READY" and session["participant_role"] == "student"
                assert (
                    session["capabilities"] == ["SESSION_VIEW"]
                    and session["current_topic_id"] is None
                )
                assert "account_id" not in created.text
                assert created.headers["Cache-Control"] == "no-store"
                replay = await client.post(route, json={}, headers=headers)
                assert replay.status_code == 200 and replay.json() == session
                reload = await client.get(f"/api/v1/lesson-sessions/{session['id']}")
                assert reload.status_code == 200 and reload.json()["id"] == session["id"]
                client.cookies.set(settings.session_cookie_name, tutor_token, path="/api/v1")
                tutor_reload = await client.get(f"/api/v1/lesson-sessions/{session['id']}")
                assert (
                    tutor_reload.status_code == 200
                    and tutor_reload.json()["participant_role"] == "tutor"
                )
                client.cookies.set(settings.session_cookie_name, foreign_token, path="/api/v1")
                assert_error(
                    await client.get(f"/api/v1/lesson-sessions/{session['id']}"),
                    404,
                    "lesson_session_not_found",
                )
                assert_error(
                    await client.post(route, json={}, headers=headers),
                    404,
                    "lesson_session_not_found",
                )
                client.cookies.delete(settings.session_cookie_name)
                assert_error(
                    await client.get(f"/api/v1/lesson-sessions/{session['id']}"),
                    401,
                    "authentication_required",
                )
                client.cookies.set(settings.session_cookie_name, tutor_token, path="/api/v1")
                cancelled = await client.post(
                    f"/api/v1/bookings/{booking['id']}/cancel",
                    json={"expected_version": accepted["version"]},
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert cancelled.status_code == 200
                client.cookies.set(settings.session_cookie_name, student_token, path="/api/v1")
                assert_error(
                    await client.get(f"/api/v1/lesson-sessions/{session['id']}"),
                    403,
                    "lesson_access_revoked",
                )
                assert_error(
                    await client.post(route, json={}, headers=headers), 403, "lesson_access_revoked"
                )
    finally:
        await inspector.dispose()
