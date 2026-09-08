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
    "ET_OIDC_ISSUER",
    "ET_OIDC_BACKCHANNEL_BASE_URL",
    "ET_OIDC_CLIENT_ID",
    "ET_OIDC_REDIRECT_URI",
    "ET_OIDC_ALLOWED_RETURN_URLS",
    "ET_OIDC_ALLOWED_POST_LOGOUT_URLS",
    "ET_WEB_ORIGINS",
    "ET_SESSION_COOKIE_NAME",
    "ET_SESSION_TTL_SECONDS",
    "ET_AUTH_TRANSACTION_TTL_SECONDS",
    "ET_COOKIE_SECURE",
    "ET_KEYCLOAK_URL",
    "ET_KEYCLOAK_ADMIN_USERNAME",
    "ET_KEYCLOAK_ADMIN_PASSWORD",
    "ET_DEV_TEST_USERNAME",
    "ET_DEV_TEST_PASSWORD",
    "ET_DEV_TEST_EMAIL",
    "ET_TEST_POSTGRES_PORT",
}

_LOCAL_ORIGINS = "http://127.0.0.1:4321,http://127.0.0.1:4322"
_LOCAL_RETURN_URLS = ",".join(
    f"http://127.0.0.1:{port}/{language}/account/"
    for port in (4321, 4322)
    for language in ("ru", "uk")
)
_LOCAL_LOGOUT_URLS = "http://127.0.0.1:4321/,http://127.0.0.1:4322/"


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
    oidc_issuer: str = Field(
        "http://127.0.0.1:58081/realms/electro-tutor-dev",
        validation_alias="ET_OIDC_ISSUER",
    )
    oidc_backchannel_base_url: str = Field(
        "http://127.0.0.1:58081", validation_alias="ET_OIDC_BACKCHANNEL_BASE_URL"
    )
    oidc_client_id: str = Field("electro-tutor-web-dev", validation_alias="ET_OIDC_CLIENT_ID")
    oidc_redirect_uri: str = Field(
        "http://127.0.0.1:8000/api/v1/auth/callback",
        validation_alias="ET_OIDC_REDIRECT_URI",
    )
    oidc_allowed_return_urls: str = Field(
        _LOCAL_RETURN_URLS, validation_alias="ET_OIDC_ALLOWED_RETURN_URLS"
    )
    oidc_allowed_post_logout_urls: str = Field(
        _LOCAL_LOGOUT_URLS, validation_alias="ET_OIDC_ALLOWED_POST_LOGOUT_URLS"
    )
    web_origins: str = Field(_LOCAL_ORIGINS, validation_alias="ET_WEB_ORIGINS")
    session_cookie_name: str = Field("et_session", validation_alias="ET_SESSION_COOKIE_NAME")
    session_ttl_seconds: Annotated[int, Field(ge=300, le=86_400)] = Field(
        3_600, validation_alias="ET_SESSION_TTL_SECONDS"
    )
    auth_transaction_ttl_seconds: Annotated[int, Field(ge=60, le=900)] = Field(
        300, validation_alias="ET_AUTH_TRANSACTION_TTL_SECONDS"
    )
    cookie_secure: bool = Field(False, validation_alias="ET_COOKIE_SECURE")

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
        self._validate_identity_contract()
        return self

    def _validate_identity_contract(self) -> None:
        issuer = urlsplit(self.oidc_issuer)
        if (
            issuer.scheme != "http"
            or issuer.hostname != "127.0.0.1"
            or issuer.port != 58081
            or issuer.path != "/realms/electro-tutor-dev"
            or issuer.query
            or issuer.fragment
        ):
            raise ValueError("ET_OIDC_ISSUER must be the approved Tutor DEV realm issuer")
        backchannel = urlsplit(self.oidc_backchannel_base_url)
        if (
            backchannel.scheme != "http"
            or (backchannel.hostname, backchannel.port)
            not in {("127.0.0.1", 58081), ("keycloak", 8080)}
            or backchannel.username is not None
            or backchannel.password is not None
            or backchannel.path not in {"", "/"}
            or backchannel.query
            or backchannel.fragment
        ):
            raise ValueError("ET_OIDC_BACKCHANNEL_BASE_URL must remain inside local DEV")
        if self.oidc_client_id != "electro-tutor-web-dev":
            raise ValueError("ET_OIDC_CLIENT_ID must be the dedicated Tutor DEV public client")
        if self.oidc_redirect_uri != "http://127.0.0.1:8000/api/v1/auth/callback":
            raise ValueError("ET_OIDC_REDIRECT_URI must match the approved exact callback")
        if self.allowed_return_urls != frozenset(_LOCAL_RETURN_URLS.split(",")):
            raise ValueError("ET_OIDC_ALLOWED_RETURN_URLS must match the approved exact URLs")
        if self.allowed_post_logout_urls != frozenset(_LOCAL_LOGOUT_URLS.split(",")):
            raise ValueError("ET_OIDC_ALLOWED_POST_LOGOUT_URLS must match the approved exact URLs")
        if self.allowed_web_origins != tuple(_LOCAL_ORIGINS.split(",")):
            raise ValueError("ET_WEB_ORIGINS must match the approved exact origins")
        if self.cookie_secure:
            raise ValueError("ET_COOKIE_SECURE is false for the approved HTTP-only local profile")

    @property
    def allowed_return_urls(self) -> frozenset[str]:
        return frozenset(item.strip() for item in self.oidc_allowed_return_urls.split(",") if item)

    @property
    def allowed_post_logout_urls(self) -> frozenset[str]:
        return frozenset(
            item.strip() for item in self.oidc_allowed_post_logout_urls.split(",") if item
        )

    @property
    def allowed_web_origins(self) -> tuple[str, ...]:
        return tuple(item.strip() for item in self.web_origins.split(",") if item)

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
            "oidc_issuer": self.oidc_issuer,
            "oidc_client_id": self.oidc_client_id,
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
