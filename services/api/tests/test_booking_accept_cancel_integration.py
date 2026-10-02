from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from test_lesson_access_integration import (
    AUTH_URL,
    MIGRATION_URL,
    PORT,
    RUNTIME_URL,
    authenticated,
    create_requested_booking,
    grant_tutor_booking_capability,
    require_database,
)

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.domain.booking import (
    Booking,
    BookingStatus,
    BookingTransitionCommand,
    OperationContext,
)
from electro_tutor_api.errors import VersionConflictError


def booking_service(engine: AsyncEngine) -> BookingService:
    return BookingService(cast(Any, lambda credential: PostgresUnitOfWork(engine, credential)))


async def wait_for_booking_lock(inspector: AsyncEngine, backend_pid: int) -> None:
    async def observe() -> None:
        async with inspector.connect() as connection:
            while True:
                waiting = await connection.scalar(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_locks AS lock "
                        "WHERE lock.pid=:pid "
                        "AND lock.locktype IN ('tuple','transactionid') AND NOT lock.granted)"
                    ),
                    {"pid": backend_pid},
                )
                if waiting:
                    return
                await asyncio.sleep(0.01)

    await asyncio.wait_for(observe(), timeout=5)


async def prime_race_connection(engine: AsyncEngine, application_name: str) -> int:
    async def identify() -> int:
        async with engine.connect() as connection:
            assert await connection.scalar(text("SHOW application_name")) == application_name
            pid = await connection.scalar(text("SELECT pg_backend_pid()"))
            assert isinstance(pid, int)
            return pid

    return await asyncio.wait_for(identify(), timeout=5)


