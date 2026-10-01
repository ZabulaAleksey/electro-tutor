from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.notification import Notification
from electro_tutor_api.errors import AuthenticationRequiredError, NotificationNotFoundError

UnitOfWorkFactory = Callable[[SessionCredential], AuditUnitOfWork]


class NotificationService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def list(
        self, principal: Principal | None, credential: SessionCredential, *, limit: int, offset: int
    ) -> list[Notification]:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.notifications.list(limit=limit, offset=offset)

    async def unread_count(self, principal: Principal | None, credential: SessionCredential) -> int:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.notifications.unread_count()

    async def mark_read(
        self, principal: Principal | None, credential: SessionCredential, notification_id: UUID
    ) -> None:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            if not await unit.notifications.mark_read(notification_id):
                raise NotificationNotFoundError()


def _require_principal(principal: Principal | None) -> Principal:
    if not isinstance(principal, Principal):
        raise AuthenticationRequiredError()
    return principal


def _require_bound_principal(unit: AuditUnitOfWork, principal: Principal) -> None:
    resolved = unit.session_principal
    if (
        not isinstance(resolved, Principal)
        or resolved.account_id != principal.account_id
        or resolved.identity_id != principal.identity_id
    ):
        raise AuthenticationRequiredError()
