from __future__ import annotations

import ipaddress
import os
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Profile = Literal["local", "test", "ci"]
_KNOWN_ENV = {
    "ET_PROFILE",
    "ET_HOST",
    "ET_PORT",
    "ET_RUNTIME_DATABASE_URL",
    "ET_MIGRATION_DATABASE_URL",
    "ET_DATABASE_URL",
    "ET_TEST_DATABASE_URL",
    "ET_ENVIRONMENT",
    "ET_DOCS_ENABLED",
    "ET_DEBUG",
    "ET_DB_CONNECT_TIMEOUT",
    "ET_REQUEST_ID_MAX_LENGTH",
    "ET_BODY_LIMIT_BYTES",
    "ET_LOG_LEVEL",
    "ET_POSTGRES_BIND_HOST",
    "ET_POSTGRES_PORT",
    "ET_CONFIRM_RESET_LOCAL",
    "ET_CONFIRM_MIGRATION_LIFECYCLE",
}


class Settings(BaseSettings):
    """Validated local/CI configuration; production is intentionally not a profile."""

    model_config = SettingsConfigDict(
        env_prefix="ET_",
        env_file=None,
        extra="forbid",
        case_sensitive=True,
        validate_default=True,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    profile: Profile = Field("local", validation_alias=AliasChoices("ET_PROFILE", "ET_ENVIRONMENT"))
    host: str = Field("127.0.0.1", validation_alias="ET_HOST")
    port: Annotated[int, Field(ge=1, le=65535)] = Field(8000, validation_alias="ET_PORT")
    runtime_database_url: str = Field(
        validation_alias=AliasChoices("ET_RUNTIME_DATABASE_URL", "ET_DATABASE_URL")
    )
    docs_enabled: bool = Field(False, validation_alias="ET_DOCS_ENABLED")
    debug: bool = Field(False, validation_alias="ET_DEBUG")
    db_connect_timeout: Annotated[int, Field(ge=1, le=60)] = Field(
        5, validation_alias="ET_DB_CONNECT_TIMEOUT"
    )
    request_id_max_length: Annotated[int, Field(ge=16, le=128)] = Field(
        128, validation_alias="ET_REQUEST_ID_MAX_LENGTH"
    )
    body_limit_bytes: Annotated[int, Field(ge=1024, le=1_048_576)] = Field(
        65_536, validation_alias="ET_BODY_LIMIT_BYTES"
    )
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        "INFO", validation_alias="ET_LOG_LEVEL"
    )

    @model_validator(mode="before")
    @classmethod
    def reject_unknown_et_environment(cls, values: object) -> object:
        unknown = sorted(
            key for key in os.environ if key.startswith("ET_") and key not in _KNOWN_ENV
        )
        if unknown:
            raise ValueError(f"Unknown ET_ configuration key(s): {', '.join(unknown)}")
        return values

    @field_validator("host")
    @classmethod
    def require_loopback_host(cls, value: str) -> str:
        normalized = value.strip()
        if normalized == "localhost":
            normalized = "127.0.0.1"
        try:
            address = ipaddress.ip_address(normalized)
        except ValueError as exc:
            raise ValueError("ET_HOST must be a loopback IP address") from exc
        if not address.is_loopback:
            raise ValueError("ET_HOST must be loopback; non-loopback exposure needs approval")
        return normalized

    @field_validator("runtime_database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme != "postgresql+asyncpg" or not parsed.hostname or not parsed.path:
            raise ValueError("database URL must use postgresql+asyncpg with host and database")
        if not parsed.username or not parsed.password:
            raise ValueError("database URL must include an explicit local/test role password")
        return value

    @model_validator(mode="after")
    def validate_profile_and_roles(self) -> Settings:
        if (self.docs_enabled or self.debug) and self.profile != "local":
            raise ValueError("docs/debug are allowed only with explicit local profile")
        parsed_runtime = urlsplit(self.runtime_database_url)
        if parsed_runtime.hostname not in {"127.0.0.1", "localhost", "postgres"}:
            raise ValueError("local/test/ci database host must be local PostgreSQL")
        if parsed_runtime.path.removeprefix("/") not in {"electro_tutor", "electro_tutor_test"}:
            raise ValueError("local/test/ci database name is not approved")
        if parsed_runtime.username != "electro_tutor_runtime":
            raise ValueError("API database URL must use the runtime role")
        return self

    def redacted_summary(self) -> dict[str, object]:
        def safe_db_url(value: str) -> str:
            parsed = urlsplit(value)
            return f"{parsed.scheme}://{parsed.hostname}:{parsed.port or 5432}{parsed.path}"

        return {
            "profile": self.profile,
            "host": self.host,
            "port": self.port,
            "docs_enabled": self.docs_enabled,
            "debug": self.debug,
            "runtime_database": safe_db_url(self.runtime_database_url),
        }


class MigrationSettings(BaseSettings):
    """One-shot migration configuration; never loaded by the API process."""

    model_config = SettingsConfigDict(
        env_prefix="ET_",
        env_file=None,
        extra="forbid",
        case_sensitive=True,
        validate_default=True,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    profile: Profile = Field("local", validation_alias=AliasChoices("ET_PROFILE", "ET_ENVIRONMENT"))
    migration_database_url: str = Field(validation_alias="ET_MIGRATION_DATABASE_URL")

    @field_validator("migration_database_url")
    @classmethod
    def validate_migration_target(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme != "postgresql+asyncpg" or not parsed.username or not parsed.password:
            raise ValueError("migration URL must use postgresql+asyncpg with explicit credentials")
        if parsed.hostname not in {"127.0.0.1", "localhost", "postgres"}:
            raise ValueError("local/test/ci migration host must be local PostgreSQL")
        if parsed.path.removeprefix("/") not in {"electro_tutor", "electro_tutor_test"}:
            raise ValueError("local/test/ci migration database is not approved")
        if parsed.username != "electro_tutor_migrator":
            raise ValueError("migration URL must use the migrator role")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values are loaded from ET_* environment
