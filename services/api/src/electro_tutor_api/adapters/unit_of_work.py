from __future__ import annotations

import logging
from types import TracebackType

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncTransaction

from electro_tutor_api.adapters.audit_repository import PostgresAuditEventRepository
from electro_tutor_api.adapters.capability_repository import PostgresCapabilityGrantRepository
from electro_tutor_api.errors import AuditUnavailableError

logger = logging.getLogger(__name__)


class PostgresUnitOfWork:
    """One-shot owner of one connection and one PostgreSQL transaction."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine
        self._connection: AsyncConnection | None = None
        self._transaction: AsyncTransaction | None = None
        self._entered = False
        self._closed = False
        self.audit_events: PostgresAuditEventRepository
        self.capability_grants: PostgresCapabilityGrantRepository

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
        except SQLAlchemyError as exc:
            if self._connection is not None:
                await self._connection.close()
            self._closed = True
            raise AuditUnavailableError() from exc
        self.audit_events = PostgresAuditEventRepository(self._connection)
        self.capability_grants = PostgresCapabilityGrantRepository(self._connection)
        return self

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
