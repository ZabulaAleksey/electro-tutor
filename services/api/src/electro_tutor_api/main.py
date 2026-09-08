from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.database import DatabaseHealth, create_runtime_engine
from electro_tutor_api.adapters.oidc import OidcAdapter
from electro_tutor_api.application.auth import AuthFlowError, AuthService
from electro_tutor_api.application.health import HealthService
from electro_tutor_api.config import Settings, get_settings
from electro_tutor_api.errors import AuditUnavailableError, ErrorBody, ErrorResponse
from electro_tutor_api.logging import log_request
from electro_tutor_api.request_id import accepted_request_id
from electro_tutor_api.transport.auth import build_auth_router
from electro_tutor_api.transport.health import router as health_router


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
) -> FastAPI:
    resolved = settings or get_settings()
    engine = create_runtime_engine(resolved)
    resolved_auth_service = auth_service or AuthService(
        repository=AuthRepository(engine),
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

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.health_service = HealthService(check_database or DatabaseHealth(engine).check)
        yield
        await engine.dispose()

    app = FastAPI(
        title="Electro Tutor API",
        version="0.1.0",
        docs_url="/docs" if resolved.docs_enabled else None,
        redoc_url="/redoc" if resolved.docs_enabled else None,
        openapi_url="/openapi.json" if resolved.docs_enabled else None,
        debug=resolved.debug,
        lifespan=lifespan,
    )
    app.state.health_service = HealthService(check_database or DatabaseHealth(engine).check)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved.allowed_web_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID"],
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

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        logging.getLogger("electro_tutor_api").error(
            "request failed: %s", type(exc).__name__, extra={"request_id": request.state.request_id}
        )
        return _error(request, "internal_error", "An internal error occurred.", 500)

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(build_auth_router(resolved_auth_service, resolved), prefix="/api/v1")
    return app
