"""Add private Student and Tutor profile persistence."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260912_0008"
down_revision: str | None = "20260909_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_profile_table(table_name: str, profile_name: str) -> None:
    op.create_table(
        table_name,
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
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
        sa.CheckConstraint(
            "char_length(display_name) BETWEEN 1 AND 80",
            name=f"ck_{table_name}_display_name_length",
        ),
        sa.CheckConstraint(
            "display_name !~ '[[:cntrl:]]'",
            name=f"ck_{table_name}_display_name_control",
        ),
        sa.CheckConstraint(
            "display_name = regexp_replace(btrim(display_name), '[[:space:]]+', ' ', 'g')",
            name=f"ck_{table_name}_display_name_normalized",
        ),
        sa.CheckConstraint(
            "updated_at >= created_at",
            name=f"ck_{table_name}_timestamp_order",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=f"fk_{table_name}_account",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("account_id", name=f"pk_{table_name}"),
        comment=f"Private {profile_name} profile; existence never grants authority.",
    )
    op.execute(f"REVOKE ALL PRIVILEGES ON TABLE {table_name} FROM PUBLIC")
    op.execute(f"REVOKE ALL PRIVILEGES ON TABLE {table_name} FROM electro_tutor_runtime")


def _create_student_functions() -> None:
    op.execute(
        """
        CREATE FUNCTION public.read_student_profile(p_account_id uuid)
        RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz
        )
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at
            FROM public.student_profiles AS profile
            WHERE profile.account_id = p_account_id
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_student_profile(
            p_account_id uuid,
            p_display_name text
        ) RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz,
            created boolean
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        BEGIN
            RETURN QUERY
            INSERT INTO public.student_profiles AS profile (account_id, display_name)
            VALUES (p_account_id, p_display_name)
            ON CONFLICT ON CONSTRAINT pk_student_profiles DO NOTHING
            RETURNING profile.account_id, profile.display_name,
                      profile.created_at, profile.updated_at, true;
            IF FOUND THEN
                RETURN;
            END IF;
            RETURN QUERY
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at, false
            FROM public.student_profiles AS profile
            WHERE profile.account_id = p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_student_profile(
            p_account_id uuid,
            p_display_name text
        ) RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        BEGIN
            PERFORM 1 FROM public.student_profiles AS profile
            WHERE profile.account_id = p_account_id
            FOR UPDATE;
            RETURN QUERY
            UPDATE public.student_profiles AS profile
            SET display_name = p_display_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE profile.account_id = p_account_id
              AND profile.display_name IS DISTINCT FROM p_display_name
            RETURNING profile.account_id, profile.display_name,
                      profile.created_at, profile.updated_at;
            IF FOUND THEN
                RETURN;
            END IF;
            RETURN QUERY
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at
            FROM public.student_profiles AS profile
            WHERE profile.account_id = p_account_id;
        END;
        $$
        """
    )


def _create_tutor_functions() -> None:
    op.execute(
        """
        CREATE FUNCTION public.read_tutor_profile(p_account_id uuid)
        RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF NOT public.lock_active_capability_grant(
                p_account_id, 'TUTOR_PROFILE_MANAGE_OWN'
            ) THEN
                RAISE EXCEPTION 'active tutor profile grant required'
                    USING ERRCODE = '42501';
            END IF;
            RETURN QUERY
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at
            FROM public.tutor_profiles AS profile
            WHERE profile.account_id = p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_tutor_profile(
            p_account_id uuid,
            p_display_name text,
            p_correlation_id uuid,
            p_request_id text
        ) RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz,
            created boolean
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_operation_id uuid;
        BEGIN
            IF NOT public.lock_active_capability_grant(
                p_account_id, 'TUTOR_PROFILE_MANAGE_OWN'
            ) THEN
                RAISE EXCEPTION 'active tutor profile grant required'
                    USING ERRCODE = '42501';
            END IF;
            RETURN QUERY
            INSERT INTO public.tutor_profiles AS profile (account_id, display_name)
            VALUES (p_account_id, p_display_name)
            ON CONFLICT ON CONSTRAINT pk_tutor_profiles DO NOTHING
            RETURNING profile.account_id, profile.display_name,
                      profile.created_at, profile.updated_at, true;
            IF FOUND THEN
                v_operation_id := gen_random_uuid();
                INSERT INTO public.audit_events (
                    actor_type, actor_id, subject_type, subject_id, action, result,
                    request_id, correlation_id, operation_id, metadata
                ) VALUES (
                    'account', p_account_id::text, 'tutor_profile', p_account_id::text,
                    'tutor_profile.created', 'succeeded', p_request_id,
                    COALESCE(p_correlation_id, v_operation_id), v_operation_id,
                    jsonb_build_object(
                        'profile_type', 'tutor',
                        'reason_category', 'profile_created'
                    )
                );
                RETURN;
            END IF;
            RETURN QUERY
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at, false
            FROM public.tutor_profiles AS profile
            WHERE profile.account_id = p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_tutor_profile(
            p_account_id uuid,
            p_display_name text
        ) RETURNS TABLE (
            account_id uuid,
            display_name varchar(80),
            created_at timestamptz,
            updated_at timestamptz
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF NOT public.lock_active_capability_grant(
                p_account_id, 'TUTOR_PROFILE_MANAGE_OWN'
            ) THEN
                RAISE EXCEPTION 'active tutor profile grant required'
                    USING ERRCODE = '42501';
            END IF;
            PERFORM 1 FROM public.tutor_profiles AS profile
            WHERE profile.account_id = p_account_id
            FOR UPDATE;
            RETURN QUERY
            UPDATE public.tutor_profiles AS profile
            SET display_name = p_display_name,
                updated_at = CURRENT_TIMESTAMP
            WHERE profile.account_id = p_account_id
              AND profile.display_name IS DISTINCT FROM p_display_name
            RETURNING profile.account_id, profile.display_name,
                      profile.created_at, profile.updated_at;
            IF FOUND THEN
                RETURN;
            END IF;
            RETURN QUERY
            SELECT profile.account_id, profile.display_name,
                   profile.created_at, profile.updated_at
            FROM public.tutor_profiles AS profile
            WHERE profile.account_id = p_account_id;
        END;
        $$
        """
    )


def _grant_function(function_signature: str) -> None:
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {function_signature} FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION {function_signature} TO electro_tutor_runtime")


def upgrade() -> None:
    _create_profile_table("student_profiles", "Student")
    _create_profile_table("tutor_profiles", "Tutor")
    _create_student_functions()
    _create_tutor_functions()
    for function_signature in (
        "public.read_student_profile(uuid)",
        "public.create_student_profile(uuid, text)",
        "public.update_student_profile(uuid, text)",
        "public.read_tutor_profile(uuid)",
        "public.create_tutor_profile(uuid, text, uuid, text)",
        "public.update_tutor_profile(uuid, text)",
    ):
        _grant_function(function_signature)


def downgrade() -> None:
    for function_signature in (
        "public.update_tutor_profile(uuid, text)",
        "public.create_tutor_profile(uuid, text, uuid, text)",
        "public.read_tutor_profile(uuid)",
        "public.update_student_profile(uuid, text)",
        "public.create_student_profile(uuid, text)",
        "public.read_student_profile(uuid)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {function_signature}")
    op.drop_table("tutor_profiles")
    op.drop_table("student_profiles")
