from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self

from electro_tutor_api.domain.audit import AuditEvent, NewAuditEvent


class AuditEventRepository(Protocol):
    async def append(self, event: NewAuditEvent) -> AuditEvent: ...


class AuditUnitOfWork(Protocol):
    audit_events: AuditEventRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...
