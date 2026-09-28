"""Independent desired head-0013 table metadata for the Alembic drift gate.

This is tooling-only SQLAlchemy Core metadata, not an ORM or a runtime query model.
Migrations remain the immutable upgrade history. A drift check must never derive
its desired state from reflection of the database it is checking.
"""

# Exact PostgreSQL CHECK expressions are deliberately kept contiguous.
# ruff: noqa: E501

from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

metadata = sa.MetaData()
UTC = sa.DateTime(timezone=True)
NOW = sa.text("CURRENT_TIMESTAMP")
CLOCK = sa.text("clock_timestamp()")
UUID_DEFAULT = sa.text("gen_random_uuid()")


def col(
    name: str,
    kind: sa.types.TypeEngine[Any],
    *,
    null: bool = False,
    default: str | sa.sql.elements.TextClause | None = None,
) -> sa.Column[Any]:
    return sa.Column(name, kind, nullable=null, server_default=default)


def pk(table: str, *columns: str) -> sa.PrimaryKeyConstraint:
    return sa.PrimaryKeyConstraint(*columns, name=f"pk_{table}")


def fk(name: str, local: str, remote: str, *, deferrable: bool = False) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [local],
        [remote],
        name=name,
        ondelete="RESTRICT" if name != "fk_sessions_identity" else "CASCADE",
        deferrable=True if deferrable else None,
        initially="DEFERRED" if deferrable else None,
    )


def uq(name: str, *columns: str) -> sa.UniqueConstraint:
    return sa.UniqueConstraint(*columns, name=name)


def ck(name: str, expression: str) -> sa.CheckConstraint:
    return sa.CheckConstraint(expression, name=name)


external_identities = sa.Table(
    "external_identities",
    metadata,
    col("id", sa.Uuid()),
    col("issuer", sa.Text()),
    col("subject", sa.Text()),
    col("email", sa.Text(), null=True),
    col("created_at", UTC, default=NOW),
    col("updated_at", UTC, default=NOW),
    col("account_id", sa.Uuid()),
    pk("external_identities", "id"),
    uq("uq_external_identities_issuer_subject", "issuer", "subject"),
    fk("fk_external_identities_account", "account_id", "accounts.id"),
)
sa.Index("ix_external_identities_account_id", external_identities.c.account_id)

auth_transactions = sa.Table(
    "auth_transactions",
    metadata,
    col("id", sa.Uuid()),
    col("state_digest", sa.String(64)),
    col("pkce_verifier", sa.Text()),
    col("nonce", sa.Text()),
    col("return_to", sa.Text()),
    col("created_at", UTC, default=NOW),
    col("expires_at", UTC),
    pk("auth_transactions", "id"),
    uq("uq_auth_transactions_state_digest", "state_digest"),
)
sa.Index("ix_auth_transactions_expires_at", auth_transactions.c.expires_at)

application_sessions = sa.Table(
    "application_sessions",
    metadata,
    col("token_digest", sa.String(64)),
    col("identity_id", sa.Uuid()),
    col("created_at", UTC, default=NOW),
    col("expires_at", UTC),
    pk("application_sessions", "token_digest"),
    fk("fk_sessions_identity", "identity_id", "external_identities.id"),
)
sa.Index("ix_application_sessions_identity_id", application_sessions.c.identity_id)
sa.Index("ix_application_sessions_expires_at", application_sessions.c.expires_at)

accounts = sa.Table(
    "accounts",
    metadata,
    col("id", sa.Uuid(), default=UUID_DEFAULT),
    col("created_at", UTC, default=NOW),
    pk("accounts", "id"),
)

