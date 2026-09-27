from __future__ import annotations

# SQL ACL and audit queries intentionally preserve exact PostgreSQL signatures.
# ruff: noqa: E501
import asyncio
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
from electro_tutor_api.adapters.lesson_session_repository import LessonSessionNotFoundError
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.application.lesson_sessions import LessonSessionService
from electro_tutor_api.domain.booking import BookingTransitionCommand, OperationContext
from electro_tutor_api.errors import (
    AuditUnavailableError,
    AuthenticationRequiredError,
    BookingTimeElapsedError,
    IdempotencyConflictError,
    LessonAccessExpiredError,
    VersionConflictError,
)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_session_join_replay_cancel_audit_and_acl() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "session-tutor")
        student, student_credential = await authenticated(auth, "session-student")
        foreign, foreign_credential = await authenticated(auth, "session-foreign")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
            for role in (
                "electro_tutor_runtime",
                "electro_tutor_auth_runtime",
                "electro_tutor_provisioner",
            ):
                for table in ("lesson_sessions", "lesson_session_operations"):
                    assert not await connection.scalar(
                        text(
                            "SELECT has_table_privilege(:role,:table,'SELECT') OR has_table_privilege(:role,:table,'INSERT') OR has_table_privilege(:role,:table,'UPDATE') OR has_table_privilege(:role,:table,'DELETE')"
                        ),
                        {"role": role, "table": table},
                    )
                assert not await connection.scalar(
                    text(
                        "SELECT has_function_privilege(:role,'public.cancel_ready_lesson_session(uuid,uuid,uuid,text)','EXECUTE')"
                    ),
                    {"role": role},
                )
            for table in ("lesson_sessions", "lesson_session_operations"):
                assert not await connection.scalar(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid=CAST(:table AS regclass) AND acl.grantee=0 AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))"
                    ),
                    {"table": f"public.{table}"},
                )
            assert not await connection.scalar(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid='public.cancel_ready_lesson_session(uuid,uuid,uuid,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE')"
                )
            )
            session_constraints = set(
                (
                    await connection.execute(
                        text(
                            "SELECT conname FROM pg_constraint WHERE conrelid='public.lesson_sessions'::regclass"
                        )
                    )
                ).scalars()
            )
            assert session_constraints == {
                "pk_lesson_sessions",
                "fk_lesson_sessions_booking",
                "uq_lesson_sessions_booking",
                "ck_lesson_sessions_state",
                "ck_lesson_sessions_version",
            }
            operation_constraints = set(
                (
                    await connection.execute(
                        text(
                            "SELECT conname FROM pg_constraint WHERE conrelid='public.lesson_session_operations'::regclass"
                        )
                    )
                ).scalars()
            )
            assert {
                "pk_lesson_session_operations",
                "fk_lesson_session_operations_audit",
                "ck_lesson_session_operations_audit_presence",
                "uq_lesson_session_operations_audit",
            } <= operation_constraints
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        sessions = LessonSessionService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "session-accept"),
            ),
        )
        key = uuid4()
        first, second = await asyncio.gather(
            sessions.mutate(
                student,
                student_credential,
                action="create",
                resource_id=accepted.id,
                expected_version=None,
                key=key,
                request_id="session-join",
            ),
            sessions.mutate(
                tutor,
                tutor_credential,
                action="create",
                resource_id=accepted.id,
                expected_version=None,
                key=uuid4(),
                request_id="session-join",
            ),
        )
        assert first.id == second.id
        assert first.status == second.status == "READY"
        assert first.version == second.version == 1
        assert first.participant_role == "student"
        assert second.participant_role == "tutor"
        assert first.current_topic_id is None
        replay = await sessions.mutate(
            student,
            student_credential,
            action="create",
            resource_id=accepted.id,
            expected_version=None,
            key=key,
            request_id="session-replay",
        )
        assert replay == first
        assert (await sessions.read(tutor, tutor_credential, first.id)).id == first.id
        with pytest.raises(LessonSessionNotFoundError):
            await sessions.read(foreign, foreign_credential, first.id)
        with pytest.raises(BookingTimeElapsedError):
            await sessions.mutate(
                tutor,
                tutor_credential,
                action="start",
                resource_id=first.id,
                expected_version=1,
                key=uuid4(),
                request_id="session-too-early",
            )
        with pytest.raises(IdempotencyConflictError):
            await sessions.mutate(
                tutor,
                tutor_credential,
                action="create",
                resource_id=accepted.id,
                expected_version=None,
                key=key,
                request_id="session-foreign-key",
            )
        cancelled = await bookings.cancel_booking(
            student,
            student_credential,
            BookingTransitionCommand(
                accepted.id, accepted.version, OperationContext(uuid4(), uuid4(), "session-cancel")
            ),
        )
        assert cancelled.status == "CANCELLED"
        async with inspector.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            "SELECT status,version,cancelled_at FROM lesson_sessions WHERE booking_id=:id"
                        ),
                        {"id": accepted.id},
                    )
                )
                .mappings()
                .one()
            )
            assert (
                row["status"] == "CANCELLED"
                and row["version"] == 2
                and row["cancelled_at"] is not None
            )
            actions = (
                (
                    await connection.execute(
                        text(
                            "SELECT action FROM audit_events WHERE subject_type='lesson_session' AND subject_id=:id ORDER BY occurred_at"
                        ),
                        {"id": str(first.id)},
                    )
                )
                .scalars()
                .all()
            )
            assert actions == ["lesson_session.created", "lesson_session.cancelled"]
            operations = (
                (
                    await connection.execute(
                        text(
                            "SELECT o.audit_operation_id,e.operation_id AS event_operation_id FROM lesson_session_operations o LEFT JOIN audit_events e ON e.operation_id=o.audit_operation_id WHERE o.booking_id=:id"
                        ),
                        {"id": accepted.id},
                    )
                )
                .mappings()
                .all()
            )
            assert len(operations) == 2
            assert sum(row["audit_operation_id"] is None for row in operations) == 1
            assert (
                sum(
                    row["audit_operation_id"] == row["event_operation_id"]
                    and row["audit_operation_id"] is not None
                    for row in operations
                )
                == 1
            )
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM lesson_sessions WHERE booking_id=:id"),
                    {"id": accepted.id},
                )
                == 1
            )
        from electro_tutor_api.errors import LessonAccessRevokedError

        with pytest.raises(LessonAccessRevokedError):
            await sessions.read(student, student_credential, first.id)
        with pytest.raises(LessonAccessRevokedError):
            await sessions.mutate(
                student,
                student_credential,
                action="create",
                resource_id=accepted.id,
                expected_version=None,
                key=key,
                request_id="session-replay-after-revoke",
            )
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_session_cancel_audit_failure_rolls_back_booking_grant_session() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "rollback-tutor")
        student, student_credential = await authenticated(auth, "rollback-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        sessions = LessonSessionService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "rollback-accept"),
            ),
        )
        ready = await sessions.mutate(
            student,
            student_credential,
            action="create",
            resource_id=accepted.id,
            expected_version=None,
            key=uuid4(),
            request_id="rollback-ready",
        )
        async with inspector.begin() as connection:
            await connection.execute(
                text("""
                CREATE FUNCTION public.fail_session_cancel_audit_for_test() RETURNS trigger
                LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
                  IF NEW.action='lesson_session.cancelled' THEN
                    RAISE EXCEPTION 'session_cancel_audit_injected' USING ERRCODE='P0001';
                  END IF;
                  RETURN NEW;
                END $$
            """)
            )
            await connection.execute(
                text(
                    "CREATE TRIGGER audit_session_cancel_fail_for_test BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.fail_session_cancel_audit_for_test()"
                )
            )
        try:
            with pytest.raises(AuditUnavailableError):
                await bookings.cancel_booking(
                    student,
                    student_credential,
                    BookingTransitionCommand(
                        accepted.id,
                        accepted.version,
                        OperationContext(uuid4(), uuid4(), "rollback-cancel"),
                    ),
                )
            async with inspector.connect() as connection:
                state = (
                    (
                        await connection.execute(
                            text(
                                "SELECT b.status AS booking_status,g.revoked_at,s.status AS session_status,s.version FROM bookings b JOIN lesson_access_grants g ON g.booking_id=b.id JOIN lesson_sessions s ON s.booking_id=b.id WHERE b.id=:id"
                            ),
                            {"id": accepted.id},
                        )
                    )
                    .mappings()
                    .one()
                )
                assert state["booking_status"] == "ACCEPTED"
                assert state["revoked_at"] is None
                assert state["session_status"] == "READY" and state["version"] == 1
                assert (
                    await connection.scalar(
                        text(
                            "SELECT count(*) FROM audit_events WHERE subject_type='lesson_session' AND subject_id=:id"
                        ),
                        {"id": str(ready.id)},
                    )
                    == 1
                )
        finally:
            async with inspector.begin() as connection:
                await connection.execute(
                    text(
                        "DROP TRIGGER IF EXISTS audit_session_cancel_fail_for_test ON public.audit_events"
                    )
                )
                await connection.execute(
                    text("DROP FUNCTION IF EXISTS public.fail_session_cancel_audit_for_test()")
                )
        cancelled = await bookings.cancel_booking(
            student,
            student_credential,
            BookingTransitionCommand(
                accepted.id,
                accepted.version,
                OperationContext(uuid4(), uuid4(), "rollback-retry-cancel"),
            ),
        )
        assert cancelled.status == "CANCELLED"
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


