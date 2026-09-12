from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from alembic import command
from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.database import create_auth_engine, create_runtime_engine
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.profiles import ProfileService
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings, Settings
from electro_tutor_api.domain.identity import ExternalIdentity, Principal, SessionCredential
from electro_tutor_api.errors import AuthenticationRequiredError

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


def settings() -> Settings:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    auth = os.getenv("ET_AUTH_DATABASE_URL")
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if (runtime, auth, migration) != (RUNTIME_URL, AUTH_URL, MIGRATION_URL):
        pytest.skip("session-bound tests require exact disposable database roles")
    return Settings(profile="test", runtime_database_url=runtime, auth_database_url=auth)


def require_migration_consent() -> None:
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("session-bound migration test requires exact disposable DB consent")


async def authenticated(
    repository: AuthRepository,
    token: str,
    *,
    expires_at: datetime | None = None,
) -> tuple[Principal, SessionCredential]:
    identity_id = await repository.resolve_identity(
        ExternalIdentity(
            issuer=f"https://session-bound-{uuid4()}.invalid",
            subject=str(uuid4()),
            email=None,
        )
    )
    credential = SessionCredential.from_token(token)
    await repository.create_session(
        token_digest=credential.digest,
        identity_id=identity_id,
        expires_at=expires_at or datetime.now(UTC) + timedelta(minutes=10),
    )
    principal = await repository.principal_for_session(credential.digest)
    assert principal is not None
    return principal, credential


