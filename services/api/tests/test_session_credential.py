from __future__ import annotations

import pytest
from pydantic import ValidationError

from electro_tutor_api.adapters.database import create_auth_engine, create_runtime_engine
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import SessionCredential

RUNTIME_URL = (
    "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor"
)
AUTH_URL = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:auth-password@127.0.0.1:55432/electro_tutor"
)


def test_session_credential_is_digest_only_and_always_redacted() -> None:
    raw_token = "secret-session-token"
    credential = SessionCredential.from_token(raw_token)

    assert credential.digest != raw_token
    assert len(credential.digest) == 64
    assert raw_token not in repr(credential)
    assert credential.digest not in repr(credential)
    assert str(credential) == "<SessionCredential redacted>"


def test_settings_require_exact_separate_database_roles() -> None:
    settings = Settings(runtime_database_url=RUNTIME_URL, auth_database_url=AUTH_URL)
    assert settings.runtime_database_url == RUNTIME_URL
    assert settings.auth_database_url == AUTH_URL

    with pytest.raises(ValidationError):
        Settings(runtime_database_url=RUNTIME_URL, auth_database_url=RUNTIME_URL)
    with pytest.raises(ValidationError):
        Settings(runtime_database_url=AUTH_URL, auth_database_url=AUTH_URL)
    with pytest.raises(ValidationError, match="same database"):
        Settings(
            runtime_database_url=RUNTIME_URL,
            auth_database_url=f"{AUTH_URL.rsplit('/', 1)[0]}/electro_tutor_test",
        )


def test_runtime_and_auth_engines_hide_bound_parameters() -> None:
    settings = Settings(runtime_database_url=RUNTIME_URL, auth_database_url=AUTH_URL)
    runtime = create_runtime_engine(settings)
    auth = create_auth_engine(settings)
    try:
        assert runtime.sync_engine.hide_parameters is True
        assert auth.sync_engine.hide_parameters is True
        assert runtime.url.username == "electro_tutor_runtime"
        assert auth.url.username == "electro_tutor_auth_runtime"
    finally:
        # No connections were opened; sync disposal is sufficient for this constructor test.
        runtime.sync_engine.dispose()
        auth.sync_engine.dispose()