audit_events = sa.Table(
    "audit_events",
    metadata,
    col("event_id", sa.Uuid(), default=UUID_DEFAULT),
    col("schema_version", sa.SmallInteger(), default="1"),
    col("occurred_at", UTC, default=NOW),
    col("actor_type", sa.String(32)),
    col("actor_id", sa.String(128)),
    col("subject_type", sa.String(32)),
    col("subject_id", sa.String(128)),
    col("action", sa.String(64)),
    col("result", sa.String(16)),
    col("request_id", sa.String(128), null=True),
    col("correlation_id", sa.Uuid()),
    col("operation_id", sa.Uuid()),
    col("metadata", JSONB(), default=sa.text("'{}'::jsonb")),
    pk("audit_events", "event_id"),
    uq("uq_audit_events_operation_id", "operation_id"),
    ck("ck_audit_events_schema_version", "schema_version = 1"),
    ck("ck_audit_events_actor_type", "actor_type IN ('account', 'service')"),
    ck(
        "ck_audit_events_subject_type",
        "subject_type IN ('account','capability_grant','tutor_profile','tutor_offer','booking',"
        "'lesson_access_grant','lesson_session')",
    ),
    ck(
        "ck_audit_events_action",
        "action IN ('tutor_capability.granted','tutor_capability.revoked','tutor_profile.created',"
        "'tutor_offer.created','tutor_offer.revised','tutor_offer.published',"
        "'tutor_offer.retired','booking.requested','booking.accepted','booking.declined',"
        "'booking.cancelled','lesson_access_grant.issued','lesson_access_grant.revoked',"
        "'lesson_session.created','lesson_session.started','lesson_session.ended',"
        "'lesson_session.cancelled')",
    ),
    ck("ck_audit_events_result", "result IN ('succeeded', 'denied', 'failed')"),
    ck(
        "ck_audit_events_actor_id",
        "CASE actor_type WHEN 'account' THEN actor_id ~ "
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "
        "WHEN 'service' THEN actor_id IN ('tutor-provisioner','lesson-access-migration') "
        "ELSE false END",
    ),
    ck(
        "ck_audit_events_subject_id",
        "subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
    ),
    ck(
        "ck_audit_events_request_id",
        "request_id IS NULL OR request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'",
    ),
    ck("ck_audit_events_metadata_object", "jsonb_typeof(metadata) = 'object'"),
    ck("ck_audit_events_metadata_size", "octet_length(convert_to(metadata::text, 'UTF8')) <= 4096"),
    ck(
        "ck_audit_events_metadata_key_count",
        "jsonb_array_length(jsonb_path_query_array(metadata, '$.keyvalue()')) <= 16",
    ),
    ck(
        "ck_audit_events_metadata_scalar",
        'NOT jsonb_path_exists(metadata, \'$.* ? (@.type() == "array" || @.type() == "object")\')',
    ),
    ck(
        "ck_audit_events_metadata_keys",
        "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND "
        "metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[]='{}'::jsonb) "
        "OR (action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[]='{}'::jsonb) "
        "OR (action IN ('tutor_offer.created','tutor_offer.revised','tutor_offer.published',"
        "'tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled') "
        "AND metadata - ARRAY['operation_action','result_version']::text[]='{}'::jsonb) "
        "OR (action='lesson_access_grant.issued' AND "
        "metadata - ARRAY['source','policy_version','capability_set_code','issuance_reason']::text[]='{}'::jsonb) "
        "OR (action='lesson_access_grant.revoked' AND "
        "metadata - ARRAY['source','policy_version','capability_set_code','revoke_reason']::text[]='{}'::jsonb) "
        "OR (action IN ('lesson_session.created','lesson_session.started','lesson_session.ended',"
        "'lesson_session.cancelled') AND "
        "metadata - ARRAY['transition_code','result_status']::text[]='{}'::jsonb))",
    ),
    ck(
        "ck_audit_events_metadata_values",
        "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND metadata->>'capability_code' IN ('TUTOR_PROFILE_MANAGE_OWN','TUTOR_BOOKING_MANAGE_OWN'))) AND (NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND (NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND (NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND (NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'operation_action' OR (jsonb_typeof(metadata->'operation_action')='string' AND metadata->>'operation_action' IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel'))) AND (NOT metadata ? 'result_version' OR (jsonb_typeof(metadata->'result_version')='string' AND metadata->>'result_version' ~ '^[1-9][0-9]*$')) AND (NOT metadata ? 'source' OR (jsonb_typeof(metadata->'source')='string' AND metadata->>'source' IN ('BOOKING_FREE','BOOKING_EXTERNAL'))) AND (NOT metadata ? 'policy_version' OR (jsonb_typeof(metadata->'policy_version')='string' AND metadata->>'policy_version'='1')) AND (NOT metadata ? 'capability_set_code' OR (jsonb_typeof(metadata->'capability_set_code')='string' AND metadata->>'capability_set_code'='LESSON_SHELL_V1')) AND (NOT metadata ? 'issuance_reason' OR (jsonb_typeof(metadata->'issuance_reason')='string' AND metadata->>'issuance_reason' IN ('booking_accept','migration_backfill'))) AND (NOT metadata ? 'revoke_reason' OR (jsonb_typeof(metadata->'revoke_reason')='string' AND metadata->>'revoke_reason'='BOOKING_CANCELLED')) AND (NOT metadata ? 'transition_code' OR (jsonb_typeof(metadata->'transition_code')='string' AND metadata->>'transition_code' IN ('create','start','end','cancel'))) AND (NOT metadata ? 'result_status' OR (jsonb_typeof(metadata->'result_status')='string' AND metadata->>'result_status' IN ('READY','ACTIVE','ENDED','CANCELLED'))) AND (actor_type<>'service' OR actor_id<>'lesson-access-migration' OR (action='lesson_access_grant.issued' AND metadata->>'issuance_reason'='migration_backfill' AND request_id IS NULL)) AND (action<>'lesson_access_grant.issued' OR (subject_type='lesson_access_grant' AND metadata ?& ARRAY['source','policy_version','capability_set_code','issuance_reason'] AND ((metadata->>'issuance_reason'='booking_accept' AND actor_type='account') OR (metadata->>'issuance_reason'='migration_backfill' AND actor_type='service' AND actor_id='lesson-access-migration' AND request_id IS NULL)))) AND (action<>'lesson_access_grant.revoked' OR (subject_type='lesson_access_grant' AND actor_type='account' AND metadata ?& ARRAY['source','policy_version','capability_set_code','revoke_reason'])) AND (action NOT LIKE 'lesson_session.%' OR (subject_type='lesson_session' AND actor_type='account' AND metadata ?& ARRAY['transition_code','result_status']))",
    ),
)
sa.Index("ix_audit_events_occurred_at", audit_events.c.occurred_at)
sa.Index("ix_audit_events_correlation_id", audit_events.c.correlation_id)
sa.Index(
    "ix_audit_events_subject_occurred_at",
    audit_events.c.subject_type,
    audit_events.c.subject_id,
    audit_events.c.occurred_at,
)

