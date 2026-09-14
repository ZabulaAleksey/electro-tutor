from __future__ import annotations

import asyncio
import logging
from types import TracebackType

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncTransaction

from electro_tutor_api.adapters.audit_repository import PostgresAuditEventRepository
from electro_tutor_api.adapters.booking_repository import (
    PostgresBookingOperationRepository,
    PostgresBookingRepository,
    PostgresTutorOfferRepository,
)
from electro_tutor_api.adapters.capability_repository import PostgresCapabilityGrantRepository
from electro_tutor_api.adapters.profile_repository import PostgresProfileRepository
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.errors import AuditUnavailableError, AuthenticationRequiredError

logger = logging.getLogger(__name__)


class PostgresUnitOfWork:
    """One-shot owner of one connection and one PostgreSQL transaction."""

    def __init__(self, engine: AsyncEngine, credential: SessionCredential | None = None) -> None:
        self._engine = engine
        self._connection: AsyncConnection | None = None
        self._transaction: AsyncTransaction | None = None
        self._entered = False
        self._closed = False
        self._credential = credential
        self.session_principal: Principal | None = None
        self.audit_events: PostgresAuditEventRepository
        self.booking_operations: PostgresBookingOperationRepository
        self.bookings: PostgresBookingRepository
        self.capability_grants: PostgresCapabilityGrantRepository
        self.profiles: PostgresProfileRepository
        self.tutor_offers: PostgresTutorOfferRepository

    @property
    def connection(self) -> AsyncConnection:
        if self._connection is None or self._closed:
            raise RuntimeError("unit of work is not active")
        return self._connection

    async def __aenter__(self) -> PostgresUnitOfWork:
        if self._entered or self._closed:
            raise RuntimeError("unit of work is one-shot and cannot be nested or reused")
        self._entered = True
        try:
            self._connection = await self._engine.connect()
            self._transaction = await self._connection.begin()
            if self._credential is not None:
                await self._connection.execute(
                    text(
                        "SELECT pg_catalog.set_config("
                        "'electro_tutor.session_digest', CAST(:digest AS text), true)"
                    ),
                    {"digest": self._credential.digest},
                )
                result = await self._connection.execute(
                    text("SELECT * FROM public.resolve_active_session_principal()")
                )
                row = result.mappings().one()
                self.session_principal = Principal(
                    account_id=row["account_id"],
                    identity_id=row["identity_id"],
                    issuer=row["issuer"],
                    subject=row["subject"],
                    email=row["email"],
                    session_expires_at=row["session_expires_at"],
                )
        except BaseException as exc:
            self._closed = True
            cleanup_failure = await asyncio.shield(self._cleanup_failed_enter())
            if cleanup_failure is not None:
                logger.warning(
                    "unit-of-work enter cleanup failed: %s",
                    type(cleanup_failure).__name__,
                )
            if isinstance(exc, SQLAlchemyError):
                if self._credential is not None and _sqlstate(exc) == "28000":
                    raise AuthenticationRequiredError() from exc
                raise AuditUnavailableError() from exc
            raise
        self.audit_events = PostgresAuditEventRepository(self._connection)
        self.booking_operations = PostgresBookingOperationRepository(self._connection)
        self.bookings = PostgresBookingRepository(self._connection, self.booking_operations)
        self.capability_grants = PostgresCapabilityGrantRepository(self._connection)
        self.profiles = PostgresProfileRepository(self._connection)
        self.tutor_offers = PostgresTutorOfferRepository(self._connection, self.booking_operations)
        return self

    async def _cleanup_failed_enter(self) -> BaseException | None:
        """Release partial enter state without replacing the original failure."""
        transaction = self._transaction
        connection = self._connection
        cleanup_failure: BaseException | None = None
        if transaction is not None and transaction.is_active:
            try:
                await transaction.rollback()
            except BaseException as exc:  # cleanup must continue through connection close
                cleanup_failure = exc
        if connection is not None:
            try:
                await connection.close()
            except BaseException as exc:  # preserve the original enter failure
                cleanup_failure = cleanup_failure or exc
        return cleanup_failure

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        transaction = self._transaction
        connection = self._connection
        if transaction is None or connection is None or self._closed:
            raise RuntimeError("unit of work lifecycle is invalid")
        lifecycle_failure: SQLAlchemyError | None = None
        committed = False
        try:
            if exc_type is None:
                await transaction.commit()
                committed = True
            elif transaction.is_active:
                await transaction.rollback()
        except SQLAlchemyError as exc:
            lifecycle_failure = exc
            if transaction.is_active:
                try:
                    await transaction.rollback()
                except SQLAlchemyError:
                    pass
        finally:
            self._closed = True
            try:
                await connection.close()
            except SQLAlchemyError as exc:
                if committed:
                    logger.warning(
                        "committed unit-of-work connection close failed: %s", type(exc).__name__
                    )
                else:
                    lifecycle_failure = lifecycle_failure or exc
        if lifecycle_failure is not None:
            raise AuditUnavailableError() from lifecycle_failure
        return False


def _sqlstate(error: BaseException) -> str | None:
    current: BaseException | None = error
    for _ in range(6):
        if current is None:
            return None
        value = getattr(current, "sqlstate", None) or getattr(current, "pgcode", None)
        if isinstance(value, str):
            return value
        current = current.__cause__ or current.__context__
    return None
