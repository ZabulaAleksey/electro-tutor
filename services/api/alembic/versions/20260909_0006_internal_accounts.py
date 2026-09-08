"""Add provider-independent internal accounts."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260909_0006"
down_revision: str | None = "20260908_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_accounts"),
    )
    op.add_column(
        "external_identities",
        sa.Column("account_id", sa.Uuid(), nullable=True),
    )
    # Existing AuditEvent account UUIDs were derived from Principal.identity_id.
    # Preserve their meaning while separating the future owner boundary.
    op.execute(
        """
        INSERT INTO accounts (id, created_at)
        SELECT id, created_at
        FROM external_identities
        """
    )
    op.execute(
        """
        UPDATE external_identities
        SET account_id = id
        WHERE account_id IS NULL
        """
    )
    op.alter_column("external_identities", "account_id", nullable=False)
    op.create_foreign_key(
        "fk_external_identities_account",
        "external_identities",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_external_identities_account_id",
        "external_identities",
        ["account_id"],
    )
    op.execute(
        """
        CREATE FUNCTION public.create_external_identity(
            p_issuer text,
            p_subject text,
            p_email text
        ) RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_account_id uuid := gen_random_uuid();
            v_identity_id uuid := gen_random_uuid();
        BEGIN
            INSERT INTO public.accounts (id) VALUES (v_account_id);
            INSERT INTO public.external_identities
                (id, account_id, issuer, subject, email)
            VALUES
                (v_identity_id, v_account_id, p_issuer, p_subject, p_email);
            RETURN v_identity_id;
        END;
        $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION "
        "public.create_external_identity(text, text, text) FROM PUBLIC"
    )
    op.execute("REVOKE INSERT ON TABLE external_identities FROM electro_tutor_runtime")
    op.execute("REVOKE ALL PRIVILEGES ON TABLE accounts FROM electro_tutor_runtime")
    op.execute(
        "GRANT EXECUTE ON FUNCTION "
        "public.create_external_identity(text, text, text) TO electro_tutor_runtime"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.create_external_identity(text, text, text)")
    op.execute("GRANT INSERT ON TABLE external_identities TO electro_tutor_runtime")
    op.drop_index("ix_external_identities_account_id", table_name="external_identities")
    op.drop_constraint(
        "fk_external_identities_account",
        "external_identities",
        type_="foreignkey",
    )
    op.drop_column("external_identities", "account_id")
    op.drop_table("accounts")