capability_grants = sa.Table(
    "capability_grants",
    metadata,
    col("id", sa.Uuid()),
    col("subject_account_id", sa.Uuid()),
    col("capability_code", sa.String(64)),
    col("scope_kind", sa.String(16)),
    col("scope_id", sa.Uuid()),
    col("issued_at", UTC, default=NOW),
    col("issued_by_actor_type", sa.String(16)),
    col("issued_by_actor_id", sa.String(64)),
    col("issue_operation_id", sa.Uuid()),
    col("revoked_at", UTC, null=True),
    col("revoked_by_actor_type", sa.String(16), null=True),
    col("revoked_by_actor_id", sa.String(64), null=True),
    col("revoke_operation_id", sa.Uuid(), null=True),
    pk("capability_grants", "id"),
    uq("uq_capability_grants_issue_operation", "issue_operation_id"),
    uq("uq_capability_grants_revoke_operation", "revoke_operation_id"),
    fk("fk_capability_grants_subject_account", "subject_account_id", "accounts.id"),
    fk("fk_capability_grants_scope_account", "scope_id", "accounts.id"),
    ck(
        "ck_capability_grants_code",
        "capability_code IN ('TUTOR_PROFILE_MANAGE_OWN', 'TUTOR_BOOKING_MANAGE_OWN')",
    ),
    ck("ck_capability_grants_scope_kind", "scope_kind = 'account'"),
    ck("ck_capability_grants_account_scope", "scope_id = subject_account_id"),
    ck(
        "ck_capability_grants_issuer",
        "issued_by_actor_type = 'service' AND issued_by_actor_id = 'tutor-provisioner'",
    ),
    ck(
        "ck_capability_grants_revoke_tuple",
        "(revoked_at IS NULL AND revoked_by_actor_type IS NULL AND "
        "revoked_by_actor_id IS NULL AND revoke_operation_id IS NULL) OR "
        "(revoked_at IS NOT NULL AND revoked_by_actor_type = 'service' "
        "AND revoked_by_actor_id = 'tutor-provisioner' AND revoke_operation_id IS NOT NULL)",
    ),
    ck("ck_capability_grants_revoke_time", "revoked_at IS NULL OR revoked_at >= issued_at"),
)
sa.Index(
    "uq_capability_grants_active_scope",
    capability_grants.c.subject_account_id,
    capability_grants.c.capability_code,
    capability_grants.c.scope_kind,
    capability_grants.c.scope_id,
    unique=True,
    postgresql_where=sa.text("revoked_at IS NULL"),
)
sa.Index(
    "ix_capability_grants_evaluation",
    capability_grants.c.subject_account_id,
    capability_grants.c.capability_code,
    postgresql_where=sa.text("revoked_at IS NULL"),
)

