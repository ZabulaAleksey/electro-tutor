from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Cookie, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from electro_tutor_api.application.auth import AuthFlowError, AuthService
from electro_tutor_api.config import Settings

AUTH_TRANSACTION_COOKIE = "et_auth_tx"


class MeResponse(BaseModel):
    identity_id: UUID
    issuer: str
    subject: str
    email: str | None


def build_auth_router(service: AuthService, settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/auth/login", response_class=RedirectResponse)
    async def login(return_to: str = Query(...)) -> RedirectResponse:
        started = await service.begin_login(return_to)
        response = RedirectResponse(started.authorization_url, status_code=302)
        response.set_cookie(
            AUTH_TRANSACTION_COOKIE,
            str(started.transaction_id),
            max_age=settings.auth_transaction_ttl_seconds,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/api/v1/auth/callback",
        )
        return response

    @router.get("/auth/callback", response_class=RedirectResponse)
    async def callback(
        code: str | None = Query(None),
        state: str | None = Query(None),
        transaction_cookie: str | None = Cookie(None, alias=AUTH_TRANSACTION_COOKIE),
        previous_session: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> RedirectResponse:
        try:
            transaction_id = UUID(transaction_cookie) if transaction_cookie else None
        except ValueError:
            transaction_id = None
        completed = await service.complete_login(
            transaction_id=transaction_id,
            state=state,
            code=code,
            previous_session_token=previous_session,
        )
        response = RedirectResponse(completed.return_to, status_code=303)
        response.delete_cookie(AUTH_TRANSACTION_COOKIE, path="/api/v1/auth/callback")
        response.set_cookie(
            settings.session_cookie_name,
            completed.session_token,
            max_age=settings.session_ttl_seconds,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/api/v1",
        )
        return response

    @router.get("/me", response_model=MeResponse)
    async def me(
        session_token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> MeResponse:
        principal = await service.principal(session_token)
        if principal is None:
            raise AuthFlowError("authentication_required", "Authentication is required.", 401)
        return MeResponse(
            identity_id=principal.identity_id,
            issuer=principal.issuer,
            subject=principal.subject,
            email=principal.email,
        )

    @router.post("/auth/logout", response_class=RedirectResponse)
    async def logout(
        request: Request,
        post_logout_redirect_uri: str = Query(...),
        session_token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> RedirectResponse:
        if request.headers.get("origin") not in settings.allowed_web_origins:
            raise AuthFlowError("invalid_logout_origin", "Logout origin is not allowed.", 403)
        provider_logout = await service.logout(session_token, post_logout_redirect_uri)
        response = RedirectResponse(provider_logout, status_code=303)
        response.delete_cookie(settings.session_cookie_name, path="/api/v1")
        return response

    return router
