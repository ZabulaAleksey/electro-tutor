"""Fast, database-free guards for the independent Alembic desired schema."""

from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects import postgresql

from electro_tutor_api.schema_contract import metadata

PRODUCT_TABLES = {
    "accounts",
    "application_sessions",
    "audit_events",
    "auth_transactions",
    "booking_operations",
    "bookings",
    "capability_grant_operations",
    "capability_grants",
    "external_identities",
    "lesson_access_grants",
    "lesson_session_operations",
    "lesson_sessions",
    "notification_outbox",
    "notifications",
    "student_profiles",
    "tutor_offers",
    "tutor_profiles",
}


def test_desired_head_includes_every_product_table_without_reflecting() -> None:
    assert set(metadata.tables) == PRODUCT_TABLES
    assert "alembic_version" not in metadata.tables
    assert all(table.schema is None for table in metadata.tables.values())


def test_expected_columns_constraints_and_defaults() -> None:
    assert metadata.tables["external_identities"].c.account_id.nullable is False
    assert metadata.tables["lesson_session_operations"].c.audit_operation_id.nullable is True
    assert metadata.tables["lesson_sessions"].c.created_at.server_default is not None
    assert str(metadata.tables["lesson_sessions"].c.created_at.server_default.arg) == (
        "clock_timestamp()"
    )
    assert str(metadata.tables["audit_events"].c.metadata.type) == "JSONB"
    assert {column.name for column in metadata.tables["bookings"].columns} == {
        "id",
        "offer_id",
        "tutor_account_id",
        "student_account_id",
        "status",
        "version",
        "snapshot_version",
        "offer_version",
        "offer_title",
        "starts_at",
        "ends_at",
        "tutor_time_zone",
        "student_time_zone",
        "duration_minutes",
        "minimum_notice_minutes",
        "payment_mode",
        "amount_minor",
        "currency",
        "currency_exponent",
        "cancellation_policy_code",
        "requested_at",
        "accepted_at",
        "declined_at",
        "cancelled_at",
        "cancelled_by_role",
    }


def test_partial_indexes_and_foreign_keys_remain_declared() -> None:
    expected = {
        "uq_capability_grants_active_scope": "revoked_at IS NULL",
        "uq_bookings_offer_open": "status IN ('REQUESTED','ACCEPTED')",
        "uq_lesson_access_grants_revoke_operation": "revoke_operation_id IS NOT NULL",
        "ix_notification_outbox_pending": "delivered_at IS NULL AND attempts < 5",
        "ix_notifications_owner_unread": "read_at IS NULL",
    }
    indexes = {index.name: index for table in metadata.tables.values() for index in table.indexes}
    for name, predicate in expected.items():
        index = indexes[name]
        assert (
            index.dialect_options["postgresql"]["where"]
            .compile(dialect=postgresql.dialect())
            .string
            == predicate
        )
    session = metadata.tables["lesson_session_operations"]
    assert {constraint.name for constraint in session.foreign_key_constraints} == {
        "fk_lesson_session_operations_actor",
        "fk_lesson_session_operations_session",
        "fk_lesson_session_operations_audit",
    }
    assert {
        constraint.name
        for constraint in session.constraints
        if isinstance(constraint, UniqueConstraint)
    } == {"uq_lesson_session_operations_audit"}


def test_notification_schema_keeps_owner_retention_and_dedup_contract() -> None:
    outbox = metadata.tables["notification_outbox"]
    inbox = metadata.tables["notifications"]
    assert {column.name for column in outbox.columns} == {
        "id",
        "recipient_account_id",
        "event_type",
        "booking_id",
        "created_at",
        "next_attempt_at",
        "attempts",
        "last_sqlstate",
        "delivered_at",
    }
    assert {column.name for column in inbox.columns} == {
        "id",
        "recipient_account_id",
        "event_type",
        "booking_id",
        "created_at",
        "expires_at",
        "read_at",
    }
    assert inbox.c.read_at.nullable
    assert not inbox.c.recipient_account_id.nullable
    assert {
        constraint.name
        for constraint in inbox.constraints
        if isinstance(constraint, UniqueConstraint)
    } == {"uq_notifications_business"}
    assert any(
        constraint.name == "ck_notifications_retention"
        and str(constraint.sqltext) == "expires_at = created_at + interval '30 days'"
        for constraint in inbox.constraints
    )