capability_grant_operations = sa.Table(
    "capability_grant_operations",
    metadata,
    col("operation_id", sa.Uuid()),
    col("operation_kind", sa.String(16)),
    col("intent_digest", sa.String(64)),
    col("grant_id", sa.Uuid()),
    col("completed_at", UTC, default=NOW),
    pk("capability_grant_operations", "operation_id"),
    fk("fk_capability_grant_operations_grant", "grant_id", "capability_grants.id", deferrable=True),
    ck("ck_capability_grant_operations_kind", "operation_kind IN ('issue', 'revoke')"),
    ck("ck_capability_grant_operations_digest", "intent_digest ~ '^[0-9a-f]{64}$'"),
)


def profile(name: str) -> sa.Table:
    return sa.Table(
        name,
        metadata,
        col("account_id", sa.Uuid()),
        col("display_name", sa.String(80)),
        col("created_at", UTC, default=NOW),
        col("updated_at", UTC, default=NOW),
        pk(name, "account_id"),
        fk(f"fk_{name}_account", "account_id", "accounts.id"),
        ck(f"ck_{name}_display_name_length", "char_length(display_name) BETWEEN 1 AND 80"),
        ck(f"ck_{name}_display_name_control", "display_name !~ '[[:cntrl:]]'"),
        ck(
            f"ck_{name}_display_name_normalized",
            "display_name = regexp_replace(btrim(display_name), '[[:space:]]+', ' ', 'g')",
        ),
        ck(f"ck_{name}_timestamp_order", "updated_at >= created_at"),
        comment=f"Private {'Student' if name == 'student_profiles' else 'Tutor'} profile; "
        "existence never grants authority.",
    )


student_profiles = profile("student_profiles")
tutor_profiles = profile("tutor_profiles")

