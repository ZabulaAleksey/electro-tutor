from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_access import LessonAccessDecision, LessonAccessStatus
from electro_tutor_api.errors import (
    AuthenticationRequiredError,
    LessonAccessExpiredError,
    LessonAccessNotYetValidError,
    LessonAccessRevokedError,
)

UnitOfWorkFactory = Callable[[SessionCredential], AuditUnitOfWork]


class LessonAccessGrantService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def authorize(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        booking_id: UUID,
    ) -> LessonAccessDecision:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            decision = await unit.lesson_access_grants.authorize_for_current_session(booking_id)
        if decision.status is LessonAccessStatus.NOT_YET_VALID:
            raise LessonAccessNotYetValidError()
        if decision.status is LessonAccessStatus.EXPIRED:
            raise LessonAccessExpiredError()
        if decision.status is LessonAccessStatus.REVOKED:
            raise LessonAccessRevokedError()
        return decision


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
