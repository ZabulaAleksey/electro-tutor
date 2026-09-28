from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
from electro_tutor_api.domain.booking import BookingTransitionCommand, OperationContext
from electro_tutor_api.errors import InvalidBookingTransitionError, NotificationNotFoundError
from electro_tutor_api.notification_worker import run_once


@pytest.mark.integration
@pytest.mark.asyncio
async def test_booking_event_delivery_private_inbox_and_retention() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    auth = AuthRepository(auth_engine)
    try:
        tutor, tutor_token = await authenticated(auth, "notification-tutor")
        student, student_token = await authenticated(auth, "notification-student")
        stranger, stranger_token = await authenticated(auth, "notification-stranger")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
            for table in ("notification_outbox", "notifications"):
                for role in (
                    "electro_tutor_runtime",
                    "electro_tutor_auth_runtime",
                    "electro_tutor_provisioner",
                ):
                    assert not await connection.scalar(
                        text(
                            "SELECT has_table_privilege(:role,:table,'SELECT') "
                            "OR has_table_privilege(:role,:table,'INSERT') "
                            "OR has_table_privilege(:role,:table,'UPDATE') "
                            "OR has_table_privilege(:role,:table,'DELETE')"
                        ),
                        {"role": role, "table": table},
                    )
            assert await connection.scalar(
                text(
                    "SELECT has_function_privilege('electro_tutor_runtime',"
                    "'public.deliver_notification_outbox(integer)','EXECUTE')"
                )
            )
            assert not await connection.scalar(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_proc AS p "
                    "CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) "
                    "AS acl WHERE p.oid="
                    "'public.deliver_notification_outbox(integer)'::regprocedure "
                    "AND acl.grantee=0 AND acl.privilege_type='EXECUTE')"
                )
            )

        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        inbox = NotificationService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_token,
            student,
            student_token,
            starts_at=datetime.now(UTC) + timedelta(minutes=20),
        )
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM notification_outbox WHERE booking_id=:id"),
                    {"id": requested.id},
                )
                == 0
            )
        operation = OperationContext(uuid4(), uuid4(), "notification-accept")
        accepted = await bookings.accept_booking(
            tutor, tutor_token, BookingTransitionCommand(requested.id, requested.version, operation)
        )
        assert accepted.status.value == "ACCEPTED"
        replay = await bookings.accept_booking(
            tutor, tutor_token, BookingTransitionCommand(requested.id, requested.version, operation)
        )
        assert replay.id == accepted.id
        with pytest.raises(InvalidBookingTransitionError):
            await bookings.accept_booking(
                tutor,
                tutor_token,
                BookingTransitionCommand(
                    accepted.id,
                    accepted.version,
                    OperationContext(uuid4(), uuid4(), "notification-invalid-accept"),
                ),
            )
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM notification_outbox WHERE booking_id=:id"),
                    {"id": requested.id},
                )
                == 1
            )
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM notifications WHERE booking_id=:id"),
                    {"id": requested.id},
                )
                == 0
            )
        # No worker has run yet: acceptance committed and its event remains durable.
        await run_once(runtime)
        await run_once(runtime)
        own = [
            item
            for item in await inbox.list(student, student_token, limit=50, offset=0)
            if item.booking_id == requested.id
        ]
        assert len(own) == 1
        item = own[0]
        assert item.read_at is None
        assert item.expires_at == item.created_at + timedelta(days=30)
        assert all(
            other.booking_id != requested.id
            for other in await inbox.list(stranger, stranger_token, limit=50, offset=0)
        )
        assert await inbox.unread_count(stranger, stranger_token) == 0
        assert len(await inbox.list(student, student_token, limit=1, offset=0)) == 1
        assert await inbox.list(student, student_token, limit=1, offset=1) == []
        with pytest.raises(NotificationNotFoundError):
            await inbox.mark_read(stranger, stranger_token, item.id)
        await inbox.mark_read(student, student_token, item.id)
        await inbox.mark_read(student, student_token, item.id)
        own_after = [
            current
            for current in await inbox.list(student, student_token, limit=50, offset=0)
            if current.id == item.id
        ]
        assert len(own_after) == 1 and own_after[0].read_at is not None
        async with inspector.begin() as connection:
            old = datetime.now(UTC) - timedelta(days=31)
            await connection.execute(
                text(
                    "UPDATE notifications SET created_at=:old,"
                    "expires_at=:old+interval '30 days' WHERE id=:id"
                ),
                {"old": old, "id": item.id},
            )
        assert all(
            current.id != item.id
            for current in await inbox.list(student, student_token, limit=50, offset=0)
        )
        with pytest.raises(NotificationNotFoundError):
            await inbox.mark_read(student, student_token, item.id)
        await run_once(runtime)
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM notifications WHERE id=:id"), {"id": item.id}
                )
                == 0
            )
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()
