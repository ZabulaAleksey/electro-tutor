from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


class LessonSessionValidationError(ValueError):
    pass


@dataclass(frozen=True)
class LessonSession:
    id: UUID
    booking_id: UUID
    status: str
    effective_status: str
    version: int
    participant_role: str
    capabilities: tuple[str, ...]
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    cancelled_at: datetime | None
    current_topic_id: None = None


def session_intent_digest(action: str, resource_id: UUID, expected_version: int | None) -> str:
    intent = {
        "action": action,
        "resource_id": str(resource_id),
        "expected_version": expected_version,
    }
    return hashlib.sha256(
        json.dumps(intent, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
