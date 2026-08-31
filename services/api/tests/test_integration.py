import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from electro_tutor_api.adapters.database import expected_revision
from electro_tutor_api.cli import alembic_config, db_status
from electro_tutor_api.config import MigrationSettings, Settings
from electro_tutor_api.main import create_app

LOCAL_RUNTIME = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/"
    "electro_tutor_test"
)
LOCAL_MIGRATION = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:55432/"
    "electro_tutor_test"
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
        pytest.skip(
            "set ET_CONFIRM_MIGRATION_LIFECYCLE=electro-tutor-local for "
            "named disposable DB mutation tests"
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_postgresql_readiness() -> None:
    settings = disposable_runtime_settings()
    app = create_app(settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_database_outage_is_redacted_503() -> None:
    settings = Settings(
        profile="ci",
        runtime_database_url=(
            "postgresql+asyncpg://electro_tutor_runtime:sentinel-password@127.0.0.1:1/electro_tutor"
        ),
    )
    app = create_app(settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "sentinel-password" not in response.text
    assert "127.0.0.1:1" not in response.text


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_schema_drift_is_redacted_503_and_restored() -> None:
    require_migration_consent()
    runtime_settings = disposable_runtime_settings()
    migration_settings = disposable_migration_settings()
    migration_engine = create_async_engine(migration_settings.migration_database_url)
    expected = expected_revision()
    try:
        async with migration_engine.begin() as connection:
            current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            assert current == expected
            await connection.execute(
                text("UPDATE alembic_version SET version_num = :revision"),
                {"revision": "00000000000000000000000000000000"},
            )
        app = create_app(runtime_settings)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "schema_mismatch"
        assert runtime_settings.runtime_database_url not in response.text
        assert "local-runtime-only" not in response.text
    finally:
        async with migration_engine.begin() as connection:
            await connection.execute(
                text("UPDATE alembic_version SET version_num = :revision"),
                {"revision": expected},
            )
        await migration_engine.dispose()


@pytest.mark.integration
def test_alembic_upgrade_downgrade_upgrade_on_named_disposable_database() -> None:
    require_migration_consent()
    settings = disposable_migration_settings()
    config = alembic_config(settings)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    status = asyncio.run(db_status(settings))
    assert status == {"current": expected_revision(), "expected": expected_revision()}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_runtime_role_cannot_create_tables() -> None:
    require_migration_consent()
    settings = disposable_runtime_settings()
    engine = create_async_engine(settings.runtime_database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                with pytest.raises(SQLAlchemyError):
                    await connection.execute(
                        text("CREATE TABLE et_runtime_ddl_probe (id integer NOT NULL)")
                    )
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_runtime_role_cannot_change_schema_revision() -> None:
    require_migration_consent()
    settings = disposable_runtime_settings()
    engine = create_async_engine(settings.runtime_database_url)
    try:
        async with engine.begin() as connection:
            with pytest.raises(SQLAlchemyError):
                await connection.execute(
                    text("UPDATE alembic_version SET version_num = version_num")
                )
    finally:
        await engine.dispose()
