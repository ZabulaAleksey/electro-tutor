from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
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
        identity_conflict: IntegrityError | None = None
        try:
            async with self.engine.begin() as connection:
                existing = await connection.execute(
                    text(
                        """
                        UPDATE external_identities
                        SET email = :email, updated_at = CURRENT_TIMESTAMP
                        WHERE issuer = :issuer AND subject = :subject
                        RETURNING id
                        """
                    ),
                    {
                        "issuer": identity.issuer,
                        "subject": identity.subject,
                        "email": identity.email,
                    },
                )
                existing_id = existing.scalar_one_or_none()
                if existing_id is not None:
                    return cast(UUID, existing_id)

                created = await connection.execute(
                    text(
                        """
                        SELECT public.create_external_identity(
                            CAST(:issuer AS text),
                            CAST(:subject AS text),
                            CAST(:email AS text)
                        )
                        """
                    ),
                    {
                        "issuer": identity.issuer,
                        "subject": identity.subject,
                        "email": identity.email,
                    },
                )
                return cast(UUID, created.scalar_one())
        except IntegrityError as exc:
            if not _is_external_identity_conflict(exc):
                raise
            identity_conflict = exc

        # The failed transaction rolled back its candidate Account. Resolve the
        # concurrent winner in a new PostgreSQL transaction.
        async with self.engine.begin() as connection:
            resolved = await connection.execute(
                text(
                    """
                    UPDATE external_identities
                    SET email = :email, updated_at = CURRENT_TIMESTAMP
                    WHERE issuer = :issuer AND subject = :subject
                    RETURNING id
                    """
                ),
                {
                    "issuer": identity.issuer,
                    "subject": identity.subject,
                    "email": identity.email,
                },
            )
            resolved_id = resolved.scalar_one_or_none()
        if resolved_id is None:
            raise identity_conflict
        return cast(UUID, resolved_id)

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
                    SELECT i.id, i.account_id, i.issuer, i.subject, i.email, s.expires_at
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
            account_id=row["account_id"],
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


def _is_external_identity_conflict(error: IntegrityError) -> bool:
    current: BaseException | None = error
    for _ in range(5):
        if current is None:
            return False
        if getattr(current, "constraint_name", None) == "uq_external_identities_issuer_subject":
            return True
        if getattr(
            current, "sqlstate", None
        ) == "23505" and "uq_external_identities_issuer_subject" in str(current):
            return True
        current = current.__cause__ or current.__context__
    return False
