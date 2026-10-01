from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID


@dataclass(frozen=True)
class Notification:
    id: UUID
    event_type: Literal["booking.accepted"]
    booking_id: UUID
    created_at: datetime
    expires_at: datetime
    read_at: datetime | None
