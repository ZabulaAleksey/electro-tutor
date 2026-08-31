from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    request_id: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: ErrorBody


class ServiceDependencyError(RuntimeError):
    """An internal safe category; database details never leave the service."""

    def __init__(self, code: str, dependency: str) -> None:
        super().__init__(code)
        self.code = code
        self.dependency = dependency
