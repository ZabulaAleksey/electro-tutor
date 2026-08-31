import pytest
from pydantic import ValidationError

from electro_tutor_api.cli import main as cli_main
from electro_tutor_api.config import MigrationSettings, Settings

BASE = {
    "runtime_database_url": "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor",
}


def test_config_redacts_database_password() -> None:
    summary = Settings(**BASE).redacted_summary()
    assert "password" not in str(summary)
    assert summary["host"] == "127.0.0.1"


def test_config_rejects_non_loopback() -> None:
    with pytest.raises(ValidationError, match="loopback"):
        Settings(**BASE, host="0.0.0.0")


def test_config_requires_exact_database_roles() -> None:
    with pytest.raises(ValidationError, match="runtime role"):
        Settings(
            runtime_database_url=(
                "postgresql+asyncpg://electro_tutor_migrator:password@127.0.0.1:55432/electro_tutor"
            )
        )
    with pytest.raises(ValidationError, match="migrator role"):
        MigrationSettings(
            migration_database_url=(
                "postgresql+asyncpg://electro_tutor_runtime:password@127.0.0.1:55432/electro_tutor"
            )
        )


def test_config_rejects_debug_outside_local() -> None:
    with pytest.raises(ValidationError, match="local"):
        Settings(**BASE, profile="ci", docs_enabled=True)


def test_config_requires_database_urls() -> None:
    with pytest.raises(ValidationError, match="ET_RUNTIME_DATABASE_URL"):
        Settings()


def test_config_rejects_unknown_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ET_NOT_SUPPORTED", "secret")
    with pytest.raises(ValidationError, match="Unknown ET_"):
        Settings(**BASE)


def test_config_rejects_remote_database_target() -> None:
    with pytest.raises(ValidationError, match="local PostgreSQL"):
        Settings(
            runtime_database_url=(
                "postgresql+asyncpg://electro_tutor_runtime:sentinel-password@db.example/electro_tutor"
            )
        )


def test_invalid_config_cli_redacts_input(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    monkeypatch.setenv(
        "ET_DATABASE_URL",
        "postgresql+asyncpg://electro_tutor_runtime:sentinel-password@db.example/electro_tutor",
    )
    assert cli_main(["config-check"]) == 2
    captured = capsys.readouterr()
    assert "sentinel-password" not in captured.err
    assert "db.example" not in captured.err
