from __future__ import annotations

import argparse
import asyncio
import json
import sys

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from electro_tutor_api.adapters.database import ALEMBIC_DIR, expected_revision
from electro_tutor_api.config import MigrationSettings, Settings


def alembic_config(settings: MigrationSettings) -> Config:
    config = Config(str(ALEMBIC_DIR.parent / "alembic.ini"))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    config.set_main_option("sqlalchemy.url", settings.migration_database_url.replace("%", "%%"))
    return config


async def db_status(settings: MigrationSettings) -> dict[str, str | None]:
    engine = create_async_engine(settings.migration_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT version_num FROM alembic_version"))
            current = result.scalar_one_or_none()
    finally:
        await engine.dispose()
    return {"current": str(current) if current else None, "expected": expected_revision()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Electro Tutor backend diagnostics")
    parser.add_argument("command", choices=["doctor", "config-check", "db-status", "db-migrate"])
    args = parser.parse_args(argv or sys.argv[1:])
    settings_type = Settings if args.command in {"doctor", "config-check"} else MigrationSettings
    try:
        settings = settings_type()  # type: ignore[call-arg]  # values load from ET_* environment
    except Exception:  # noqa: BLE001 - deliberately redacted config boundary
        print(
            json.dumps({"status": "invalid_config", "message": "Configuration is invalid."}),
            file=sys.stderr,
        )
        return 2
    if isinstance(settings, Settings):
        print(json.dumps({"status": "ok", "config": settings.redacted_summary()}, sort_keys=True))
        return 0
    if args.command == "db-status":
        try:
            status = asyncio.run(db_status(settings))
        except Exception:
            print(json.dumps({"status": "unavailable", "dependency": "database"}))
            return 1
        print(json.dumps({"status": "ok", **status}, sort_keys=True))
        return 0 if status["current"] == status["expected"] else 1
    try:
        command.upgrade(alembic_config(settings), "head")
    except Exception:
        print(json.dumps({"status": "migration_failed", "dependency": "database"}))
        return 1
    print(json.dumps({"status": "ok", "revision": expected_revision()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
