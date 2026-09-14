from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncEngine
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.database import (
    DatabaseHealth,
    create_auth_engine,
    create_runtime_engine,
)
from electro_tutor_api.adapters.oidc import OidcAdapter
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.auth import AuthFlowError, AuthService
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.application.health import HealthService
from electro_tutor_api.application.profiles import ProfileService, UnitOfWorkFactory
from electro_tutor_api.config import Settings, get_settings
from electro_tutor_api.domain.booking import BookingValidationError
from electro_tutor_api.domain.profile import ProfileValidationError
from electro_tutor_api.errors import (
    AuditUnavailableError,
    AuthenticationRequiredError,
    BookingNotFoundError,
    BookingOverlapError,
    BookingTimeElapsedError,
    CapabilityRequiredError,
    ErrorBody,
    ErrorResponse,
    IdempotencyConflictError,
    InvalidBookingTransitionError,
    LessonAccessPolicyUnavailableError,
    OfferChangedError,
    OfferUnavailableError,
    ProfileAlreadyExistsError,
    ProfileNotFoundError,
    SelfBookingForbiddenError,
    TutorOfferNotFoundError,
    VersionConflictError,
)
from electro_tutor_api.logging import log_request
from electro_tutor_api.request_id import accepted_request_id
from electro_tutor_api.transport.auth import build_auth_router
from electro_tutor_api.transport.bookings import build_booking_router
from electro_tutor_api.transport.health import router as health_router
from electro_tutor_api.transport.profiles import build_profile_router

PROFILE_ERROR_CONTRACT: dict[type[Exception], tuple[str, str, int]] = {
    AuthenticationRequiredError: (
        "authentication_required",
        "Authentication is required.",
        401,
    ),
    CapabilityRequiredError: (
        "capability_required",
        "The required capability is not active.",
        403,
    ),
    ProfileNotFoundError: ("profile_not_found", "Profile was not found.", 404),
    ProfileAlreadyExistsError: (
        "profile_already_exists",
        "Profile already exists with different data.",
        409,
    ),
    ProfileValidationError: ("invalid_request", "Request validation failed.", 422),
}

BOOKING_ERROR_CONTRACT: dict[type[Exception], tuple[str, str, int]] = {
    BookingValidationError: ("invalid_request", "Request validation failed.", 422),
    TutorOfferNotFoundError: ("tutor_offer_not_found", "Tutor offer was not found.", 404),
    BookingNotFoundError: ("booking_not_found", "Booking was not found.", 404),
    IdempotencyConflictError: (
        "idempotency_conflict",
        "The idempotency key conflicts with an earlier operation.",
        409,
    ),
    OfferChangedError: ("offer_changed", "Tutor offer has changed.", 409),
    VersionConflictError: ("version_conflict", "Resource version has changed.", 409),
    InvalidBookingTransitionError: (
        "invalid_booking_transition",
        "Booking transition is not allowed.",
        409,
    ),
    BookingTimeElapsedError: (
        "booking_time_elapsed",
        "Booking time boundary has elapsed.",
        409,
    ),
    BookingOverlapError: ("booking_overlap", "Booking overlaps an accepted booking.", 409),
    SelfBookingForbiddenError: (
        "self_booking_forbidden",
        "Tutor and student must be different accounts.",
        409,
    ),
    OfferUnavailableError: ("offer_unavailable", "Tutor offer is unavailable.", 409),
    LessonAccessPolicyUnavailableError: (
        "lesson_access_policy_unavailable",
        "Lesson access policy is temporarily unavailable.",
        503,
    ),
}


def _error(request: Request, code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(
            error=ErrorBody(
                code=code, message=message, request_id=request.state.request_id, details={}
            )
        ).model_dump(),
    )


