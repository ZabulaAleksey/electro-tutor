from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ReminderSettingsValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ReminderSettings:
    time_zone: str | None = None
    remind_24h: bool = True
    remind_1h: bool = True
    remind_15m: bool = False
    quiet_hours_enabled: bool = False
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None

    def validate(self) -> None:
        if self.time_zone is not None:
            if not self.time_zone or len(self.time_zone) > 64:
                raise ReminderSettingsValidationError()
            try:
                ZoneInfo(self.time_zone)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ReminderSettingsValidationError() from exc
        if (self.quiet_hours_start is None) != (self.quiet_hours_end is None):
            raise ReminderSettingsValidationError()
        if self.quiet_hours_enabled and self.quiet_hours_start is None:
            raise ReminderSettingsValidationError()
        if self.quiet_hours_start is not None and self.quiet_hours_start == self.quiet_hours_end:
            raise ReminderSettingsValidationError()