async def _wait_until_db_clock(inspector: Any, boundary: datetime) -> None:
    async with inspector.connect() as monitor:
        for _ in range(400):
            now = await monitor.scalar(text("SELECT clock_timestamp()"))
            if now >= boundary:
                return
            await asyncio.sleep(0.025)
    raise AssertionError("disposable DB clock did not reach bounded test boundary")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_session_lock_wait_crosses_exact_grant_expiry_without_ended() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "expiry-tutor")
        student, student_credential = await authenticated(auth, "expiry-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        sessions = LessonSessionService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        booking, end = await _near_window_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            inspector,
            seconds_until_end=5,
        )
        ready = await sessions.mutate(
            student,
            student_credential,
            action="create",
            resource_id=booking.id,
            expected_version=None,
            key=uuid4(),
            request_id="session-expiry-create",
        )
        async with inspector.connect() as blocker:
            transaction = await blocker.begin()
            try:
                await blocker.execute(
                    text("SELECT id FROM lesson_sessions WHERE id=:id FOR UPDATE"), {"id": ready.id}
                )
                request = asyncio.create_task(sessions.read(student, student_credential, ready.id))
                await _wait_until_db_clock(inspector, end)
                assert not request.done()
            finally:
                await transaction.rollback()
        with pytest.raises(LessonAccessExpiredError):
            await request
        async with inspector.connect() as connection:
            persisted = (
                (
                    await connection.execute(
                        text("SELECT status,version FROM lesson_sessions WHERE id=:id"),
                        {"id": ready.id},
                    )
                )
                .mappings()
                .one()
            )
            assert persisted == {"status": "READY", "version": 1}
            effective = await connection.scalar(
                text(
                    "SELECT public.lesson_session_payload(s,'student',b.starts_at,b.ends_at,b.ends_at)->>'effective_status' FROM lesson_sessions s JOIN bookings b ON b.id=s.booking_id WHERE s.id=:id"
                ),
                {"id": ready.id},
            )
            assert effective == "WINDOW_CLOSED"
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM audit_events WHERE subject_type='lesson_session' AND subject_id=:id AND action='lesson_session.ended'"
                    ),
                    {"id": str(ready.id)},
                )
                == 0
            )
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_booking_lock_wait_crosses_application_session_expiry() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "app-expiry-tutor")
        student, student_credential = await authenticated(auth, "app-expiry-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        sessions = LessonSessionService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(minutes=10),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "app-expiry-accept"),
            ),
        )
        ready = await sessions.mutate(
            student,
            student_credential,
            action="create",
            resource_id=accepted.id,
            expected_version=None,
            key=uuid4(),
            request_id="app-expiry-create",
        )
        async with inspector.begin() as connection:
            expiry = await connection.scalar(
                text(
                    "UPDATE application_sessions SET expires_at=clock_timestamp()+make_interval(secs=>3) WHERE token_digest=:digest RETURNING expires_at"
                ),
                {"digest": student_credential.digest},
            )
        assert isinstance(expiry, datetime)
        async with inspector.connect() as blocker:
            transaction = await blocker.begin()
            try:
                await blocker.execute(
                    text("SELECT id FROM bookings WHERE id=:id FOR UPDATE"), {"id": accepted.id}
                )
                request = asyncio.create_task(sessions.read(student, student_credential, ready.id))
                await _wait_until_db_clock(inspector, expiry)
                assert not request.done()
            finally:
                await transaction.rollback()
        with pytest.raises(AuthenticationRequiredError):
            await request
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