def create_app(
    settings: Settings | None = None,
    check_database: Callable[[], Awaitable[str]] | None = None,
    auth_service: AuthService | None = None,
    profile_service: ProfileService | None = None,
    booking_service: BookingService | None = None,
) -> FastAPI:
    resolved = settings or get_settings()
    owned_engines: list[AsyncEngine] = []
    runtime_engine = None
    if profile_service is None or check_database is None:
        runtime_engine = create_runtime_engine(resolved)
        owned_engines.append(runtime_engine)
    auth_engine = None
    if auth_service is None:
        auth_engine = create_auth_engine(resolved)
        owned_engines.append(auth_engine)
    resolved_auth_service = auth_service
    if resolved_auth_service is None:
        assert auth_engine is not None
        resolved_auth_service = AuthService(
            repository=AuthRepository(auth_engine),
            oidc=OidcAdapter(
                issuer=resolved.oidc_issuer,
                backchannel_base_url=resolved.oidc_backchannel_base_url,
                client_id=resolved.oidc_client_id,
            ),
            client_id=resolved.oidc_client_id,
            redirect_uri=resolved.oidc_redirect_uri,
            allowed_return_urls=resolved.allowed_return_urls,
            allowed_post_logout_urls=resolved.allowed_post_logout_urls,
            transaction_ttl_seconds=resolved.auth_transaction_ttl_seconds,
            session_ttl_seconds=resolved.session_ttl_seconds,
        )
    resolved_profile_service = profile_service
    if resolved_profile_service is None:
        assert runtime_engine is not None
        resolved_profile_service = ProfileService(
            cast(
                UnitOfWorkFactory,
                lambda credential: PostgresUnitOfWork(runtime_engine, credential),
            )
        )
    resolved_booking_service = booking_service
    if resolved_booking_service is None and runtime_engine is not None:
        resolved_booking_service = BookingService(
            cast(
                UnitOfWorkFactory,
                lambda credential: PostgresUnitOfWork(runtime_engine, credential),
            )
        )
    resolved_database_check = check_database
    if resolved_database_check is None:
        assert runtime_engine is not None
        resolved_database_check = DatabaseHealth(runtime_engine).check

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.health_service = HealthService(resolved_database_check)
        try:
            yield
        finally:
            for owned_engine in owned_engines:
                try:
                    await owned_engine.dispose()
                except Exception as exc:  # noqa: BLE001 - continue disposing all engines
                    logging.getLogger("electro_tutor_api").error(
                        "database engine disposal failed: %s", type(exc).__name__
                    )

    app = FastAPI(
        title="Electro Tutor API",
        version="0.1.0",
        docs_url="/docs" if resolved.docs_enabled else None,
        redoc_url="/redoc" if resolved.docs_enabled else None,
        openapi_url="/openapi.json" if resolved.docs_enabled else None,
        debug=resolved.debug,
        lifespan=lifespan,
    )
    app.state.health_service = HealthService(resolved_database_check)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved.allowed_web_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_headers=["Content-Type", "X-Request-ID", "Idempotency-Key"],
    )

    @app.middleware("http")
    async def contract_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        request.state.request_id = accepted_request_id(
            request.headers.get("X-Request-ID"), max_length=resolved.request_id_max_length
        )
        content_length = request.headers.get("content-length")
        response: Response
        if content_length is not None and (
            not content_length.isdecimal() or int(content_length) > resolved.body_limit_bytes
        ):
            response = _error(request, "request_too_large", "Request body is too large.", 413)
        else:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > resolved.body_limit_bytes:
                    response = _error(
                        request, "request_too_large", "Request body is too large.", 413
                    )
                    break
            else:
                request._body = bytes(body)
                response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Request-ID"] = request.state.request_id
        log_request(request, response, started)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, _exc: RequestValidationError) -> JSONResponse:
        return _error(request, "invalid_request", "Request validation failed.", 422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return _error(request, "http_error", "Request could not be completed.", exc.status_code)

    @app.exception_handler(AuthFlowError)
    async def auth_error(request: Request, exc: AuthFlowError) -> JSONResponse:
        return _error(request, exc.code, exc.message, exc.status_code)

    @app.exception_handler(AuditUnavailableError)
    async def audit_unavailable(request: Request, exc: AuditUnavailableError) -> JSONResponse:
        return _error(request, exc.code, exc.message, exc.status_code)

    async def profile_error(request: Request, exc: Exception) -> JSONResponse:
        code, message, status_code = PROFILE_ERROR_CONTRACT[type(exc)]
        return _error(request, code, message, status_code)

    for profile_error_type in PROFILE_ERROR_CONTRACT:
        app.add_exception_handler(profile_error_type, profile_error)

    async def booking_error(request: Request, exc: Exception) -> JSONResponse:
        code, message, status_code = BOOKING_ERROR_CONTRACT[type(exc)]
        return _error(request, code, message, status_code)

    for booking_error_type in BOOKING_ERROR_CONTRACT:
        app.add_exception_handler(booking_error_type, booking_error)

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        logging.getLogger("electro_tutor_api").error(
            "request failed: %s", type(exc).__name__, extra={"request_id": request.state.request_id}
        )
        return _error(request, "internal_error", "An internal error occurred.", 500)

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(build_auth_router(resolved_auth_service, resolved), prefix="/api/v1")
    app.include_router(
        build_profile_router(resolved_auth_service, resolved_profile_service, resolved),
        prefix="/api/v1",
    )
    if resolved_booking_service is not None:
        app.include_router(
            build_booking_router(resolved_auth_service, resolved_booking_service, resolved),
            prefix="/api/v1",
        )
    return app
