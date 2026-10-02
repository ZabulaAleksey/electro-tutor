import pytest
from pydantic import ValidationError

from electro_tutor_api.config import Settings

BASE = {
    "runtime_database_url": "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor_test",
    "auth_database_url": "postgresql+asyncpg://electro_tutor_auth_runtime:auth-password@127.0.0.1:55432/electro_tutor_test",
}


def test_registration_provider_port_is_exact_test_only_override() -> None:
    settings = Settings(
        **BASE,
        profile="test",
        test_oidc_port=58181,
        oidc_issuer="http://127.0.0.1:58181/realms/electro-tutor-dev",
        oidc_backchannel_base_url="http://127.0.0.1:58181",
    )
    assert settings.test_oidc_port == 58181


@pytest.mark.parametrize("profile", ["local", "ci"])
def test_registration_provider_port_rejected_outside_test(profile: str) -> None:
    with pytest.raises(ValidationError, match="ET_TEST_OIDC_PORT"):
        Settings(**BASE, profile=profile, test_oidc_port=58181)


@pytest.mark.parametrize("port", [58081, 58180, 59000])
def test_registration_provider_port_rejects_unapproved_value(port: int) -> None:
    with pytest.raises(ValidationError, match="ET_TEST_OIDC_PORT"):
        Settings(**BASE, profile="test", test_oidc_port=port)
