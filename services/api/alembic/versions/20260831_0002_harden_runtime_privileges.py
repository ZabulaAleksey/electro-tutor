"""Restrict the runtime role to read-only migration metadata."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260831_0002"
down_revision: str | None = "20260831_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE electro_tutor_migrator "
        "IN SCHEMA public REVOKE ALL ON TABLES FROM electro_tutor_runtime"
    )
    op.execute(
        "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER "
        "ON TABLE alembic_version FROM electro_tutor_runtime"
    )
    op.execute("GRANT SELECT ON TABLE alembic_version TO electro_tutor_runtime")


def downgrade() -> None:
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE electro_tutor_migrator IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO electro_tutor_runtime"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE alembic_version "
        "TO electro_tutor_runtime"
    )