async def _near_window_booking(
    bookings: BookingService,
    tutor: Any,
    tutor_credential: Any,
    student: Any,
    student_credential: Any,
    inspector: Any,
    *,
    seconds_until_end: int,
) -> tuple[Any, datetime]:
    requested = await create_requested_booking(
        bookings,
        tutor,
        tutor_credential,
        student,
        student_credential,
        starts_at=datetime.now(UTC) + timedelta(hours=1),
    )
    async with inspector.begin() as connection:
        end = await connection.scalar(
            text("SELECT clock_timestamp()+make_interval(secs=>:seconds)"),
            {"seconds": seconds_until_end},
        )
        assert isinstance(end, datetime)
        start = end - timedelta(minutes=15)
        await connection.execute(
            text("""
            WITH source AS (DELETE FROM public.bookings WHERE id=:id RETURNING *)
            INSERT INTO public.bookings
            SELECT (jsonb_populate_record(NULL::public.bookings,
                    to_jsonb(source) || jsonb_build_object(
                      'status','ACCEPTED','version',2,
                      'starts_at',CAST(:start AS timestamptz),
                      'ends_at',CAST(:end AS timestamptz),
                      'accepted_at',clock_timestamp()))).* FROM source
        """),
            {"id": requested.id, "start": start, "end": end},
        )
        await connection.execute(
            text("""
            INSERT INTO public.lesson_access_grants(
              booking_id,source,valid_from,valid_until,issue_operation_id)
            VALUES(:booking,'BOOKING_FREE',CAST(:start AS timestamptz)-make_interval(mins=>15),CAST(:end AS timestamptz),:operation)
        """),
            {"booking": requested.id, "start": start, "end": end, "operation": uuid4()},
        )
    return requested, end


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_session_start_end_versions_and_terminal_reload() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "lifecycle-tutor")
        student, student_credential = await authenticated(auth, "lifecycle-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        sessions = LessonSessionService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        booking, _ = await _near_window_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            inspector,
            seconds_until_end=120,
        )
        ready = await sessions.mutate(
            student,
            student_credential,
            action="create",
            resource_id=booking.id,
            expected_version=None,
            key=uuid4(),
            request_id="session-ready",
        )
        assert ready.status == "READY" and ready.version == 1
        with pytest.raises(LessonSessionNotFoundError):
            await sessions.mutate(
                student,
                student_credential,
                action="start",
                resource_id=ready.id,
                expected_version=1,
                key=uuid4(),
                request_id="student-start-denied",
            )
        started_key = uuid4()
        active = await sessions.mutate(
            tutor,
            tutor_credential,
            action="start",
            resource_id=ready.id,
            expected_version=1,
            key=started_key,
            request_id="session-start",
        )
        assert active.status == active.effective_status == "ACTIVE"
        assert active.version == 2 and active.started_at is not None
        assert "SESSION_END" in active.capabilities
        with pytest.raises(VersionConflictError):
            await sessions.mutate(
                tutor,
                tutor_credential,
                action="end",
                resource_id=ready.id,
                expected_version=1,
                key=uuid4(),
                request_id="stale-end",
            )
        ended_key = uuid4()
        ended = await sessions.mutate(
            tutor,
            tutor_credential,
            action="end",
            resource_id=ready.id,
            expected_version=2,
            key=ended_key,
            request_id="session-end",
        )
        assert ended.status == ended.effective_status == "ENDED"
        assert ended.version == 3 and ended.ended_at is not None
        assert (await sessions.read(student, student_credential, ready.id)).status == "ENDED"
        assert (
            await sessions.mutate(
                tutor,
                tutor_credential,
                action="start",
                resource_id=ready.id,
                expected_version=1,
                key=started_key,
                request_id="exact-start-replay",
            )
        ) == active
        assert (
            await sessions.mutate(
                tutor,
                tutor_credential,
                action="end",
                resource_id=ready.id,
                expected_version=2,
                key=ended_key,
                request_id="exact-end-replay",
            )
        ) == ended
        async with inspector.connect() as connection:
            actions = (
                (
                    await connection.execute(
                        text(
                            "SELECT action FROM audit_events WHERE subject_type='lesson_session' AND subject_id=:id ORDER BY occurred_at"
                        ),
                        {"id": str(ready.id)},
                    )
                )
                .scalars()
                .all()
            )
            assert actions == [
                "lesson_session.created",
                "lesson_session.started",
                "lesson_session.ended",
            ]
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()