@pytest.mark.integration
def test_0009_downgrade_restores_exact_0008_profile_semantics_and_privileges() -> None:
    settings()
    require_migration_consent()
    migration_settings = MigrationSettings(profile="test", migration_database_url=MIGRATION_URL)
    config = alembic_config(migration_settings)
    command.downgrade(config, "20260912_0008")

    async def verify() -> None:
        runtime = create_async_engine(RUNTIME_URL)
        auth = create_async_engine(AUTH_URL)
        inspector = create_async_engine(MIGRATION_URL)
        account_id = uuid4()
        grant_id = uuid4()
        try:
            async with inspector.begin() as connection:
                await connection.execute(
                    text("INSERT INTO accounts(id) VALUES (:account_id)"),
                    {"account_id": account_id},
                )

            with pytest.raises(SQLAlchemyError):
                async with runtime.begin() as connection:
                    await connection.execute(
                        text(
                            "SELECT * FROM public.create_tutor_profile("
                            "CAST(:account AS uuid),'Tutor',"
                            "CAST(:correlation AS uuid),'request')"
                        ),
                        {"account": account_id, "correlation": uuid4()},
                    )

            async with inspector.begin() as connection:
                await connection.execute(
                    text(
                        "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                        "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                        "issue_operation_id) VALUES (:id,:account,'TUTOR_PROFILE_MANAGE_OWN',"
                        "'account',:account,'service','tutor-provisioner',:operation)"
                    ),
                    {"id": grant_id, "account": account_id, "operation": uuid4()},
                )

            # An audit rejection must roll back the first profile insert atomically.
            with pytest.raises(SQLAlchemyError):
                async with runtime.begin() as connection:
                    await connection.execute(
                        text(
                            "SELECT * FROM public.create_tutor_profile("
                            "CAST(:account AS uuid),'Tutor',CAST(:correlation AS uuid),:request)"
                        ),
                        {
                            "account": account_id,
                            "correlation": uuid4(),
                            "request": "x" * 129,
                        },
                    )
            async with inspector.connect() as connection:
                assert (
                    await connection.scalar(
                        text("SELECT count(*) FROM tutor_profiles WHERE account_id=:account"),
                        {"account": account_id},
                    )
                    == 0
                )

            async with runtime.begin() as connection:
                created = (
                    (
                        await connection.execute(
                            text(
                                "SELECT * FROM public.create_tutor_profile("
                                "CAST(:account AS uuid),'Tutor',"
                                "CAST(:correlation AS uuid),'request')"
                            ),
                            {"account": account_id, "correlation": uuid4()},
                        )
                    )
                    .mappings()
                    .one()
                )
                repeated = (
                    (
                        await connection.execute(
                            text(
                                "SELECT * FROM public.create_tutor_profile("
                                "CAST(:account AS uuid),'Tutor',"
                                "CAST(:correlation AS uuid),'request')"
                            ),
                            {"account": account_id, "correlation": uuid4()},
                        )
                    )
                    .mappings()
                    .one()
                )
                unchanged = (
                    (
                        await connection.execute(
                            text(
                                "SELECT * FROM public.update_tutor_profile("
                                "CAST(:account AS uuid),'Tutor')"
                            ),
                            {"account": account_id},
                        )
                    )
                    .mappings()
                    .one()
                )
            assert created["created"] is True
            assert repeated["created"] is False
            assert unchanged["updated_at"] == created["updated_at"]

            async with inspector.connect() as connection:
                audit = (
                    (
                        await connection.execute(
                            text(
                                "SELECT count(*) event_count,min(actor_id) actor_id,"
                                "min(subject_id) subject_id FROM audit_events "
                                "WHERE action='tutor_profile.created' AND subject_id=:account"
                            ),
                            {"account": str(account_id)},
                        )
                    )
                    .mappings()
                    .one()
                )
                signatures = {
                    signature: (
                        await connection.execute(
                            text(
                                "SELECT to_regprocedure(:signature) IS NOT NULL present,"
                                "has_function_privilege('electro_tutor_runtime',"
                                "to_regprocedure(:signature),'EXECUTE') runtime_execute,"
                                "has_function_privilege('electro_tutor_auth_runtime',"
                                "to_regprocedure(:signature),'EXECUTE') auth_execute,"
                                "EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode("
                                "coalesce(p.proacl,acldefault('f',p.proowner))) acl "
                                "WHERE p.oid=to_regprocedure(:signature) AND acl.grantee=0 "
                                "AND acl.privilege_type='EXECUTE') public_execute"
                            ),
                            {"signature": signature},
                        )
                    )
                    .mappings()
                    .one()
                    for signature in (
                        "public.read_student_profile(uuid)",
                        "public.create_student_profile(uuid,text)",
                        "public.update_student_profile(uuid,text)",
                        "public.read_tutor_profile(uuid)",
                        "public.create_tutor_profile(uuid,text,uuid,text)",
                        "public.update_tutor_profile(uuid,text)",
                    )
                }
                new_functions = await connection.scalar(
                    text(
                        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n "
                        "ON n.oid=p.pronamespace "
                        "WHERE n.nspname='public' AND p.proname IN "
                        "('resolve_active_session_principal','current_session_account_id')"
                    )
                )
            assert audit["event_count"] == 1
            assert audit["actor_id"] == audit["subject_id"] == str(account_id)
            assert new_functions == 0
            for privileges in signatures.values():
                assert dict(privileges) == {
                    "present": True,
                    "runtime_execute": True,
                    "auth_execute": False,
                    "public_execute": False,
                }

            revoke_started = asyncio.Event()

            async def revoke() -> None:
                async with inspector.begin() as connection:
                    revoke_started.set()
                    await connection.execute(
                        text(
                            "UPDATE capability_grants SET revoked_at=CURRENT_TIMESTAMP,"
                            "revoked_by_actor_type='service',"
                            "revoked_by_actor_id='tutor-provisioner',"
                            "revoke_operation_id=:operation WHERE id=:grant"
                        ),
                        {"operation": uuid4(), "grant": grant_id},
                    )

            async with runtime.begin() as connection:
                await connection.execute(
                    text("SELECT * FROM public.read_tutor_profile(CAST(:account AS uuid))"),
                    {"account": account_id},
                )
                revoke_task = asyncio.create_task(revoke())
                await revoke_started.wait()
                await asyncio.sleep(0.1)
                assert revoke_task.done() is False
            await asyncio.wait_for(revoke_task, timeout=2)

            for statement in (
                "SELECT * FROM public.read_tutor_profile(CAST(:account AS uuid))",
                "SELECT * FROM public.update_tutor_profile(CAST(:account AS uuid),'Changed')",
            ):
                with pytest.raises(SQLAlchemyError):
                    async with runtime.begin() as connection:
                        await connection.execute(text(statement), {"account": account_id})
        finally:
            await runtime.dispose()
            await auth.dispose()
            await inspector.dispose()

    try:
        asyncio.run(verify())
    finally:
        command.upgrade(config, "head")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_database_roles_and_legacy_profile_signatures_are_closed() -> None:
    resolved = settings()
    runtime = create_runtime_engine(resolved)
    auth = create_auth_engine(resolved)
    inspector = create_async_engine(MIGRATION_URL)
    try:
        async with inspector.connect() as connection:
            roles = {
                row["rolname"]: row
                for row in (
                    await connection.execute(
                        text(
                            "SELECT rolname,rolinherit,rolsuper,rolcreatedb,rolcreaterole,"
                            "rolbypassrls,rolcanlogin FROM pg_roles "
                            "WHERE rolname IN ('electro_tutor_runtime',"
                            "'electro_tutor_auth_runtime')"
                        )
                    )
                ).mappings()
            }
            memberships = await connection.scalar(
                text(
                    "SELECT count(*) FROM pg_auth_members membership "
                    "JOIN pg_roles granted ON granted.oid=membership.roleid "
                    "JOIN pg_roles member ON member.oid=membership.member "
                    "WHERE granted.rolname IN ('electro_tutor_runtime',"
                    "'electro_tutor_auth_runtime') OR member.rolname IN "
                    "('electro_tutor_runtime','electro_tutor_auth_runtime')"
                )
            )
            old_signatures = [
                await connection.scalar(
                    text("SELECT to_regprocedure(:signature)"), {"signature": sig}
                )
                for sig in (
                    "public.read_student_profile(uuid)",
                    "public.create_student_profile(uuid,text)",
                    "public.update_student_profile(uuid,text)",
                    "public.read_tutor_profile(uuid)",
                    "public.create_tutor_profile(uuid,text,uuid,text)",
                    "public.update_tutor_profile(uuid,text)",
                )
            ]
            new_privileges = {
                signature: (
                    await connection.execute(
                        text(
                            "SELECT has_function_privilege('electro_tutor_runtime',"
                            "to_regprocedure(:signature),'EXECUTE') runtime_execute,"
                            "has_function_privilege('electro_tutor_auth_runtime',"
                            "to_regprocedure(:signature),'EXECUTE') auth_execute,"
                            "EXISTS (SELECT 1 FROM pg_proc p, "
                            "LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl "
                            "WHERE p.oid=to_regprocedure(:signature) AND acl.grantee=0 "
                            "AND acl.privilege_type='EXECUTE') public_execute"
                        ),
                        {"signature": signature},
                    )
                )
                .mappings()
                .one()
                for signature in (
                    "public.resolve_active_session_principal()",
                    "public.read_student_profile()",
                    "public.create_student_profile(text)",
                    "public.update_student_profile(text)",
                    "public.read_tutor_profile()",
                    "public.create_tutor_profile(text,uuid,text)",
                    "public.update_tutor_profile(text)",
                )
            }
            helper_privileges = (
                (
                    await connection.execute(
                        text(
                            "SELECT has_function_privilege('electro_tutor_runtime',"
                            "'public.current_session_account_id()','EXECUTE') runtime_execute,"
                            "has_function_privilege('electro_tutor_auth_runtime',"
                            "'public.current_session_account_id()','EXECUTE') auth_execute,"
                            "EXISTS (SELECT 1 FROM pg_proc p, "
                            "LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl "
                            "WHERE p.oid='public.current_session_account_id()'::regprocedure "
                            "AND acl.grantee=0 AND acl.privilege_type='EXECUTE') public_execute"
                        )
                    )
                )
                .mappings()
                .one()
            )
        assert set(roles) == {"electro_tutor_runtime", "electro_tutor_auth_runtime"}
        for role in roles.values():
            assert role["rolinherit"] is False
            assert role["rolsuper"] is False
            assert role["rolcreatedb"] is False
            assert role["rolcreaterole"] is False
            assert role["rolbypassrls"] is False
            assert role["rolcanlogin"] is True
        assert memberships == 0
        assert old_signatures == [None] * 6
        for privileges in new_privileges.values():
            assert dict(privileges) == {
                "runtime_execute": True,
                "auth_execute": False,
                "public_execute": False,
            }
        assert dict(helper_privileges) == {
            "runtime_execute": False,
            "auth_execute": False,
            "public_execute": False,
        }

        for statement in (
            "SELECT * FROM application_sessions",
            "INSERT INTO application_sessions(token_digest,identity_id,expires_at) "
            "VALUES ('0000000000000000000000000000000000000000000000000000000000000000',"
            "gen_random_uuid(),CURRENT_TIMESTAMP)",
            "DELETE FROM application_sessions",
            "SELECT * FROM auth_transactions",
            "SELECT * FROM external_identities",
        ):
            with pytest.raises(SQLAlchemyError):
                async with runtime.begin() as connection:
                    await connection.execute(text(statement))

        for statement in (
            "SELECT * FROM student_profiles",
            "SELECT * FROM capability_grants",
            "SELECT * FROM audit_events",
            "SELECT * FROM public.read_student_profile()",
        ):
            with pytest.raises(SQLAlchemyError):
                async with auth.begin() as connection:
                    await connection.execute(text(statement))

        for engine, targets in (
            (
                runtime,
                (
                    "electro_tutor_auth_runtime",
                    "electro_tutor_migrator",
                    "electro_tutor_provisioner",
                ),
            ),
            (
                auth,
                (
                    "electro_tutor_runtime",
                    "electro_tutor_migrator",
                    "electro_tutor_provisioner",
                ),
            ),
        ):
            for target in targets:
                with pytest.raises(SQLAlchemyError):
                    async with engine.begin() as connection:
                        await connection.execute(text(f"SET ROLE {target}"))

        for engine in (runtime, auth):
            with pytest.raises(SQLAlchemyError):
                async with engine.begin() as connection:
                    await connection.execute(text("SELECT public.current_session_account_id()"))
    finally:
        await runtime.dispose()
        await auth.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_session_resolution_rejects_malformed_random_expired_and_logged_out() -> None:
    resolved = settings()
    runtime = create_runtime_engine(resolved)
    auth = create_auth_engine(resolved)
    inspector = create_async_engine(MIGRATION_URL)
    repository = AuthRepository(auth)
    try:
        for digest in ("malformed", "0" * 64):
            with pytest.raises(SQLAlchemyError):
                async with runtime.begin() as connection:
                    await connection.execute(
                        text(
                            "SELECT pg_catalog.set_config("
                            "'electro_tutor.session_digest',:digest,true)"
                        ),
                        {"digest": digest},
                    )
                    await connection.execute(
                        text("SELECT * FROM public.resolve_active_session_principal()")
                    )

        expired_principal, expired = await authenticated(repository, f"expired-{uuid4()}")
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE application_sessions SET "
                    "expires_at=CURRENT_TIMESTAMP-interval '1 second' "
                    "WHERE token_digest=:digest"
                ),
                {"digest": expired.digest},
            )
        del expired_principal
        with pytest.raises(AuthenticationRequiredError):
            async with PostgresUnitOfWork(runtime, expired):
                pass

        principal, logged_out = await authenticated(repository, f"logout-{uuid4()}")
        await repository.delete_session(logged_out.digest)
        with pytest.raises(AuthenticationRequiredError):
            async with PostgresUnitOfWork(runtime, logged_out):
                pass
        assert principal.account_id
    finally:
        await runtime.dispose()
        await auth.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_credential_is_owner_and_pool_context_does_not_leak() -> None:
    resolved = settings()
    runtime = create_async_engine(
        resolved.runtime_database_url,
        pool_size=1,
        max_overflow=0,
        hide_parameters=True,
    )
    auth = create_auth_engine(resolved)
    repository = AuthRepository(auth)
    service = ProfileService(lambda proof: PostgresUnitOfWork(runtime, proof))
    try:
        principal_a, credential_a = await authenticated(repository, f"a-{uuid4()}")
        principal_b, credential_b = await authenticated(repository, f"b-{uuid4()}")

        profile_a = await service.create_student_profile(principal_a, credential_a, "Student A")
        profile_b = await service.create_student_profile(principal_b, credential_b, "Student B")
        assert profile_a.account_id == principal_a.account_id
        assert profile_b.account_id == principal_b.account_id

        with pytest.raises(AuthenticationRequiredError):
            await service.read_student_profile(principal_b, credential_a)

        async with PostgresUnitOfWork(runtime, credential_a) as unit:
            backend_pid = await unit.connection.scalar(text("SELECT pg_backend_pid()"))
            assert (
                await unit.connection.scalar(
                    text("SELECT current_setting('electro_tutor.session_digest',true)")
                )
                == credential_a.digest
            )
            await unit.connection.execute(
                text(
                    "SELECT pg_catalog.set_config("
                    "'electro_tutor.account_id',CAST(:account_id AS text),true)"
                ),
                {"account_id": str(principal_b.account_id)},
            )
            assert (await unit.profiles.get_student()).account_id == principal_a.account_id  # type: ignore[union-attr]

        async def assert_clean_backend() -> None:
            async with runtime.begin() as connection:
                assert await connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
                assert await connection.scalar(
                    text("SELECT current_setting('electro_tutor.session_digest',true)")
                ) in (None, "")

        await assert_clean_backend()

        class ExpectedRollback(Exception):
            pass

        with pytest.raises(ExpectedRollback):
            async with PostgresUnitOfWork(runtime, credential_a) as unit:
                assert await unit.connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
                raise ExpectedRollback
        await assert_clean_backend()

        entered = asyncio.Event()
        never = asyncio.Event()

        async def cancel_transaction() -> None:
            async with PostgresUnitOfWork(runtime, credential_a) as unit:
                assert await unit.connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
                entered.set()
                await never.wait()

        task = asyncio.create_task(cancel_transaction())
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await assert_clean_backend()

        async with PostgresUnitOfWork(runtime, credential_b) as unit:
            assert await unit.connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
            assert (
                await unit.connection.scalar(
                    text("SELECT current_setting('electro_tutor.session_digest',true)")
                )
                == credential_b.digest
            )
            assert (await unit.profiles.get_student()).account_id == principal_b.account_id  # type: ignore[union-attr]

        async with runtime.begin() as connection:
            assert await connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
            assert await connection.scalar(
                text("SELECT current_setting('electro_tutor.session_digest',true)")
            ) in (None, "")
        assert await service.read_student_profile(principal_b, credential_b) == profile_b
    finally:
        await runtime.dispose()
        await auth.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancelled_session_bind_cleans_transaction_guc_and_session_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved = settings()
    runtime = create_async_engine(
        resolved.runtime_database_url,
        pool_size=1,
        max_overflow=0,
        hide_parameters=True,
    )
    auth = create_auth_engine(resolved)
    inspector = create_async_engine(MIGRATION_URL)
    repository = AuthRepository(auth)
    try:
        _, credential = await authenticated(repository, f"cancel-bind-{uuid4()}")
        async with runtime.connect() as connection:
            backend_pid = await connection.scalar(text("SELECT pg_backend_pid()"))

        entered = False
        resolver_started = asyncio.Event()
        never = asyncio.Event()
        original_execute = AsyncConnection.execute

        async def pause_before_resolver(connection, statement, *args, **kwargs):
            if "resolve_active_session_principal" in str(statement):
                resolver_started.set()
                await never.wait()
            return await original_execute(connection, statement, *args, **kwargs)

        monkeypatch.setattr(AsyncConnection, "execute", pause_before_resolver)

        async def bind_session() -> None:
            nonlocal entered
            async with PostgresUnitOfWork(runtime, credential):
                entered = True

        task = asyncio.create_task(bind_session())
        await asyncio.wait_for(resolver_started.wait(), timeout=2)
        assert entered is False
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, timeout=2)

        async with runtime.begin() as connection:
            assert await connection.scalar(text("SELECT pg_backend_pid()")) == backend_pid
            assert await connection.scalar(
                text("SELECT current_setting('electro_tutor.session_digest',true)")
            ) in (None, "")

        await asyncio.wait_for(repository.delete_session(credential.digest), timeout=1)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM application_sessions WHERE token_digest=:digest"),
                    {"digest": credential.digest},
                )
                == 0
            )
    finally:
        await runtime.dispose()
        await auth.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_logout_waits_for_profile_transaction_session_lock() -> None:
    resolved = settings()
    runtime = create_runtime_engine(resolved)
    auth = create_auth_engine(resolved)
    repository = AuthRepository(auth)
    try:
        _, credential = await authenticated(repository, f"serialize-{uuid4()}")
        async with PostgresUnitOfWork(runtime, credential):
            logout = asyncio.create_task(repository.delete_session(credential.digest))
            await asyncio.sleep(0.1)
            assert logout.done() is False
        await asyncio.wait_for(logout, timeout=2)
        with pytest.raises(AuthenticationRequiredError):
            async with PostgresUnitOfWork(runtime, credential):
                pass
    finally:
        await runtime.dispose()
        await auth.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tutor_audit_actor_is_database_resolved_and_digest_absent() -> None:
    resolved = settings()
    runtime = create_runtime_engine(resolved)
    auth = create_auth_engine(resolved)
    inspector = create_async_engine(MIGRATION_URL)
    repository = AuthRepository(auth)
    service = ProfileService(lambda proof: PostgresUnitOfWork(runtime, proof))
    try:
        principal, credential = await authenticated(repository, f"audit-{uuid4()}")
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                    "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                    "issue_operation_id) "
                    "VALUES (:id,:account,'TUTOR_PROFILE_MANAGE_OWN','account',:account,"
                    "'service','tutor-provisioner',:operation)"
                ),
                {"id": uuid4(), "account": principal.account_id, "operation": uuid4()},
            )
        forged = Principal(
            account_id=uuid4(),
            identity_id=uuid4(),
            issuer=principal.issuer,
            subject=principal.subject,
            email=None,
            session_expires_at=principal.session_expires_at,
        )
        with pytest.raises(AuthenticationRequiredError):
            await service.create_tutor_profile(forged, credential, "Forged")
        await service.create_tutor_profile(principal, credential, "Tutor")
        async with inspector.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            "SELECT actor_id,subject_id,metadata::text metadata,"
                            "coalesce(request_id,'') request_id FROM audit_events "
                            "WHERE action='tutor_profile.created' AND subject_id=:account "
                            "ORDER BY occurred_at DESC LIMIT 1"
                        ),
                        {"account": str(principal.account_id)},
                    )
                )
                .mappings()
                .one()
            )
        assert row["actor_id"] == row["subject_id"] == str(principal.account_id)
        assert credential.digest not in " ".join(str(value) for value in row.values())
    finally:
        await runtime.dispose()
        await auth.dispose()
        await inspector.dispose()
