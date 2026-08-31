from __future__ import annotations

from collections.abc import Awaitable, Callable

from electro_tutor_api.domain.health import HealthResult


class HealthService:
    def __init__(self, check_database: Callable[[], Awaitable[str]]) -> None:
        self._check_database = check_database

    async def ready(self) -> HealthResult:
        return HealthResult(status="ready", schema_revision=await self._check_database())
