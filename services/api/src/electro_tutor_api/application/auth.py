from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import UUID, uuid4

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.oidc import OidcAdapter, OidcDiscovery, OidcValidationError
from electro_tutor_api.domain.identity import AuthTransaction, Principal


class AuthFlowError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class LoginStart:
    authorization_url: str
    transaction_id: UUID


@dataclass(frozen=True)
class LoginComplete:
    return_to: str
    session_token: str


def digest_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class AuthService:
    def __init__(
        self,
        *,
        repository: AuthRepository,
        oidc: OidcAdapter,
        client_id: str,
        redirect_uri: str,
        allowed_return_urls: frozenset[str],
        allowed_post_logout_urls: frozenset[str],
        transaction_ttl_seconds: int,
        session_ttl_seconds: int,
    ) -> None:
        self.repository = repository
        self.oidc = oidc
        self.client_id = client_id
        self.redirect_uri = redirect_uri
        self.allowed_return_urls = allowed_return_urls
        self.allowed_post_logout_urls = allowed_post_logout_urls
        self.transaction_ttl_seconds = transaction_ttl_seconds
        self.session_ttl_seconds = session_ttl_seconds

    async def begin_login(self, return_to: str) -> LoginStart:
        if return_to not in self.allowed_return_urls:
            raise AuthFlowError("invalid_return_url", "Login return URL is not allowed.")
        discovery = await self._discover()
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        transaction = AuthTransaction(
            transaction_id=uuid4(),
            state_digest=digest_secret(state),
            pkce_verifier=verifier,
            nonce=nonce,
            return_to=return_to,
        )
        await self.repository.create_transaction(
            transaction,
            expires_at=datetime.now(UTC) + timedelta(seconds=self.transaction_ttl_seconds),
        )
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
                "scope": "openid profile email",
                "state": state,
                "nonce": nonce,
                "code_challenge": pkce_challenge(verifier),
                "code_challenge_method": "S256",
            }
        )
        return LoginStart(
            authorization_url=f"{discovery.authorization_endpoint}?{query}",
            transaction_id=transaction.transaction_id,
        )

    async def complete_login(
        self,
        *,
        transaction_id: UUID | None,
        state: str | None,
        code: str | None,
        previous_session_token: str | None,
    ) -> LoginComplete:
        if transaction_id is None or state is None or code is None:
            raise AuthFlowError("invalid_auth_transaction", "Login transaction is missing.")
        state_digest = digest_secret(state)
        transaction = await self.repository.consume_transaction(transaction_id, state_digest)
        if transaction is None or not hmac.compare_digest(transaction.state_digest, state_digest):
            raise AuthFlowError("invalid_auth_state", "Login state is invalid or expired.")
        discovery = await self._discover()
        try:
            external = await self.oidc.exchange_code(
                discovery,
                code=code,
                redirect_uri=self.redirect_uri,
                verifier=transaction.pkce_verifier,
                nonce=transaction.nonce,
            )
        except OidcValidationError as exc:
            raise AuthFlowError(
                "oidc_validation_failed", "Identity response was rejected."
            ) from exc
        identity_id = await self.repository.resolve_identity(external)
        if previous_session_token:
            await self.repository.delete_session(digest_secret(previous_session_token))
        session_token = secrets.token_urlsafe(48)
        await self.repository.create_session(
            token_digest=digest_secret(session_token),
            identity_id=identity_id,
            expires_at=datetime.now(UTC) + timedelta(seconds=self.session_ttl_seconds),
        )
        return LoginComplete(return_to=transaction.return_to, session_token=session_token)

    async def principal(self, session_token: str | None) -> Principal | None:
        if not session_token:
            return None
        return await self.repository.principal_for_session(digest_secret(session_token))

    async def logout(self, session_token: str | None, post_logout_redirect_uri: str) -> str:
        if post_logout_redirect_uri not in self.allowed_post_logout_urls:
            raise AuthFlowError("invalid_logout_url", "Logout redirect URL is not allowed.")
        if session_token:
            await self.repository.delete_session(digest_secret(session_token))
        discovery = await self._discover()
        query = urlencode(
            {
                "client_id": self.client_id,
                "post_logout_redirect_uri": post_logout_redirect_uri,
            }
        )
        return f"{discovery.end_session_endpoint}?{query}"

    async def _discover(self) -> OidcDiscovery:
        try:
            return await self.oidc.discover()
        except Exception as exc:
            raise AuthFlowError(
                "identity_provider_unavailable", "Identity provider is unavailable.", 503
            ) from exc
