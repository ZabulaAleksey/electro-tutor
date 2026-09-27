from __future__ import annotations

from collections.abc import Callable
from uuid import UUID, uuid4

from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_session import LessonSession, session_intent_digest
from electro_tutor_api.errors import AuthenticationRequiredError

UnitOfWorkFactory = Callable[[SessionCredential], AuditUnitOfWork]


class LessonSessionService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def read(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        session_id: UUID,
    ) -> LessonSession:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.lesson_sessions.read(session_id)

    async def mutate(
        self,
        principal: Principal | None,
        credential: SessionCredential,
        *,
        action: str,
        resource_id: UUID,
        expected_version: int | None,
        key: UUID,
        request_id: str | None,
    ) -> LessonSession:
        actor = _require_principal(principal)
        async with self._unit_of_work(credential) as unit:
            _require_bound_principal(unit, actor)
            return await unit.lesson_sessions.mutate(
                booking_id=resource_id if action == "create" else None,
                session_id=None if action == "create" else resource_id,
                action=action,
                expected_version=expected_version,
                key=key,
                digest=session_intent_digest(action, resource_id, expected_version),
                correlation_id=uuid4(),
                request_id=request_id,
            )


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
