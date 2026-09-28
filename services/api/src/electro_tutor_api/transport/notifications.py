from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.notifications import NotificationService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.notification import Notification
from electro_tutor_api.errors import AuthenticationRequiredError


class NotificationOriginDeniedError(RuntimeError):
    pass


class NotificationIdValidationError(RuntimeError):
    pass


class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    type: Literal["booking.accepted"]
    booking_id: UUID
    created_at: datetime
    expires_at: datetime
    read_at: datetime | None


class NotificationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[NotificationResponse]
    limit: int
    offset: int


class UnreadCountResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    count: int


@dataclass(frozen=True)
class NotificationRequestContext:
    principal: Principal
    credential: SessionCredential


def build_notification_router(
    auth_service: AuthService,
    service: NotificationService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> NotificationRequestContext:
        principal = await auth_service.principal(token)
        credential = auth_service.session_credential(token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return NotificationRequestContext(principal, credential)

    dependency = Depends(authenticated)

    @router.get("/notifications", response_model=NotificationListResponse)
    async def list_notifications(
        limit: int = Query(20, ge=1, le=50),
        offset: int = Query(0, ge=0, le=2_147_483_647),
        context: NotificationRequestContext = dependency,
    ) -> NotificationListResponse:
        items = await service.list(
            context.principal, context.credential, limit=limit, offset=offset
        )
        return NotificationListResponse(
            items=[_response(item) for item in items], limit=limit, offset=offset
        )

    @router.get("/notifications/unread-count", response_model=UnreadCountResponse)
    async def unread_count(
        context: NotificationRequestContext = dependency,
    ) -> UnreadCountResponse:
        return UnreadCountResponse(
            count=await service.unread_count(context.principal, context.credential)
        )

    @router.post("/notifications/{notification_id}/read", status_code=204)
    async def mark_read(
        request: Request,
        notification_id: str,
        context: NotificationRequestContext = dependency,
    ) -> Response:
        if request.headers.get("Origin") not in settings.allowed_web_origins:
            raise NotificationOriginDeniedError()
        await service.mark_read(
            context.principal, context.credential, _canonical_uuid(notification_id)
        )
        return Response(status_code=204)

    return router


def _canonical_uuid(value: str) -> UUID:
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise NotificationIdValidationError() from exc
    if str(parsed) != value:
        raise NotificationIdValidationError()
    return parsed


def _response(item: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=item.id,
        type=item.event_type,
        booking_id=item.booking_id,
        created_at=item.created_at,
        expires_at=item.expires_at,
        read_at=item.read_at,
    )
