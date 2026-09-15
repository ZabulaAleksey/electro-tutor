from __future__ import annotations

import pytest
from pydantic import ValidationError

from electro_tutor_api.adapters.database import (
    create_auth_engine,
    create_provisioning_engine,
    create_runtime_engine,
)
from electro_tutor_api.config import ProvisioningSettings, Settings
from electro_tutor_api.domain.identity import SessionCredential

RUNTIME_URL = (
    "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor"
)
AUTH_URL = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:auth-password@127.0.0.1:55432/electro_tutor"
)
PROVISIONING_URL = (
    "postgresql+asyncpg://electro_tutor_provisioner:provisioner-password@"
    "127.0.0.1:55432/electro_tutor"
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


def test_runtime_auth_and_provisioning_engines_hide_bound_parameters() -> None:
    settings = Settings(runtime_database_url=RUNTIME_URL, auth_database_url=AUTH_URL)
    provisioning_settings = ProvisioningSettings(provisioning_database_url=PROVISIONING_URL)
    runtime = create_runtime_engine(settings)
    auth = create_auth_engine(settings)
    provisioning = create_provisioning_engine(provisioning_settings)
    try:
        assert runtime.sync_engine.hide_parameters is True
        assert auth.sync_engine.hide_parameters is True
        assert provisioning.sync_engine.hide_parameters is True
        assert runtime.url.username == "electro_tutor_runtime"
        assert auth.url.username == "electro_tutor_auth_runtime"
        assert provisioning.url.username == "electro_tutor_provisioner"
    finally:
        # No connections were opened; sync disposal is sufficient for this constructor test.
        runtime.sync_engine.dispose()
        auth.sync_engine.dispose()
        provisioning.sync_engine.dispose()
