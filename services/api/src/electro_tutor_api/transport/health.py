from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from electro_tutor_api.application.health import HealthService
from electro_tutor_api.errors import ErrorBody, ErrorResponse, ServiceDependencyError

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", summary="Process liveness")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", summary="Database and schema readiness", response_model=None)
async def ready(request: Request) -> dict[str, object] | JSONResponse:
    service: HealthService = request.app.state.health_service
    try:
        result = await service.ready()
    except ServiceDependencyError as exc:
        payload = ErrorResponse(
            error=ErrorBody(
                code=exc.code,
                message="Service is not ready.",
                request_id=request.state.request_id,
                details={"dependency": exc.dependency},
            )
        ).model_dump()
        return JSONResponse(status_code=503, content=payload)
    return {"status": result.status, "schema_revision": result.schema_revision}
