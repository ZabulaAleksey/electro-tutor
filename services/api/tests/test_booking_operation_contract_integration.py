from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
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
from electro_tutor_api.domain.booking import (
    BookingStatus,
    BookingTransitionCommand,
    OperationContext,
)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_read_booking_operation_matches_repository_projection() -> None:
    """The booking adapter decodes these named fields, including persisted payload."""
    contract_url = os.getenv("ET_BOOKING_OPERATION_CONTRACT_URL")
    if contract_url is None:
        require_database()
        target_url = MIGRATION_URL
    else:
        target = make_url(contract_url)
        assert (
            target.drivername == "postgresql+asyncpg"
            and target.host == "127.0.0.1"
            and target.port == 55433
            and target.database == "electro_tutor"
            and target.username == "electro_tutor_migrator"
        ), "contract override must target only the ET-10.3 clone"
        target_url = contract_url
    engine = create_async_engine(target_url)
    try:
        async with engine.connect() as connection:
            async with connection.begin():
                await connection.execute(text("SET TRANSACTION READ ONLY"))
                result = await connection.execute(
                    text(
                        "SELECT * FROM public.read_booking_operation("
                        "CAST(:operation_id AS uuid))"
                    ),
                    {"operation_id": UUID(int=0)},
                )
                assert tuple(result.keys()) == (
                    "operation_id",
                    "actor_account_id",
                    "action",
                    "target_type",
                    "target_id",
                    "intent_digest",
                    "result_version",
                    "result_payload",
                    "completed_at",
                )
                assert result.mappings().one_or_none() is None

                return_contract = await connection.scalar(
                    text(
                        "SELECT pg_get_function_result("
                        "to_regprocedure('public.read_booking_operation(uuid)'))"
                    )
                )
                assert isinstance(return_contract, str)
                assert (
                    "result_version integer, result_payload jsonb, completed_at"
                    in return_contract
                )

                attributes = (
                    await connection.execute(
                        text(
                            "SELECT p.provolatile,p.prosecdef,p.proconfig,"
                            "pg_get_userbyid(p.proowner) AS owner "
                            "FROM pg_proc p WHERE p.oid = "
                            "to_regprocedure('public.read_booking_operation(uuid)')"
                        )
                    )
                ).mappings().one()
                assert attributes["provolatile"] == b"s"
                assert attributes["prosecdef"] is True
                assert attributes["proconfig"] == ["search_path=pg_catalog"]
                assert attributes["owner"] == "electro_tutor_migrator"
    finally:
        await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_read_booking_operation_rehydrates_participants_and_historical_payload() -> None:
    """A booking replay returns its persisted result, not the current target state."""
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth_engine = create_async_engine(AUTH_URL)
    inspector = create_async_engine(MIGRATION_URL)
    auth = AuthRepository(auth_engine)
    try:
        tutor, tutor_credential = await authenticated(auth, "contract-tutor")
        student, student_credential = await authenticated(auth, "contract-student")
        foreign, foreign_credential = await authenticated(auth, "contract-foreign")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        service = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            service,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(days=2),
        )
        async with inspector.connect() as connection:
            stored = (
                await connection.execute(
                    text(
                        "SELECT operation_id,result_payload FROM booking_operations "
                        "WHERE action='booking.request' AND target_id=:target_id"
                    ),
                    {"target_id": requested.id},
                )
            ).mappings().one()
        operation_id = stored["operation_id"]
        assert isinstance(stored["result_payload"], dict)
        assert "tutor_account_id" not in stored["result_payload"]
        assert "student_account_id" not in stored["result_payload"]

        accepted = await service.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "contract-accept"),
            ),
        )
        assert accepted.status is BookingStatus.ACCEPTED
        async with PostgresUnitOfWork(runtime, student_credential) as unit:
            row = (
                await unit.connection.execute(
                    text("SELECT * FROM public.read_booking_operation(:operation_id)"),
                    {"operation_id": operation_id},
                )
            ).mappings().one()
            assert row["operation_id"] == operation_id
            assert row["actor_account_id"] == student.account_id
            assert row["action"] == "booking.request"
            assert row["target_type"] == "booking"
            assert row["target_id"] == requested.id
            assert isinstance(row["intent_digest"], str)
            assert len(row["intent_digest"]) == 64
            assert row["result_version"] == requested.version
            assert row["completed_at"] is not None
            payload = row["result_payload"]
            assert isinstance(payload, dict)
            assert UUID(payload["tutor_account_id"]) == tutor.account_id
            assert UUID(payload["student_account_id"]) == student.account_id
            assert payload["status"] == "REQUESTED"
            record = await unit.booking_operations.get(operation_id)
            assert record is not None and record.result == requested
            assert await unit.booking_operations.get(UUID(int=0)) is None
        async with PostgresUnitOfWork(runtime, foreign_credential) as unit:
            assert await unit.booking_operations.get(operation_id) is None
            assert unit.session_principal is not None
            assert unit.session_principal.account_id == foreign.account_id
    finally:
        await runtime.dispose()
        await auth_engine.dispose()
        await inspector.dispose()
