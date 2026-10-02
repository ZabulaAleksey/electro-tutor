from __future__ import annotations

from dataclasses import dataclass
from datetime import time

from fastapi import APIRouter, Cookie, Depends, Request
from pydantic import BaseModel, ConfigDict, field_validator

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.reminders import ReminderSettingsService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.reminder import ReminderSettings
from electro_tutor_api.errors import AuthenticationRequiredError
from electro_tutor_api.transport.notifications import NotificationOriginDeniedError


class ReminderSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time_zone: str | None
    remind_24h: bool
    remind_1h: bool
    remind_15m: bool
    quiet_hours_enabled: bool
    quiet_hours_start: str | None
    quiet_hours_end: str | None

    @field_validator("quiet_hours_start", "quiet_hours_end")
    @classmethod
    def validate_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) != 5 or value[2] != ":":
            raise ValueError("expected HH:mm")
        try:
            parsed = time.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("expected HH:mm") from exc
        if parsed.isoformat(timespec="minutes") != value:
            raise ValueError("expected HH:mm")
        return value

    def domain(self) -> ReminderSettings:
        return ReminderSettings(
            time_zone=self.time_zone,
            remind_24h=self.remind_24h,
            remind_1h=self.remind_1h,
            remind_15m=self.remind_15m,
            quiet_hours_enabled=self.quiet_hours_enabled,
            quiet_hours_start=(
                time.fromisoformat(self.quiet_hours_start)
                if self.quiet_hours_start is not None
                else None
            ),
            quiet_hours_end=(
                time.fromisoformat(self.quiet_hours_end)
                if self.quiet_hours_end is not None
                else None
            ),
        )


@dataclass(frozen=True)
class ReminderRequestContext:
    principal: Principal
    credential: SessionCredential


def build_reminder_router(
    auth_service: AuthService,
    service: ReminderSettingsService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> ReminderRequestContext:
        principal = await auth_service.principal(token)
        credential = auth_service.session_credential(token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return ReminderRequestContext(principal, credential)

    dependency = Depends(authenticated)

    @router.get("/reminder-settings/me", response_model=ReminderSettingsBody)
    async def get_settings(
        context: ReminderRequestContext = dependency,
    ) -> ReminderSettingsBody:
        return _body(await service.get(context.principal, context.credential))

    @router.put("/reminder-settings/me", response_model=ReminderSettingsBody)
    async def put_settings(
        request: Request,
        body: ReminderSettingsBody,
        context: ReminderRequestContext = dependency,
    ) -> ReminderSettingsBody:
        if request.headers.get("Origin") not in settings.allowed_web_origins:
            raise NotificationOriginDeniedError()
        return _body(await service.put(context.principal, context.credential, body.domain()))

    return router


def _body(settings: ReminderSettings) -> ReminderSettingsBody:
    return ReminderSettingsBody(
        time_zone=settings.time_zone,
        remind_24h=settings.remind_24h,
        remind_1h=settings.remind_1h,
        remind_15m=settings.remind_15m,
        quiet_hours_enabled=settings.quiet_hours_enabled,
        quiet_hours_start=(
            settings.quiet_hours_start.isoformat(timespec="minutes")
            if settings.quiet_hours_start is not None
            else None
        ),
        quiet_hours_end=(
            settings.quiet_hours_end.isoformat(timespec="minutes")
            if settings.quiet_hours_end is not None
            else None
        ),
    )