tutor_offers = sa.Table(
    "tutor_offers",
    metadata,
    col("id", sa.Uuid()),
    col("tutor_account_id", sa.Uuid()),
    col("status", sa.String(16), default="DRAFT"),
    col("version", sa.Integer(), default="1"),
    col("title", sa.String(120)),
    col("starts_at", UTC),
    col("ends_at", UTC),
    col("time_zone", sa.String(64)),
    col("duration_minutes", sa.Integer()),
    col("minimum_notice_minutes", sa.Integer()),
    col("payment_mode", sa.String(16)),
    col("amount_minor", sa.BigInteger()),
    col("currency", sa.String(3), null=True),
    col("currency_exponent", sa.SmallInteger(), null=True),
    col("created_at", UTC, default=NOW),
    col("updated_at", UTC, default=NOW),
    col("published_at", UTC, null=True),
    col("retired_at", UTC, null=True),
    pk("tutor_offers", "id"),
    fk("fk_tutor_offers_tutor_account", "tutor_account_id", "accounts.id"),
    ck("ck_tutor_offers_status", "status IN ('DRAFT','ACTIVE','RETIRED')"),
    ck("ck_tutor_offers_version", "version >= 1"),
    ck("ck_tutor_offers_title", "char_length(title) BETWEEN 1 AND 120 AND title !~ '[[:cntrl:]]'"),
    ck("ck_tutor_offers_interval", "starts_at < ends_at"),
    ck(
        "ck_tutor_offers_duration",
        "duration_minutes BETWEEN 15 AND 480 AND "
        "duration_minutes % 15 = 0 AND ends_at = starts_at + make_interval(mins => duration_minutes)",
    ),
    ck("ck_tutor_offers_notice", "minimum_notice_minutes BETWEEN 0 AND 10080"),
    ck(
        "ck_tutor_offers_time_zone",
        "char_length(time_zone) BETWEEN 1 AND 64 AND time_zone !~ '[[:cntrl:]]'",
    ),
    ck(
        "ck_tutor_offers_money",
        "(payment_mode='FREE' AND amount_minor=0 "
        "AND currency IS NULL AND currency_exponent IS NULL) OR "
        "(payment_mode='EXTERNAL' AND amount_minor BETWEEN 1 AND 100000000 "
        "AND currency IN ('UAH','EUR','USD') AND currency_exponent=2)",
    ),
    ck(
        "ck_tutor_offers_lifecycle",
        "(status='DRAFT' AND published_at IS NULL "
        "AND retired_at IS NULL) OR (status='ACTIVE' AND published_at IS NOT NULL "
        "AND retired_at IS NULL) OR (status='RETIRED' AND retired_at IS NOT NULL)",
    ),
    ck(
        "ck_tutor_offers_timestamps",
        "updated_at >= created_at AND "
        "(published_at IS NULL OR published_at >= created_at) AND "
        "(retired_at IS NULL OR retired_at >= created_at)",
    ),
)
sa.Index(
    "ix_tutor_offers_owner_updated", tutor_offers.c.tutor_account_id, tutor_offers.c.updated_at
)
sa.Index(
    "ix_tutor_offers_active_start",
    tutor_offers.c.starts_at,
    postgresql_where=sa.text("status='ACTIVE'"),
)

