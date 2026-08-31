from __future__ import annotations

import re
import secrets

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def new_request_id() -> str:
    return secrets.token_hex(16)


def accepted_request_id(value: str | None, *, max_length: int = 128) -> str:
    if value and len(value) <= max_length and REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return new_request_id()