async def persisted_effects(inspector: AsyncEngine, booking_id: UUID) -> dict[str, list[Any]]:
    effects: dict[str, list[Any]] = {}
    queries = {
        "operations": "SELECT to_jsonb(item) FROM booking_operations AS item "
        "WHERE target_id=:id ORDER BY operation_id",
        "audits": "SELECT to_jsonb(item) FROM audit_events AS item "
        "WHERE subject_id=:subject "
        "AND action IN ('booking.accepted','booking.cancelled') ORDER BY operation_id",
        "grants": "SELECT to_jsonb(item) FROM lesson_access_grants AS item "
        "WHERE booking_id=:id ORDER BY id",
        "outbox": "SELECT to_jsonb(item) FROM notification_outbox AS item "
        "WHERE booking_id=:id ORDER BY id",
    }
    async with inspector.connect() as connection:
        for name, query in queries.items():
            rows = await connection.execute(
                text(query), {"id": booking_id, "subject": str(booking_id)}
            )
            effects[name] = list(rows.scalars())
    return effects


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("first_action", ["accept", "cancel"])
async def test_same_version_accept_cancel_has_one_atomic_winner(first_action: str) -> None:
    """ET-NIGHT-BOOKING-RACE-01: actual lock contention, independent of FIFO priority."""
    require_database()
    if PORT == 55432:
        pytest.skip("booking race requires the newly owned non-55432 disposable database")
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    names = {action: f"et-booking-race-{action}-{uuid4().hex}" for action in ("accept", "cancel")}
    race_engines = {
        action: create_async_engine(
            RUNTIME_URL,
            pool_size=1,
            max_overflow=0,
            connect_args={
                "server_settings": {
                    "application_name": name,
                    "statement_timeout": "10000",
                    "lock_timeout": "10000",
                }
            },
        )
        for action, name in names.items()
    }
    tasks: dict[str, asyncio.Task[Booking]] = {}
    try:
        auth = AuthRepository(auth_engine)
        tutor, tutor_token = await authenticated(auth, "accept-cancel-tutor")
        student, student_token = await authenticated(auth, "accept-cancel-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = booking_service(runtime)
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        operations = {
            action: OperationContext(uuid4(), uuid4(), f"accept-cancel-{action}")
            for action in names
        }
        commands = {
            action: BookingTransitionCommand(requested.id, requested.version, operation)
            for action, operation in operations.items()
        }
        services = {action: booking_service(engine) for action, engine in race_engines.items()}
        # Each dedicated one-slot pool returns this same connection to its UOW.
        # Its own PID identifies the exact dedicated runtime connection
        # without relying on cross-connection activity-statistics snapshots.
        # A replaced connection cannot satisfy the real wait and fails closed.
        backend_pids = {
            action: await prime_race_connection(engine, names[action])
            for action, engine in race_engines.items()
        }
        assert backend_pids["accept"] != backend_pids["cancel"]

        def launch(action: str) -> asyncio.Task[Booking]:
            if action == "accept":
                return asyncio.create_task(
                    services[action].accept_booking(tutor, tutor_token, commands[action])
                )
            return asyncio.create_task(
                services[action].cancel_booking(student, student_token, commands[action])
            )

        # Hold the authoritative row until BOTH independent contenders really wait.
        async with inspector.begin() as blocker:
            await blocker.execute(
                text("SELECT id FROM bookings WHERE id=:id FOR UPDATE"), {"id": requested.id}
            )
            tasks[first_action] = launch(first_action)
            await wait_for_booking_lock(inspector, backend_pids[first_action])
            second_action = "cancel" if first_action == "accept" else "accept"
            tasks[second_action] = launch(second_action)
            await wait_for_booking_lock(inspector, backend_pids[second_action])

        results = await asyncio.wait_for(
            asyncio.gather(tasks["accept"], tasks["cancel"], return_exceptions=True), timeout=10
        )
        successes = [
            (action, result)
            for action, result in zip(("accept", "cancel"), results, strict=True)
            if isinstance(result, Booking)
        ]
        failures = [result for result in results if isinstance(result, BaseException)]
        assert len(successes) == 1, results
        assert len(failures) == 1 and isinstance(failures[0], VersionConflictError), results
        winner, result = successes[0]
        loser = "cancel" if winner == "accept" else "accept"
        expected_status = BookingStatus.ACCEPTED if winner == "accept" else BookingStatus.CANCELLED
        assert result.status is expected_status
        assert result.version == requested.version + 1
        current = await bookings.read_booking(student, student_token, requested.id)
        assert current == result

        effects = await persisted_effects(inspector, requested.id)
        for action in (winner, loser):
            expected_count = int(action == winner)
            operation_id = str(operations[action].operation_id)
            assert sum(row["operation_id"] == operation_id for row in effects["operations"]) == (
                expected_count
            )
            audit_action = "booking.accepted" if action == "accept" else "booking.cancelled"
            assert (
                sum(
                    row["operation_id"] == operation_id and row["action"] == audit_action
                    for row in effects["audits"]
                )
                == expected_count
            )
        assert len(effects["audits"]) == 1
        assert len(effects["grants"]) == len(effects["outbox"]) == int(winner == "accept")
        if winner == "accept":
            grant = effects["grants"][0]
            assert grant["source"] == "BOOKING_FREE"
            assert grant["revoked_at"] is None
            assert datetime.fromisoformat(grant["valid_from"]) <= datetime.now(UTC)
            assert datetime.now(UTC) < datetime.fromisoformat(grant["valid_until"])
            assert effects["outbox"][0]["event_type"] == "booking.accepted"
            assert effects["outbox"][0]["recipient_account_id"] == str(student.account_id)

        if winner == "accept":
            replay = await services[winner].accept_booking(tutor, tutor_token, commands[winner])
        else:
            replay = await services[winner].cancel_booking(student, student_token, commands[winner])
        assert replay == result
        assert await bookings.read_booking(student, student_token, requested.id) == current
        assert await persisted_effects(inspector, requested.id) == effects
    finally:
        for task in tasks.values():
            if not task.done():
                task.cancel()
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks.values(), return_exceptions=True), timeout=5
            )
        finally:
            await asyncio.wait_for(
                asyncio.gather(
                    runtime.dispose(),
                    auth_engine.dispose(),
                    inspector.dispose(),
                    *(engine.dispose() for engine in race_engines.values()),
                ),
                timeout=10,
            )
