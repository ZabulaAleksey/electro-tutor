from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from electro_tutor_api.config import MigrationSettings
from electro_tutor_api.schema_contract import metadata as target_metadata

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
settings = MigrationSettings()
config.set_main_option("sqlalchemy.url", settings.migration_database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(url=settings.migration_database_url, target_metadata=target_metadata,
                      compare_server_default=True, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata,
                      compare_server_default=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(config.get_section(config.config_ini_section, {}),
                                           prefix="sqlalchemy.", poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
