from __future__ import annotations

from collections.abc import Callable

from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.reminder import ReminderSettings
from electro_tutor_api.errors import AuthenticationRequiredError

UnitOfWorkFactory = Callable[[SessionCredential], AuditUnitOfWork]


class ReminderSettingsService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def get(
        self, principal: Principal | None, credential: SessionCredential
    ) -> ReminderSettings:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.reminder_settings.get()

    async def put(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        settings: ReminderSettings,
    ) -> ReminderSettings:
        actor = _require_principal(principal)
        settings.validate()
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.reminder_settings.put(settings)


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
