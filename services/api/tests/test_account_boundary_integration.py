import asyncio
import hashlib
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.database import expected_revision
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings, Settings
from electro_tutor_api.domain.identity import ExternalIdentity

LOCAL_POSTGRES_PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
LOCAL_RUNTIME = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)
LOCAL_MIGRATION = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{LOCAL_POSTGRES_PORT}/electro_tutor_test"
)


def disposable_runtime_settings() -> Settings:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    if runtime != LOCAL_RUNTIME:
        pytest.skip("integration mutation tests require the exact electro_tutor_test database")
    return Settings(profile="test", runtime_database_url=runtime)


def disposable_migration_settings() -> MigrationSettings:
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if migration != LOCAL_MIGRATION:
        pytest.skip("integration mutation tests require the exact electro_tutor_test database")
    return MigrationSettings(profile="test", migration_database_url=migration)


def require_migration_consent() -> None:
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("named disposable DB migration consent is required")


async def _seed_pre_account_schema(
    database_url: str,
    *,
    identity_ids: tuple[UUID, UUID],
    session_digest: str,
) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            for position, identity_id in enumerate(identity_ids):
                await connection.execute(
                    text(
                        """
                        INSERT INTO external_identities (id, issuer, subject, email)
                        VALUES (:id, :issuer, :subject, :email)
                        """
                    ),
                    {
                        "id": identity_id,
                        "issuer": "https://backfill.invalid",
                        "subject": f"backfill-{identity_id}",
                        "email": f"backfill-{position}@invalid.example",
                    },
                )
            await connection.execute(
                text(
                    """
                    INSERT INTO application_sessions (token_digest, identity_id, expires_at)
                    VALUES (:token_digest, :identity_id, :expires_at)
                    """
                ),
                {
                    "token_digest": session_digest,
                    "identity_id": identity_ids[0],
                    "expires_at": datetime.now(UTC) + timedelta(minutes=10),
                },
            )
    finally:
        await engine.dispose()