bookings = sa.Table(
    "bookings",
    metadata,
    col("id", sa.Uuid()),
    col("offer_id", sa.Uuid()),
    col("tutor_account_id", sa.Uuid()),
    col("student_account_id", sa.Uuid()),
    col("status", sa.String(16), default="REQUESTED"),
    col("version", sa.Integer(), default="1"),
    col("snapshot_version", sa.SmallInteger(), default="1"),
    col("offer_version", sa.Integer()),
    col("offer_title", sa.String(120)),
    col("starts_at", UTC),
    col("ends_at", UTC),
    col("tutor_time_zone", sa.String(64)),
    col("student_time_zone", sa.String(64)),
    col("duration_minutes", sa.Integer()),
    col("minimum_notice_minutes", sa.Integer()),
    col("payment_mode", sa.String(16)),
    col("amount_minor", sa.BigInteger()),
    col("currency", sa.String(3), null=True),
    col("currency_exponent", sa.SmallInteger(), null=True),
    col("cancellation_policy_code", sa.String(64), default="participant_before_start_v1"),
    col("requested_at", UTC, default=NOW),
    col("accepted_at", UTC, null=True),
    col("declined_at", UTC, null=True),
    col("cancelled_at", UTC, null=True),
    col("cancelled_by_role", sa.String(16), null=True),
    pk("bookings", "id"),
    fk("fk_bookings_offer", "offer_id", "tutor_offers.id"),
    fk("fk_bookings_tutor_account", "tutor_account_id", "accounts.id"),
    fk("fk_bookings_student_account", "student_account_id", "accounts.id"),
    ck("ck_bookings_distinct_participants", "tutor_account_id <> student_account_id"),
    ck("ck_bookings_status", "status IN ('REQUESTED','ACCEPTED','DECLINED','CANCELLED')"),
    ck("ck_bookings_versions", "version >= 1 AND snapshot_version=1 AND offer_version >= 1"),
    ck(
        "ck_bookings_interval",
        "starts_at < ends_at AND duration_minutes BETWEEN 15 AND 480 "
        "AND duration_minutes % 15=0 AND ends_at=starts_at+make_interval(mins=>duration_minutes)",
    ),
    ck("ck_bookings_notice", "minimum_notice_minutes BETWEEN 0 AND 10080"),
    ck(
        "ck_bookings_title",
        "char_length(offer_title) BETWEEN 1 AND 120 AND offer_title !~ '[[:cntrl:]]'",
    ),
    ck(
        "ck_bookings_time_zones",
        "char_length(tutor_time_zone) BETWEEN 1 AND 64 "
        "AND char_length(student_time_zone) BETWEEN 1 AND 64",
    ),
    ck(
        "ck_bookings_money",
        "(payment_mode='FREE' AND amount_minor=0 AND currency IS NULL "
        "AND currency_exponent IS NULL) OR (payment_mode='EXTERNAL' AND amount_minor BETWEEN "
        "1 AND 100000000 AND currency IN ('UAH','EUR','USD') AND currency_exponent=2)",
    ),
    ck("ck_bookings_cancel_policy", "cancellation_policy_code='participant_before_start_v1'"),
    ck(
        "ck_bookings_lifecycle",
        "(status='REQUESTED' AND accepted_at IS NULL "
        "AND declined_at IS NULL AND cancelled_at IS NULL AND cancelled_by_role IS NULL) "
        "OR (status='ACCEPTED' AND accepted_at IS NOT NULL AND declined_at IS NULL "
        "AND cancelled_at IS NULL AND cancelled_by_role IS NULL) "
        "OR (status='DECLINED' AND accepted_at IS NULL AND declined_at IS NOT NULL "
        "AND cancelled_at IS NULL AND cancelled_by_role IS NULL) "
        "OR (status='CANCELLED' AND declined_at IS NULL AND cancelled_at IS NOT NULL "
        "AND cancelled_by_role IN ('student','tutor'))",
    ),
)
sa.Index(
    "uq_bookings_offer_open",
    bookings.c.offer_id,
    unique=True,
    postgresql_where=sa.text("status IN ('REQUESTED','ACCEPTED')"),
)
sa.Index("ix_bookings_tutor_list", bookings.c.tutor_account_id, bookings.c.requested_at)
sa.Index("ix_bookings_student_list", bookings.c.student_account_id, bookings.c.requested_at)
sa.Index(
    "ix_bookings_tutor_accepted_overlap",
    bookings.c.tutor_account_id,
    bookings.c.starts_at,
    bookings.c.ends_at,
    postgresql_where=sa.text("status='ACCEPTED'"),
)
sa.Index(
    "ix_bookings_student_accepted_overlap",
    bookings.c.student_account_id,
    bookings.c.starts_at,
    bookings.c.ends_at,
    postgresql_where=sa.text("status='ACCEPTED'"),
)

booking_operations = sa.Table(
    "booking_operations",
    metadata,
    col("operation_id", sa.Uuid()),
    col("actor_account_id", sa.Uuid()),
    col("action", sa.String(32)),
    col("target_type", sa.String(16)),
    col("target_id", sa.Uuid()),
    col("intent_digest", sa.String(64)),
    col("result_version", sa.Integer()),
    col("result_payload", JSONB()),
    col("completed_at", UTC, default=NOW),
    pk("booking_operations", "operation_id"),
    fk("fk_booking_operations_actor", "actor_account_id", "accounts.id"),
    ck(
        "ck_booking_operations_action",
        "action IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish',"
        "'tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel')",
    ),
    ck(
        "ck_booking_operations_target",
        "(target_type='tutor_offer' AND action LIKE 'tutor_offer.%') "
        "OR (target_type='booking' AND action LIKE 'booking.%')",
    ),
    ck("ck_booking_operations_digest", "intent_digest ~ '^[0-9a-f]{64}$'"),
    ck("ck_booking_operations_result_version", "result_version >= 1"),
    ck(
        "ck_booking_operations_result_payload",
        "jsonb_typeof(result_payload)='object' AND "
        "octet_length(convert_to(result_payload::text,'UTF8')) <= 16384 "
        "AND NOT result_payload ?| ARRAY['tutor_account_id','student_account_id']",
    ),
)
sa.Index(
    "ix_booking_operations_target",
    booking_operations.c.target_type,
    booking_operations.c.target_id,
    booking_operations.c.completed_at,
)

