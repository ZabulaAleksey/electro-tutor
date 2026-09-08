"""Restrict runtime identity updates to mutable attributes."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260908_0004"
down_revision: str | None = "20260908_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("REVOKE UPDATE ON TABLE external_identities FROM electro_tutor_runtime")
    op.execute(
        "GRANT UPDATE (email, updated_at) ON TABLE external_identities TO electro_tutor_runtime"
    )


def downgrade() -> None:
    op.execute(
        "REVOKE UPDATE (email, updated_at) ON TABLE external_identities FROM electro_tutor_runtime"
    )
    op.execute("GRANT UPDATE ON TABLE external_identities TO electro_tutor_runtime")