@pytest.mark.integration
def test_populated_account_migration_backfill_catalog_and_round_trip() -> None:
    require_migration_consent()
    migration_settings = disposable_migration_settings()
    runtime_settings = disposable_runtime_settings()
    config = alembic_config(migration_settings)
    identity_ids = (uuid4(), uuid4())
    session_digest = hashlib.sha256(f"backfill-{uuid4()}".encode()).hexdigest()

    async def verify_upgrade() -> None:
        migration_engine = create_async_engine(migration_settings.migration_database_url)
        try:
            async with migration_engine.connect() as connection:
                account_count = await connection.scalar(text("SELECT count(*) FROM accounts"))
                identity_count = await connection.scalar(
                    text("SELECT count(*) FROM external_identities")
                )
                backfilled = (
                    (
                        await connection.execute(
                            text(
                                """
                                SELECT id, account_id
                                FROM external_identities
                                WHERE id = ANY(:identity_ids)
                                ORDER BY id
                                """
                            ),
                            {"identity_ids": list(identity_ids)},
                        )
                    )
                    .mappings()
                    .all()
                )
                columns = (
                    (
                        await connection.execute(
                            text(
                                """
                                SELECT table_name, column_name, data_type, is_nullable
                                FROM information_schema.columns
                                WHERE table_schema = 'public'
                                  AND (table_name = 'accounts'
                                    OR (table_name = 'external_identities'
                                        AND column_name = 'account_id'))
                                ORDER BY table_name, column_name
                                """
                            )
                        )
                    )
                    .mappings()
                    .all()
                )
                constraints = set(
                    (
                        await connection.execute(
                            text(
                                """
                                SELECT conname
                                FROM pg_constraint
                                WHERE conname IN (
                                    'pk_accounts',
                                    'fk_external_identities_account',
                                    'uq_external_identities_issuer_subject'
                                )
                                """
                            )
                        )
                    ).scalars()
                )
                delete_action = await connection.scalar(
                    text(
                        """
                        SELECT confdeltype
                        FROM pg_constraint
                        WHERE conname = 'fk_external_identities_account'
                        """
                    )
                )
                index_exists = await connection.scalar(
                    text(
                        """
                        SELECT count(*)
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                          AND indexname = 'ix_external_identities_account_id'
                        """
                    )
                )
                creation_function = await connection.scalar(
                    text(
                        "SELECT to_regprocedure('public.create_external_identity(text,text,text)')"
                    )
                )
                function_security = (
                    (
                        await connection.execute(
                            text(
                                """
                                SELECT
                                    p.prosecdef,
                                    p.proconfig,
                                    (
                                        SELECT count(*)
                                        FROM aclexplode(
                                            coalesce(
                                                p.proacl,
                                                acldefault('f', p.proowner)
                                            )
                                        ) AS acl
                                        WHERE acl.grantee = 0
                                          AND acl.privilege_type = 'EXECUTE'
                                    ) AS public_execute
                                FROM pg_proc AS p
                                WHERE p.oid = to_regprocedure(
                                    'public.create_external_identity(text,text,text)'
                                )
                                """
                            )
                        )
                    )
                    .mappings()
                    .one()
                )
                runtime_account_insert = await connection.scalar(
                    text(
                        "SELECT has_table_privilege('electro_tutor_runtime', 'accounts', 'INSERT')"
                    )
                )
                runtime_identity_insert = await connection.scalar(
                    text(
                        "SELECT has_table_privilege("
                        "'electro_tutor_runtime', 'external_identities', 'INSERT')"
                    )
                )
                runtime_creation_execute = await connection.scalar(
                    text(
                        "SELECT has_function_privilege("
                        "'electro_tutor_runtime', "
                        "'public.create_external_identity(text,text,text)', 'EXECUTE')"
                    )
                )
            assert account_count == identity_count
            assert len(backfilled) == 2
            assert {row["id"] for row in backfilled} == set(identity_ids)
            assert all(row["account_id"] == row["id"] for row in backfilled)
            assert [tuple(row.values()) for row in columns] == [
                ("accounts", "created_at", "timestamp with time zone", "NO"),
                ("accounts", "id", "uuid", "NO"),
                ("external_identities", "account_id", "uuid", "NO"),
            ]
            assert constraints == {
                "pk_accounts",
                "fk_external_identities_account",
                "uq_external_identities_issuer_subject",
            }
            assert delete_action == b"r"
            assert index_exists == 1
            assert creation_function == "create_external_identity(text,text,text)"
            assert function_security == {
                "prosecdef": True,
                "proconfig": ["search_path=pg_catalog"],
                "public_execute": 0,
            }
            assert runtime_account_insert is False
            assert runtime_identity_insert is False
            assert runtime_creation_execute is True
        finally:
            await migration_engine.dispose()

        repository = AuthRepository(create_async_engine(runtime_settings.runtime_database_url))
        try:
            principal = await repository.principal_for_session(session_digest)
            assert principal is not None
            assert principal.identity_id == identity_ids[0]
            assert principal.account_id == identity_ids[0]
        finally:
            await repository.engine.dispose()

    async def verify_downgrade() -> None:
        engine = create_async_engine(migration_settings.migration_database_url)
        try:
            async with engine.connect() as connection:
                assert (
                    await connection.scalar(text("SELECT to_regclass('public.accounts')")) is None
                )
                account_column = await connection.scalar(
                    text(
                        """
                        SELECT count(*)
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'external_identities'
                          AND column_name = 'account_id'
                        """
                    )
                )
                preserved_identities = await connection.scalar(
                    text("SELECT count(*) FROM external_identities WHERE id = ANY(:identity_ids)"),
                    {"identity_ids": list(identity_ids)},
                )
                preserved_session = await connection.scalar(
                    text("SELECT count(*) FROM application_sessions WHERE token_digest = :digest"),
                    {"digest": session_digest},
                )
                creation_function = await connection.scalar(
                    text(
                        "SELECT to_regprocedure('public.create_external_identity(text,text,text)')"
                    )
                )
                runtime_identity_insert = await connection.scalar(
                    text(
                        "SELECT has_table_privilege("
                        "'electro_tutor_runtime', 'external_identities', 'INSERT')"
                    )
                )
            assert account_column == 0
            assert preserved_identities == 2
            assert preserved_session == 1
            assert creation_function is None
            assert runtime_identity_insert is True
        finally:
            await engine.dispose()

    try:
        command.downgrade(config, "20260908_0005")
        asyncio.run(
            _seed_pre_account_schema(
                migration_settings.migration_database_url,
                identity_ids=identity_ids,
                session_digest=session_digest,
            )
        )
        command.upgrade(config, "head")
        assert expected_revision() == "20260909_0006"
        asyncio.run(verify_upgrade())
        command.downgrade(config, "20260908_0005")
        asyncio.run(verify_downgrade())
    finally:
        command.upgrade(config, "head")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_first_login_reuses_account_and_email_never_links_accounts() -> None:
    migration_settings = disposable_migration_settings()
    repository = AuthRepository(
        create_async_engine(disposable_runtime_settings().runtime_database_url)
    )
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    issuer = f"https://login-{uuid4()}.invalid"
    shared_email = f"shared-{uuid4()}@invalid.example"
    try:
        first_identity = ExternalIdentity(issuer=issuer, subject="first", email=shared_email)
        identity_id = await repository.resolve_identity(first_identity)
        repeated_id = await repository.resolve_identity(
            ExternalIdentity(issuer=issuer, subject="first", email="changed@invalid.example")
        )
        other_id = await repository.resolve_identity(
            ExternalIdentity(issuer=issuer, subject="second", email=shared_email)
        )
        async with inspection_engine.connect() as connection:
            rows = (
                (
                    await connection.execute(
                        text(
                            """
                            SELECT id, account_id
                            FROM external_identities
                            WHERE id IN (:first_id, :other_id)
                            """
                        ),
                        {"first_id": identity_id, "other_id": other_id},
                    )
                )
                .mappings()
                .all()
            )
            orphan_count = await connection.scalar(
                text(
                    """
                    SELECT count(*)
                    FROM accounts AS a
                    LEFT JOIN external_identities AS i ON i.account_id = a.id
                    WHERE i.id IS NULL
                    """
                )
            )
        assert repeated_id == identity_id
        assert other_id != identity_id
        assert len({row["account_id"] for row in rows}) == 2
        assert orphan_count == 0
    finally:
        await repository.engine.dispose()
        await inspection_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_first_login_has_one_identity_account_and_no_orphan() -> None:
    migration_settings = disposable_migration_settings()
    engine = create_async_engine(disposable_runtime_settings().runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    repository = AuthRepository(engine)
    identity = ExternalIdentity(
        issuer=f"https://concurrent-{uuid4()}.invalid",
        subject="same-subject",
        email="concurrent@invalid.example",
    )
    try:
        resolved = await asyncio.gather(*(repository.resolve_identity(identity) for _ in range(8)))
        async with inspection_engine.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            """
                            SELECT count(*) AS identities, count(DISTINCT account_id) AS accounts
                            FROM external_identities
                            WHERE issuer = :issuer AND subject = :subject
                            """
                        ),
                        {"issuer": identity.issuer, "subject": identity.subject},
                    )
                )
                .mappings()
                .one()
            )
            orphan_count = await connection.scalar(
                text(
                    """
                    SELECT count(*)
                    FROM accounts AS a
                    LEFT JOIN external_identities AS i ON i.account_id = a.id
                    WHERE i.id IS NULL
                    """
                )
            )
        assert len(set(resolved)) == 1
        assert row == {"identities": 1, "accounts": 1}
        assert orphan_count == 0
    finally:
        await engine.dispose()
        await inspection_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_failed_identity_insert_rolls_back_candidate_account() -> None:
    migration_settings = disposable_migration_settings()
    engine = create_async_engine(disposable_runtime_settings().runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    repository = AuthRepository(engine)
    try:
        async with inspection_engine.connect() as connection:
            before = await connection.scalar(text("SELECT count(*) FROM accounts"))
        invalid = ExternalIdentity(issuer=None, subject=f"invalid-{uuid4()}", email=None)  # type: ignore[arg-type]
        with pytest.raises(IntegrityError):
            await repository.resolve_identity(invalid)
        async with inspection_engine.connect() as connection:
            after = await connection.scalar(text("SELECT count(*) FROM accounts"))
        assert after == before
    finally:
        await engine.dispose()
        await inspection_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_runtime_cannot_create_or_reassign_account_ownership_directly() -> None:
    migration_settings = disposable_migration_settings()
    engine = create_async_engine(disposable_runtime_settings().runtime_database_url)
    inspection_engine = create_async_engine(migration_settings.migration_database_url)
    repository = AuthRepository(engine)
    identity = ExternalIdentity(
        issuer=f"https://immutable-{uuid4()}.invalid",
        subject="immutable-owner",
        email=None,
    )
    spoof_identity_id = uuid4()
    direct_account_id = uuid4()
    try:
        identity_id = await repository.resolve_identity(identity)
        async with inspection_engine.connect() as connection:
            account_id = await connection.scalar(
                text("SELECT account_id FROM external_identities WHERE id = :id"),
                {"id": identity_id},
            )
        assert account_id is not None
        with pytest.raises(SQLAlchemyError):
            async with engine.begin() as connection:
                await connection.execute(
                    text("UPDATE external_identities SET account_id = :replacement WHERE id = :id"),
                    {"replacement": uuid4(), "id": identity_id},
                )
        with pytest.raises(SQLAlchemyError):
            async with engine.begin() as connection:
                await connection.execute(
                    text(
                        "INSERT INTO external_identities "
                        "(id, account_id, issuer, subject, email) "
                        "VALUES (:id, :account_id, :issuer, :subject, NULL)"
                    ),
                    {
                        "id": spoof_identity_id,
                        "account_id": account_id,
                        "issuer": "https://spoof.invalid",
                        "subject": "spoof",
                    },
                )
        with pytest.raises(SQLAlchemyError):
            async with engine.begin() as connection:
                await connection.execute(
                    text("INSERT INTO accounts (id) VALUES (:id)"),
                    {"id": direct_account_id},
                )
        async with inspection_engine.connect() as connection:
            persisted_account_id = await connection.scalar(
                text("SELECT account_id FROM external_identities WHERE id = :id"),
                {"id": identity_id},
            )
            spoof_count = await connection.scalar(
                text("SELECT count(*) FROM external_identities WHERE id = :id"),
                {"id": spoof_identity_id},
            )
            direct_account_count = await connection.scalar(
                text("SELECT count(*) FROM accounts WHERE id = :id"),
                {"id": direct_account_id},
            )
        assert persisted_account_id == account_id
        assert spoof_count == 0
        assert direct_account_count == 0
    finally:
        await engine.dispose()
        await inspection_engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_trusted_fixture_maps_two_login_identities_to_one_account() -> None:
    migration_settings = disposable_migration_settings()
    runtime_settings = disposable_runtime_settings()
    account_id = uuid4()
    identity_ids = (uuid4(), uuid4())
    fixture_nonce = uuid4()
    digests = tuple(
        hashlib.sha256(f"linked-{value}".encode()).hexdigest() for value in identity_ids
    )
    migration_engine = create_async_engine(migration_settings.migration_database_url)
    try:
        async with migration_engine.begin() as connection:
            await connection.execute(
                text("INSERT INTO accounts (id) VALUES (:id)"), {"id": account_id}
            )
            for position, identity_id in enumerate(identity_ids):
                await connection.execute(
                    text(
                        """
                        INSERT INTO external_identities
                            (id, account_id, issuer, subject, email)
                        VALUES
                            (:id, :account_id, :issuer, :subject, :email)
                        """
                    ),
                    {
                        "id": identity_id,
                        "account_id": account_id,
                        "issuer": f"https://linked-{fixture_nonce}-{position}.invalid",
                        "subject": f"linked-{fixture_nonce}-{position}",
                        "email": f"linked-{position}@invalid.example",
                    },
                )
                await connection.execute(
                    text(
                        """
                        INSERT INTO application_sessions
                            (token_digest, identity_id, expires_at)
                        VALUES
                            (:digest, :identity_id, :expires_at)
                        """
                    ),
                    {
                        "digest": digests[position],
                        "identity_id": identity_id,
                        "expires_at": datetime.now(UTC) + timedelta(minutes=10),
                    },
                )
    finally:
        await migration_engine.dispose()

    repository = AuthRepository(create_async_engine(runtime_settings.runtime_database_url))
    try:
        principals = [await repository.principal_for_session(digest) for digest in digests]
        assert all(principal is not None for principal in principals)
        first, second = principals
        assert first is not None and second is not None
        assert first.account_id == second.account_id == account_id
        assert first.identity_id != second.identity_id
        assert first.issuer != second.issuer
        assert first.subject != second.subject
    finally:
        await repository.engine.dispose()