lesson_access_grants = sa.Table(
    "lesson_access_grants",
    metadata,
    col("id", sa.Uuid(), default=UUID_DEFAULT),
    col("booking_id", sa.Uuid()),
    col("source", sa.String(32)),
    col("policy_version", sa.SmallInteger(), default="1"),
    col("capability_set_code", sa.String(32), default="LESSON_SHELL_V1"),
    col("valid_from", UTC),
    col("valid_until", UTC),
    col("issued_at", UTC, default=NOW),
    col("issue_operation_id", sa.Uuid()),
    col("revoked_at", UTC, null=True),
    col("revoked_by_actor_type", sa.String(16), null=True),
    col("revoked_by_actor_id", sa.String(64), null=True),
    col("revoke_operation_id", sa.Uuid(), null=True),
    col("revoke_reason", sa.String(32), null=True),
    pk("lesson_access_grants", "id"),
    fk("fk_lesson_access_grants_booking", "booking_id", "bookings.id"),
    uq("uq_lesson_access_grants_booking", "booking_id"),
    uq("uq_lesson_access_grants_issue_operation", "issue_operation_id"),
    ck("ck_lesson_access_grants_source", "source IN ('BOOKING_FREE','BOOKING_EXTERNAL')"),
    ck(
        "ck_lesson_access_grants_policy",
        "policy_version=1 AND capability_set_code='LESSON_SHELL_V1'",
    ),
    ck("ck_lesson_access_grants_validity", "valid_from < valid_until"),
    ck(
        "ck_lesson_access_grants_revoke_tuple",
        "(revoked_at IS NULL AND revoked_by_actor_type IS NULL "
        "AND revoked_by_actor_id IS NULL AND revoke_operation_id IS NULL "
        "AND revoke_reason IS NULL) OR "
        "(revoked_at IS NOT NULL AND revoked_at >= issued_at "
        "AND revoked_by_actor_type='account' "
        "AND revoked_by_actor_id ~ "
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "
        "AND revoke_operation_id IS NOT NULL AND revoke_reason='BOOKING_CANCELLED')",
    ),
)
sa.Index(
    "uq_lesson_access_grants_revoke_operation",
    lesson_access_grants.c.revoke_operation_id,
    unique=True,
    postgresql_where=sa.text("revoke_operation_id IS NOT NULL"),
)
sa.Index(
    "ix_lesson_access_grants_active_until",
    lesson_access_grants.c.valid_until,
    postgresql_where=sa.text("revoked_at IS NULL"),
)

lesson_sessions = sa.Table(
    "lesson_sessions",
    metadata,
    col("id", sa.Uuid(), default=UUID_DEFAULT),
    col("booking_id", sa.Uuid()),
    col("status", sa.String(16), default="READY"),
    col("version", sa.Integer(), default="1"),
    col("created_at", UTC, default=CLOCK),
    col("started_at", UTC, null=True),
    col("ended_at", UTC, null=True),
    col("cancelled_at", UTC, null=True),
    pk("lesson_sessions", "id"),
    fk("fk_lesson_sessions_booking", "booking_id", "bookings.id"),
    uq("uq_lesson_sessions_booking", "booking_id"),
    ck("ck_lesson_sessions_version", "version >= 1"),
    ck(
        "ck_lesson_sessions_state",
        "(status='READY' AND started_at IS NULL "
        "AND ended_at IS NULL AND cancelled_at IS NULL) OR "
        "(status='ACTIVE' AND started_at IS NOT NULL AND ended_at IS NULL "
        "AND cancelled_at IS NULL) OR "
        "(status='ENDED' AND started_at IS NOT NULL AND ended_at IS NOT NULL "
        "AND ended_at >= started_at AND cancelled_at IS NULL) OR "
        "(status='CANCELLED' AND started_at IS NULL AND ended_at IS NULL "
        "AND cancelled_at IS NOT NULL)",
    ),
)

