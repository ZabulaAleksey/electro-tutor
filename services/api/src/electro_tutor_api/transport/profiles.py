from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, Request
from pydantic import BaseModel, ConfigDict, ValidationError

from electro_tutor_api.application.auth import AuthService
from electro_tutor_api.application.profiles import ProfileService
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.profile import ProfileValidationError, StudentProfile, TutorProfile
from electro_tutor_api.errors import AuthenticationRequiredError, ProfileNotFoundError


class ProfileKind(StrEnum):
    STUDENT = "student"
    TUTOR = "tutor"


class ProfileWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str


PROFILE_WRITE_OPENAPI = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {"schema": ProfileWriteRequest.model_json_schema()},
        },
    }
}


class ProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    account_id: UUID
    display_name: str
    created_at: datetime
    updated_at: datetime


class OwnProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    display_name: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ProfileRequestContext:
    principal: Principal
    credential: SessionCredential


def build_profile_router(
    auth_service: AuthService,
    profile_service: ProfileService,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    async def authenticated(
        session_token: str | None = Cookie(None, alias=settings.session_cookie_name),
    ) -> ProfileRequestContext:
        principal = await auth_service.principal(session_token)
        credential = auth_service.session_credential(session_token)
        if principal is None or credential is None:
            raise AuthenticationRequiredError()
        return ProfileRequestContext(principal, credential)

    authenticated_dependency = Depends(authenticated)

    async def require_owner_selector(
        account_id: UUID,
        context: ProfileRequestContext = authenticated_dependency,
    ) -> ProfileRequestContext:
        if context.principal.account_id != account_id:
            raise ProfileNotFoundError()
        return context

    owner_dependency = Depends(require_owner_selector)

    async def parse_write_request(request: Request) -> ProfileWriteRequest:
        try:
            raw_payload = await request.json()
        except (TypeError, ValueError) as exc:
            raise ProfileValidationError("profile request must be valid JSON") from exc
        try:
            return ProfileWriteRequest.model_validate(raw_payload)
        except ValidationError as exc:
            raise ProfileValidationError("profile request body is invalid") from exc

    async def read_for_kind(
        profile_kind: ProfileKind,
        context: ProfileRequestContext,
    ) -> StudentProfile | TutorProfile:
        if profile_kind is ProfileKind.STUDENT:
            return await profile_service.read_student_profile(context.principal, context.credential)
        return await profile_service.read_tutor_profile(context.principal, context.credential)

    async def create_for_kind(
        request: Request,
        profile_kind: ProfileKind,
        context: ProfileRequestContext,
    ) -> StudentProfile | TutorProfile:
        payload = await parse_write_request(request)
        if profile_kind is ProfileKind.STUDENT:
            return await profile_service.create_student_profile(
                context.principal, context.credential, payload.display_name
            )
        return await profile_service.create_tutor_profile(
            context.principal,
            context.credential,
            payload.display_name,
            correlation_id=uuid4(),
            request_id=request.state.request_id,
        )

    async def update_for_kind(
        request: Request,
        profile_kind: ProfileKind,
        context: ProfileRequestContext,
    ) -> StudentProfile | TutorProfile:
        payload = await parse_write_request(request)
        if profile_kind is ProfileKind.STUDENT:
            return await profile_service.update_student_profile(
                context.principal, context.credential, payload.display_name
            )
        return await profile_service.update_tutor_profile(
            context.principal, context.credential, payload.display_name
        )

    # Keep the literal self routes before the UUID selector routes. The UI can use
    # these without exposing the internal account key through the authentication API.
    @router.get(
        "/profiles/{profile_kind}/me",
        response_model=OwnProfileResponse,
    )
    async def read_own_profile(
        profile_kind: ProfileKind,
        context: ProfileRequestContext = authenticated_dependency,
    ) -> StudentProfile | TutorProfile:
        return await read_for_kind(profile_kind, context)

    @router.put(
        "/profiles/{profile_kind}/me",
        response_model=OwnProfileResponse,
        openapi_extra=PROFILE_WRITE_OPENAPI,
    )
    async def create_own_profile(
        request: Request,
        profile_kind: ProfileKind,
        context: ProfileRequestContext = authenticated_dependency,
    ) -> StudentProfile | TutorProfile:
        return await create_for_kind(request, profile_kind, context)

    @router.patch(
        "/profiles/{profile_kind}/me",
        response_model=OwnProfileResponse,
        openapi_extra=PROFILE_WRITE_OPENAPI,
    )
    async def update_own_profile(
        request: Request,
        profile_kind: ProfileKind,
        context: ProfileRequestContext = authenticated_dependency,
    ) -> StudentProfile | TutorProfile:
        return await update_for_kind(request, profile_kind, context)

    @router.get(
        "/profiles/{profile_kind}/{account_id}",
        response_model=ProfileResponse,
    )
    async def read_profile(
        profile_kind: ProfileKind,
        account_id: UUID,
        context: ProfileRequestContext = owner_dependency,
    ) -> StudentProfile | TutorProfile:
        return await read_for_kind(profile_kind, context)

    @router.put(
        "/profiles/{profile_kind}/{account_id}",
        response_model=ProfileResponse,
        openapi_extra=PROFILE_WRITE_OPENAPI,
    )
    async def create_profile(
        request: Request,
        profile_kind: ProfileKind,
        account_id: UUID,
        context: ProfileRequestContext = owner_dependency,
    ) -> StudentProfile | TutorProfile:
        return await create_for_kind(request, profile_kind, context)

    @router.patch(
        "/profiles/{profile_kind}/{account_id}",
        response_model=ProfileResponse,
        openapi_extra=PROFILE_WRITE_OPENAPI,
    )
    async def update_profile(
        request: Request,
        profile_kind: ProfileKind,
        account_id: UUID,
        context: ProfileRequestContext = owner_dependency,
    ) -> StudentProfile | TutorProfile:
        return await update_for_kind(request, profile_kind, context)

    return router
