from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends
from pydantic import BaseModel, ConfigDict

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.lesson_access import LessonAccessGrantService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_access import LessonAccessDecision, LessonAccessValidationError
from electro_tutor_api.errors import AuthenticationRequiredError


class LessonAccessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grant_id: UUID
    booking_id: UUID
    status: str
    participant_role: str
    valid_from: datetime
    valid_until: datetime
    capabilities: list[str]


@dataclass(frozen=True)
class LessonAccessRequestContext:
    principal: Principal
    credential: SessionCredential


def build_lesson_access_router(
    auth_service: AuthService,
    lesson_access_service: LessonAccessGrantService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        session_token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> LessonAccessRequestContext:
        principal = await auth_service.principal(session_token)
        credential = auth_service.session_credential(session_token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return LessonAccessRequestContext(principal, credential)

    authenticated_dependency = Depends(authenticated)

    @router.get(
        "/bookings/{booking_id}/lesson-access",
        response_model=LessonAccessResponse,
    )
    async def read_lesson_access(
        booking_id: str,
        context: LessonAccessRequestContext = authenticated_dependency,
    ) -> LessonAccessResponse:
        parsed_booking_id = _canonical_uuid(booking_id)
        decision = await lesson_access_service.authorize(
            context.principal, context.credential, parsed_booking_id
        )
        return _response(decision)

    return router


def _canonical_uuid(value: str) -> UUID:
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise LessonAccessValidationError("booking_id must be a canonical UUID") from exc
    if str(parsed) != value:
        raise LessonAccessValidationError("booking_id must be a canonical UUID")
    return parsed


def _response(decision: LessonAccessDecision) -> LessonAccessResponse:
    return LessonAccessResponse(
        grant_id=decision.grant_id,
        booking_id=decision.booking_id,
        status=decision.status.value,
        participant_role=decision.participant_role.value,
        valid_from=decision.valid_from,
        valid_until=decision.valid_until,
        capabilities=[capability.value for capability in decision.capabilities],
    )
