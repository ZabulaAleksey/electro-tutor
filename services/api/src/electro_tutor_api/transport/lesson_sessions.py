from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Request
from pydantic import BaseModel, ConfigDict, StrictInt, ValidationError

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.lesson_sessions import LessonSessionService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.lesson_session import LessonSession, LessonSessionValidationError
from electro_tutor_api.errors import AuthenticationRequiredError


class SessionOriginDeniedError(RuntimeError):
    pass


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateSessionRequest(_StrictRequest):
    pass


class TransitionSessionRequest(_StrictRequest):
    expected_version: StrictInt


class LessonSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    booking_id: UUID
    status: str
    effective_status: str
    version: int
    participant_role: str
    capabilities: list[str]
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    cancelled_at: datetime | None
    current_topic_id: None


@dataclass(frozen=True)
class SessionRequestContext:
    principal: Principal
    credential: SessionCredential


def build_lesson_session_router(
    auth_service: AuthService,
    service: LessonSessionService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> SessionRequestContext:
        principal = await auth_service.principal(token)
        credential = auth_service.session_credential(token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return SessionRequestContext(principal, credential)

    dependency = Depends(authenticated)

    @router.post("/bookings/{booking_id}/lesson-session", response_model=LessonSessionResponse)
    async def create(
        request: Request,
        booking_id: str,
        context: SessionRequestContext = dependency,
    ) -> LessonSessionResponse:
        resource_id = _uuid(booking_id)
        key, _ = await _write(request, CreateSessionRequest, settings)
        return _response(
            await service.mutate(
                context.principal,
                context.credential,
                action="create",
                resource_id=resource_id,
                expected_version=None,
                key=key,
                request_id=request.state.request_id,
            )
        )

    @router.get("/lesson-sessions/{session_id}", response_model=LessonSessionResponse)
    async def read(
        session_id: str,
        context: SessionRequestContext = dependency,
    ) -> LessonSessionResponse:
        return _response(
            await service.read(context.principal, context.credential, _uuid(session_id))
        )

    async def transition(
        request: Request,
        session_id: str,
        context: SessionRequestContext,
        action: str,
    ) -> LessonSessionResponse:
        resource_id = _uuid(session_id)
        key, payload = await _write(request, TransitionSessionRequest, settings)
        assert isinstance(payload, TransitionSessionRequest)
        if payload.expected_version < 1 or payload.expected_version > 2_147_483_647:
            raise LessonSessionValidationError()
        return _response(
            await service.mutate(
                context.principal,
                context.credential,
                action=action,
                resource_id=resource_id,
                expected_version=payload.expected_version,
                key=key,
                request_id=request.state.request_id,
            )
        )

    @router.post("/lesson-sessions/{session_id}/start", response_model=LessonSessionResponse)
    async def start(
        request: Request,
        session_id: str,
        context: SessionRequestContext = dependency,
    ) -> LessonSessionResponse:
        return await transition(request, session_id, context, "start")

    @router.post("/lesson-sessions/{session_id}/end", response_model=LessonSessionResponse)
    async def end(
        request: Request,
        session_id: str,
        context: SessionRequestContext = dependency,
    ) -> LessonSessionResponse:
        return await transition(request, session_id, context, "end")

    return router


async def _write(
    request: Request,
    model: type[_StrictRequest],
    settings: Settings,
) -> tuple[UUID, _StrictRequest]:
    if request.headers.get("Origin") not in settings.allowed_web_origins:
        raise SessionOriginDeniedError()
    if request.headers.get("Content-Type", "").lower() != "application/json":
        raise LessonSessionValidationError()
    key = _uuid(request.headers.get("Idempotency-Key"))
    try:
        payload = model.model_validate(json.loads(await request.body()))
    except (ValueError, TypeError, ValidationError) as exc:
        raise LessonSessionValidationError() from exc
    return key, payload


def _uuid(value: str | None) -> UUID:
    if value is None:
        raise LessonSessionValidationError()
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise LessonSessionValidationError() from exc
    if str(parsed) != value:
        raise LessonSessionValidationError()
    return parsed


def _response(session: LessonSession) -> LessonSessionResponse:
    return LessonSessionResponse(
        id=session.id,
        booking_id=session.booking_id,
        status=session.status,
        effective_status=session.effective_status,
        version=session.version,
        participant_role=session.participant_role,
        capabilities=list(session.capabilities),
        created_at=session.created_at,
        started_at=session.started_at,
        ended_at=session.ended_at,
        cancelled_at=session.cancelled_at,
        current_topic_id=None,
    )
