from __future__ import annotations

import time
from urllib.parse import parse_qs

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from electro_tutor_api.adapters.oidc import OidcAdapter, OidcValidationError

ISSUER = "http://127.0.0.1:58081/realms/electro-tutor-dev"
CLIENT_ID = "electro-tutor-web-dev"


def oidc_fixture(
    *,
    token_nonce: str = "expected-nonce",
    audience: str | list[str] = CLIENT_ID,
    authorized_party: str | None = None,
):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    public_jwk["kid"] = "test-key"
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "sub": "stable-subject",
        "aud": audience,
        "iat": now,
        "exp": now + 300,
        "nonce": token_nonce,
        "email": "test@invalid.example",
    }
    if authorized_party is not None:
        claims["azp"] = authorized_party
    id_token = jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    captured_token_form: dict[str, list[str]] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
                    "token_endpoint": "http://keycloak:8080/realms/electro-tutor-dev/protocol/openid-connect/token",
                    "jwks_uri": "http://keycloak:8080/realms/electro-tutor-dev/protocol/openid-connect/certs",
                    "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
                },
            )
        if request.url.path.endswith("/protocol/openid-connect/token"):
            captured_token_form.update(parse_qs(request.content.decode("ascii")))
            return httpx.Response(200, json={"id_token": id_token, "access_token": "discarded"})
        if request.url.path.endswith("/protocol/openid-connect/certs"):
            return httpx.Response(200, json={"keys": [public_jwk]})
        return httpx.Response(404)

    adapter = OidcAdapter(
        issuer=ISSUER,
        backchannel_base_url="http://keycloak:8080",
        client_id=CLIENT_ID,
        transport=httpx.MockTransport(handler),
    )
    return adapter, captured_token_form


@pytest.mark.asyncio
async def test_discovery_and_id_token_validate_issuer_audience_nonce_without_secret() -> None:
    adapter, token_form = oidc_fixture()
    discovery = await adapter.discover()
    identity = await adapter.exchange_code(
        discovery,
        code="authorization-code",
        redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
        verifier="v" * 64,
        nonce="expected-nonce",
    )
    assert identity.issuer == ISSUER
    assert identity.subject == "stable-subject"
    assert identity.email == "test@invalid.example"
    assert token_form["client_id"] == [CLIENT_ID]
    assert token_form["code_verifier"] == ["v" * 64]
    assert "client_secret" not in token_form


@pytest.mark.asyncio
async def test_oidc_backchannel_ignores_ambient_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_client = httpx.AsyncClient
    trust_env_values: list[bool] = []

    def guarded_client(*args, **kwargs):
        trust_env_values.append(kwargs.get("trust_env"))
        return original_client(*args, **kwargs)

    monkeypatch.setenv("HTTP_PROXY", "http://attacker.invalid:9999")
    monkeypatch.setattr(httpx, "AsyncClient", guarded_client)
    adapter, _ = oidc_fixture()
    discovery = await adapter.discover()
    await adapter.exchange_code(
        discovery,
        code="authorization-code",
        redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
        verifier="v" * 64,
        nonce="expected-nonce",
    )
    assert trust_env_values == [False, False]


@pytest.mark.asyncio
async def test_invalid_nonce_is_rejected() -> None:
    adapter, _ = oidc_fixture(token_nonce="attacker-nonce")
    discovery = await adapter.discover()
    with pytest.raises(OidcValidationError, match="nonce"):
        await adapter.exchange_code(
            discovery,
            code="authorization-code",
            redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
            verifier="v" * 64,
            nonce="expected-nonce",
        )


@pytest.mark.asyncio
async def test_invalid_audience_is_rejected() -> None:
    adapter, _ = oidc_fixture(audience="foreign-client")
    discovery = await adapter.discover()
    with pytest.raises(OidcValidationError, match="validation failed"):
        await adapter.exchange_code(
            discovery,
            code="authorization-code",
            redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
            verifier="v" * 64,
            nonce="expected-nonce",
        )


@pytest.mark.asyncio
async def test_malformed_token_response_is_classified_as_oidc_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
                    "token_endpoint": f"{ISSUER}/protocol/openid-connect/token",
                    "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                    "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
                },
            )
        return httpx.Response(200, content=b"not-json")

    adapter = OidcAdapter(
        issuer=ISSUER,
        backchannel_base_url="http://127.0.0.1:58081",
        client_id=CLIENT_ID,
        transport=httpx.MockTransport(handler),
    )
    discovery = await adapter.discover()
    with pytest.raises(OidcValidationError, match="code exchange failed"):
        await adapter.exchange_code(
            discovery,
            code="authorization-code",
            redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
            verifier="v" * 64,
            nonce="expected-nonce",
        )


@pytest.mark.asyncio
async def test_foreign_authorized_party_is_rejected_for_single_audience() -> None:
    adapter, _ = oidc_fixture(authorized_party="foreign-client")
    discovery = await adapter.discover()
    with pytest.raises(OidcValidationError, match="authorized party"):
        await adapter.exchange_code(
            discovery,
            code="authorization-code",
            redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
            verifier="v" * 64,
            nonce="expected-nonce",
        )


@pytest.mark.asyncio
async def test_discovery_with_wrong_issuer_is_rejected() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "issuer": "http://127.0.0.1:58081/realms/foreign",
                "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
                "token_endpoint": f"{ISSUER}/protocol/openid-connect/token",
                "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
            },
        )

    adapter = OidcAdapter(
        issuer=ISSUER,
        backchannel_base_url="http://127.0.0.1:58081",
        client_id=CLIENT_ID,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(OidcValidationError, match="issuer"):
        await adapter.discover()


@pytest.mark.asyncio
async def test_discovery_rejects_endpoint_outside_public_and_backchannel_origins() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "issuer": ISSUER,
                "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
                "token_endpoint": "https://attacker.example/token",
                "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                "end_session_endpoint": f"{ISSUER}/protocol/openid-connect/logout",
            },
        )

    adapter = OidcAdapter(
        issuer=ISSUER,
        backchannel_base_url="http://keycloak:8080",
        client_id=CLIENT_ID,
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(OidcValidationError, match="outside"):
        await adapter.discover()
