from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from alembic import command
from electro_tutor_api.adapters.database import create_provisioning_engine
from electro_tutor_api.adapters.provisioning import TrustedProvisioningAdapter
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.capabilities import CapabilityEvaluator, CapabilityGrantService
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings, ProvisioningSettings, Settings
from electro_tutor_api.domain.capability import (
    CapabilityCode,
    CapabilityReason,
    IssueCapabilityCommand,
    RevokeCapabilityCommand,
    TutorProfileOperation,
)
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.errors import (
    AccountNotFoundError,
    AuditUnavailableError,
    CapabilityAlreadyGrantedError,
    IdempotencyConflictError,
)

LOCAL_POSTGRES_PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
LOCAL_RUNTIME = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
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
    if (runtime, migration, provisioning) != (
        LOCAL_RUNTIME,
        LOCAL_MIGRATION,
        LOCAL_PROVISIONING,
    ):
        pytest.skip("capability tests require exact disposable Tutor PostgreSQL roles/database")
    return (
        Settings(profile="test", runtime_database_url=runtime),
        MigrationSettings(profile="test", migration_database_url=migration),
        ProvisioningSettings(profile="test", provisioning_database_url=provisioning),
    )


def require_migration_consent() -> None:
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("capability migration lifecycle requires exact disposable DB consent")


async def create_account(runtime_engine: AsyncEngine, *, email: str | None = None) -> UUID:
    async with runtime_engine.begin() as connection:
        identity_id = await connection.scalar(
            text(
                "SELECT public.create_external_identity(CAST(:issuer AS text), "
                "CAST(:subject AS text), CAST(:email AS text))"
            ),
            {
                "issuer": "https://capability-test.invalid",
                "subject": str(uuid4()),
                "email": email or f"{uuid4()}@invalid.example",
            },
        )
        account_id = await connection.scalar(
            text("SELECT account_id FROM external_identities WHERE id = :identity_id"),
            {"identity_id": identity_id},
        )
    assert isinstance(account_id, UUID)
    return account_id


def provisioning_adapter(
    engine: AsyncEngine, settings: ProvisioningSettings
) -> TrustedProvisioningAdapter:
    service = CapabilityGrantService(lambda: PostgresUnitOfWork(engine))
    return TrustedProvisioningAdapter(settings, service)


def issue_command(
    account_id: UUID,
    *,
    operation_id: UUID | None = None,
    reason: CapabilityReason = CapabilityReason.TEST,
) -> IssueCapabilityCommand:
    return IssueCapabilityCommand(
        subject_account_id=account_id,
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        operation_id=operation_id or uuid4(),
        correlation_id=uuid4(),
        request_id="et-09.4b-integration",
        reason=reason,
    )


def revoke_command(
    account_id: UUID,
    grant_id: UUID,
    *,
    operation_id: UUID | None = None,
) -> RevokeCapabilityCommand:
    return RevokeCapabilityCommand(
        subject_account_id=account_id,
        grant_id=grant_id,
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        operation_id=operation_id or uuid4(),
        correlation_id=uuid4(),
        request_id="et-09.4b-integration",
        reason=CapabilityReason.TEST,
    )


