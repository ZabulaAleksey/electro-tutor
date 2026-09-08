from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import pytest

from electro_tutor_api.adapters.oidc import OidcDiscovery, OidcValidationError
from electro_tutor_api.application.auth import AuthFlowError, AuthService, digest_secret
from electro_tutor_api.domain.identity import AuthTransaction, ExternalIdentity, Principal


class FakeRepository:
    def __init__(self) -> None:
        self.transactions: dict[UUID, AuthTransaction] = {}
        self.identities: dict[tuple[str, str], tuple[UUID, str | None]] = {}
        self.account_ids: dict[tuple[str, str], UUID] = {}
        self.sessions: dict[str, UUID] = {}
        self.deleted_sessions: list[str] = []

    async def create_transaction(
        self, transaction: AuthTransaction, *, expires_at: datetime
    ) -> None:
        assert expires_at > datetime.now(UTC)
        self.transactions[transaction.transaction_id] = transaction

    async def consume_transaction(
        self, transaction_id: UUID, state_digest: str
    ) -> AuthTransaction | None:
        transaction = self.transactions.get(transaction_id)
        if transaction is None or transaction.state_digest != state_digest:
            return None
        return self.transactions.pop(transaction_id)

    async def resolve_identity(self, identity: ExternalIdentity) -> UUID:
        key = (identity.issuer, identity.subject)
        identity_id = self.identities.get(key, (uuid4(), None))[0]
        self.account_ids.setdefault(key, uuid4())
        self.identities[key] = (identity_id, identity.email)
        return identity_id

    async def create_session(
        self, *, token_digest: str, identity_id: UUID, expires_at: datetime
    ) -> None:
        assert expires_at > datetime.now(UTC)
        self.sessions[token_digest] = identity_id

    async def principal_for_session(self, token_digest: str) -> Principal | None:
        identity_id = self.sessions.get(token_digest)
        if identity_id is None:
            return None
        (issuer, subject), (_, email) = next(
            item for item in self.identities.items() if item[1][0] == identity_id
        )
        return Principal(
            account_id=self.account_ids[(issuer, subject)],
            identity_id=identity_id,
            issuer=issuer,
            subject=subject,
            email=email,
            session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )

    async def delete_session(self, token_digest: str) -> None:
        self.deleted_sessions.append(token_digest)
        self.sessions.pop(token_digest, None)


class FakeOidc:
    def __init__(self) -> None:
        self.identity = ExternalIdentity(
            issuer="http://127.0.0.1:58081/realms/electro-tutor-dev",
            subject="stable-subject",
            email="first@invalid.example",
        )
        self.expected_nonce: str | None = None

    async def discover(self) -> OidcDiscovery:
        issuer = self.identity.issuer
        return OidcDiscovery(
            issuer=issuer,
            authorization_endpoint=f"{issuer}/protocol/openid-connect/auth",
            token_endpoint=f"{issuer}/protocol/openid-connect/token",
            jwks_uri=f"{issuer}/protocol/openid-connect/certs",
            end_session_endpoint=f"{issuer}/protocol/openid-connect/logout",
        )

    async def exchange_code(
        self,
        _discovery: OidcDiscovery,
        *,
        code: str,
        redirect_uri: str,
        verifier: str,
        nonce: str,
    ) -> ExternalIdentity:
        assert code == "authorization-code"
        assert redirect_uri == "http://127.0.0.1:8000/api/v1/auth/callback"
        assert len(verifier) >= 43
        self.expected_nonce = nonce
        return self.identity


def service(repository: FakeRepository, oidc: FakeOidc) -> AuthService:
    return AuthService(  # type: ignore[arg-type]
        repository=repository,
        oidc=oidc,
        client_id="electro-tutor-web-dev",
        redirect_uri="http://127.0.0.1:8000/api/v1/auth/callback",
        allowed_return_urls=frozenset({"http://127.0.0.1:4322/ru/account/"}),
        allowed_post_logout_urls=frozenset({"http://127.0.0.1:4322/"}),
        transaction_ttl_seconds=300,
        session_ttl_seconds=3600,
    )


