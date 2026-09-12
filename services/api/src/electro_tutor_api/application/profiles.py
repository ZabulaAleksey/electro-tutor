from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from electro_tutor_api.application.capabilities import CapabilityEvaluator
from electro_tutor_api.application.unit_of_work import AuditUnitOfWork
from electro_tutor_api.domain.capability import TutorProfileOperation
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.domain.profile import (
    StudentProfile,
    TutorProfile,
    normalize_display_name,
)
from electro_tutor_api.errors import (
    AuthenticationRequiredError,
    CapabilityRequiredError,
    ProfileAlreadyExistsError,
    ProfileNotFoundError,
)

UnitOfWorkFactory = Callable[[], AuditUnitOfWork]


class ProfileService:
    def __init__(
        self,
        unit_of_work: UnitOfWorkFactory,
        capability_evaluator: CapabilityEvaluator | None = None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._capability_evaluator = capability_evaluator or CapabilityEvaluator(unit_of_work)

    async def create_student_profile(
        self, principal: Principal | None, display_name: str
    ) -> StudentProfile:
        actor = _require_principal(principal)
        normalized_name = normalize_display_name(display_name)
        async with self._unit_of_work() as unit:
            profile, created = await unit.profiles.create_student(actor.account_id, normalized_name)
            if not created and profile.display_name != normalized_name:
                raise ProfileAlreadyExistsError()
            return profile

    async def read_student_profile(self, principal: Principal | None) -> StudentProfile:
        actor = _require_principal(principal)
        async with self._unit_of_work() as unit:
            profile = await unit.profiles.get_student(actor.account_id)
            if profile is None:
                raise ProfileNotFoundError()
            return profile

    async def update_student_profile(
        self, principal: Principal | None, display_name: str
    ) -> StudentProfile:
        actor = _require_principal(principal)
        normalized_name = normalize_display_name(display_name)
        async with self._unit_of_work() as unit:
            profile = await unit.profiles.update_student(actor.account_id, normalized_name)
            if profile is None:
                raise ProfileNotFoundError()
            return profile

    async def create_tutor_profile(
        self,
        principal: Principal | None,
        display_name: str,
        *,
        correlation_id: UUID | None = None,
        request_id: str | None = None,
    ) -> TutorProfile:
        actor = _require_principal(principal)
        normalized_name = normalize_display_name(display_name)
        async with self._unit_of_work() as unit:
            await self._require_tutor_capability(
                unit, actor, TutorProfileOperation.CREATE_OWN, for_update=True
            )
            profile, created = await unit.profiles.create_tutor(
                actor.account_id,
                normalized_name,
                correlation_id=correlation_id,
                request_id=request_id,
            )
            if not created:
                if profile.display_name != normalized_name:
                    raise ProfileAlreadyExistsError()
                return profile
            return profile

    async def read_tutor_profile(self, principal: Principal | None) -> TutorProfile:
        actor = _require_principal(principal)
        async with self._unit_of_work() as unit:
            await self._require_tutor_capability(
                unit, actor, TutorProfileOperation.READ_OWN, for_update=True
            )
            profile = await unit.profiles.get_tutor(actor.account_id)
            if profile is None:
                raise ProfileNotFoundError()
            return profile

    async def update_tutor_profile(
        self, principal: Principal | None, display_name: str
    ) -> TutorProfile:
        actor = _require_principal(principal)
        normalized_name = normalize_display_name(display_name)
        async with self._unit_of_work() as unit:
            await self._require_tutor_capability(
                unit, actor, TutorProfileOperation.UPDATE_OWN, for_update=True
            )
            profile = await unit.profiles.update_tutor(actor.account_id, normalized_name)
            if profile is None:
                raise ProfileNotFoundError()
            return profile

    async def _require_tutor_capability(
        self,
        unit: AuditUnitOfWork,
        principal: Principal,
        operation: TutorProfileOperation,
        *,
        for_update: bool,
    ) -> None:
        if not await self._capability_evaluator.authorize_in(
            unit,
            principal,
            operation,
            principal.account_id,
            for_update=for_update,
        ):
            raise CapabilityRequiredError()


def _require_principal(principal: Principal | None) -> Principal:
    if not isinstance(principal, Principal):
        raise AuthenticationRequiredError()
    return principal
