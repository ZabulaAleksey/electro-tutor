"""Negative drift checks in the exact newly created disposable baseline DB.

Every mutation is inside one transaction and rolled back. Product/test data is
never reset, and the target is rejected unless the catalog-baseline command
created the database with the test profile.
"""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from typing import cast
from urllib.parse import urlsplit

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from electro_tutor_api.config import MigrationSettings
from electro_tutor_api.schema_catalog_contract import (
    CatalogDriftError,
    catalog_differences,
    load_manifest,
    snapshot_catalog,
    verify_catalog,
)
from electro_tutor_api.schema_contract import metadata


def _settings() -> MigrationSettings:
    if os.environ.get("ET_ENVIRONMENT") != "test":
        pytest.fail("catalog drift tests require the test profile")
    settings = MigrationSettings(
        profile="test", migration_database_url=os.environ["ET_MIGRATION_DATABASE_URL"]
    )
    target = urlsplit(settings.migration_database_url)
    if (
        settings.profile != "test"
        or target.path != "/electro_tutor_catalog_baseline"
        or target.hostname != "127.0.0.1"
        or target.username != "electro_tutor_migrator"
    ):
        pytest.fail("catalog drift tests require exact newly created disposable baseline")
    return settings


async def _alembic_diff(connection: AsyncConnection) -> list[object]:
    def compare(sync_connection: Connection) -> list[object]:
        context = MigrationContext.configure(sync_connection, opts={"compare_server_default": True})
        return cast(list[object], compare_metadata(context, metadata))

    return await connection.run_sync(compare)


async def _change_function_body(connection: AsyncConnection) -> None:
    definition = await connection.scalar(
        text(
            "SELECT pg_catalog.pg_get_functiondef("
            "'public.derive_lesson_access_status("
            "timestamptz,timestamptz,timestamptz,timestamptz)'::regprocedure)"
        )
    )
    assert isinstance(definition, str) and "'ACTIVE'" in definition
    await connection.exec_driver_sql(definition.replace("'ACTIVE'", "'BROKEN'", 1))


Mutation = str | tuple[str, ...] | Callable[[AsyncConnection], Awaitable[None]]

DRIFT_CASES: tuple[tuple[str, str | None, Mutation, bool], ...] = (
    (
        "added_column",
        None,
        "ALTER TABLE public.lesson_sessions ADD COLUMN catalog_probe text",
        True,
    ),
    (
        "changed_default",
        None,
        "ALTER TABLE public.lesson_sessions ALTER COLUMN version SET DEFAULT 2",
        True,
    ),
    ("missing_index", "indexes", "DROP INDEX public.ix_lesson_access_grants_active_until", True),
    (
        "changed_partial_predicate",
        "indexes",
        (
            "DROP INDEX public.uq_bookings_offer_open",
            "CREATE UNIQUE INDEX uq_bookings_offer_open ON public.bookings (offer_id) "
            "WHERE status = 'REQUESTED'",
        ),
        False,
    ),
    ("changed_function_body", "functions", _change_function_body, False),
    (
        "changed_function_acl",
        "functions",
        "GRANT EXECUTE ON FUNCTION public.derive_lesson_access_status("
        "timestamptz,timestamptz,timestamptz,timestamptz) TO electro_tutor_runtime",
        False,
    ),
    (
        "disabled_trigger",
        "triggers",
        "ALTER TABLE public.booking_operations DISABLE TRIGGER booking_operations_append_only",
        False,
    ),
    (
        "changed_check",
        "checks",
        (
            "ALTER TABLE public.lesson_sessions DROP CONSTRAINT ck_lesson_sessions_version",
            "ALTER TABLE public.lesson_sessions ADD CONSTRAINT ck_lesson_sessions_version "
            "CHECK (version >= 2)",
        ),
        False,
    ),
    (
        "changed_table_acl",
        "table_acl",
        "GRANT SELECT ON TABLE public.lesson_sessions TO electro_tutor_runtime",
        False,
    ),
)


@pytest.mark.catalog_baseline
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,category,mutation,alembic_detects", DRIFT_CASES, ids=[item[0] for item in DRIFT_CASES]
)
async def test_transactional_catalog_and_schema_drift_fail_closed(
    case: str,
    category: str | None,
    mutation: Mutation,
    alembic_detects: bool,
) -> None:
    settings = _settings()
    engine = create_async_engine(settings.migration_database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await verify_catalog(connection)
                assert await _alembic_diff(connection) == []
                if isinstance(mutation, str):
                    await connection.exec_driver_sql(mutation)
                elif isinstance(mutation, tuple):
                    for statement in mutation:
                        await connection.exec_driver_sql(statement)
                else:
                    await mutation(connection)
                if alembic_detects:
                    assert await _alembic_diff(connection), case
                if category is not None:
                    differences = catalog_differences(
                        await snapshot_catalog(connection), load_manifest()
                    )
                    assert category in differences, case
                    with pytest.raises(CatalogDriftError) as error:
                        await verify_catalog(connection)
                    assert settings.migration_database_url not in str(error.value)
            finally:
                await transaction.rollback()
        async with engine.connect() as connection:
            await verify_catalog(connection)
            assert await _alembic_diff(connection) == []
    finally:
        await engine.dispose()
