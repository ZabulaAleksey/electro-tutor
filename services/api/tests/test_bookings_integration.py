from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.domain.booking import (
    Booking,
    BookingTransitionCommand,
    OperationContext,
    PaymentMode,
    ReviseTutorOfferCommand,
    TutorOfferTerms,
    TutorOfferTransitionCommand,
)
from electro_tutor_api.domain.identity import ExternalIdentity, Principal, SessionCredential
from electro_tutor_api.errors import (
    BookingOverlapError,
    BookingTimeElapsedError,
    TutorOfferNotFoundError,
)

PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
RUNTIME_URL = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
AUTH_URL = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
MIGRATION_URL = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)


def require_database() -> None:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    if (
        runtime != RUNTIME_URL
        or os.getenv("ET_AUTH_DATABASE_URL") != AUTH_URL
        or os.getenv("ET_MIGRATION_DATABASE_URL") != MIGRATION_URL
    ):
        pytest.skip("booking integration tests require exact disposable database roles")


async def authenticated(
    repository: AuthRepository, label: str
) -> tuple[Principal, SessionCredential]:
    identity_id = await repository.resolve_identity(
        ExternalIdentity(
            issuer=f"https://booking-{label}-{uuid4()}.invalid",
            subject=str(uuid4()),
            email=None,
        )
    )
    credential = SessionCredential.from_token(f"booking-{label}-{uuid4()}")
    await repository.create_session(
        token_digest=credential.digest,
        identity_id=identity_id,
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    principal = await repository.principal_for_session(credential.digest)
    assert principal is not None
    return principal, credential


@pytest.mark.integration
@pytest.mark.asyncio
async def test_booking_schema_runtime_acl_and_timezone_data() -> None:
    require_database()
    assert ZoneInfo("Europe/Kyiv").key == "Europe/Kyiv"
    inspector = create_async_engine(MIGRATION_URL)
    try:
        async with inspector.connect() as connection:
            for table in ("tutor_offers", "bookings", "booking_operations"):
                assert (
                    await connection.scalar(
                        text(
                            "SELECT has_table_privilege('electro_tutor_runtime',:table,'SELECT') "
                            "OR has_table_privilege('electro_tutor_runtime',:table,'INSERT') "
                            "OR has_table_privilege('electro_tutor_runtime',:table,'UPDATE') "
                            "OR has_table_privilege('electro_tutor_runtime',:table,'DELETE')"
                        ),
                        {"table": table},
                    )
                    is False
                )
            assert (
                await connection.scalar(
                    text(
                        "SELECT has_function_privilege('electro_tutor_runtime',"
                        "'public.request_booking(uuid,uuid,integer,text,uuid,text,uuid,text)',"
                        "'EXECUTE')"
                    )
                )
                is True
            )
            for signature, lock_marker in (
                (
                    "public.request_booking(uuid,uuid,integer,text,uuid,text,uuid,text)",
                    "for update",
                ),
                (
                    "public.accept_booking(uuid,integer,uuid,text,uuid,text)",
                    "lock_booking_participants",
                ),
                (
                    "public.cancel_booking(uuid,integer,uuid,text,uuid,text)",
                    "lock_booking_participants",
                ),
            ):
                definition = await connection.scalar(
                    text("SELECT pg_get_functiondef(to_regprocedure(:signature))"),
                    {"signature": signature},
                )
                assert isinstance(definition, str)
                normalized = definition.lower()
                assert "current_timestamp" not in normalized
                assert normalized.index(lock_marker) < normalized.index("clock_timestamp")
    finally:
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_booking_snapshot_and_historical_idempotent_result() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "tutor")
        student, student_credential = await authenticated(auth, "student")
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                    "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                    "issue_operation_id) VALUES (:id,:account,'TUTOR_BOOKING_MANAGE_OWN',"
                    "'account',:account,'service','tutor-provisioner',:operation)"
                ),
                {"id": uuid4(), "account": tutor.account_id, "operation": uuid4()},
            )

        service = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        starts_at = (datetime.now(UTC) + timedelta(days=2)).astimezone(ZoneInfo("Europe/Kyiv"))
        terms = TutorOfferTerms.from_input(
            title="Надёжный снимок",
            starts_at=starts_at,
            time_zone="Europe/Kyiv",
            duration_minutes=60,
            minimum_notice_minutes=30,
            payment_mode=PaymentMode.FREE,
            amount_minor=0,
            currency=None,
        )
        create_operation = OperationContext(uuid4(), uuid4(), "booking-create")
        created = await service.create_tutor_offer(tutor, tutor_credential, terms, create_operation)
        with pytest.raises(TutorOfferNotFoundError):
            await service.request_booking(
                student,
                student_credential,
                offer_id=created.id,
                observed_offer_version=created.version,
                student_time_zone="Europe/Kyiv",
                operation=OperationContext(
                    create_operation.operation_id,
                    uuid4(),
                    "foreign-operation-hidden-offer",
                ),
            )
        published = await service.publish_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTransitionCommand(
                created.id,
                created.version,
                OperationContext(uuid4(), uuid4(), "booking-publish"),
            ),
        )
        booking = await service.request_booking(
            student,
            student_credential,
            offer_id=published.id,
            observed_offer_version=published.version,
            student_time_zone="Europe/Kyiv",
            operation=OperationContext(uuid4(), uuid4(), "booking-request"),
        )
        revised_terms = TutorOfferTerms.from_input(
            title="Изменённое предложение",
            starts_at=starts_at + timedelta(hours=2),
            time_zone="Europe/Kyiv",
            duration_minutes=60,
            minimum_notice_minutes=30,
            payment_mode=PaymentMode.FREE,
            amount_minor=0,
            currency=None,
        )
        await service.revise_tutor_offer(
            tutor,
            tutor_credential,
            ReviseTutorOfferCommand(
                published.id,
                published.version,
                revised_terms,
                OperationContext(uuid4(), uuid4(), "booking-revise"),
            ),
        )

        unchanged = await service.read_booking(student, student_credential, booking.id)
        assert unchanged.snapshot.offer_title == "Надёжный снимок"
        assert unchanged.snapshot.starts_at == terms.starts_at
        historical = await service.create_tutor_offer(
            tutor, tutor_credential, terms, create_operation
        )
        assert historical.id == created.id
        assert historical.version == created.version == 1
        assert historical.terms == created.terms

        second_created = await service.create_tutor_offer(
            tutor,
            tutor_credential,
            terms,
            OperationContext(uuid4(), uuid4(), "booking-create-overlap"),
        )
        second_published = await service.publish_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTransitionCommand(
                second_created.id,
                second_created.version,
                OperationContext(uuid4(), uuid4(), "booking-publish-overlap"),
            ),
        )
        second_booking = await service.request_booking(
            student,
            student_credential,
            offer_id=second_published.id,
            observed_offer_version=second_published.version,
            student_time_zone="Europe/Kyiv",
            operation=OperationContext(uuid4(), uuid4(), "booking-request-overlap"),
        )
        outcomes = await asyncio.wait_for(
            asyncio.gather(
                service.accept_booking(
                    tutor,
                    tutor_credential,
                    BookingTransitionCommand(
                        booking.id,
                        booking.version,
                        OperationContext(uuid4(), uuid4(), "booking-accept-first"),
                    ),
                ),
                service.accept_booking(
                    tutor,
                    tutor_credential,
                    BookingTransitionCommand(
                        second_booking.id,
                        second_booking.version,
                        OperationContext(uuid4(), uuid4(), "booking-accept-second"),
                    ),
                ),
                return_exceptions=True,
            ),
            timeout=5,
        )
        assert sum(not isinstance(outcome, BaseException) for outcome in outcomes) == 1
        assert sum(isinstance(outcome, BookingOverlapError) for outcome in outcomes) == 1
        accepted = next(outcome for outcome in outcomes if isinstance(outcome, Booking))

        third_created = await service.create_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTerms.from_input(
                title="Идемпотентный запрос",
                starts_at=starts_at + timedelta(hours=5),
                time_zone="Europe/Kyiv",
                duration_minutes=60,
                minimum_notice_minutes=30,
                payment_mode=PaymentMode.FREE,
                amount_minor=0,
                currency=None,
            ),
            OperationContext(uuid4(), uuid4(), "booking-create-identical"),
        )
        third_published = await service.publish_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTransitionCommand(
                third_created.id,
                third_created.version,
                OperationContext(uuid4(), uuid4(), "booking-publish-identical"),
            ),
        )
        request_operation = OperationContext(uuid4(), uuid4(), "booking-request-identical")
        identical_requests = await asyncio.wait_for(
            asyncio.gather(
                service.request_booking(
                    student,
                    student_credential,
                    offer_id=third_published.id,
                    observed_offer_version=third_published.version,
                    student_time_zone="Europe/Kyiv",
                    operation=request_operation,
                ),
                service.request_booking(
                    student,
                    student_credential,
                    offer_id=third_published.id,
                    observed_offer_version=third_published.version,
                    student_time_zone="Europe/Kyiv",
                    operation=request_operation,
                ),
            ),
            timeout=5,
        )
        assert identical_requests[0] == identical_requests[1]

        cancel_operation = OperationContext(uuid4(), uuid4(), "booking-cancel-identical")
        cancel_command = BookingTransitionCommand(accepted.id, accepted.version, cancel_operation)
        identical_cancels = await asyncio.wait_for(
            asyncio.gather(
                service.cancel_booking(student, student_credential, cancel_command),
                service.cancel_booking(student, student_credential, cancel_command),
            ),
            timeout=5,
        )
        assert identical_cancels[0] == identical_cancels[1]
        async with inspector.connect() as connection:
            for operation in (request_operation, cancel_operation):
                counts = (
                    (
                        await connection.execute(
                            text(
                                "SELECT "
                                "(SELECT count(*) FROM booking_operations "
                                " WHERE operation_id=:operation_id) operation_count,"
                                "(SELECT count(*) FROM audit_events "
                                " WHERE operation_id=:operation_id) audit_count"
                            ),
                            {"operation_id": operation.operation_id},
                        )
                    )
                    .mappings()
                    .one()
                )
                assert counts == {"operation_count": 1, "audit_count": 1}

        with pytest.raises(SQLAlchemyError):
            async with runtime.begin() as connection:
                await connection.execute(
                    text("UPDATE bookings SET offer_title='tampered' WHERE id=:id"),
                    {"id": booking.id},
                )
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancel_rechecks_wall_clock_after_blocking_participant_lock() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "boundary-tutor")
        student, student_credential = await authenticated(auth, "boundary-student")
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
                    "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
                    "issue_operation_id) VALUES (:id,:account,'TUTOR_BOOKING_MANAGE_OWN',"
                    "'account',:account,'service','tutor-provisioner',:operation)"
                ),
                {"id": uuid4(), "account": tutor.account_id, "operation": uuid4()},
            )
        service = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        starts_at = datetime.now(UTC) + timedelta(seconds=4)
        created = await service.create_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTerms.from_input(
                title="Граница отмены",
                starts_at=starts_at,
                time_zone="UTC",
                duration_minutes=15,
                minimum_notice_minutes=0,
                payment_mode=PaymentMode.FREE,
                amount_minor=0,
                currency=None,
            ),
            OperationContext(uuid4(), uuid4(), "boundary-create"),
        )
        published = await service.publish_tutor_offer(
            tutor,
            tutor_credential,
            TutorOfferTransitionCommand(
                created.id,
                created.version,
                OperationContext(uuid4(), uuid4(), "boundary-publish"),
            ),
        )
        requested = await service.request_booking(
            student,
            student_credential,
            offer_id=published.id,
            observed_offer_version=published.version,
            student_time_zone="UTC",
            operation=OperationContext(uuid4(), uuid4(), "boundary-request"),
        )
        accepted = await service.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "boundary-accept"),
            ),
        )

        async with inspector.begin() as blocker:
            await blocker.execute(
                text(
                    "SELECT public.lock_booking_participants("
                    "CAST(:tutor AS uuid),CAST(:student AS uuid))"
                ),
                {
                    "tutor": accepted.tutor_account_id,
                    "student": accepted.student_account_id,
                },
            )
            cancellation = asyncio.create_task(
                service.cancel_booking(
                    student,
                    student_credential,
                    BookingTransitionCommand(
                        accepted.id,
                        accepted.version,
                        OperationContext(uuid4(), uuid4(), "boundary-cancel"),
                    ),
                )
            )
            await asyncio.sleep(0.1)
            assert not cancellation.done()
            delay = max(0.0, (starts_at - datetime.now(UTC)).total_seconds() + 0.1)
            await asyncio.sleep(delay)
        with pytest.raises(BookingTimeElapsedError):
            await asyncio.wait_for(cancellation, timeout=5)
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()