@pytest.mark.asyncio
async def test_login_creates_bound_state_nonce_and_pkce_s256_transaction() -> None:
    repository = FakeRepository()
    auth = service(repository, FakeOidc())
    started = await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    query = parse_qs(urlsplit(started.authorization_url).query)
    transaction = repository.transactions[started.transaction_id]
    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["electro-tutor-web-dev"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid profile email"]
    assert transaction.state_digest == digest_secret(query["state"][0])
    assert transaction.nonce == query["nonce"][0]


@pytest.mark.asyncio
async def test_callback_rejects_missing_or_invalid_state_without_consuming_valid_transaction() -> (
    None
):
    repository = FakeRepository()
    auth = service(repository, FakeOidc())
    with pytest.raises(AuthFlowError, match="missing"):
        await auth.complete_login(
            transaction_id=None,
            state=None,
            code=None,
            previous_session_token=None,
        )
    started = await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    with pytest.raises(AuthFlowError, match="invalid or expired"):
        await auth.complete_login(
            transaction_id=started.transaction_id,
            state="attacker-state",
            code="authorization-code",
            previous_session_token=None,
        )
    assert started.transaction_id in repository.transactions


@pytest.mark.asyncio
async def test_identity_provider_outage_fails_closed_without_transaction() -> None:
    repository = FakeRepository()
    oidc = FakeOidc()

    async def unavailable() -> OidcDiscovery:
        raise TimeoutError("identity provider unavailable")

    oidc.discover = unavailable  # type: ignore[method-assign]
    auth = service(repository, oidc)
    with pytest.raises(AuthFlowError) as raised:
        await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    assert raised.value.code == "identity_provider_unavailable"
    assert raised.value.status_code == 503
    assert repository.transactions == {}


@pytest.mark.asyncio
async def test_same_subject_updates_email_without_new_identity_and_rotates_session() -> None:
    repository = FakeRepository()
    oidc = FakeOidc()
    auth = service(repository, oidc)
    first = await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    first_state = next(
        value for value in parse_qs(urlsplit(first.authorization_url).query)["state"]
    )
    completed = await auth.complete_login(
        transaction_id=first.transaction_id,
        state=first_state,
        code="authorization-code",
        previous_session_token="fixed-session",
    )
    first_id = next(iter(repository.identities.values()))[0]
    assert digest_secret("fixed-session") in repository.deleted_sessions
    assert completed.session_token != "fixed-session"

    oidc.identity = ExternalIdentity(
        issuer=oidc.identity.issuer,
        subject=oidc.identity.subject,
        email="changed@invalid.example",
    )
    second = await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    second_state = parse_qs(urlsplit(second.authorization_url).query)["state"][0]
    await auth.complete_login(
        transaction_id=second.transaction_id,
        state=second_state,
        code="authorization-code",
        previous_session_token=completed.session_token,
    )
    assert len(repository.identities) == 1
    assert next(iter(repository.identities.values())) == (first_id, "changed@invalid.example")


@pytest.mark.asyncio
async def test_same_email_does_not_link_distinct_provider_identities() -> None:
    repository = FakeRepository()
    shared_email = "shared@invalid.example"
    await repository.resolve_identity(
        ExternalIdentity(issuer="https://issuer-a.invalid", subject="subject-a", email=shared_email)
    )
    await repository.resolve_identity(
        ExternalIdentity(issuer="https://issuer-b.invalid", subject="subject-b", email=shared_email)
    )
    assert len(repository.identities) == 2
    assert len(set(repository.account_ids.values())) == 2


@pytest.mark.asyncio
async def test_logout_invalidates_local_session_and_rejects_unknown_redirect() -> None:
    repository = FakeRepository()
    auth = service(repository, FakeOidc())
    with pytest.raises(AuthFlowError, match="not allowed"):
        await auth.logout("session", "https://attacker.example/")
    location = await auth.logout("session", "http://127.0.0.1:4322/")
    assert digest_secret("session") in repository.deleted_sessions
    assert location.startswith(
        "http://127.0.0.1:58081/realms/electro-tutor-dev/protocol/openid-connect/logout?"
    )


@pytest.mark.asyncio
async def test_oidc_validation_failure_does_not_create_session() -> None:
    repository = FakeRepository()
    oidc = FakeOidc()
    auth = service(repository, oidc)
    started = await auth.begin_login("http://127.0.0.1:4322/ru/account/")
    state = parse_qs(urlsplit(started.authorization_url).query)["state"][0]

    async def invalid(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise OidcValidationError("invalid nonce")

    oidc.exchange_code = invalid  # type: ignore[method-assign]
    with pytest.raises(AuthFlowError, match="rejected"):
        await auth.complete_login(
            transaction_id=started.transaction_id,
            state=state,
            code="authorization-code",
            previous_session_token=None,
        )
    assert repository.sessions == {}
