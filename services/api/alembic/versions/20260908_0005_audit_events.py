"""Add append-only product-security audit events."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260908_0005"
down_revision: str | None = "20260908_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column(
            "event_id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "schema_version",
            sa.SmallInteger(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=128), nullable=False),
        sa.Column("subject_type", sa.String(length=32), nullable=False),
        sa.Column("subject_id", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("result", sa.String(length=16), nullable=False),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.CheckConstraint("schema_version = 1", name="ck_audit_events_schema_version"),
        sa.CheckConstraint(
            "actor_type IN ('account', 'service')",
            name="ck_audit_events_actor_type",
        ),
        sa.CheckConstraint(
            "subject_type IN ('account', 'capability_grant', 'tutor_profile')",
            name="ck_audit_events_subject_type",
        ),
        sa.CheckConstraint(
            "action IN ('tutor_capability.granted', 'tutor_capability.revoked', "
            "'tutor_profile.created')",
            name="ck_audit_events_action",
        ),
        sa.CheckConstraint(
            "result IN ('succeeded', 'denied', 'failed')",
            name="ck_audit_events_result",
        ),
        sa.CheckConstraint(
            "CASE actor_type "
            "WHEN 'account' THEN actor_id ~ "
            "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "
            "WHEN 'service' THEN actor_id = 'tutor-provisioner' ELSE false END",
            name="ck_audit_events_actor_id",
        ),
        sa.CheckConstraint(
            "subject_id ~ "
            "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
            name="ck_audit_events_subject_id",
        ),
        sa.CheckConstraint(
            "request_id IS NULL OR request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'",
            name="ck_audit_events_request_id",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(metadata) = 'object'",
            name="ck_audit_events_metadata_object",
        ),
        sa.CheckConstraint(
            "octet_length(convert_to(metadata::text, 'UTF8')) <= 4096",
            name="ck_audit_events_metadata_size",
        ),
        sa.CheckConstraint(
            "jsonb_array_length(jsonb_path_query_array(metadata, '$.keyvalue()')) <= 16",
            name="ck_audit_events_metadata_key_count",
        ),
        sa.CheckConstraint(
            "NOT jsonb_path_exists(metadata, "
            "'$.* ? (@.type() == \"array\" || @.type() == \"object\")')",
            name="ck_audit_events_metadata_scalar",
        ),
        sa.CheckConstraint(
            "((action IN ('tutor_capability.granted', 'tutor_capability.revoked') AND "
            "metadata - ARRAY['capability_code', 'grant_id', 'reason_category', "
            "'scope_id', 'scope_kind']::text[] = '{}'::jsonb) OR "
            "(action = 'tutor_profile.created' AND "
            "metadata - ARRAY['profile_type', 'reason_category']::text[] = '{}'::jsonb))",
            name="ck_audit_events_metadata_keys",
        ),
        sa.CheckConstraint(
            "(NOT metadata ? 'capability_code' OR ("
            "jsonb_typeof(metadata->'capability_code') = 'string' AND "
            "metadata->>'capability_code' = 'TUTOR_PROFILE_MANAGE_OWN')) AND "
            "(NOT metadata ? 'scope_kind' OR ("
            "jsonb_typeof(metadata->'scope_kind') = 'string' AND "
            "metadata->>'scope_kind' = 'account')) AND "
            "(NOT metadata ? 'profile_type' OR ("
            "jsonb_typeof(metadata->'profile_type') = 'string' AND "
            "metadata->>'profile_type' = 'tutor')) AND "
            "(NOT metadata ? 'reason_category' OR ("
            "jsonb_typeof(metadata->'reason_category') = 'string' AND "
            "metadata->>'reason_category' IN "
            "('profile_created', 'provisioned', 'reconciled', 'revoked', 'test'))) AND "
            "(NOT metadata ? 'grant_id' OR ("
            "jsonb_typeof(metadata->'grant_id') = 'string' AND metadata->>'grant_id' ~ "
            "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND "
            "(NOT metadata ? 'scope_id' OR ("
            "jsonb_typeof(metadata->'scope_id') = 'string' AND metadata->>'scope_id' ~ "
            "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))",
            name="ck_audit_events_metadata_values",
        ),
        sa.PrimaryKeyConstraint("event_id", name="pk_audit_events"),
        sa.UniqueConstraint("operation_id", name="uq_audit_events_operation_id"),
    )
    op.create_index("ix_audit_events_occurred_at", "audit_events", ["occurred_at"])
    op.create_index("ix_audit_events_correlation_id", "audit_events", ["correlation_id"])
    op.create_index(
        "ix_audit_events_subject_occurred_at",
        "audit_events",
        ["subject_type", "subject_id", "occurred_at"],
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE audit_events FROM electro_tutor_runtime")
    op.execute("GRANT SELECT ON TABLE audit_events TO electro_tutor_runtime")
    op.execute(
        "GRANT INSERT (actor_type, actor_id, subject_type, subject_id, action, result, "
        "request_id, correlation_id, operation_id, metadata) "
        "ON TABLE audit_events TO electro_tutor_runtime"
    )


def downgrade() -> None:
    op.drop_table("audit_events")