lesson_session_operations = sa.Table(
    "lesson_session_operations",
    metadata,
    col("operation_id", sa.Uuid()),
    col("actor_account_id", sa.Uuid()),
    col("action", sa.String(32)),
    col("booking_id", sa.Uuid()),
    col("session_id", sa.Uuid()),
    col("intent_digest", sa.String(64)),
    col("result_payload", JSONB()),
    col("audit_operation_id", sa.Uuid(), null=True),
    col("completed_at", UTC, default=CLOCK),
    pk("lesson_session_operations", "operation_id"),
    fk("fk_lesson_session_operations_actor", "actor_account_id", "accounts.id"),
    fk("fk_lesson_session_operations_session", "session_id", "lesson_sessions.id"),
    fk("fk_lesson_session_operations_audit", "audit_operation_id", "audit_events.operation_id"),
    uq("uq_lesson_session_operations_audit", "audit_operation_id"),
    ck("ck_lesson_session_operations_action", "action IN ('create','start','end')"),
    ck(
        "ck_lesson_session_operations_audit_presence",
        "action='create' OR audit_operation_id IS NOT NULL",
    ),
    ck("ck_lesson_session_operations_digest", "intent_digest ~ '^[0-9a-f]{64}$'"),
)

notification_outbox = sa.Table(
    "notification_outbox",
    metadata,
    col("id", sa.Uuid(), default=UUID_DEFAULT),
    col("recipient_account_id", sa.Uuid()),
    col("event_type", sa.String(32)),
    col("booking_id", sa.Uuid()),
    col("created_at", UTC, default=CLOCK),
    col("next_attempt_at", UTC, default=CLOCK),
    col("attempts", sa.SmallInteger(), default="0"),
    col("last_sqlstate", sa.String(5), null=True),
    col("delivered_at", UTC, null=True),
    pk("notification_outbox", "id"),
    fk("fk_notification_outbox_recipient", "recipient_account_id", "accounts.id"),
    fk("fk_notification_outbox_booking", "booking_id", "bookings.id"),
    uq("uq_notification_outbox_business", "event_type", "booking_id", "recipient_account_id"),
    ck("ck_notification_outbox_event_type", "event_type='booking.accepted'"),
    ck("ck_notification_outbox_attempts", "attempts BETWEEN 0 AND 5"),
    ck(
        "ck_notification_outbox_sqlstate",
        "last_sqlstate IS NULL OR last_sqlstate ~ '^[0-9A-Z]{5}$'",
    ),
    ck("ck_notification_outbox_delivery", "delivered_at IS NULL OR delivered_at >= created_at"),
)
sa.Index(
    "ix_notification_outbox_pending",
    notification_outbox.c.next_attempt_at,
    notification_outbox.c.id,
    postgresql_where=sa.text("delivered_at IS NULL AND attempts < 5"),
)
sa.Index("ix_notification_outbox_retention", notification_outbox.c.created_at)

notifications = sa.Table(
    "notifications",
    metadata,
    col("id", sa.Uuid(), default=UUID_DEFAULT),
    col("recipient_account_id", sa.Uuid()),
    col("event_type", sa.String(32)),
    col("booking_id", sa.Uuid()),
    col("created_at", UTC),
    col("expires_at", UTC),
    col("read_at", UTC, null=True),
    pk("notifications", "id"),
    fk("fk_notifications_recipient", "recipient_account_id", "accounts.id"),
    fk("fk_notifications_booking", "booking_id", "bookings.id"),
    uq("uq_notifications_business", "event_type", "booking_id", "recipient_account_id"),
    ck("ck_notifications_event_type", "event_type='booking.accepted'"),
    ck("ck_notifications_retention", "expires_at = created_at + interval '30 days'"),
    ck("ck_notifications_read", "read_at IS NULL OR read_at >= created_at"),
)
sa.Index(
    "ix_notifications_owner_inbox",
    notifications.c.recipient_account_id,
    sa.text("created_at DESC"),
    sa.text("id DESC"),
)
sa.Index(
    "ix_notifications_owner_unread",
    notifications.c.recipient_account_id,
    notifications.c.expires_at,
    postgresql_where=sa.text("read_at IS NULL"),
)
sa.Index("ix_notifications_expiry", notifications.c.expires_at)
