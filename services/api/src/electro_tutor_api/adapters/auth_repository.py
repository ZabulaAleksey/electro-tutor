from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from electro_tutor_api.domain.identity import AuthTransaction, ExternalIdentity, Principal


class AuthRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    async def create_transaction(
        self,
        transaction: AuthTransaction,
        *,
        expires_at: datetime,
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM auth_transactions WHERE expires_at <= CURRENT_TIMESTAMP")
            )
            await connection.execute(
                text(
                    """
                    INSERT INTO auth_transactions
                        (id, state_digest, pkce_verifier, nonce, return_to, expires_at)
                    VALUES
                        (:id, :state_digest, :pkce_verifier, :nonce, :return_to, :expires_at)
                    """
                ),
                {
                    "id": transaction.transaction_id,
                    "state_digest": transaction.state_digest,
                    "pkce_verifier": transaction.pkce_verifier,
                    "nonce": transaction.nonce,
                    "return_to": transaction.return_to,
                    "expires_at": expires_at,
                },
            )

    async def consume_transaction(
        self, transaction_id: UUID, state_digest: str
    ) -> AuthTransaction | None:
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    DELETE FROM auth_transactions
                    WHERE id = :id
                      AND state_digest = :state_digest
                      AND expires_at > CURRENT_TIMESTAMP
                    RETURNING id, state_digest, pkce_verifier, nonce, return_to
                    """
                ),
                {"id": transaction_id, "state_digest": state_digest},
            )
            row = result.mappings().one_or_none()
        if row is None:
            return None
        return AuthTransaction(
            transaction_id=row["id"],
            state_digest=row["state_digest"],
            pkce_verifier=row["pkce_verifier"],
            nonce=row["nonce"],
            return_to=row["return_to"],
        )

    async def resolve_identity(self, identity: ExternalIdentity) -> UUID:
        async with self.engine.begin() as connection:
            result = await connection.execute(
                text(
                    """
                    INSERT INTO external_identities (id, issuer, subject, email)
                    VALUES (:id, :issuer, :subject, :email)
                    ON CONFLICT (issuer, subject) DO UPDATE
                    SET email = EXCLUDED.email, updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                    """
                ),
                {
                    "id": uuid4(),
                    "issuer": identity.issuer,
                    "subject": identity.subject,
                    "email": identity.email,
                },
            )
            return cast(UUID, result.scalar_one())

    async def create_session(
        self,
        *,
        token_digest: str,
        identity_id: UUID,
        expires_at: datetime,
    ) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM application_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
            )
            await connection.execute(
                text(
                    """
                    INSERT INTO application_sessions (token_digest, identity_id, expires_at)
                    VALUES (:token_digest, :identity_id, :expires_at)
                    """
                ),
                {
                    "token_digest": token_digest,
                    "identity_id": identity_id,
                    "expires_at": expires_at,
                },
            )

    async def principal_for_session(self, token_digest: str) -> Principal | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    SELECT i.id, i.issuer, i.subject, i.email, s.expires_at
                    FROM application_sessions AS s
                    JOIN external_identities AS i ON i.id = s.identity_id
                    WHERE s.token_digest = :token_digest
                      AND s.expires_at > CURRENT_TIMESTAMP
                    """
                ),
                {"token_digest": token_digest},
            )
            row = result.mappings().one_or_none()
        if row is None:
            return None
        return Principal(
            identity_id=row["id"],
            issuer=row["issuer"],
            subject=row["subject"],
            email=row["email"],
            session_expires_at=row["expires_at"],
        )

    async def delete_session(self, token_digest: str) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM application_sessions WHERE token_digest = :token_digest"),
                {"token_digest": token_digest},
            )
