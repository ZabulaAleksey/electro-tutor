from __future__ import annotations

import asyncio
from datetime import UTC, datetime, time, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from test_lesson_access_integration import (
    AUTH_URL,
    MIGRATION_URL,
    RUNTIME_URL,
    authenticated,
    create_requested_booking,
    grant_tutor_booking_capability,
    require_database,
)

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.application.notifications import NotificationService
from electro_tutor_api.application.reminders import ReminderSettingsService
from electro_tutor_api.domain.booking import BookingTransitionCommand, OperationContext
from electro_tutor_api.domain.reminder import ReminderSettings
from electro_tutor_api.notification_worker import run_once


@pytest.mark.integration
@pytest.mark.asyncio
async def test_settings_owner_scope_accept_schedule_toggle_and_cancel() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    try:
        auth = AuthRepository(auth_engine)
        tutor, tutor_token = await authenticated(auth, "reminder-tutor")
        student, student_token = await authenticated(auth, "reminder-student")
        foreign, foreign_token = await authenticated(auth, "reminder-foreign")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
            for table in ("reminder_settings", "booking_reminders"):
                assert not await connection.scalar(
                    text(
                        "SELECT has_table_privilege('electro_tutor_runtime',:table,'SELECT') "
                        "OR has_table_privilege('electro_tutor_runtime',:table,'INSERT') "
                        "OR has_table_privilege('electro_tutor_runtime',:table,'UPDATE')"
                    ),
                    {"table": table},
                )
        uow = cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        settings = ReminderSettingsService(uow)
        bookings = BookingService(uow)
        assert (await settings.get(student, student_token)).time_zone is None
        assert (await settings.get(foreign, foreign_token)).time_zone is None
        saved = ReminderSettings("Europe/Warsaw", True, True, True)
        await settings.put(student, student_token, saved)
        assert await settings.get(student, student_token) == saved
        assert (await settings.get(foreign, foreign_token)).time_zone is None
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(hours=30),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_token,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "reminder-accept"),
            ),
        )
        assert accepted.status.value == "ACCEPTED"
        async with inspector.connect() as connection:
            rows = (
                (
                    await connection.execute(
                        text(
                            "SELECT recipient_account_id,offset_minutes,status,planned_at,due_at "
                            "FROM booking_reminders WHERE booking_id=:booking "
                            "ORDER BY offset_minutes"
                        ),
                        {"booking": requested.id},
                    )
                )
                .mappings()
                .all()
            )
        assert {row["offset_minutes"] for row in rows} == {15, 60, 1440}
        assert all(row["recipient_account_id"] == student.account_id for row in rows)
        assert all(
            row["status"] == "scheduled" and row["due_at"] == row["planned_at"] for row in rows
        )
        # Identical settings update is idempotent; disabling only cancels pending 15m.
        await settings.put(student, student_token, saved)
        await settings.put(
            student,
            student_token,
            ReminderSettings("Europe/Warsaw", True, True, False),
        )
        async with inspector.connect() as connection:
            rows = (
                await connection.execute(
                    text(
                        "SELECT offset_minutes,status FROM booking_reminders "
                        "WHERE booking_id=:booking ORDER BY offset_minutes"
                    ),
                    {"booking": requested.id},
                )
            ).all()
        assert rows == [(15, "cancelled"), (60, "scheduled"), (1440, "scheduled")]
        await bookings.cancel_booking(
            student,
            student_token,
            BookingTransitionCommand(
                requested.id,
                accepted.version,
                OperationContext(uuid4(), uuid4(), "reminder-cancel"),
            ),
        )
        async with inspector.connect() as connection:
            statuses = (
                (
                    await connection.execute(
                        text("SELECT status FROM booking_reminders WHERE booking_id=:booking"),
                        {"booking": requested.id},
                    )
                )
                .scalars()
                .all()
            )
        assert statuses and set(statuses) == {"cancelled"}
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": requested.id},
                )
                == 0
            )
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_due_worker_late_skip_idempotent_delivery_and_history() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    try:
        auth = AuthRepository(auth_engine)
        tutor, tutor_token = await authenticated(auth, "due-tutor")
        student, student_token = await authenticated(auth, "due-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        uow = cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        settings = ReminderSettingsService(uow)
        bookings = BookingService(uow)
        inbox = NotificationService(uow)
        await settings.put(
            student,
            student_token,
            ReminderSettings("America/New_York", False, False, True),
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(minutes=35),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_token,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "due-accept"),
            ),
        )
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE booking_reminders SET "
                    "planned_at=clock_timestamp()-interval '6 minutes',"
                    "due_at=clock_timestamp()-interval '5 minutes' "
                    "WHERE booking_id=:booking AND offset_minutes=15"
                ),
                {"booking": requested.id},
            )
        await run_once(runtime)
        await run_once(runtime)
        own = [
            item
            for item in await inbox.list(student, student_token, limit=50, offset=0)
            if item.booking_id == requested.id and item.event_type == "booking.reminder.15m"
        ]
        assert len(own) == 1
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders WHERE booking_id=:booking "
                        "AND offset_minutes=15"
                    ),
                    {"booking": requested.id},
                )
                == "delivered"
            )
        await bookings.cancel_booking(
            student,
            student_token,
            BookingTransitionCommand(
                requested.id,
                accepted.version,
                OperationContext(uuid4(), uuid4(), "due-cancel"),
            ),
        )
        assert any(
            item.id == own[0].id
            for item in await inbox.list(student, student_token, limit=50, offset=0)
        )
        late = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(minutes=40),
        )
        await bookings.accept_booking(
            tutor,
            tutor_token,
            BookingTransitionCommand(
                late.id, late.version, OperationContext(uuid4(), uuid4(), "late-accept")
            ),
        )
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE booking_reminders SET "
                    "planned_at=clock_timestamp()-interval '17 minutes',"
                    "due_at=clock_timestamp()-interval '16 minutes' "
                    "WHERE booking_id=:booking AND offset_minutes=15"
                ),
                {"booking": late.id},
            )
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders WHERE booking_id=:booking "
                        "AND offset_minutes=15"
                    ),
                    {"booking": late.id},
                )
                == "skipped"
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": late.id},
                )
                == 0
            )
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_postgres_iana_quiet_hours_dst_gap_and_fold() -> None:
    require_database()
    inspector = create_async_engine(MIGRATION_URL)
    try:
        async with inspector.connect() as connection:

            async def due(instant: datetime, zone: str, start: time, end: time) -> datetime:
                value = await connection.scalar(
                    text(
                        "SELECT public.reminder_due_at(CAST(:instant AS timestamptz),"
                        ":zone,true,CAST(:start AS time),CAST(:end AS time))"
                    ),
                    {"instant": instant, "zone": zone, "start": start, "end": end},
                )
                assert isinstance(value, datetime)
                return value

            # Warsaw spring gap: 02:00→03:00; 01:30 local is delayed to 03:30.
            assert await due(
                datetime(2026, 3, 29, 0, 30, tzinfo=UTC), "Europe/Warsaw", time(1), time(3, 30)
            ) == datetime(2026, 3, 29, 1, 30, tzinfo=UTC)
            # Warsaw fall fold: 02:30 end resolves to standard-time occurrence.
            assert await due(
                datetime(2026, 10, 25, 0, 15, tzinfo=UTC), "Europe/Warsaw", time(22), time(2, 30)
            ) == datetime(2026, 10, 25, 1, 30, tzinfo=UTC)
            # New York has a materially different spring transition.
            assert await due(
                datetime(2026, 3, 8, 6, 30, tzinfo=UTC), "America/New_York", time(22), time(3, 30)
            ) == datetime(2026, 3, 8, 7, 30, tzinfo=UTC)
    finally:
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_queued_settings_change_retry_grace_and_cancellation_race() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    try:
        auth = AuthRepository(auth_engine)
        tutor, tutor_token = await authenticated(auth, "race-tutor")
        student, student_token = await authenticated(auth, "race-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        uow = cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        settings = ReminderSettingsService(uow)
        bookings = BookingService(uow)
        await settings.put(
            student,
            student_token,
            ReminderSettings("Europe/Warsaw", False, False, True),
        )

        booking_index = 0

        async def queued_booking(label: str) -> tuple[Any, Any]:
            nonlocal booking_index
            booking_index += 1
            requested = await create_requested_booking(
                bookings,
                tutor,
                tutor_token,
                student,
                student_token,
                starts_at=datetime.now(UTC) + timedelta(minutes=40 + 30 * booking_index),
            )
            accepted = await bookings.accept_booking(
                tutor,
                tutor_token,
                BookingTransitionCommand(
                    requested.id,
                    requested.version,
                    OperationContext(uuid4(), uuid4(), label),
                ),
            )
            # Drain the unrelated booking.accepted event before locking Booking;
            # its FK insert would otherwise wait on the deliberate race lock.
            await run_once(runtime)
            async with inspector.begin() as connection:
                await connection.execute(
                    text(
                        "UPDATE booking_reminders SET "
                        "planned_at=clock_timestamp()-interval '6 minutes',"
                        "due_at=clock_timestamp()-interval '5 minutes' "
                        "WHERE booking_id=:booking AND offset_minutes=15"
                    ),
                    {"booking": requested.id},
                )
            async with runtime.begin() as connection:
                assert (
                    await connection.scalar(
                        text("SELECT public.process_due_booking_reminders(100)")
                    )
                    >= 1
                )
            return requested, accepted

        first, _ = await queued_booking("queued-settings")
        await settings.put(
            student,
            student_token,
            ReminderSettings("Europe/Warsaw", False, False, False),
        )
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders WHERE booking_id=:booking "
                        "AND offset_minutes=15"
                    ),
                    {"booking": first.id},
                )
                == "cancelled"
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notification_outbox WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": first.id},
                )
                == 0
            )
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": first.id},
                )
                == 0
            )

        await settings.put(
            student,
            student_token,
            ReminderSettings("Europe/Warsaw", False, False, True),
        )
        second, _ = await queued_booking("queued-retry")
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE booking_reminders SET due_at=clock_timestamp()-interval '16 minutes',"
                    "planned_at=clock_timestamp()-interval '17 minutes' "
                    "WHERE booking_id=:booking AND offset_minutes=15"
                ),
                {"booking": second.id},
            )
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders WHERE booking_id=:booking "
                        "AND offset_minutes=15"
                    ),
                    {"booking": second.id},
                )
                == "skipped"
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": second.id},
                )
                == 0
            )

        third, _ = await queued_booking("queued-cancel-race")
        async with inspector.begin() as connection:
            await connection.execute(
                text("SELECT id FROM bookings WHERE id=:booking FOR UPDATE"),
                {"booking": third.id},
            )
            await connection.execute(
                text(
                    "UPDATE bookings SET status='CANCELLED',version=version+1,"
                    "cancelled_at=clock_timestamp(),cancelled_by_role='student' "
                    "WHERE id=:booking"
                ),
                {"booking": third.id},
            )
            # Delivery must skip the locked Booking instead of reading stale
            # ACCEPTED state and inserting a reminder during cancellation.
            await asyncio.wait_for(run_once(runtime), timeout=5)
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications WHERE booking_id=:booking "
                        "AND event_type LIKE 'booking.reminder.%'"
                    ),
                    {"booking": third.id},
                )
                == 0
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders WHERE booking_id=:booking "
                        "AND offset_minutes=15"
                    ),
                    {"booking": third.id},
                )
                == "cancelled"
            )
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_exact_grace_boundary_is_inclusive_on_disposable_postgres() -> None:
    require_database()
    inspector = create_async_engine(MIGRATION_URL)
    due = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    try:
        async with inspector.connect() as connection:

            async def permitted(now: datetime) -> bool:
                value = await connection.scalar(
                    text(
                        "SELECT public.reminder_within_grace("
                        "CAST(:due AS timestamptz),CAST(:now AS timestamptz))"
                    ),
                    {"due": due, "now": now},
                )
                assert isinstance(value, bool)
                return value

            assert not await permitted(due - timedelta(microseconds=1))
            assert await permitted(due)
            assert await permitted(due + timedelta(minutes=5))
            assert await permitted(due + timedelta(minutes=15))
            assert not await permitted(due + timedelta(minutes=15, microseconds=1))
            assert not await connection.scalar(
                text(
                    "SELECT has_function_privilege('electro_tutor_runtime',"
                    "'public.reminder_within_grace(timestamptz,timestamptz)','EXECUTE')"
                )
            )
    finally:
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_due_workers_deliver_one_private_reminder() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    try:
        auth = AuthRepository(auth_engine)
        tutor, tutor_token = await authenticated(auth, "two-workers-tutor")
        student, student_token = await authenticated(auth, "two-workers-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        uow = cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        settings = ReminderSettingsService(uow)
        bookings = BookingService(uow)
        await settings.put(
            student,
            student_token,
            ReminderSettings("Europe/Warsaw", False, False, True),
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(minutes=40),
        )
        await bookings.accept_booking(
            tutor,
            tutor_token,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "two-workers-accept"),
            ),
        )
        # The accepted event is independent; isolate the shared reminder job.
        await run_once(runtime)
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE booking_reminders SET "
                    "planned_at=clock_timestamp()-interval '6 minutes',"
                    "due_at=clock_timestamp()-interval '5 minutes' "
                    "WHERE booking_id=:booking AND offset_minutes=15"
                ),
                {"booking": requested.id},
            )
        await asyncio.gather(run_once(runtime), run_once(runtime))
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notification_outbox "
                        "WHERE booking_id=:booking AND event_type='booking.reminder.15m'"
                    ),
                    {"booking": requested.id},
                )
                == 1
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM notifications "
                        "WHERE booking_id=:booking AND event_type='booking.reminder.15m'"
                    ),
                    {"booking": requested.id},
                )
                == 1
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT status FROM booking_reminders "
                        "WHERE booking_id=:booking AND offset_minutes=15"
                    ),
                    {"booking": requested.id},
                )
                == "delivered"
            )
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()
