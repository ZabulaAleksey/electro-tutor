from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from electro_tutor_api.config import ProvisioningSettings, Settings
from electro_tutor_api.errors import ServiceDependencyError

ALEMBIC_DIR = Path(__file__).resolve().parents[3] / "alembic"


def expected_revision() -> str:
    config = Config(str(ALEMBIC_DIR.parent / "alembic.ini"))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    return ScriptDirectory.from_config(config).get_current_head() or "base"


class DatabaseHealth:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def check(self) -> str:
        try:
            async with self.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
                result = await connection.execute(text("SELECT version_num FROM alembic_version"))
                current = result.scalar_one_or_none()
        except Exception as exc:  # noqa: BLE001 - deliberately redacted boundary
            raise ServiceDependencyError("database_unavailable", "database") from exc
        if current != expected_revision():
            raise ServiceDependencyError("schema_mismatch", "schema")
        return str(current)


def create_runtime_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.runtime_database_url,
        pool_pre_ping=True,
        connect_args={"timeout": settings.db_connect_timeout},
    )


def create_provisioning_engine(settings: ProvisioningSettings) -> AsyncEngine:
    return create_async_engine(
        settings.provisioning_database_url,
        pool_pre_ping=True,
        connect_args={"timeout": 5},
    )
