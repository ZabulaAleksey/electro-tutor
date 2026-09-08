"""Add trusted account-scoped capability grants and operation ledger."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260909_0007"
down_revision: str | None = "20260909_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "capability_grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("subject_account_id", sa.Uuid(), nullable=False),
        sa.Column("capability_code", sa.String(length=64), nullable=False),
        sa.Column("scope_kind", sa.String(length=16), nullable=False),
        sa.Column("scope_id", sa.Uuid(), nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("issued_by_actor_type", sa.String(length=16), nullable=False),
        sa.Column("issued_by_actor_id", sa.String(length=64), nullable=False),
        sa.Column("issue_operation_id", sa.Uuid(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_actor_type", sa.String(length=16), nullable=True),
        sa.Column("revoked_by_actor_id", sa.String(length=64), nullable=True),
        sa.Column("revoke_operation_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "capability_code = 'TUTOR_PROFILE_MANAGE_OWN'",
            name="ck_capability_grants_code",
        ),
        sa.CheckConstraint("scope_kind = 'account'", name="ck_capability_grants_scope_kind"),
        sa.CheckConstraint(
            "scope_id = subject_account_id",
            name="ck_capability_grants_account_scope",
        ),
        sa.CheckConstraint(
            "issued_by_actor_type = 'service' AND issued_by_actor_id = 'tutor-provisioner'",
            name="ck_capability_grants_issuer",
        ),
        sa.CheckConstraint(
            "(revoked_at IS NULL AND revoked_by_actor_type IS NULL "
            "AND revoked_by_actor_id IS NULL AND revoke_operation_id IS NULL) OR "
            "(revoked_at IS NOT NULL AND revoked_by_actor_type = 'service' "
            "AND revoked_by_actor_id = 'tutor-provisioner' "
            "AND revoke_operation_id IS NOT NULL)",
            name="ck_capability_grants_revoke_tuple",
        ),
        sa.CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= issued_at",
            name="ck_capability_grants_revoke_time",
        ),
        sa.ForeignKeyConstraint(
            ["subject_account_id"],
            ["accounts.id"],
            name="fk_capability_grants_subject_account",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scope_id"],
            ["accounts.id"],
            name="fk_capability_grants_scope_account",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_capability_grants"),
        sa.UniqueConstraint("issue_operation_id", name="uq_capability_grants_issue_operation"),
        sa.UniqueConstraint("revoke_operation_id", name="uq_capability_grants_revoke_operation"),
    )
    op.create_index(
        "uq_capability_grants_active_scope",
        "capability_grants",
        ["subject_account_id", "capability_code", "scope_kind", "scope_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "ix_capability_grants_evaluation",
        "capability_grants",
        ["subject_account_id", "capability_code"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "capability_grant_operations",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("operation_kind", sa.String(length=16), nullable=False),
        sa.Column("intent_digest", sa.String(length=64), nullable=False),
        sa.Column("grant_id", sa.Uuid(), nullable=False),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "operation_kind IN ('issue', 'revoke')",
            name="ck_capability_grant_operations_kind",
        ),
        sa.CheckConstraint(
            "intent_digest ~ '^[0-9a-f]{64}$'",
            name="ck_capability_grant_operations_digest",
        ),
        sa.ForeignKeyConstraint(
            ["grant_id"],
            ["capability_grants.id"],
            name="fk_capability_grant_operations_grant",
            ondelete="RESTRICT",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("operation_id", name="pk_capability_grant_operations"),
    )

    op.execute(
        """
        CREATE FUNCTION public.prevent_capability_grant_rewrite() RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF OLD.revoked_at IS NOT NULL THEN
                RAISE EXCEPTION 'revoked capability grants are immutable';
            END IF;
            IF NEW.revoked_at IS NULL THEN
                RAISE EXCEPTION 'capability grant update must be a revoke';
            END IF;
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER capability_grants_one_way_revoke
        BEFORE UPDATE ON capability_grants
        FOR EACH ROW EXECUTE FUNCTION public.prevent_capability_grant_rewrite()
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.lock_active_capability_grant(
            p_account_id uuid,
            p_capability_code text
        ) RETURNS boolean
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF p_capability_code <> 'TUTOR_PROFILE_MANAGE_OWN' THEN
                RETURN false;
            END IF;
            PERFORM 1
            FROM public.capability_grants
            WHERE subject_account_id = p_account_id
              AND capability_code = p_capability_code
              AND scope_kind = 'account'
              AND scope_id = p_account_id
              AND revoked_at IS NULL
            FOR UPDATE;
            RETURN FOUND;
        END;
        $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION "
        "public.lock_active_capability_grant(uuid, text) FROM PUBLIC"
    )

    op.execute("REVOKE ALL PRIVILEGES ON TABLE capability_grants FROM PUBLIC")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE capability_grants FROM electro_tutor_runtime")
    op.execute("GRANT SELECT ON TABLE capability_grants TO electro_tutor_runtime")
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.lock_active_capability_grant(uuid, text) "
        "TO electro_tutor_runtime"
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE capability_grants FROM electro_tutor_provisioner")
    op.execute("GRANT SELECT ON TABLE accounts TO electro_tutor_provisioner")
    op.execute("GRANT SELECT ON TABLE capability_grants TO electro_tutor_provisioner")
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.lock_active_capability_grant(uuid, text) "
        "TO electro_tutor_provisioner"
    )
    op.execute(
        "GRANT INSERT (id, subject_account_id, capability_code, scope_kind, scope_id, "
        "issued_by_actor_type, issued_by_actor_id, issue_operation_id) "
        "ON TABLE capability_grants TO electro_tutor_provisioner"
    )
    op.execute(
        "GRANT UPDATE (revoked_at, revoked_by_actor_type, revoked_by_actor_id, "
        "revoke_operation_id) ON TABLE capability_grants TO electro_tutor_provisioner"
    )
    op.execute("REVOKE ALL PRIVILEGES ON TABLE capability_grant_operations FROM PUBLIC")
    op.execute(
        "REVOKE ALL PRIVILEGES ON TABLE capability_grant_operations FROM electro_tutor_runtime"
    )
    op.execute("GRANT SELECT ON TABLE capability_grant_operations TO electro_tutor_provisioner")
    op.execute(
        "GRANT INSERT (operation_id, operation_kind, intent_digest, grant_id) "
        "ON TABLE capability_grant_operations TO electro_tutor_provisioner"
    )
    op.execute("GRANT SELECT ON TABLE audit_events TO electro_tutor_provisioner")
    op.execute(
        "GRANT INSERT (actor_type, actor_id, subject_type, subject_id, action, result, "
        "request_id, correlation_id, operation_id, metadata) "
        "ON TABLE audit_events TO electro_tutor_provisioner"
    )


def downgrade() -> None:
    op.execute("REVOKE SELECT ON TABLE accounts FROM electro_tutor_provisioner")
    op.execute(
        "REVOKE INSERT (actor_type, actor_id, subject_type, subject_id, action, result, "
        "request_id, correlation_id, operation_id, metadata) "
        "ON TABLE audit_events FROM electro_tutor_provisioner"
    )
    op.execute("REVOKE SELECT ON TABLE audit_events FROM electro_tutor_provisioner")
    op.execute("DROP FUNCTION IF EXISTS public.lock_active_capability_grant(uuid, text)")
    op.drop_table("capability_grant_operations")
    op.execute("DROP TRIGGER capability_grants_one_way_revoke ON capability_grants")
    op.execute("DROP FUNCTION public.prevent_capability_grant_rewrite()")
    op.drop_index("ix_capability_grants_evaluation", table_name="capability_grants")
    op.drop_index("uq_capability_grants_active_scope", table_name="capability_grants")
    op.drop_table("capability_grants")
