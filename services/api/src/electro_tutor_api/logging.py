from __future__ import annotations

import json
import logging
import time
from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("electro_tutor_api.request")


def log_request(request: Request, response: Response, started: float) -> None:
    route = request.scope.get("route")
    logger.info(
        json.dumps(
            {
                "event": "request",
                "request_id": getattr(request.state, "request_id", "unknown"),
                "method": request.method,
                "route": getattr(route, "path", "unknown"),
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
            separators=(",", ":"),
        )
    )


async def request_logging_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    started = time.perf_counter()
    response = await call_next(request)
    log_request(request, response, started)
    return response
