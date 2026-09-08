from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
import jwt

from electro_tutor_api.domain.identity import ExternalIdentity


class OidcValidationError(Exception):
    pass


@dataclass(frozen=True)
class OidcDiscovery:
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    end_session_endpoint: str


class OidcAdapter:
    def __init__(
        self,
        *,
        issuer: str,
        backchannel_base_url: str,
        client_id: str,
        timeout_seconds: float = 5.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.issuer = issuer.rstrip("/")
        self.backchannel_base_url = backchannel_base_url.rstrip("/")
        self.client_id = client_id
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def _validate_endpoint(self, value: str, *, allow_backchannel: bool) -> None:
        endpoint = urlsplit(value)
        issuer = urlsplit(self.issuer)
        backchannel = urlsplit(self.backchannel_base_url)
        allowed_origins = {(issuer.scheme, issuer.netloc)}
        if allow_backchannel:
            allowed_origins.add((backchannel.scheme, backchannel.netloc))
        if (
            (endpoint.scheme, endpoint.netloc) not in allowed_origins
            or not endpoint.path.startswith(f"{issuer.path}/")
            or endpoint.fragment
        ):
            raise OidcValidationError("OIDC endpoint is outside the configured issuer boundary")

    def _backchannel(self, public_url: str) -> str:
        public = urlsplit(public_url)
        internal = urlsplit(self.backchannel_base_url)
        return urlunsplit((internal.scheme, internal.netloc, public.path, public.query, ""))

    async def discover(self) -> OidcDiscovery:
        public_url = f"{self.issuer}/.well-known/openid-configuration"
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds, transport=self.transport, trust_env=False
        ) as client:
            response = await client.get(self._backchannel(public_url))
            response.raise_for_status()
            payload = response.json()
        required = (
            "issuer",
            "authorization_endpoint",
            "token_endpoint",
            "jwks_uri",
            "end_session_endpoint",
        )
        if not isinstance(payload, dict) or any(
            not isinstance(payload.get(key), str) for key in required
        ):
            raise OidcValidationError("OIDC discovery document is incomplete")
        if payload["issuer"].rstrip("/") != self.issuer:
            raise OidcValidationError("OIDC issuer does not match configured issuer")
        self._validate_endpoint(payload["authorization_endpoint"], allow_backchannel=False)
        self._validate_endpoint(payload["end_session_endpoint"], allow_backchannel=False)
        self._validate_endpoint(payload["token_endpoint"], allow_backchannel=True)
        self._validate_endpoint(payload["jwks_uri"], allow_backchannel=True)
        return OidcDiscovery(
            issuer=payload["issuer"].rstrip("/"),
            authorization_endpoint=payload["authorization_endpoint"],
            token_endpoint=payload["token_endpoint"],
            jwks_uri=payload["jwks_uri"],
            end_session_endpoint=payload["end_session_endpoint"],
        )

    async def exchange_code(
        self,
        discovery: OidcDiscovery,
        *,
        code: str,
        redirect_uri: str,
        verifier: str,
        nonce: str,
    ) -> ExternalIdentity:
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self.transport, trust_env=False
            ) as client:
                token_response = await client.post(
                    self._backchannel(discovery.token_endpoint),
                    data={
                        "grant_type": "authorization_code",
                        "client_id": self.client_id,
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "code_verifier": verifier,
                    },
                )
                token_response.raise_for_status()
                token_payload = token_response.json()
                id_token = (
                    token_payload.get("id_token") if isinstance(token_payload, dict) else None
                )
                if not isinstance(id_token, str):
                    raise OidcValidationError("OIDC token response did not contain an ID token")
                jwks_response = await client.get(self._backchannel(discovery.jwks_uri))
                jwks_response.raise_for_status()
                jwks_payload = jwks_response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise OidcValidationError("OIDC code exchange failed") from exc

        try:
            header = jwt.get_unverified_header(id_token)
            key_id = header.get("kid")
            keys = jwks_payload.get("keys") if isinstance(jwks_payload, dict) else None
            if not isinstance(key_id, str) or not isinstance(keys, list):
                raise OidcValidationError("OIDC signing key metadata is invalid")
            key_data = next(
                (item for item in keys if isinstance(item, dict) and item.get("kid") == key_id),
                None,
            )
            if key_data is None:
                raise OidcValidationError("OIDC signing key is unavailable")
            claims: dict[str, Any] = jwt.decode(
                id_token,
                jwt.PyJWK.from_dict(key_data).key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "iss", "sub", "aud", "nonce"]},
            )
        except jwt.PyJWTError as exc:
            raise OidcValidationError("OIDC ID token validation failed") from exc
        if claims.get("nonce") != nonce:
            raise OidcValidationError("OIDC nonce validation failed")
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise OidcValidationError("OIDC subject is missing")
        audience = claims.get("aud")
        authorized_party = claims.get("azp")
        if (authorized_party is not None and authorized_party != self.client_id) or (
            isinstance(audience, list) and len(audience) > 1 and authorized_party != self.client_id
        ):
            raise OidcValidationError("OIDC authorized party does not match the client")
        email = claims.get("email")
        if email is not None and not isinstance(email, str):
            raise OidcValidationError("OIDC email claim is invalid")
        return ExternalIdentity(issuer=self.issuer, subject=subject, email=email)
