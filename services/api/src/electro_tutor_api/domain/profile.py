from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

_WHITESPACE_RUN = re.compile(r"\s+")
_MAX_DISPLAY_NAME_CODE_POINTS = 80


class ProfileValidationError(ValueError):
    code = "invalid_request"
    status_code = 422


def normalize_display_name(value: str) -> str:
    if not isinstance(value, str):
        raise ProfileValidationError("display_name must be a string")
    normalized = unicodedata.normalize("NFC", value)
    if any(unicodedata.category(character).startswith("C") for character in normalized):
        raise ProfileValidationError("display_name must not contain control characters")
    normalized = _WHITESPACE_RUN.sub(" ", normalized.strip())
    if not 1 <= len(normalized) <= _MAX_DISPLAY_NAME_CODE_POINTS:
        raise ProfileValidationError(
            f"display_name must contain 1..{_MAX_DISPLAY_NAME_CODE_POINTS} code points"
        )
    return normalized


@dataclass(frozen=True)
class StudentProfile:
    account_id: UUID
    display_name: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class TutorProfile:
    account_id: UUID
    display_name: str
    created_at: datetime
    updated_at: datetime
