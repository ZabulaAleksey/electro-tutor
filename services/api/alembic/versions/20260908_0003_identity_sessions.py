"""Add Tutor-local external identities, auth transactions, and sessions."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260908_0003"
down_revision: str | None = "20260831_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "external_identities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("issuer", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_external_identities"),
        sa.UniqueConstraint("issuer", "subject", name="uq_external_identities_issuer_subject"),
    )
    op.create_table(
        "auth_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("state_digest", sa.String(length=64), nullable=False),
        sa.Column("pkce_verifier", sa.Text(), nullable=False),
        sa.Column("nonce", sa.Text(), nullable=False),
        sa.Column("return_to", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_auth_transactions"),
        sa.UniqueConstraint("state_digest", name="uq_auth_transactions_state_digest"),
    )
    op.create_index("ix_auth_transactions_expires_at", "auth_transactions", ["expires_at"])
    op.create_table(
        "application_sessions",
        sa.Column("token_digest", sa.String(length=64), nullable=False),
        sa.Column("identity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["identity_id"],
            ["external_identities.id"],
            name="fk_sessions_identity",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token_digest", name="pk_application_sessions"),
    )
    op.create_index("ix_application_sessions_identity_id", "application_sessions", ["identity_id"])
    op.create_index("ix_application_sessions_expires_at", "application_sessions", ["expires_at"])
    op.execute("GRANT SELECT, INSERT, UPDATE ON TABLE external_identities TO electro_tutor_runtime")
    op.execute("GRANT SELECT, INSERT, DELETE ON TABLE auth_transactions TO electro_tutor_runtime")
    op.execute(
        "GRANT SELECT, INSERT, DELETE ON TABLE application_sessions TO electro_tutor_runtime"
    )


def downgrade() -> None:
    op.drop_index("ix_application_sessions_expires_at", table_name="application_sessions")
    op.drop_index("ix_application_sessions_identity_id", table_name="application_sessions")
    op.drop_table("application_sessions")
    op.drop_index("ix_auth_transactions_expires_at", table_name="auth_transactions")
    op.drop_table("auth_transactions")
    op.drop_table("external_identities")
