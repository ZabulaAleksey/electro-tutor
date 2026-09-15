from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class ExternalIdentity:
    issuer: str
    subject: str
    email: str | None


@dataclass(frozen=True)
class Principal:
    account_id: UUID
    identity_id: UUID
    issuer: str
    subject: str
    email: str | None
    session_expires_at: datetime


@dataclass(frozen=True, repr=False)
class SessionCredential:
    """Redacted proof used only to bind one database transaction to a session."""

    digest: str

    def __post_init__(self) -> None:
        if len(self.digest) != 64 or any(
            character not in "0123456789abcdef" for character in self.digest
        ):
            raise ValueError("session credential digest must be lowercase SHA-256 hex")

    @classmethod
    def from_token(cls, token: str) -> SessionCredential:
        if not isinstance(token, str) or not token:
            raise ValueError("session token is required")
        return cls(hashlib.sha256(token.encode("utf-8")).hexdigest())

    def __repr__(self) -> str:
        return "<SessionCredential redacted>"

    __str__ = __repr__


@dataclass(frozen=True)
class AuthTransaction:
    transaction_id: UUID
    state_digest: str
    pkce_verifier: str
    nonce: str
    return_to: str