@pytest.mark.integration
def test_capability_migration_empty_and_populated_round_trip() -> None:
    require_migration_consent()
    runtime_settings, migration_settings, _ = integration_settings()
    config = alembic_config(migration_settings)
    command.downgrade(config, "20260909_0006")

    async def seed() -> UUID:
        runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
        try:
            return await create_account(runtime_engine)
        finally:
            await runtime_engine.dispose()

    account_id = asyncio.run(seed())
    command.upgrade(config, "head")

    async def verify() -> None:
        migration_engine = create_async_engine(migration_settings.migration_database_url)
        try:
            async with migration_engine.connect() as connection:
                assert (
                    await connection.scalar(
                        text("SELECT count(*) FROM accounts WHERE id = :id"), {"id": account_id}
                    )
                    == 1
                )
                assert await connection.scalar(text("SELECT count(*) FROM capability_grants")) == 0
                assert (
                    await connection.scalar(
                        text("SELECT count(*) FROM capability_grant_operations")
                    )
                    == 0
                )
        finally:
            await migration_engine.dispose()

    asyncio.run(verify())
    command.downgrade(config, "20260909_0006")
    command.upgrade(config, "head")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_capability_schema_constraints_indexes_and_role_privileges() -> None:
    _, migration_settings, _ = integration_settings()
    engine = create_async_engine(migration_settings.migration_database_url)
    try:
        async with engine.connect() as connection:
            columns = set(
                (
                    await connection.execute(
                        text(
                            "SELECT column_name FROM information_schema.columns "
                            "WHERE table_schema='public' AND table_name='capability_grants'"
                        )
                    )
                ).scalars()
            )
            assert columns == {
                "id",
                "subject_account_id",
                "capability_code",
                "scope_kind",
                "scope_id",
                "issued_at",
                "issued_by_actor_type",
                "issued_by_actor_id",
                "issue_operation_id",
                "revoked_at",
                "revoked_by_actor_type",
                "revoked_by_actor_id",
                "revoke_operation_id",
            }
            constraints = set(
                (
                    await connection.execute(
                        text(
                            "SELECT conname FROM pg_constraint "
                            "WHERE conrelid='capability_grants'::regclass"
                        )
                    )
                ).scalars()
            )
            assert {
                "pk_capability_grants",
                "fk_capability_grants_subject_account",
                "fk_capability_grants_scope_account",
                "ck_capability_grants_code",
                "ck_capability_grants_scope_kind",
                "ck_capability_grants_account_scope",
                "ck_capability_grants_issuer",
                "ck_capability_grants_revoke_tuple",
            } <= constraints
            indexes = set(
                (
                    await connection.execute(
                        text(
                            "SELECT indexname FROM pg_indexes "
                            "WHERE schemaname='public' AND tablename='capability_grants'"
                        )
                    )
                ).scalars()
            )
            assert "uq_capability_grants_active_scope" in indexes
            privileges = (
                (
                    await connection.execute(
                        text(
                            """
                            SELECT
                              has_table_privilege(
                                'electro_tutor_runtime','capability_grants','SELECT'
                              ) runtime_read,
                              has_table_privilege(
                                'electro_tutor_runtime','capability_grants','INSERT'
                              ) runtime_insert,
                              has_table_privilege(
                                'electro_tutor_runtime','capability_grants','UPDATE'
                              ) runtime_update,
                              has_table_privilege(
                                'electro_tutor_provisioner','capability_grants','DELETE'
                              ) provisioner_delete,
                              has_column_privilege(
                                'electro_tutor_provisioner','capability_grants',
                                'subject_account_id','INSERT'
                              ) provisioner_issue,
                              has_column_privilege(
                                'electro_tutor_provisioner','capability_grants',
                                'revoked_at','UPDATE'
                              ) provisioner_revoke,
                              has_column_privilege(
                                'electro_tutor_provisioner','capability_grants',
                                'subject_account_id','UPDATE'
                              ) provisioner_reowner,
                              has_column_privilege(
                                'electro_tutor_provisioner','capability_grants',
                                'issued_at','INSERT'
                              ) provisioner_spoof_issued_at,
                              has_column_privilege(
                                'electro_tutor_provisioner','capability_grant_operations',
                                'completed_at','INSERT'
                              ) provisioner_spoof_completed_at,
                              has_table_privilege(
                                'electro_tutor_runtime','capability_grant_operations','SELECT'
                              ) runtime_operations
                            """
                        )
                    )
                )
                .mappings()
                .one()
            )
            assert dict(privileges) == {
                "runtime_read": True,
                "runtime_insert": False,
                "runtime_update": False,
                "provisioner_delete": False,
                "provisioner_issue": True,
                "provisioner_revoke": True,
                "provisioner_reowner": False,
                "provisioner_spoof_issued_at": False,
                "provisioner_spoof_completed_at": False,
                "runtime_operations": False,
            }
            lock_function = (
                (
                    await connection.execute(
                        text(
                            """
                            SELECT p.prosecdef, p.proconfig,
                              has_function_privilege(
                                'electro_tutor_runtime',
                                'public.lock_active_capability_grant(uuid,text)',
                                'EXECUTE'
                              ) runtime_execute,
                              (
                                SELECT count(*)
                                FROM aclexplode(
                                  coalesce(p.proacl, acldefault('f', p.proowner))
                                ) acl
                                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
                              ) public_execute
                            FROM pg_proc p
                            WHERE p.oid=to_regprocedure(
                              'public.lock_active_capability_grant(uuid,text)'
                            )
                            """
                        )
                    )
                )
                .mappings()
                .one()
            )
            assert dict(lock_function) == {
                "prosecdef": True,
                "proconfig": ["search_path=pg_catalog"],
                "runtime_execute": True,
                "public_execute": 0,
            }
            fk_target = await connection.scalar(
                text(
                    "SELECT confrelid::regclass::text FROM pg_constraint "
                    "WHERE conname='fk_capability_grants_subject_account'"
                )
            )
            assert fk_target == "accounts"
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_issue_retry_evaluate_revoke_and_audit_are_exactly_once() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        account_id = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        evaluator = CapabilityEvaluator(lambda: PostgresUnitOfWork(runtime_engine))
        issue = issue_command(account_id)

        first = await adapter.issue(issue)
        replay = await adapter.issue(issue_command(account_id, operation_id=issue.operation_id))
        assert first.id == replay.id
        assert (
            await evaluator.has_capability(account_id, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN)
            is True
        )

        revoke = revoke_command(account_id, first.id)
        revoked = await adapter.revoke(revoke)
        revoke_replay = await adapter.revoke(
            revoke_command(account_id, first.id, operation_id=revoke.operation_id)
        )
        assert revoked.id == revoke_replay.id == first.id
        assert revoked.is_active is False
        assert (
            await evaluator.has_capability(account_id, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN)
            is False
        )

        async with authority_engine.connect() as connection:
            grant_count = await connection.scalar(
                text("SELECT count(*) FROM capability_grants WHERE id = :id"), {"id": first.id}
            )
            operations = await connection.scalar(
                text(
                    "SELECT count(*) FROM capability_grant_operations "
                    "WHERE operation_id = ANY(:ids)"
                ),
                {"ids": [issue.operation_id, revoke.operation_id]},
            )
            audits = {
                row["operation_id"]: row
                for row in (
                    await connection.execute(
                        text(
                            "SELECT operation_id, actor_type, actor_id, subject_type, "
                            "subject_id, action, result, metadata FROM audit_events "
                            "WHERE operation_id = ANY(:ids)"
                        ),
                        {"ids": [issue.operation_id, revoke.operation_id]},
                    )
                ).mappings()
            }
        assert (grant_count, operations, len(audits)) == (1, 2, 2)
        assert audits[issue.operation_id]["action"] == "tutor_capability.granted"
        assert audits[revoke.operation_id]["action"] == "tutor_capability.revoked"
        for audit in audits.values():
            assert audit["actor_type"] == "service"
            assert audit["actor_id"] == "tutor-provisioner"
            assert audit["subject_type"] == "capability_grant"
            assert audit["subject_id"] == str(first.id)
            assert audit["result"] == "succeeded"
            assert audit["metadata"]["capability_code"] == "TUTOR_PROFILE_MANAGE_OWN"
            assert audit["metadata"]["scope_kind"] == "account"
            assert audit["metadata"]["scope_id"] == str(account_id)
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_operation_id_conflict_detects_changed_and_cross_action_intent() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        first_account = await create_account(runtime_engine)
        second_account = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        operation_id = uuid4()
        grant = await adapter.issue(issue_command(first_account, operation_id=operation_id))

        with pytest.raises(IdempotencyConflictError):
            await adapter.issue(issue_command(second_account, operation_id=operation_id))
        with pytest.raises(IdempotencyConflictError):
            await adapter.revoke(revoke_command(first_account, grant.id, operation_id=operation_id))
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_issue_requires_existing_internal_account_and_rolls_back_reservation() -> None:
    _, _, provisioning_settings = integration_settings()
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        command_value = issue_command(uuid4())
        with pytest.raises(AccountNotFoundError):
            await adapter.issue(command_value)
        async with authority_engine.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM capability_grant_operations "
                        "WHERE operation_id=:operation_id"
                    ),
                    {"operation_id": command_value.operation_id},
                )
                == 0
            )
    finally:
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_same_and_distinct_issue_is_database_serialized() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        same_account = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        repeated = issue_command(same_account)
        same_results = await asyncio.gather(adapter.issue(repeated), adapter.issue(repeated))
        assert same_results[0].id == same_results[1].id

        other_account = await create_account(runtime_engine)
        distinct = await asyncio.gather(
            adapter.issue(issue_command(other_account)),
            adapter.issue(issue_command(other_account)),
            return_exceptions=True,
        )
        assert sum(not isinstance(value, BaseException) for value in distinct) == 1
        assert sum(isinstance(value, CapabilityAlreadyGrantedError) for value in distinct) == 1
        async with authority_engine.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM capability_grants "
                        "WHERE subject_account_id=:id AND revoked_at IS NULL"
                    ),
                    {"id": other_account},
                )
                == 1
            )
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_revoke_and_grant_race_has_no_unaudited_authority() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        account_id = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        original = await adapter.issue(issue_command(account_id))

        repeated_revoke = revoke_command(account_id, original.id)
        revoke_results = await asyncio.gather(
            adapter.revoke(repeated_revoke), adapter.revoke(repeated_revoke)
        )
        assert revoke_results[0].id == revoke_results[1].id == original.id

        active = await adapter.issue(issue_command(account_id))
        race_issue = issue_command(account_id)
        race_revoke = revoke_command(account_id, active.id)
        results = await asyncio.gather(
            adapter.issue(race_issue), adapter.revoke(race_revoke), return_exceptions=True
        )
        assert not isinstance(results[1], BaseException)
        assert not isinstance(results[0], BaseException) or isinstance(
            results[0], CapabilityAlreadyGrantedError
        )
        async with authority_engine.connect() as connection:
            active_count = await connection.scalar(
                text(
                    "SELECT count(*) FROM capability_grants "
                    "WHERE subject_account_id=:id AND revoked_at IS NULL"
                ),
                {"id": account_id},
            )
            operation_count = await connection.scalar(
                text(
                    "SELECT count(*) FROM capability_grant_operations "
                    "WHERE operation_id = ANY(:ids)"
                ),
                {"ids": [race_issue.operation_id, race_revoke.operation_id]},
            )
            audit_count = await connection.scalar(
                text("SELECT count(*) FROM audit_events WHERE operation_id = ANY(:ids)"),
                {"ids": [race_issue.operation_id, race_revoke.operation_id]},
            )
        assert active_count <= 1
        assert operation_count == audit_count
        assert operation_count in {1, 2}
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_for_update_evaluation_serializes_with_revoke() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        account_id = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        grant = await adapter.issue(issue_command(account_id))
        evaluator = CapabilityEvaluator(lambda: PostgresUnitOfWork(runtime_engine))
        principal = Principal(
            account_id=account_id,
            identity_id=uuid4(),
            issuer="https://issuer.example.test/realms/electro-tutor",
            subject="subject",
            email=None,
            session_expires_at=datetime.now(UTC),
        )

        async with PostgresUnitOfWork(runtime_engine) as unit:
            assert await evaluator.authorize_in(
                unit,
                principal,
                TutorProfileOperation.UPDATE_OWN,
                account_id,
                for_update=True,
            )
            revoke_task = asyncio.create_task(adapter.revoke(revoke_command(account_id, grant.id)))
            await asyncio.sleep(0.1)
            assert revoke_task.done() is False
        revoked = await asyncio.wait_for(revoke_task, timeout=2)
        assert revoked.is_active is False
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


class FailingAuditRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def append(self, _event: object) -> object:
        try:
            await self._connection.execute(
                text(
                    "INSERT INTO audit_events (actor_type, actor_id, subject_type, subject_id, "
                    "action, result, correlation_id, operation_id, metadata) VALUES "
                    "('invalid', 'invalid', 'account', :subject_id, "
                    "'tutor_capability.granted', 'succeeded', :correlation_id, "
                    ":operation_id, '{}'::jsonb)"
                ),
                {
                    "subject_id": str(uuid4()),
                    "correlation_id": uuid4(),
                    "operation_id": uuid4(),
                },
            )
        except Exception as exc:
            raise AuditUnavailableError() from exc
        raise AssertionError("audit constraint unexpectedly accepted invalid actor")


class AuditFailingUnitOfWork(PostgresUnitOfWork):
    async def __aenter__(self) -> AuditFailingUnitOfWork:
        await super().__aenter__()
        self.audit_events = FailingAuditRepository(self.connection)  # type: ignore[assignment]
        return self


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_database_audit_failure_rolls_back_issue_and_revoke() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        account_id = await create_account(runtime_engine)
        good = provisioning_adapter(authority_engine, provisioning_settings)
        failing = TrustedProvisioningAdapter(
            provisioning_settings,
            CapabilityGrantService(lambda: AuditFailingUnitOfWork(authority_engine)),
        )
        failed_issue = issue_command(account_id)
        with pytest.raises(AuditUnavailableError):
            await failing.issue(failed_issue)
        async with authority_engine.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM capability_grants "
                        "WHERE issue_operation_id=:operation_id"
                    ),
                    {"operation_id": failed_issue.operation_id},
                )
                == 0
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM capability_grant_operations "
                        "WHERE operation_id=:operation_id"
                    ),
                    {"operation_id": failed_issue.operation_id},
                )
                == 0
            )

        grant = await good.issue(issue_command(account_id))
        failed_revoke = revoke_command(account_id, grant.id)
        with pytest.raises(AuditUnavailableError):
            await failing.revoke(failed_revoke)
        async with authority_engine.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            "SELECT revoked_at, revoke_operation_id FROM capability_grants "
                            "WHERE id=:id"
                        ),
                        {"id": grant.id},
                    )
                )
                .mappings()
                .one()
            )
            assert row["revoked_at"] is None
            assert row["revoke_operation_id"] is None
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM capability_grant_operations "
                        "WHERE operation_id=:operation_id"
                    ),
                    {"operation_id": failed_revoke.operation_id},
                )
                == 0
            )
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_runtime_cannot_mutate_grants_and_revoked_rows_are_database_immutable() -> None:
    runtime_settings, _, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        account_id = await create_account(runtime_engine)
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        grant = await adapter.issue(issue_command(account_id))
        revoked = await adapter.revoke(revoke_command(account_id, grant.id))

        with pytest.raises(SQLAlchemyError):
            async with runtime_engine.begin() as connection:
                await connection.execute(
                    text(
                        "INSERT INTO capability_grants "
                        "(id, subject_account_id, capability_code, scope_kind, scope_id, "
                        "issued_by_actor_type, issued_by_actor_id, issue_operation_id) "
                        "VALUES (:id, :account_id, 'TUTOR_PROFILE_MANAGE_OWN', 'account', "
                        ":account_id, 'service', 'tutor-provisioner', :operation_id)"
                    ),
                    {"id": uuid4(), "account_id": account_id, "operation_id": uuid4()},
                )
        with pytest.raises(SQLAlchemyError):
            async with runtime_engine.begin() as connection:
                await connection.execute(
                    text("DELETE FROM capability_grants WHERE id=:id"), {"id": grant.id}
                )
        with pytest.raises(SQLAlchemyError):
            async with authority_engine.begin() as connection:
                await connection.execute(
                    text("UPDATE capability_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id=:id"),
                    {"id": revoked.id},
                )
    finally:
        await runtime_engine.dispose()
        await authority_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_account_scope_does_not_follow_email_or_provider_identity() -> None:
    runtime_settings, migration_settings, provisioning_settings = integration_settings()
    runtime_engine = create_async_engine(runtime_settings.runtime_database_url)
    migration_engine = create_async_engine(migration_settings.migration_database_url)
    authority_engine = create_provisioning_engine(provisioning_settings)
    try:
        shared_email = "same-email@invalid.example"
        first_account = await create_account(runtime_engine, email=shared_email)
        second_account = await create_account(runtime_engine, email=shared_email)
        assert first_account != second_account
        async with migration_engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO external_identities "
                    "(id, account_id, issuer, subject, email) "
                    "VALUES (:id, :account_id, :issuer, :subject, :email)"
                ),
                {
                    "id": uuid4(),
                    "account_id": first_account,
                    "issuer": "https://second-provider.invalid",
                    "subject": str(uuid4()),
                    "email": "different@invalid.example",
                },
            )
        adapter = provisioning_adapter(authority_engine, provisioning_settings)
        await adapter.issue(issue_command(first_account))
        evaluator = CapabilityEvaluator(lambda: PostgresUnitOfWork(runtime_engine))

        assert (
            await evaluator.has_capability(first_account, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN)
            is True
        )
        assert (
            await evaluator.has_capability(second_account, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN)
            is False
        )
        async with migration_engine.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM external_identities WHERE account_id=:id"),
                    {"id": first_account},
                )
                == 2
            )
    finally:
        await runtime_engine.dispose()
        await migration_engine.dispose()
        await authority_engine.dispose()
