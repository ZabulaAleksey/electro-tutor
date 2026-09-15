from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

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
        pytest.skip("profile HTTP tests require exact disposable PostgreSQL roles")
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
                "issuer": f"https://profile-http-{uuid4()}.invalid",
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
                "expires": datetime.now(UTC) + timedelta(minutes=10),
            },
        )
    return account_id


async def issue_tutor_grant(engine: AsyncEngine, account_id: UUID) -> UUID:
    grant_id = uuid4()
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                "issue_operation_id) VALUES (:id,:account,'TUTOR_PROFILE_MANAGE_OWN',"
                "'account',:account,'service','tutor-provisioner',:operation)"
            ),
            {"id": grant_id, "account": account_id, "operation": uuid4()},
        )
    return grant_id


async def revoke_tutor_grant(engine: AsyncEngine, grant_id: UUID) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE capability_grants SET revoked_at=CURRENT_TIMESTAMP,"
                "revoked_by_actor_type='service',revoked_by_actor_id='tutor-provisioner',"
                "revoke_operation_id=:operation WHERE id=:grant"
            ),
            {"operation": uuid4(), "grant": grant_id},
        )


def assert_code(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_profile_http_owner_lifecycle_idor_grant_and_audit_component_path() -> None:
    settings = integration_settings()
    inspector = create_async_engine(MIGRATION_URL)
    token_a = f"http-a-{uuid4()}"
    token_b = f"http-b-{uuid4()}"
    try:
        account_a = await seed_session(inspector, token_a)
        account_b = await seed_session(inspector, token_b)
        app = create_app(settings)
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                client.cookies.set(settings.session_cookie_name, token_b, path="/api/v1")
                missing = await client.get(f"/api/v1/profiles/student/{account_b}")
                missing_update = await client.patch(
                    f"/api/v1/profiles/student/{account_b}",
                    json={"display_name": "Missing"},
                )
                assert_code(missing, 404, "profile_not_found")
                assert_code(missing_update, 404, "profile_not_found")
                created_b = await client.put(
                    f"/api/v1/profiles/student/{account_b}",
                    json={"display_name": "Private B"},
                )
                assert created_b.status_code == 200

                client.cookies.set(settings.session_cookie_name, token_a, path="/api/v1")
                created = await client.put(
                    f"/api/v1/profiles/student/{account_a}",
                    json={"display_name": " Student   A "},
                )
                replay = await client.put(
                    f"/api/v1/profiles/student/{account_a}",
                    json={"display_name": "Student A"},
                )
                conflict = await client.put(
                    f"/api/v1/profiles/student/{account_a}",
                    json={"display_name": "Different"},
                )
                read = await client.get(f"/api/v1/profiles/student/{account_a}")
                updated = await client.patch(
                    f"/api/v1/profiles/student/{account_a}",
                    json={"display_name": "Updated A"},
                )
                assert created.status_code == replay.status_code == read.status_code == 200
                assert created.json() == replay.json()
                assert created.json()["display_name"] == "Student A"
                assert updated.status_code == 200
                assert updated.json()["display_name"] == "Updated A"
                assert_code(conflict, 409, "profile_already_exists")

                for method in ("GET", "PUT", "PATCH"):
                    foreign = await client.request(
                        method,
                        f"/api/v1/profiles/student/{account_b}",
                        json={"display_name": "Attack"} if method != "GET" else None,
                    )
                    assert_code(foreign, 404, "profile_not_found")
                    assert "Private B" not in foreign.text

                for invalid_payload in (
                    {"display_name": "Override", "account_id": str(account_b)},
                    {"display_name": "Escalate", "role": "tutor"},
                    {"display_name": "Unknown", "unknown": True},
                ):
                    invalid = await client.patch(
                        f"/api/v1/profiles/student/{account_a}", json=invalid_payload
                    )
                    assert_code(invalid, 422, "invalid_request")

                missing_grant = await client.put(
                    f"/api/v1/profiles/tutor/{account_a}",
                    json={"display_name": "Tutor A"},
                )
                assert_code(missing_grant, 403, "capability_required")

                grant_id = await issue_tutor_grant(inspector, account_a)
                tutor_created = await client.put(
                    f"/api/v1/profiles/tutor/{account_a}",
                    json={"display_name": " Tutor   A "},
                    headers={"X-Request-ID": "http-tutor-create"},
                )
                tutor_replay = await client.put(
                    f"/api/v1/profiles/tutor/{account_a}",
                    json={"display_name": "Tutor A"},
                    headers={"X-Request-ID": "http-tutor-replay"},
                )
                tutor_conflict = await client.put(
                    f"/api/v1/profiles/tutor/{account_a}",
                    json={"display_name": "Different Tutor"},
                )
                tutor_read = await client.get(f"/api/v1/profiles/tutor/{account_a}")
                tutor_updated = await client.patch(
                    f"/api/v1/profiles/tutor/{account_a}",
                    json={"display_name": "Updated Tutor A"},
                )
                assert tutor_created.status_code == tutor_replay.status_code == 200
                assert tutor_created.json() == tutor_replay.json()
                assert_code(tutor_conflict, 409, "profile_already_exists")
                assert tutor_read.status_code == tutor_updated.status_code == 200
                assert tutor_updated.json()["display_name"] == "Updated Tutor A"
                assert token_a not in tutor_created.text
                assert SessionCredential.from_token(token_a).digest not in tutor_created.text

                await revoke_tutor_grant(inspector, grant_id)
                for method in ("GET", "PUT", "PATCH"):
                    revoked = await client.request(
                        method,
                        f"/api/v1/profiles/tutor/{account_a}",
                        json={"display_name": "Denied"} if method != "GET" else None,
                    )
                    assert_code(revoked, 403, "capability_required")

                client.cookies.set(settings.session_cookie_name, token_b, path="/api/v1")
                foreign_a = await client.get(f"/api/v1/profiles/tutor/{account_a}")
                assert_code(foreign_a, 404, "profile_not_found")

                client.cookies.set(settings.session_cookie_name, "invalid-session", path="/api/v1")
                invalid_session = await client.get(f"/api/v1/profiles/student/{account_a}")
                assert_code(invalid_session, 401, "authentication_required")

                async with inspector.begin() as connection:
                    await connection.execute(
                        text("DELETE FROM application_sessions WHERE token_digest=:digest"),
                        {"digest": SessionCredential.from_token(token_a).digest},
                    )
                client.cookies.set(settings.session_cookie_name, token_a, path="/api/v1")
                logged_out = await client.get(f"/api/v1/profiles/student/{account_a}")
                assert_code(logged_out, 401, "authentication_required")

        async with inspector.connect() as connection:
            audit = (
                (
                    await connection.execute(
                        text(
                            "SELECT actor_id,subject_id,request_id,correlation_id,"
                            "count(*) OVER () event_count FROM audit_events "
                            "WHERE action='tutor_profile.created' AND subject_id=:account "
                            "ORDER BY occurred_at LIMIT 1"
                        ),
                        {"account": str(account_a)},
                    )
                )
                .mappings()
                .one()
            )
        assert audit["event_count"] == 1
        assert audit["actor_id"] == audit["subject_id"] == str(account_a)
        assert audit["request_id"] == "http-tutor-create"
        assert isinstance(audit["correlation_id"], UUID)
    finally:
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_self_profile_http_path_uses_db_session_owner_and_preserves_denials() -> None:
    settings = integration_settings()
    inspector = create_async_engine(MIGRATION_URL)
    token_a = f"http-self-a-{uuid4()}"
    token_b = f"http-self-b-{uuid4()}"
    request_id = f"self-tutor-{uuid4()}"
    try:
        account_a = await seed_session(inspector, token_a)
        account_b = await seed_session(inspector, token_b)
        app = create_app(settings)
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                anonymous = await client.put(
                    "/api/v1/profiles/student/me",
                    content=b'{"display_name":',
                    headers={"Content-Type": "application/json"},
                )
                assert_code(anonymous, 401, "authentication_required")

                client.cookies.set(settings.session_cookie_name, "invalid-session", path="/api/v1")
                invalid_session = await client.get("/api/v1/profiles/student/me")
                assert_code(invalid_session, 401, "authentication_required")

                client.cookies.set(settings.session_cookie_name, token_a, path="/api/v1")
                created = await client.put(
                    "/api/v1/profiles/student/me",
                    json={"display_name": " Self   Student A "},
                )
                replay = await client.put(
                    "/api/v1/profiles/student/me",
                    json={"display_name": "Self Student A"},
                )
                conflict = await client.put(
                    "/api/v1/profiles/student/me",
                    json={"display_name": "Different"},
                )
                read = await client.get("/api/v1/profiles/student/me")
                updated = await client.patch(
                    "/api/v1/profiles/student/me",
                    json={"display_name": "Updated Self A"},
                )
                assert created.status_code == replay.status_code == read.status_code == 200
                assert created.json() == replay.json()
                assert "account_id" not in created.json()
                assert "account_id" not in replay.json()
                assert "account_id" not in read.json()
                assert "account_id" not in updated.json()
                assert updated.status_code == 200
                assert updated.json()["display_name"] == "Updated Self A"
                assert_code(conflict, 409, "profile_already_exists")

                for payload in (
                    {"display_name": "Override", "account_id": str(account_b)},
                    {"display_name": "Escalate", "role": "tutor"},
                    {"display_name": "Escalate", "capability": "TUTOR_PROFILE_MANAGE_OWN"},
                ):
                    rejected = await client.patch("/api/v1/profiles/student/me", json=payload)
                    assert_code(rejected, 422, "invalid_request")

                foreign = await client.get(f"/api/v1/profiles/student/{account_b}")
                assert_code(foreign, 404, "profile_not_found")

                missing_grant = await client.put(
                    "/api/v1/profiles/tutor/me",
                    json={"display_name": "Tutor A"},
                )
                assert_code(missing_grant, 403, "capability_required")

                grant_id = await issue_tutor_grant(inspector, account_a)
                tutor_created = await client.put(
                    "/api/v1/profiles/tutor/me",
                    json={"display_name": " Self   Tutor A "},
                    headers={"X-Request-ID": request_id},
                )
                tutor_read = await client.get("/api/v1/profiles/tutor/me")
                tutor_updated = await client.patch(
                    "/api/v1/profiles/tutor/me",
                    json={"display_name": "Updated Self Tutor A"},
                )
                assert tutor_created.status_code == tutor_read.status_code == 200
                assert "account_id" not in tutor_created.json()
                assert "account_id" not in tutor_read.json()
                assert "account_id" not in tutor_updated.json()
                assert tutor_updated.status_code == 200
                assert tutor_updated.json()["display_name"] == "Updated Self Tutor A"

                await revoke_tutor_grant(inspector, grant_id)
                revoked = await client.get("/api/v1/profiles/tutor/me")
                assert_code(revoked, 403, "capability_required")

                async with inspector.begin() as connection:
                    await connection.execute(
                        text("DELETE FROM application_sessions WHERE token_digest=:digest"),
                        {"digest": SessionCredential.from_token(token_a).digest},
                    )
                logged_out = await client.get("/api/v1/profiles/student/me")
                assert_code(logged_out, 401, "authentication_required")

        async with inspector.connect() as connection:
            audit = (
                (
                    await connection.execute(
                        text(
                            "SELECT actor_id,subject_id,request_id,correlation_id,metadata "
                            "FROM audit_events WHERE action='tutor_profile.created' "
                            "AND subject_id=:account AND request_id=:request"
                        ),
                        {"account": str(account_a), "request": request_id},
                    )
                )
                .mappings()
                .one()
            )
        assert audit["actor_id"] == audit["subject_id"] == str(account_a)
        assert audit["request_id"] == request_id
        assert isinstance(audit["correlation_id"], UUID)
        assert token_a not in str(audit["metadata"])
        assert SessionCredential.from_token(token_a).digest not in str(audit["metadata"])
    finally:
        await inspector.dispose()
