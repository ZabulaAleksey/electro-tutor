from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HealthResult:
    status: str
    schema_revision: str
