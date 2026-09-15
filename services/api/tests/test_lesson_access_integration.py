from __future__ import annotations

import asyncio
import os
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4, uuid5

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.bookings import BookingService
from electro_tutor_api.application.lesson_access import LessonAccessGrantService
from electro_tutor_api.cli import alembic_config
from electro_tutor_api.config import MigrationSettings
from electro_tutor_api.domain.booking import (
    Booking,
    BookingOperationAction,
    BookingStatus,
    BookingTransitionCommand,
    Currency,
    OperationContext,
    PaymentMode,
    TutorOfferTerms,
    TutorOfferTransitionCommand,
    operation_intent_digest,
)
from electro_tutor_api.domain.identity import ExternalIdentity, Principal, SessionCredential
from electro_tutor_api.domain.lesson_access import (
    LessonAccessParticipantRole,
    LessonAccessStatus,
)
from electro_tutor_api.errors import (
    AuditUnavailableError,
    BookingNotFoundError,
    LessonAccessExpiredError,
    LessonAccessNotYetValidError,
    LessonAccessPolicyUnavailableError,
    LessonAccessRevokedError,
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
OLD_PREDICTABLE_NAMESPACE = UUID("16c8c6a8-e30c-47c7-a167-3d56a8cc7faa")
ACCESS_FUNCTIONS = {
    "public.authorize_lesson_access(uuid)": True,
    "public.append_lesson_access_audit(text,text,uuid,text,text,uuid,uuid,text,text)": True,
    (
        "public.derive_lesson_access_status(timestamp with time zone,"
        "timestamp with time zone,timestamp with time zone,timestamp with time zone)"
    ): False,
    "public.issue_lesson_access_grant(uuid,text,text,uuid,text,text)": True,
    "public.new_lesson_access_operation_id()": True,
    "public.prevent_lesson_access_grant_rewrite()": False,
    "public.prevent_lesson_access_migration_impersonation()": False,
    "public.revoke_lesson_access_grant(uuid,uuid,uuid,text)": True,
}


def require_database() -> None:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    if (
        runtime != RUNTIME_URL
        or os.getenv("ET_AUTH_DATABASE_URL") != AUTH_URL
        or os.getenv("ET_MIGRATION_DATABASE_URL") != MIGRATION_URL
    ):
        pytest.skip("lesson access integration tests require exact disposable database roles")


async def authenticated(
    repository: AuthRepository, label: str
) -> tuple[Principal, SessionCredential]:
    identity_id = await repository.resolve_identity(
        ExternalIdentity(
            issuer=f"https://access-{label}-{uuid4()}.invalid",
            subject=str(uuid4()),
            email=None,
        )
    )
    credential = SessionCredential.from_token(f"access-{label}-{uuid4()}")
    await repository.create_session(
        token_digest=credential.digest,
        identity_id=identity_id,
        expires_at=datetime.now(UTC) + timedelta(minutes=20),
    )
    principal = await repository.principal_for_session(credential.digest)
    assert principal is not None
    return principal, credential


async def create_requested_booking(
    service: BookingService,
    tutor: Principal,
    tutor_credential: SessionCredential,
    student: Principal,
    student_credential: SessionCredential,
    *,
    starts_at: datetime,
    payment_mode: PaymentMode = PaymentMode.FREE,
) -> Booking:
    offer = await service.create_tutor_offer(
        tutor,
        tutor_credential,
        TutorOfferTerms.from_input(
            title=f"Access {uuid4()}",
            starts_at=starts_at,
            time_zone="UTC",
            duration_minutes=15,
            minimum_notice_minutes=0,
            payment_mode=payment_mode,
            amount_minor=0 if payment_mode is PaymentMode.FREE else 100,
            currency=None if payment_mode is PaymentMode.FREE else Currency.UAH,
        ),
        OperationContext(uuid4(), uuid4(), "access-create"),
    )
    published = await service.publish_tutor_offer(
        tutor,
        tutor_credential,
        TutorOfferTransitionCommand(
            offer.id,
            offer.version,
            OperationContext(uuid4(), uuid4(), "access-publish"),
        ),
    )
    return await service.request_booking(
        student,
        student_credential,
        offer_id=published.id,
        observed_offer_version=published.version,
        student_time_zone="UTC",
        operation=OperationContext(uuid4(), uuid4(), "access-request"),
    )


async def grant_tutor_booking_capability(connection: Any, account_id: UUID) -> None:
    await connection.execute(
        text(
            "INSERT INTO capability_grants(id,subject_account_id,capability_code,"
            "scope_kind,scope_id,issued_by_actor_type,issued_by_actor_id,"
            "issue_operation_id) VALUES (:id,:account,'TUTOR_BOOKING_MANAGE_OWN',"
            "'account',:account,'service','tutor-provisioner',:operation)"
        ),
        {"id": uuid4(), "account": account_id, "operation": uuid4()},
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_access_schema_acl_atomic_issue_replay_authorization_and_revoke() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "tutor")
        student, student_credential = await authenticated(auth, "student")
        foreign, foreign_credential = await authenticated(auth, "foreign")
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
            for role in (
                "electro_tutor_runtime",
                "electro_tutor_auth_runtime",
                "electro_tutor_provisioner",
            ):
                assert (
                    await connection.scalar(
                        text(
                            "SELECT has_table_privilege(:role,'lesson_access_grants','SELECT') "
                            "OR has_table_privilege(:role,'lesson_access_grants','INSERT') "
                            "OR has_table_privilege(:role,'lesson_access_grants','UPDATE') "
                            "OR has_table_privilege(:role,'lesson_access_grants','DELETE')"
                        ),
                        {"role": role},
                    )
                    is False
                )
            assert not await connection.scalar(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_class class "
                    "CROSS JOIN LATERAL aclexplode(COALESCE(class.relacl,"
                    "acldefault('r',class.relowner))) acl "
                    "WHERE class.oid='public.lesson_access_grants'::regclass "
                    "AND acl.grantee=0 AND acl.privilege_type IN "
                    "('SELECT','INSERT','UPDATE','DELETE'))"
                )
            )
            for signature, security_definer in ACCESS_FUNCTIONS.items():
                function_acl = (
                    (
                        await connection.execute(
                            text(
                                "SELECT procedure.prosecdef,procedure.proconfig,"
                                "pg_get_functiondef(procedure.oid) AS definition,"
                                "EXISTS (SELECT 1 FROM aclexplode(COALESCE("
                                "procedure.proacl,acldefault('f',procedure.proowner))) acl "
                                "WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') "
                                "AS public_execute FROM pg_proc procedure "
                                "WHERE procedure.oid=to_regprocedure(:signature)"
                            ),
                            {"signature": signature},
                        )
                    )
                    .mappings()
                    .one()
                )
                assert function_acl["prosecdef"] is security_definer
                assert function_acl["proconfig"] == ["search_path=pg_catalog"]
                assert function_acl["public_execute"] is False
                assert "SET search_path TO 'pg_catalog'" in function_acl["definition"]
                for role in (
                    "electro_tutor_auth_runtime",
                    "electro_tutor_provisioner",
                ):
                    assert not await connection.scalar(
                        text("SELECT has_function_privilege(:role,:signature,'EXECUTE')"),
                        {"role": role, "signature": signature},
                    )
                assert bool(
                    await connection.scalar(
                        text(
                            "SELECT has_function_privilege("
                            "'electro_tutor_runtime',:signature,'EXECUTE')"
                        ),
                        {"signature": signature},
                    )
                ) is (signature == "public.authorize_lesson_access(uuid)")

            constraints = set(
                (
                    await connection.execute(
                        text(
                            "SELECT conname FROM pg_constraint "
                            "WHERE conrelid='public.lesson_access_grants'::regclass"
                        )
                    )
                ).scalars()
            )
            assert constraints == {
                "ck_lesson_access_grants_policy",
                "ck_lesson_access_grants_revoke_tuple",
                "ck_lesson_access_grants_source",
                "ck_lesson_access_grants_validity",
                "fk_lesson_access_grants_booking",
                "pk_lesson_access_grants",
                "uq_lesson_access_grants_booking",
                "uq_lesson_access_grants_issue_operation",
            }
            indexes = set(
                (
                    await connection.execute(
                        text(
                            "SELECT indexname FROM pg_indexes WHERE schemaname='public' "
                            "AND tablename='lesson_access_grants'"
                        )
                    )
                ).scalars()
            )
            assert indexes == {
                "ix_lesson_access_grants_active_until",
                "pk_lesson_access_grants",
                "uq_lesson_access_grants_booking",
                "uq_lesson_access_grants_issue_operation",
                "uq_lesson_access_grants_revoke_operation",
            }
            transition_definitions = {
                row["proname"]: row["definition"]
                for row in (
                    (
                        await connection.execute(
                            text(
                                "SELECT proname,pg_get_functiondef(oid) definition "
                                "FROM pg_proc WHERE pronamespace='public'::regnamespace "
                                "AND proname IN ('accept_booking','cancel_booking')"
                            )
                        )
                    )
                    .mappings()
                    .all()
                )
            }
            assert "issue_lesson_access_grant" in transition_definitions["accept_booking"]
            assert "revoke_lesson_access_grant" in transition_definitions["cancel_booking"]

        async with runtime.connect() as connection:
            transaction = await connection.begin()
            try:
                with pytest.raises(SQLAlchemyError):
                    await connection.execute(
                        text(
                            "INSERT INTO audit_events(actor_type,actor_id,subject_type,"
                            "subject_id,action,result,correlation_id,operation_id,metadata) "
                            "VALUES ('service','lesson-access-migration',"
                            "'lesson_access_grant',:subject,'lesson_access_grant.issued',"
                            "'succeeded',:correlation,:operation,jsonb_build_object("
                            "'source','BOOKING_FREE','policy_version','1',"
                            "'capability_set_code','LESSON_SHELL_V1',"
                            "'issuance_reason','migration_backfill'))"
                        ),
                        {
                            "subject": str(uuid4()),
                            "correlation": uuid4(),
                            "operation": uuid4(),
                        },
                    )
            finally:
                await transaction.rollback()

        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        access = LessonAccessGrantService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(minutes=10),
            payment_mode=PaymentMode.EXTERNAL,
        )
        accept_operation = OperationContext(uuid4(), uuid4(), "access-accept")
        predictable_access_id = uuid5(OLD_PREDICTABLE_NAMESPACE, str(accept_operation.operation_id))
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO audit_events(actor_type,actor_id,subject_type,subject_id,"
                    "action,result,correlation_id,operation_id,metadata) VALUES "
                    "('account',:actor,'tutor_profile',:actor,'tutor_profile.created',"
                    "'succeeded',:correlation,:operation,"
                    "jsonb_build_object('profile_type','tutor','reason_category','test'))"
                ),
                {
                    "actor": str(foreign.account_id),
                    "correlation": uuid4(),
                    "operation": predictable_access_id,
                },
            )
        accept_command = BookingTransitionCommand(requested.id, requested.version, accept_operation)
        accepted, replayed_accept = await asyncio.wait_for(
            asyncio.gather(
                bookings.accept_booking(tutor, tutor_credential, accept_command),
                bookings.accept_booking(tutor, tutor_credential, accept_command),
            ),
            timeout=5,
        )
        assert replayed_accept == accepted

        tutor_decision = await access.authorize(tutor, tutor_credential, accepted.id)
        student_decision = await access.authorize(student, student_credential, accepted.id)
        assert tutor_decision.status is student_decision.status is LessonAccessStatus.ACTIVE
        assert tutor_decision.participant_role is LessonAccessParticipantRole.TUTOR
        assert student_decision.participant_role is LessonAccessParticipantRole.STUDENT
        assert tutor_decision.grant_id == student_decision.grant_id
        with pytest.raises(BookingNotFoundError):
            await access.authorize(foreign, foreign_credential, accepted.id)

        async with inspector.connect() as connection:
            issued = (
                (
                    await connection.execute(
                        text(
                            "SELECT grant_row.*,event.actor_type,event.actor_id,event.request_id,"
                            "event.correlation_id,event.metadata "
                            "FROM lesson_access_grants grant_row "
                            "JOIN audit_events event "
                            "ON event.operation_id=grant_row.issue_operation_id "
                            "WHERE grant_row.booking_id=:booking_id"
                        ),
                        {"booking_id": accepted.id},
                    )
                )
                .mappings()
                .one()
            )
        assert issued["source"] == "BOOKING_EXTERNAL"
        assert issued["valid_from"] == accepted.snapshot.starts_at - timedelta(minutes=15)
        assert issued["valid_until"] == accepted.snapshot.ends_at
        assert issued["issue_operation_id"].version == 4
        assert issued["issue_operation_id"] not in {
            accept_operation.operation_id,
            predictable_access_id,
        }
        assert issued["actor_type"] == "account"
        assert issued["actor_id"] == str(tutor.account_id)
        assert issued["request_id"] == accept_operation.request_id
        assert issued["correlation_id"] == accept_operation.correlation_id
        assert issued["metadata"] == {
            "source": "BOOKING_EXTERNAL",
            "policy_version": "1",
            "capability_set_code": "LESSON_SHELL_V1",
            "issuance_reason": "booking_accept",
        }

        cancel_operation = OperationContext(uuid4(), uuid4(), "access-cancel")
        cancel_command = BookingTransitionCommand(accepted.id, accepted.version, cancel_operation)
        cancelled, replayed_cancel = await asyncio.wait_for(
            asyncio.gather(
                bookings.cancel_booking(student, student_credential, cancel_command),
                bookings.cancel_booking(student, student_credential, cancel_command),
            ),
            timeout=5,
        )
        assert replayed_cancel == cancelled
        with pytest.raises(LessonAccessRevokedError):
            await access.authorize(student, student_credential, accepted.id)
        async with inspector.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            "SELECT grant_row.*,"
                            "(SELECT count(*) FROM audit_events event WHERE "
                            " event.subject_id=grant_row.id::text AND "
                            " event.action='lesson_access_grant.issued') issue_events,"
                            "(SELECT count(*) FROM audit_events event WHERE "
                            " event.subject_id=grant_row.id::text AND "
                            " event.action='lesson_access_grant.revoked') revoke_events "
                            "FROM lesson_access_grants grant_row WHERE booking_id=:booking_id"
                        ),
                        {"booking_id": accepted.id},
                    )
                )
                .mappings()
                .one()
            )
        assert row["revoked_by_actor_type"] == "account"
        assert row["revoked_by_actor_id"] == str(student.account_id)
        assert row["revoke_reason"] == "BOOKING_CANCELLED"
        assert row["revoke_operation_id"].version == 4
        assert row["issue_events"] == row["revoke_events"] == 1

        async with inspector.connect() as connection:
            transaction = await connection.begin()
            try:
                with pytest.raises(SQLAlchemyError):
                    await connection.execute(
                        text(
                            "UPDATE lesson_access_grants "
                            "SET valid_until=valid_until+interval '1 minute' "
                            "WHERE booking_id=:booking_id"
                        ),
                        {"booking_id": accepted.id},
                    )
            finally:
                await transaction.rollback()
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_db_time_boundaries_are_exact_and_authorization_is_fail_closed() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "time-tutor")
        student, student_credential = await authenticated(auth, "time-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
            boundary = datetime(2030, 1, 2, 3, 4, 5, tzinfo=UTC)
            statuses = (
                (
                    await connection.execute(
                        text(
                            "SELECT "
                            "derive_lesson_access_status(NULL,:start,:finish,:before) before_start,"
                            "derive_lesson_access_status(NULL,:start,:finish,:start) exact_start,"
                            "derive_lesson_access_status(NULL,:start,:finish,:finish) exact_finish,"
                            "derive_lesson_access_status(NULL,:start,:finish,:after) after_finish"
                        ),
                        {
                            "start": boundary,
                            "finish": boundary + timedelta(hours=1),
                            "before": boundary - timedelta(microseconds=1),
                            "after": boundary + timedelta(hours=1, microseconds=1),
                        },
                    )
                )
                .mappings()
                .one()
            )
        assert dict(statuses) == {
            "before_start": "NOT_YET_VALID",
            "exact_start": "ACTIVE",
            "exact_finish": "EXPIRED",
            "after_finish": "EXPIRED",
        }

        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        access = LessonAccessGrantService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=1),
        )
        accepted = await bookings.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "time-accept"),
            ),
        )
        with pytest.raises(LessonAccessNotYetValidError):
            await access.authorize(student, student_credential, accepted.id)

        expired_offer_id = uuid4()
        expired_booking_id = uuid4()
        expired_start = datetime(2020, 1, 2, 3, tzinfo=UTC)
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO tutor_offers(id,tutor_account_id,status,version,title,"
                    "starts_at,ends_at,time_zone,duration_minutes,minimum_notice_minutes,"
                    "payment_mode,amount_minor,currency,currency_exponent,created_at,"
                    "updated_at,published_at,retired_at) SELECT :new_id,tutor_account_id,"
                    "'ACTIVE',version,title,:starts_at,:ends_at,time_zone,duration_minutes,"
                    "minimum_notice_minutes,payment_mode,amount_minor,currency,currency_exponent,"
                    "created_at,updated_at,published_at,NULL FROM tutor_offers WHERE id=:source_id"
                ),
                {
                    "new_id": expired_offer_id,
                    "source_id": accepted.offer_id,
                    "starts_at": expired_start,
                    "ends_at": expired_start + timedelta(minutes=15),
                },
            )
            await connection.execute(
                text(
                    "INSERT INTO bookings(id,offer_id,tutor_account_id,student_account_id,"
                    "status,version,snapshot_version,offer_version,offer_title,starts_at,ends_at,"
                    "tutor_time_zone,student_time_zone,duration_minutes,minimum_notice_minutes,"
                    "payment_mode,amount_minor,currency,currency_exponent,cancellation_policy_code,"
                    "requested_at,accepted_at,declined_at,cancelled_at,cancelled_by_role) "
                    "SELECT :new_id,:offer_id,tutor_account_id,student_account_id,'ACCEPTED',2,"
                    "snapshot_version,offer_version,offer_title,:starts_at,:ends_at,"
                    "tutor_time_zone,student_time_zone,duration_minutes,minimum_notice_minutes,"
                    "payment_mode,amount_minor,currency,currency_exponent,cancellation_policy_code,"
                    "requested_at,CURRENT_TIMESTAMP,NULL,NULL,NULL FROM bookings "
                    "WHERE id=:source_id"
                ),
                {
                    "new_id": expired_booking_id,
                    "offer_id": expired_offer_id,
                    "source_id": accepted.id,
                    "starts_at": expired_start,
                    "ends_at": expired_start + timedelta(minutes=15),
                },
            )
            await connection.execute(
                text(
                    "SELECT issue_lesson_access_grant(:booking_id,'service',"
                    "'lesson-access-migration',:correlation,NULL,'migration_backfill')"
                ),
                {"booking_id": expired_booking_id, "correlation": uuid4()},
            )
        with pytest.raises(LessonAccessExpiredError):
            await access.authorize(student, student_credential, expired_booking_id)
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_nonaccepted_booking_states_never_issue_and_platform_is_rejected() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "nongrant-tutor")
        student, student_credential = await authenticated(auth, "nongrant-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=2),
        )
        declined_request = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=4),
        )
        declined = await bookings.decline_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                declined_request.id,
                declined_request.version,
                OperationContext(uuid4(), uuid4(), "nongrant-decline"),
            ),
        )
        cancelled_request = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=6),
        )
        cancelled = await bookings.cancel_booking(
            student,
            student_credential,
            BookingTransitionCommand(
                cancelled_request.id,
                cancelled_request.version,
                OperationContext(uuid4(), uuid4(), "nongrant-cancel"),
            ),
        )
        assert declined.status is BookingStatus.DECLINED
        assert cancelled.status is BookingStatus.CANCELLED
        async with inspector.connect() as connection:
            counts = (
                (
                    await connection.execute(
                        text(
                            "SELECT ids.booking_id,count(grants.booking_id) grant_count FROM "
                            "(VALUES (CAST(:requested AS uuid)),"
                            "(CAST(:declined AS uuid)),(CAST(:cancelled AS uuid))) ids(booking_id) "
                            "LEFT JOIN lesson_access_grants grants "
                            "ON grants.booking_id=ids.booking_id "
                            "GROUP BY ids.booking_id"
                        ),
                        {
                            "requested": requested.id,
                            "declined": declined.id,
                            "cancelled": cancelled.id,
                        },
                    )
                )
                .mappings()
                .all()
            )
            assert {row["booking_id"]: row["grant_count"] for row in counts} == {
                requested.id: 0,
                declined.id: 0,
                cancelled.id: 0,
            }
        async with inspector.connect() as connection:
            transaction = await connection.begin()
            try:
                with pytest.raises(SQLAlchemyError):
                    await connection.execute(
                        text(
                            "INSERT INTO lesson_access_grants(booking_id,source,valid_from,"
                            "valid_until,issue_operation_id) VALUES (:booking_id,'PLATFORM',"
                            ":valid_from,:valid_until,:operation_id)"
                        ),
                        {
                            "booking_id": requested.id,
                            "valid_from": requested.snapshot.starts_at - timedelta(minutes=15),
                            "valid_until": requested.snapshot.ends_at,
                            "operation_id": uuid4(),
                        },
                    )
            finally:
                await transaction.rollback()
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_access_audit_failure_rolls_back_accept_and_accepted_cancel() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    trigger_exists = False
    try:
        tutor, tutor_credential = await authenticated(auth, "audit-tutor")
        student, student_credential = await authenticated(auth, "audit-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
            await connection.execute(
                text(
                    "CREATE FUNCTION public.fail_access_audit_for_test() RETURNS trigger "
                    "LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN "
                    "IF NEW.action IN ('lesson_access_grant.issued',"
                    "'lesson_access_grant.revoked') THEN RAISE EXCEPTION "
                    "'synthetic access audit outage'; END IF; RETURN NEW; END $$"
                )
            )
            await connection.execute(
                text(
                    "CREATE TRIGGER fail_access_audit_for_test BEFORE INSERT ON audit_events "
                    "FOR EACH ROW EXECUTE FUNCTION fail_access_audit_for_test()"
                )
            )
        trigger_exists = True
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        requested = await create_requested_booking(
            bookings,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=8),
        )
        with pytest.raises(AuditUnavailableError):
            await bookings.accept_booking(
                tutor,
                tutor_credential,
                BookingTransitionCommand(
                    requested.id,
                    requested.version,
                    OperationContext(uuid4(), uuid4(), "audit-fail-accept"),
                ),
            )
        unchanged = await bookings.read_booking(student, student_credential, requested.id)
        assert unchanged.status is BookingStatus.REQUESTED
        assert unchanged.version == requested.version
        async with inspector.connect() as connection:
            assert (
                await connection.scalar(
                    text("SELECT count(*) FROM lesson_access_grants WHERE booking_id=:id"),
                    {"id": requested.id},
                )
                == 0
            )
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM audit_events WHERE subject_id=:id "
                        "AND action IN ('booking.accepted','lesson_access_grant.issued')"
                    ),
                    {"id": str(requested.id)},
                )
                == 0
            )
        async with inspector.begin() as connection:
            await connection.execute(
                text("DROP TRIGGER fail_access_audit_for_test ON audit_events")
            )
        trigger_exists = False
        accepted = await bookings.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "audit-pass-accept"),
            ),
        )
        async with inspector.begin() as connection:
            await connection.execute(
                text(
                    "CREATE TRIGGER fail_access_audit_for_test BEFORE INSERT ON audit_events "
                    "FOR EACH ROW EXECUTE FUNCTION fail_access_audit_for_test()"
                )
            )
        trigger_exists = True
        with pytest.raises(AuditUnavailableError):
            await bookings.cancel_booking(
                student,
                student_credential,
                BookingTransitionCommand(
                    accepted.id,
                    accepted.version,
                    OperationContext(uuid4(), uuid4(), "audit-fail-cancel"),
                ),
            )
        still_accepted = await bookings.read_booking(student, student_credential, accepted.id)
        assert still_accepted.status is BookingStatus.ACCEPTED
        assert still_accepted.version == accepted.version
        async with inspector.connect() as connection:
            grant = (
                (
                    await connection.execute(
                        text(
                            "SELECT revoked_at,revoke_operation_id FROM lesson_access_grants "
                            "WHERE booking_id=:id"
                        ),
                        {"id": accepted.id},
                    )
                )
                .mappings()
                .one()
            )
            assert grant["revoked_at"] is None
            assert grant["revoke_operation_id"] is None
            assert (
                await connection.scalar(
                    text(
                        "SELECT count(*) FROM audit_events WHERE subject_id=:id "
                        "AND action IN ('booking.cancelled','lesson_access_grant.revoked')"
                    ),
                    {"id": str(accepted.id)},
                )
                == 0
            )
    finally:
        if trigger_exists:
            async with inspector.begin() as connection:
                await connection.execute(
                    text("DROP TRIGGER IF EXISTS fail_access_audit_for_test ON audit_events")
                )
        async with inspector.begin() as connection:
            await connection.execute(text("DROP FUNCTION IF EXISTS fail_access_audit_for_test()"))
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_authorize_check_linearizes_before_concurrent_revoke() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    reader: PostgresUnitOfWork | None = None
    cancel_connection = None
    cancel_transaction = None
    cancel_task: asyncio.Task[Any] | None = None
    try:
        tutor, tutor_credential = await authenticated(auth, "race-tutor")
        student, student_credential = await authenticated(auth, "race-student")
        async with inspector.begin() as connection:
            await grant_tutor_booking_capability(connection, tutor.account_id)
        bookings = BookingService(
            cast(Any, lambda credential: PostgresUnitOfWork(runtime, credential))
        )
        access = LessonAccessGrantService(
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
                OperationContext(uuid4(), uuid4(), "race-accept"),
            ),
        )

        reader = PostgresUnitOfWork(runtime, student_credential)
        unit = await reader.__aenter__()
        before = await unit.lesson_access_grants.authorize_for_current_session(accepted.id)
        assert before.status is LessonAccessStatus.ACTIVE

        cancel_operation = OperationContext(uuid4(), uuid4(), "race-cancel")
        cancel_command = BookingTransitionCommand(accepted.id, accepted.version, cancel_operation)
        cancel_connection = await runtime.connect()
        cancel_transaction = await cancel_connection.begin()
        await cancel_connection.execute(
            text("SELECT set_config('electro_tutor.session_digest',CAST(:digest AS text),true)"),
            {"digest": student_credential.digest},
        )
        cancel_pid = await cancel_connection.scalar(text("SELECT pg_backend_pid()"))
        cancel_task = asyncio.create_task(
            cancel_connection.execute(
                text(
                    "SELECT * FROM cancel_booking(:booking_id,:expected_version,"
                    ":operation_id,:digest,:correlation_id,:request_id)"
                ),
                {
                    "booking_id": accepted.id,
                    "expected_version": accepted.version,
                    "operation_id": cancel_operation.operation_id,
                    "digest": operation_intent_digest(
                        BookingOperationAction.BOOKING_CANCEL, cancel_command
                    ),
                    "correlation_id": cancel_operation.correlation_id,
                    "request_id": cancel_operation.request_id,
                },
            )
        )
        observed_wait = False
        async with inspector.connect() as connection:
            for _ in range(10_000):
                observed_wait = bool(
                    await connection.scalar(
                        text(
                            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=:pid AND NOT granted)"
                        ),
                        {"pid": cancel_pid},
                    )
                )
                if observed_wait:
                    break
                await asyncio.sleep(0)
        assert observed_wait, "cancel did not block behind the authorization share lock"

        await reader.__aexit__(None, None, None)
        reader = None
        await asyncio.wait_for(cancel_task, timeout=5)
        cancel_task = None
        await cancel_transaction.commit()
        cancel_transaction = None
        await cancel_connection.close()
        cancel_connection = None

        with pytest.raises(LessonAccessRevokedError):
            await access.authorize(student, student_credential, accepted.id)
    finally:
        if reader is not None:
            await reader.__aexit__(Exception, Exception("test cleanup"), None)
        if cancel_task is not None:
            cancel_task.cancel()
            with suppress(BaseException):
                await cancel_task
        if cancel_transaction is not None and cancel_transaction.is_active:
            await cancel_transaction.rollback()
        if cancel_connection is not None:
            await cancel_connection.close()
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_accepted_cancel_rolls_back_when_required_grant_is_missing() -> None:
    require_database()
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    try:
        tutor, tutor_credential = await authenticated(auth, "rollback-tutor")
        student, student_credential = await authenticated(auth, "rollback-student")
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
        requested = await create_requested_booking(
            service,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=1),
        )
        accepted = await service.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(uuid4(), uuid4(), "rollback-accept"),
            ),
        )
        async with inspector.begin() as connection:
            await connection.execute(
                text("DELETE FROM lesson_access_grants WHERE booking_id=:booking_id"),
                {"booking_id": accepted.id},
            )
        with pytest.raises(LessonAccessPolicyUnavailableError):
            await service.cancel_booking(
                student,
                student_credential,
                BookingTransitionCommand(
                    accepted.id,
                    accepted.version,
                    OperationContext(uuid4(), uuid4(), "rollback-cancel"),
                ),
            )
        unchanged = await service.read_booking(student, student_credential, accepted.id)
        assert unchanged.status == accepted.status
        assert unchanged.version == accepted.version
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_migration_backfill_has_exact_service_provenance_and_random_operation_id() -> None:
    require_database()
    if os.getenv("ET_CONFIRM_MIGRATION_LIFECYCLE") != "electro-tutor-local":
        pytest.skip("migration backfill test requires named disposable lifecycle consent")
    runtime = create_async_engine(RUNTIME_URL)
    auth = AuthRepository(create_async_engine(AUTH_URL))
    inspector = create_async_engine(MIGRATION_URL)
    booking_id: UUID | None = None
    tutor_id: UUID | None = None
    accept_operation_id: UUID | None = None
    try:
        tutor, tutor_credential = await authenticated(auth, "backfill-tutor")
        student, student_credential = await authenticated(auth, "backfill-student")
        tutor_id = tutor.account_id
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
        requested = await create_requested_booking(
            service,
            tutor,
            tutor_credential,
            student,
            student_credential,
            starts_at=datetime.now(UTC) + timedelta(hours=3),
        )
        accept_operation_id = uuid4()
        accepted = await service.accept_booking(
            tutor,
            tutor_credential,
            BookingTransitionCommand(
                requested.id,
                requested.version,
                OperationContext(accept_operation_id, uuid4(), "backfill-accept"),
            ),
        )
        booking_id = accepted.id
    finally:
        await runtime.dispose()
        await auth.engine.dispose()
        await inspector.dispose()

    assert booking_id is not None
    assert tutor_id is not None
    assert accept_operation_id is not None
    settings = MigrationSettings(profile="test", migration_database_url=MIGRATION_URL)
    config = alembic_config(settings)
    predictable_access_id = uuid5(OLD_PREDICTABLE_NAMESPACE, str(booking_id))
    try:
        await asyncio.to_thread(command.downgrade, config, "20260914_0010")
        inspector = create_async_engine(MIGRATION_URL)
        try:
            async with inspector.begin() as connection:
                await connection.execute(
                    text(
                        "INSERT INTO audit_events(actor_type,actor_id,subject_type,subject_id,"
                        "action,result,correlation_id,operation_id,metadata) VALUES "
                        "('account',:actor,'tutor_profile',:actor,'tutor_profile.created',"
                        "'succeeded',:correlation,:operation,"
                        "jsonb_build_object('profile_type','tutor','reason_category','test'))"
                    ),
                    {
                        "actor": str(tutor_id),
                        "correlation": uuid4(),
                        "operation": predictable_access_id,
                    },
                )
        finally:
            await inspector.dispose()
        await asyncio.to_thread(command.upgrade, config, "head")
        inspector = create_async_engine(MIGRATION_URL)
        try:
            async with inspector.connect() as connection:
                row = (
                    (
                        await connection.execute(
                            text(
                                "SELECT grant_row.issue_operation_id,event.actor_type,"
                                "event.actor_id,event.request_id,event.correlation_id,"
                                "event.metadata FROM lesson_access_grants grant_row "
                                "JOIN audit_events event "
                                "ON event.operation_id=grant_row.issue_operation_id "
                                "WHERE grant_row.booking_id=:booking_id"
                            ),
                            {"booking_id": booking_id},
                        )
                    )
                    .mappings()
                    .one()
                )
                correlations = await connection.scalar(
                    text(
                        "SELECT count(DISTINCT correlation_id) FROM audit_events "
                        "WHERE action='lesson_access_grant.issued' "
                        "AND metadata->>'issuance_reason'='migration_backfill'"
                    )
                )
        finally:
            await inspector.dispose()
    finally:
        await asyncio.to_thread(command.upgrade, config, "head")

    assert row["issue_operation_id"].version == 4
    assert row["issue_operation_id"] not in {
        accept_operation_id,
        predictable_access_id,
    }
    assert row["actor_type"] == "service"
    assert row["actor_id"] == "lesson-access-migration"
    assert row["request_id"] is None
    assert row["metadata"] == {
        "source": "BOOKING_FREE",
        "policy_version": "1",
        "capability_set_code": "LESSON_SHELL_V1",
        "issuance_reason": "migration_backfill",
    }
    assert correlations == 1
