from __future__ import annotations

import os
from datetime import UTC
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import command
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings, Settings
from electro_tutor_api.domain.audit import (
    AuditAction,
    AuditActor,
    AuditResult,
    AuditSubjectType,
    NewAuditEvent,
    TrustedAuditService,
)
from electro_tutor_api.errors import AuditUnavailableError

LOCAL_POSTGRES_PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
LOCAL_RUNTIME = (
    f"postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:"
    f"{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)
LOCAL_MIGRATION = (
    f"postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:"
    f"{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)


def runtime_settings() -> Settings:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    if runtime != LOCAL_RUNTIME:
        pytest.skip("audit integration tests require the exact electro_tutor_test database")
    return Settings(profile="test", runtime_database_url=runtime)


def migration_settings() -> MigrationSettings:
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if migration != LOCAL_MIGRATION:
        pytest.skip("audit integration tests require the exact electro_tutor_test database")
    return MigrationSettings(profile="test", migration_database_url=migration)


def require_migration_consent() -> None:
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("audit migration tests require the exact disposable DB consent marker")


def event(*, operation_id: UUID | None = None, correlation_id: UUID | None = None) -> NewAuditEvent:
    return NewAuditEvent(
        actor=AuditActor.from_trusted_service(TrustedAuditService.TUTOR_PROVISIONER),
        subject_type=AuditSubjectType.ACCOUNT,
        subject_id=str(uuid4()),
        action=AuditAction.TUTOR_CAPABILITY_GRANTED,
        result=AuditResult.SUCCEEDED,
        request_id="et-09.4a-integration",
        correlation_id=correlation_id or uuid4(),
        operation_id=operation_id or uuid4(),
        metadata={
            "capability_code": "TUTOR_PROFILE_MANAGE_OWN",
            "scope_kind": "account",
        },
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_audit_migration_schema_and_forward_compatible_identity_references() -> None:
    require_migration_consent()
    engine = create_async_engine(migration_settings().migration_database_url)
    try:
        async with engine.connect() as connection:
            columns = {
                row["column_name"]: row
                for row in (
                    await connection.execute(
                        text(
                            "SELECT column_name, data_type, udt_name, is_nullable, column_default "
                            "FROM information_schema.columns "
                            "WHERE table_schema = 'public' AND table_name = 'audit_events'"
                        )
                    )
                ).mappings()
            }
            assert set(columns) == {
                "event_id",
                "schema_version",
                "occurred_at",
                "actor_type",
                "actor_id",
                "subject_type",
                "subject_id",
                "action",
                "result",
                "request_id",
                "correlation_id",
                "operation_id",
                "metadata",
            }
            assert columns["event_id"]["udt_name"] == "uuid"
            assert columns["occurred_at"]["data_type"] == "timestamp with time zone"
            assert columns["metadata"]["udt_name"] == "jsonb"
            assert columns["request_id"]["is_nullable"] == "YES"
            assert all(
                row["is_nullable"] == "NO" for name, row in columns.items() if name != "request_id"
            )
            foreign_keys = await connection.scalar(
                text(
                    "SELECT count(*) FROM pg_constraint "
                    "WHERE conrelid = 'audit_events'::regclass AND contype = 'f'"
                )
            )
            assert foreign_keys == 0
            constraints = set(
                (
                    await connection.execute(
                        text(
                            "SELECT conname FROM pg_constraint "
                            "WHERE conrelid = 'audit_events'::regclass"
                        )
                    )
                ).scalars()
            )
            assert {
                "pk_audit_events",
                "uq_audit_events_operation_id",
                "ck_audit_events_schema_version",
                "ck_audit_events_actor_type",
                "ck_audit_events_subject_type",
                "ck_audit_events_action",
                "ck_audit_events_result",
                "ck_audit_events_metadata_object",
                "ck_audit_events_metadata_size",
                "ck_audit_events_metadata_key_count",
                "ck_audit_events_metadata_scalar",
                "ck_audit_events_metadata_keys",
                "ck_audit_events_metadata_values",
            } <= constraints
            indexes = set(
                (
                    await connection.execute(
                        text(
                            "SELECT indexname FROM pg_indexes "
                            "WHERE schemaname = 'public' AND tablename = 'audit_events'"
                        )
                    )
                ).scalars()
            )
            assert {
                "ix_audit_events_occurred_at",
                "ix_audit_events_correlation_id",
                "ix_audit_events_subject_occurred_at",
            } <= indexes
            privileges = (
                (
                    await connection.execute(
                        text(
                            "SELECT "
                            "has_table_privilege('electro_tutor_runtime', "
                            "'audit_events', 'SELECT') "
                            "AS can_select, "
                            "has_table_privilege('electro_tutor_runtime', "
                            "'audit_events', 'UPDATE') "
                            "AS can_update, "
                            "has_table_privilege('electro_tutor_runtime', "
                            "'audit_events', 'DELETE') "
                            "AS can_delete, "
                            "has_table_privilege('electro_tutor_runtime', "
                            "'audit_events', 'TRUNCATE') "
                            "AS can_truncate, "
                            "has_column_privilege('electro_tutor_runtime', 'audit_events', "
                            "'actor_type', 'INSERT') AS can_insert_actor, "
                            "has_column_privilege('electro_tutor_runtime', 'audit_events', "
                            "'event_id', 'INSERT') AS can_insert_event_id"
                        )
                    )
                )
                .mappings()
                .one()
            )
            assert privileges == {
                "can_select": True,
                "can_update": False,
                "can_delete": False,
                "can_truncate": False,
                "can_insert_actor": True,
                "can_insert_event_id": False,
            }
    finally:
        await engine.dispose()


@pytest.mark.integration
def test_audit_migration_downgrade_and_upgrade_round_trip() -> None:
    require_migration_consent()
    settings = migration_settings()
    config = alembic_config(settings)
    command.downgrade(config, "20260908_0004")
    engine = create_async_engine(settings.migration_database_url)
    try:

        async def table_is_absent() -> bool:
            async with engine.connect() as connection:
                return (
                    await connection.scalar(text("SELECT to_regclass('public.audit_events')"))
                    is None
                )

        import asyncio

        assert asyncio.run(table_is_absent())
    finally:
        asyncio.run(engine.dispose())
        command.upgrade(config, "head")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_valid_event_commits_once_and_reads_by_correlation() -> None:
    engine = create_async_engine(runtime_settings().runtime_database_url)
    correlation_id = uuid4()
    try:
        async with PostgresUnitOfWork(engine) as unit:
            persisted = await unit.audit_events.append(event(correlation_id=correlation_id))
            assert persisted.schema_version == 1
            assert persisted.occurred_at.tzinfo is not None
            assert persisted.occurred_at.utcoffset() == UTC.utcoffset(persisted.occurred_at)
            assert persisted.metadata["capability_code"] == "TUTOR_PROFILE_MANAGE_OWN"
        async with PostgresUnitOfWork(engine) as unit:
            correlated = await unit.audit_events.for_correlation(correlation_id)
            assert [item.event_id for item in correlated] == [persisted.event_id]
            count = await unit.connection.scalar(
                text("SELECT count(*) FROM audit_events WHERE event_id = :event_id"),
                {"event_id": persisted.event_id},
            )
            assert count == 1
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_event_id_uniqueness_and_server_controlled_columns_are_database_enforced() -> None:
    require_migration_consent()
    migration_engine = create_async_engine(migration_settings().migration_database_url)
    runtime_engine = create_async_engine(runtime_settings().runtime_database_url)
    event_id = uuid4()
    insert = text(
        """
        INSERT INTO audit_events (
            event_id, actor_type, actor_id, subject_type, subject_id, action, result,
            correlation_id, operation_id, metadata
        ) VALUES (
            :event_id, 'service', 'tutor-provisioner', 'account', :subject_id,
            'tutor_capability.granted', 'succeeded', :correlation_id, :operation_id, '{}'::jsonb
        )
        """
    )
    try:
        async with migration_engine.begin() as connection:
            await connection.execute(
                insert,
                {
                    "event_id": event_id,
                    "subject_id": str(uuid4()),
                    "correlation_id": uuid4(),
                    "operation_id": uuid4(),
                },
            )
        async with migration_engine.begin() as connection:
            with pytest.raises(SQLAlchemyError):
                await connection.execute(
                    insert,
                    {
                        "event_id": event_id,
                        "subject_id": str(uuid4()),
                        "correlation_id": uuid4(),
                        "operation_id": uuid4(),
                    },
                )
        async with runtime_engine.begin() as connection:
            with pytest.raises(SQLAlchemyError):
                await connection.execute(
                    insert,
                    {
                        "event_id": uuid4(),
                        "subject_id": str(uuid4()),
                        "correlation_id": uuid4(),
                        "operation_id": uuid4(),
                    },
                )
    finally:
        await migration_engine.dispose()
        await runtime_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "metadata",
    [
        {f"key_{index}": index for index in range(17)},
        {"reason_category": {"nested": "forbidden"}},
        {"email": "private@invalid.example"},
        {"reason_category": "eyJhbGciOiJub25lIn0.payload.signature"},
        {"reason_category": None},
    ],
)
async def test_runtime_insert_cannot_bypass_metadata_contract(metadata: object) -> None:
    import json

    engine = create_async_engine(runtime_settings().runtime_database_url)
    try:
        async with engine.begin() as connection:
            with pytest.raises(SQLAlchemyError):
                await connection.execute(
                    text(
                        "INSERT INTO audit_events ("
                        "actor_type, actor_id, subject_type, subject_id, action, result, "
                        "correlation_id, operation_id, metadata) VALUES ("
                        "'service', 'tutor-provisioner', 'account', :subject_id, "
                        "'tutor_capability.granted', 'succeeded', :correlation_id, "
                        ":operation_id, CAST(:metadata AS jsonb))"
                    ),
                    {
                        "subject_id": str(uuid4()),
                        "correlation_id": uuid4(),
                        "operation_id": uuid4(),
                        "metadata": json.dumps(metadata),
                    },
                )
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_runtime_role_cannot_update_delete_or_truncate_audit_events() -> None:
    require_migration_consent()
    engine = create_async_engine(runtime_settings().runtime_database_url)
    try:
        async with PostgresUnitOfWork(engine) as unit:
            persisted = await unit.audit_events.append(event())
        for statement in (
            "UPDATE audit_events SET result = 'failed' WHERE event_id = :event_id",
            "DELETE FROM audit_events WHERE event_id = :event_id",
            "TRUNCATE TABLE audit_events",
        ):
            async with engine.connect() as connection:
                transaction = await connection.begin()
                try:
                    with pytest.raises(SQLAlchemyError):
                        await connection.execute(text(statement), {"event_id": persisted.event_id})
                finally:
                    await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_exception_after_append_rolls_back_without_repository_autocommit() -> None:
    engine = create_async_engine(runtime_settings().runtime_database_url)
    draft = event()
    try:
        with pytest.raises(RuntimeError, match="after append"):
            async with PostgresUnitOfWork(engine) as unit:
                persisted = await unit.audit_events.append(draft)
                raise RuntimeError("after append")
        async with engine.connect() as connection:
            count = await connection.scalar(
                text("SELECT count(*) FROM audit_events WHERE event_id = :event_id"),
                {"event_id": persisted.event_id},
            )
        assert count == 0
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_audit_constraint_failure_rolls_back_surrounding_mutation() -> None:
    engine = create_async_engine(runtime_settings().runtime_database_url)
    duplicate_operation_id = uuid4()
    identity_id = uuid4()
    issuer = "http://127.0.0.1:58081/realms/electro-tutor-dev"
    subject = f"et-audit-rollback-{uuid4()}"
    try:
        async with PostgresUnitOfWork(engine) as unit:
            await unit.audit_events.append(event(operation_id=duplicate_operation_id))
        with pytest.raises(AuditUnavailableError) as raised:
            async with PostgresUnitOfWork(engine) as unit:
                await unit.connection.execute(
                    text(
                        "INSERT INTO external_identities (id, issuer, subject, email) "
                        "VALUES (:id, :issuer, :subject, NULL)"
                    ),
                    {"id": identity_id, "issuer": issuer, "subject": subject},
                )
                await unit.audit_events.append(event(operation_id=duplicate_operation_id))
        assert raised.value.code == "audit_unavailable"
        assert raised.value.status_code == 503
        async with engine.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM external_identities WHERE id = :id"),
                    {"id": identity_id},
                )
                == 0
            )
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_unit_of_work_rejects_accidental_nested_or_reused_transaction() -> None:
    engine: AsyncEngine = create_async_engine(runtime_settings().runtime_database_url)
    unit = PostgresUnitOfWork(engine)
    try:
        async with unit:
            with pytest.raises(RuntimeError, match="cannot be nested"):
                async with unit:
                    pass
        with pytest.raises(RuntimeError, match="cannot be nested or reused"):
            async with unit:
                pass
    finally:
        await engine.dispose()
