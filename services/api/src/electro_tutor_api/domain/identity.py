from __future__ import annotations

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
    identity_id: UUID
    issuer: str
    subject: str
    email: str | None
    session_expires_at: datetime


@dataclass(frozen=True)
class AuthTransaction:
    transaction_id: UUID
    state_digest: str
    pkce_verifier: str
    nonce: str
    return_to: str
