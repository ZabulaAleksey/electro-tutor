from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import command
from electro_tutor_api.adapters.database import create_provisioning_engine
from electro_tutor_api.adapters.provisioning import TrustedProvisioningAdapter
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.capabilities import CapabilityGrantService
from electro_tutor_api.application.profiles import ProfileService
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings, ProvisioningSettings, Settings
from electro_tutor_api.domain.capability import (
    CapabilityCode,
    CapabilityReason,
    IssueCapabilityCommand,
    RevokeCapabilityCommand,
    TutorProfileOperation,
)
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.errors import (
    AuditUnavailableError,
    CapabilityRequiredError,
    ProfileAlreadyExistsError,
)

LOCAL_POSTGRES_PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
LOCAL_RUNTIME = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)
LOCAL_AUTH = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)
LOCAL_MIGRATION = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)
LOCAL_PROVISIONING = (
    "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)


def integration_settings() -> tuple[Settings, MigrationSettings, ProvisioningSettings]:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    provisioning = os.getenv("ET_PROVISIONING_DATABASE_URL")
    auth = os.getenv("ET_AUTH_DATABASE_URL")
    if (runtime, auth, migration, provisioning) != (
        LOCAL_RUNTIME,
        LOCAL_AUTH,
        LOCAL_MIGRATION,
        LOCAL_PROVISIONING,
    ):
        pytest.skip("profile tests require exact disposable Tutor PostgreSQL roles/database")
    return (
        Settings(profile="test", runtime_database_url=runtime, auth_database_url=auth),
        MigrationSettings(profile="test", migration_database_url=migration),
        ProvisioningSettings(profile="test", provisioning_database_url=provisioning),
    )


def require_migration_consent() -> None:
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("profile migration lifecycle requires exact disposable DB consent")


async def create_account(runtime_engine: AsyncEngine) -> UUID:
    async with runtime_engine.begin() as connection:
        identity_id = await connection.scalar(
            text(
                "SELECT public.create_external_identity(CAST(:issuer AS text), "
                "CAST(:subject AS text), CAST(:email AS text))"
            ),
            {
                "issuer": "https://profile-test.invalid",
                "subject": str(uuid4()),
                "email": f"{uuid4()}@invalid.example",
            },
        )
        account_id = await connection.scalar(
            text("SELECT account_id FROM external_identities WHERE id=:identity_id"),
            {"identity_id": identity_id},
        )
    assert isinstance(account_id, UUID)
    return account_id


def principal(account_id: UUID) -> Principal:
    return Principal(
        account_id=account_id,
        identity_id=uuid4(),
        issuer="https://profile-test.invalid",
        subject=str(uuid4()),
        email=None,
        session_expires_at=datetime.now(UTC),
    )


async def create_authenticated_account(
    migration_engine: AsyncEngine, *, expires_at: datetime | None = None
) -> tuple[Principal, SessionCredential]:
    account_id = uuid4()
    identity_id = uuid4()
    token = f"profile-session-{uuid4()}"
    credential = SessionCredential.from_token(token)
    session_expires_at = expires_at or (datetime.now(UTC) + timedelta(minutes=10))
    actor = Principal(
        account_id=account_id,
        identity_id=identity_id,
        issuer="https://profile-test.invalid",
        subject=str(uuid4()),
        email=None,
        session_expires_at=session_expires_at,
    )
    async with migration_engine.begin() as connection:
        await connection.execute(text("INSERT INTO accounts(id) VALUES (:id)"), {"id": account_id})
        await connection.execute(
            text(
                "INSERT INTO external_identities(id,account_id,issuer,subject,email) "
                "VALUES (:id,:account_id,:issuer,:subject,NULL)"
            ),
            {
                "id": identity_id,
                "account_id": account_id,
                "issuer": actor.issuer,
                "subject": actor.subject,
            },
        )
        await connection.execute(
            text(
                "INSERT INTO application_sessions(token_digest,identity_id,expires_at) "
                "VALUES (:digest,:identity_id,:expires_at)"
            ),
            {
                "digest": credential.digest,
                "identity_id": identity_id,
                "expires_at": session_expires_at,
            },
        )
    return actor, credential


def issue_command(account_id: UUID) -> IssueCapabilityCommand:
    return IssueCapabilityCommand(
        subject_account_id=account_id,
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        operation_id=uuid4(),
        correlation_id=uuid4(),
        request_id="et-09.4c-integration",
        reason=CapabilityReason.TEST,
    )


def revoke_command(account_id: UUID, grant_id: UUID) -> RevokeCapabilityCommand:
    return RevokeCapabilityCommand(
        subject_account_id=account_id,
        grant_id=grant_id,
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        operation_id=uuid4(),
        correlation_id=uuid4(),
        request_id="et-09.4c-integration",
        reason=CapabilityReason.TEST,
    )


def provisioning_adapter(
    engine: AsyncEngine, settings: ProvisioningSettings
) -> TrustedProvisioningAdapter:
    return TrustedProvisioningAdapter(
        settings,
        CapabilityGrantService(lambda: PostgresUnitOfWork(engine)),
    )


@pytest.mark.integration
def test_profile_migration_populated_round_trip() -> None:
    require_migration_consent()
    runtime_settings, migration_settings, _ = integration_settings()
    config = alembic_config(migration_settings)
    command.downgrade(config, "20260909_0007")

    async def seed_account() -> UUID:
        engine = create_async_engine(runtime_settings.runtime_database_url)
        try:
            return await create_account(engine)
        finally:
            await engine.dispose()

    account_id = asyncio.run(seed_account())
    try:
        command.upgrade(config, "head")

        async def verify_upgrade() -> None:
            engine = create_async_engine(migration_settings.migration_database_url)
            try:
                async with engine.connect() as connection:
                    assert (
                        await connection.scalar(
                            text("SELECT count(*) FROM accounts WHERE id=:account_id"),
                            {"account_id": account_id},
                        )
                        == 1
                    )
                    assert (
                        await connection.scalar(text("SELECT count(*) FROM student_profiles")) == 0
                    )
                    assert await connection.scalar(text("SELECT count(*) FROM tutor_profiles")) == 0
            finally:
                await engine.dispose()

        asyncio.run(verify_upgrade())
        command.downgrade(config, "20260909_0007")

        async def verify_downgrade() -> None:
            engine = create_async_engine(migration_settings.migration_database_url)
            try:
                async with engine.connect() as connection:
                    assert (
                        await connection.scalar(text("SELECT to_regclass('student_profiles')"))
                        is None
                    )
                    assert (
                        await connection.scalar(text("SELECT to_regclass('tutor_profiles')"))
                        is None
                    )
            finally:
                await engine.dispose()

        asyncio.run(verify_downgrade())
    finally:
        command.upgrade(config, "head")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_profile_schema_constraints_and_runtime_least_privileges() -> None:
    runtime_settings, migration_settings, _ = integration_settings()
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    try:
        async with inspection_engine.connect() as connection:
            for table in ("student_profiles", "tutor_profiles"):
                constraints = set(
                    (
                        await connection.execute(
                            text(
                                "SELECT conname FROM pg_constraint "
                                "WHERE conrelid=CAST(:table AS regclass)"
                            ),
                            {"table": table},
                        )
                    ).scalars()
                )
                assert {
                    f"pk_{table}",
                    f"fk_{table}_account",
                    f"ck_{table}_display_name_length",
                    f"ck_{table}_display_name_control",
                    f"ck_{table}_display_name_normalized",
                    f"ck_{table}_timestamp_order",
                } <= constraints
                privileges = (
                    (
                        await connection.execute(
                            text(
                                """
                                SELECT
                                  has_table_privilege(
                                    'electro_tutor_runtime', :table, 'SELECT'
                                  ) can_read,
                                  has_table_privilege(
                                    'electro_tutor_runtime', :table, 'DELETE'
                                  ) can_delete,
                                  has_table_privilege(
                                    'electro_tutor_runtime', :table, 'TRUNCATE'
                                  ) can_truncate,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'account_id', 'INSERT'
                                  ) can_insert_owner,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'display_name', 'INSERT'
                                  ) can_insert_name,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'created_at', 'INSERT'
                                  ) can_spoof_created,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'display_name', 'UPDATE'
                                  ) can_update_name,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'updated_at', 'UPDATE'
                                  ) can_update_timestamp,
                                  has_column_privilege(
                                    'electro_tutor_runtime', :table, 'account_id', 'UPDATE'
                                  ) can_reowner
                                """
                            ),
                            {"table": table},
                        )
                    )
                    .mappings()
                    .one()
                )
                assert dict(privileges) == {
                    "can_read": False,
                    "can_delete": False,
                    "can_truncate": False,
                    "can_insert_owner": False,
                    "can_insert_name": False,
                    "can_spoof_created": False,
                    "can_update_name": False,
                    "can_update_timestamp": False,
                    "can_reowner": False,
                }

            function_security = {
                row["function_name"]: row
                for row in (
                    await connection.execute(
                        text(
                            """
                            SELECT p.proname function_name, p.prosecdef, p.proconfig,
                              has_function_privilege(
                                'electro_tutor_runtime', p.oid, 'EXECUTE'
                              ) runtime_execute,
                              (
                                SELECT count(*)
                                FROM aclexplode(
                                  coalesce(p.proacl, acldefault('f', p.proowner))
                                ) acl
                                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
                              ) public_execute
                            FROM pg_proc p
                            JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE n.nspname='public'
                              AND p.proname IN (
                                'read_student_profile', 'create_student_profile',
                                'update_student_profile', 'read_tutor_profile',
                                'create_tutor_profile', 'update_tutor_profile'
                              )
                            """
                        )
                    )
                ).mappings()
            }
            assert set(function_security) == {
                "read_student_profile",
                "create_student_profile",
                "update_student_profile",
                "read_tutor_profile",
                "create_tutor_profile",
                "update_tutor_profile",
            }
            for function in function_security.values():
                assert function["prosecdef"] is True
                assert function["proconfig"] == ["search_path=pg_catalog"]
                assert function["runtime_execute"] is True
                assert function["public_execute"] == 0

        actor, credential = await create_authenticated_account(inspection_engine)
        account_id = actor.account_id
        for statement in (
            "SELECT * FROM student_profiles WHERE account_id=:account_id",
            "INSERT INTO student_profiles (account_id, display_name) "
            "VALUES (:account_id, 'Student')",
            "UPDATE student_profiles SET display_name='Changed' WHERE account_id=:account_id",
            "DELETE FROM student_profiles WHERE account_id=:account_id",
            "SELECT * FROM tutor_profiles WHERE account_id=:account_id",
            "INSERT INTO tutor_profiles (account_id, display_name) VALUES (:account_id, 'Tutor')",
            "UPDATE tutor_profiles SET display_name='Changed' WHERE account_id=:account_id",
            "DELETE FROM tutor_profiles WHERE account_id=:account_id",
        ):
            with pytest.raises(SQLAlchemyError):
                async with runtime_engine.begin() as connection:
                    await connection.execute(
                        text(statement),
                        {"account_id": account_id},
                    )

        for invalid_name in ("", " leading", "double  space", "control\nname", "x" * 81):
            with pytest.raises(SQLAlchemyError):
                async with runtime_engine.begin() as connection:
                    await connection.execute(
                        text(
                            "SELECT pg_catalog.set_config("
                            "'electro_tutor.session_digest', :digest, true)"
                        ),
                        {"digest": credential.digest},
                    )
                    await connection.execute(
                        text(
                            "SELECT * FROM public.create_student_profile("
                            "CAST(:display_name AS text))"
                        ),
                        {"display_name": invalid_name},
                    )

        for function_call in (
            "SELECT * FROM public.read_tutor_profile(CAST(:account_id AS uuid))",
            "SELECT * FROM public.create_tutor_profile("
            "CAST(:account_id AS uuid), 'Tutor', NULL::uuid, NULL::text)",
            "SELECT * FROM public.update_tutor_profile(CAST(:account_id AS uuid), 'Tutor')",
        ):
            with pytest.raises(SQLAlchemyError):
                async with runtime_engine.begin() as connection:
                    await connection.execute(text(function_call), {"account_id": account_id})
    finally:
        await inspection_engine.dispose()
        await runtime_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_account_can_own_both_profiles_and_create_is_exactly_idempotent() -> None:
    runtime_settings, migration_settings, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        actor, credential = await create_authenticated_account(inspection_engine)
        account_id = actor.account_id
        service = ProfileService(lambda proof: PostgresUnitOfWork(runtime_engine, proof))
        grant = await provisioning_adapter(authority_engine, provisioning_settings).issue(
            issue_command(account_id)
        )

        student = await service.create_student_profile(actor, credential, " Student   Name ")
        student_replay = await service.create_student_profile(actor, credential, "Student Name")
        tutor, tutor_replay = await asyncio.gather(
            service.create_tutor_profile(actor, credential, " Tutor   Name "),
            service.create_tutor_profile(actor, credential, "Tutor Name"),
        )
        assert student == student_replay
        assert tutor == tutor_replay
        assert student.account_id == tutor.account_id == account_id

        with pytest.raises(ProfileAlreadyExistsError):
            await service.create_student_profile(actor, credential, "Different")
        with pytest.raises(ProfileAlreadyExistsError):
            await service.create_tutor_profile(actor, credential, "Different")

        async with inspection_engine.connect() as connection:
            profile_counts = (
                (
                    await connection.execute(
                        text(
                            "SELECT "
                            "(SELECT count(*) FROM student_profiles "
                            " WHERE account_id=:id) students, "
                            "(SELECT count(*) FROM tutor_profiles WHERE account_id=:id) tutors"
                        ),
                        {"id": account_id},
                    )
                )
                .mappings()
                .one()
            )
        async with authority_engine.connect() as connection:
            audit_count = await connection.scalar(
                text(
                    "SELECT count(*) FROM audit_events "
                    "WHERE subject_type='tutor_profile' AND subject_id=:subject_id "
                    "AND action='tutor_profile.created'"
                ),
                {"subject_id": str(account_id)},
            )
        assert dict(profile_counts) == {"students": 1, "tutors": 1}
        assert audit_count == 1
        assert grant.is_active
    finally:
        await runtime_engine.dispose()
        await inspection_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tutor_profile_audit_failure_rolls_back_creation() -> None:
    runtime_settings, migration_settings, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    trigger_created = False
    try:
        actor, credential = await create_authenticated_account(inspection_engine)
        account_id = actor.account_id
        await provisioning_adapter(authority_engine, provisioning_settings).issue(
            issue_command(account_id)
        )
        async with inspection_engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    CREATE FUNCTION public.fail_tutor_profile_audit_for_test()
                    RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
                    BEGIN
                      IF NEW.action = 'tutor_profile.created' THEN
                        RAISE EXCEPTION 'synthetic audit outage';
                      END IF;
                      RETURN NEW;
                    END;
                    $$;
                    """
                )
            )
            await connection.execute(
                text(
                    """
                    CREATE TRIGGER fail_tutor_profile_audit_for_test
                    BEFORE INSERT ON public.audit_events
                    FOR EACH ROW EXECUTE FUNCTION public.fail_tutor_profile_audit_for_test();
                    """
                )
            )
        trigger_created = True
        service = ProfileService(lambda proof: PostgresUnitOfWork(runtime_engine, proof))
        with pytest.raises(AuditUnavailableError):
            await service.create_tutor_profile(actor, credential, "Tutor")
        async with inspection_engine.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM tutor_profiles WHERE account_id=:id"),
                    {"id": account_id},
                )
                == 0
            )
    finally:
        if trigger_created:
            async with inspection_engine.begin() as connection:
                await connection.execute(
                    text("DROP TRIGGER fail_tutor_profile_audit_for_test ON audit_events")
                )
                await connection.execute(
                    text("DROP FUNCTION public.fail_tutor_profile_audit_for_test()")
                )
        await runtime_engine.dispose()
        await inspection_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tutor_update_serializes_with_revoke_and_revoke_removes_access() -> None:
    runtime_settings, migration_settings, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        actor, credential = await create_authenticated_account(inspection_engine)
        account_id = actor.account_id
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        grant = await adapter.issue(issue_command(account_id))
        service = ProfileService(lambda proof: PostgresUnitOfWork(runtime_engine, proof))
        student = await service.create_student_profile(actor, credential, "Student")
        await service.create_tutor_profile(actor, credential, "Tutor")

        async with PostgresUnitOfWork(runtime_engine, credential) as unit:
            assert await service._capability_evaluator.authorize_in(  # noqa: SLF001
                unit,
                actor,
                operation=TutorProfileOperation.UPDATE_OWN,
                resource_owner_account_id=account_id,
                for_update=True,
            )
            updated = await unit.profiles.update_tutor("Updated Tutor")
            assert updated is not None
            revoke_task = asyncio.create_task(adapter.revoke(revoke_command(account_id, grant.id)))
            await asyncio.sleep(0.1)
            assert revoke_task.done() is False
        await asyncio.wait_for(revoke_task, timeout=2)

        with pytest.raises(CapabilityRequiredError):
            await service.read_tutor_profile(actor, credential)
        with pytest.raises(CapabilityRequiredError):
            await service.update_tutor_profile(actor, credential, "Denied")
        assert await service.read_student_profile(actor, credential) == student
    finally:
        await runtime_engine.dispose()
        await inspection_engine.dispose()
        await authority_engine.dispose()
