"""Bind private profile operations to an active application session."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260912_0009"
down_revision: str | None = "20260912_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_SIGNATURES = (
    "public.read_student_profile(uuid)",
    "public.create_student_profile(uuid,text)",
    "public.update_student_profile(uuid,text)",
    "public.read_tutor_profile(uuid)",
    "public.create_tutor_profile(uuid,text,uuid,text)",
    "public.update_tutor_profile(uuid,text)",
)

NEW_SIGNATURES = (
    "public.resolve_active_session_principal()",
    "public.read_student_profile()",
    "public.create_student_profile(text)",
    "public.update_student_profile(text)",
    "public.read_tutor_profile()",
    "public.create_tutor_profile(text,uuid,text)",
    "public.update_tutor_profile(text)",
)


def _secure_runtime_function(signature: str) -> None:
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {signature} FROM PUBLIC")
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {signature} FROM electro_tutor_auth_runtime")
    op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO electro_tutor_runtime")


def upgrade() -> None:
    # Authentication state belongs exclusively to the isolated auth runtime.
    for table in ("auth_transactions", "application_sessions", "external_identities"):
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_runtime")
    op.execute(
        "GRANT SELECT, INSERT, DELETE ON TABLE public.auth_transactions "
        "TO electro_tutor_auth_runtime"
    )
    op.execute(
        "GRANT SELECT, INSERT, DELETE ON TABLE public.application_sessions "
        "TO electro_tutor_auth_runtime"
    )
    op.execute("GRANT SELECT ON TABLE public.external_identities TO electro_tutor_auth_runtime")
    op.execute(
        "GRANT UPDATE (email, updated_at) ON TABLE public.external_identities "
        "TO electro_tutor_auth_runtime"
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION "
        "public.create_external_identity(text,text,text) FROM electro_tutor_runtime"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.create_external_identity(text,text,text) "
        "TO electro_tutor_auth_runtime"
    )

    for signature in OLD_SIGNATURES:
        op.execute(f"DROP FUNCTION {signature}")

    op.execute(
        """
        CREATE FUNCTION public.resolve_active_session_principal()
        RETURNS TABLE (
            account_id uuid,
            identity_id uuid,
            issuer text,
            subject text,
            email text,
            session_expires_at timestamptz
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_digest text := current_setting('electro_tutor.session_digest', true);
        BEGIN
            IF v_digest IS NULL OR v_digest !~ '^[0-9a-f]{64}$' THEN
                RAISE EXCEPTION 'active session required' USING ERRCODE = '28000';
            END IF;
            RETURN QUERY
            SELECT identity.account_id, identity.id, identity.issuer, identity.subject,
                   identity.email, session.expires_at
            FROM public.application_sessions AS session
            JOIN public.external_identities AS identity ON identity.id = session.identity_id
            WHERE session.token_digest = v_digest
              AND session.expires_at > CURRENT_TIMESTAMP
            FOR KEY SHARE OF session;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'active session required' USING ERRCODE = '28000';
            END IF;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.current_session_account_id()
        RETURNS uuid
        LANGUAGE sql
        VOLATILE
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
            SELECT principal.account_id
            FROM public.resolve_active_session_principal() AS principal
        $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.current_session_account_id() FROM PUBLIC, "
        "electro_tutor_runtime, electro_tutor_auth_runtime"
    )

    op.execute(
        """
        CREATE FUNCTION public.read_student_profile()
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
            SELECT profile.account_id, profile.display_name, profile.created_at, profile.updated_at
            FROM public.student_profiles AS profile
            WHERE profile.account_id = public.current_session_account_id()
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_student_profile(p_display_name text)
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz, created boolean)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE v_account_id uuid := public.current_session_account_id();
        BEGIN
            RETURN QUERY INSERT INTO public.student_profiles AS profile (account_id, display_name)
            VALUES (v_account_id, p_display_name)
            ON CONFLICT ON CONSTRAINT pk_student_profiles DO NOTHING
            RETURNING profile.account_id, profile.display_name, profile.created_at,
                      profile.updated_at, true;
            IF FOUND THEN RETURN; END IF;
            RETURN QUERY SELECT profile.account_id, profile.display_name, profile.created_at,
                                profile.updated_at, false
            FROM public.student_profiles AS profile WHERE profile.account_id = v_account_id;
        END $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_student_profile(p_display_name text)
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE v_account_id uuid := public.current_session_account_id();
        BEGIN
            PERFORM 1 FROM public.student_profiles p WHERE p.account_id=v_account_id FOR UPDATE;
            RETURN QUERY UPDATE public.student_profiles AS profile
            SET display_name=p_display_name, updated_at=CURRENT_TIMESTAMP
            WHERE profile.account_id=v_account_id AND profile.display_name IS DISTINCT FROM p_display_name
            RETURNING profile.account_id, profile.display_name, profile.created_at, profile.updated_at;
            IF FOUND THEN RETURN; END IF;
            RETURN QUERY SELECT profile.account_id, profile.display_name, profile.created_at,
                                profile.updated_at
            FROM public.student_profiles AS profile WHERE profile.account_id=v_account_id;
        END $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.read_tutor_profile()
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE v_account_id uuid := public.current_session_account_id();
        BEGIN
            IF NOT public.lock_active_capability_grant(v_account_id, 'TUTOR_PROFILE_MANAGE_OWN') THEN
                RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
            END IF;
            RETURN QUERY SELECT profile.account_id, profile.display_name, profile.created_at,
                                profile.updated_at
            FROM public.tutor_profiles AS profile WHERE profile.account_id=v_account_id;
        END $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_tutor_profile(
            p_display_name text, p_correlation_id uuid, p_request_id text
        ) RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                         updated_at timestamptz, created boolean)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE
            v_account_id uuid := public.current_session_account_id();
            v_operation_id uuid;
        BEGIN
            IF NOT public.lock_active_capability_grant(v_account_id, 'TUTOR_PROFILE_MANAGE_OWN') THEN
                RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
            END IF;
            RETURN QUERY INSERT INTO public.tutor_profiles AS profile (account_id, display_name)
            VALUES (v_account_id, p_display_name)
            ON CONFLICT ON CONSTRAINT pk_tutor_profiles DO NOTHING
            RETURNING profile.account_id, profile.display_name, profile.created_at,
                      profile.updated_at, true;
            IF FOUND THEN
                v_operation_id := gen_random_uuid();
                INSERT INTO public.audit_events (
                    actor_type, actor_id, subject_type, subject_id, action, result,
                    request_id, correlation_id, operation_id, metadata
                ) VALUES (
                    'account', v_account_id::text, 'tutor_profile', v_account_id::text,
                    'tutor_profile.created', 'succeeded', p_request_id,
                    COALESCE(p_correlation_id, v_operation_id), v_operation_id,
                    jsonb_build_object('profile_type','tutor','reason_category','profile_created')
                );
                RETURN;
            END IF;
            RETURN QUERY SELECT profile.account_id, profile.display_name, profile.created_at,
                                profile.updated_at, false
            FROM public.tutor_profiles AS profile WHERE profile.account_id=v_account_id;
        END $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_tutor_profile(p_display_name text)
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE v_account_id uuid := public.current_session_account_id();
        BEGIN
            IF NOT public.lock_active_capability_grant(v_account_id, 'TUTOR_PROFILE_MANAGE_OWN') THEN
                RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
            END IF;
            PERFORM 1 FROM public.tutor_profiles p WHERE p.account_id=v_account_id FOR UPDATE;
            RETURN QUERY UPDATE public.tutor_profiles AS profile
            SET display_name=p_display_name, updated_at=CURRENT_TIMESTAMP
            WHERE profile.account_id=v_account_id AND profile.display_name IS DISTINCT FROM p_display_name
            RETURNING profile.account_id, profile.display_name, profile.created_at, profile.updated_at;
            IF FOUND THEN RETURN; END IF;
            RETURN QUERY SELECT profile.account_id, profile.display_name, profile.created_at,
                                profile.updated_at
            FROM public.tutor_profiles AS profile WHERE profile.account_id=v_account_id;
        END $$
        """
    )
    for signature in NEW_SIGNATURES:
        _secure_runtime_function(signature)

    # The auth runtime can only use auth/session/identity surfaces.
    for table in ("student_profiles", "tutor_profiles", "capability_grants", "audit_events"):
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_auth_runtime")


def downgrade() -> None:
    for signature in reversed(NEW_SIGNATURES):
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
    op.execute("DROP FUNCTION IF EXISTS public.current_session_account_id()")

    # A previously interrupted disposable lifecycle test may have already removed
    # 0008 tables before restoring the revision marker. Let earlier downgrades
    # repair that test database instead of creating functions over missing tables.
    if op.get_bind().scalar(sa.text("SELECT to_regclass('public.student_profiles')")) is None:
        return

    # Restore the account-selected 0008 functions for an exact one-revision rollback.
    op.execute(
        """
        CREATE FUNCTION public.read_student_profile(p_account_id uuid)
        RETURNS TABLE (account_id uuid, display_name varchar(80), created_at timestamptz,
                       updated_at timestamptz)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
          SELECT p.account_id,p.display_name,p.created_at,p.updated_at
          FROM public.student_profiles p WHERE p.account_id=p_account_id
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_student_profile(p_account_id uuid,p_display_name text)
        RETURNS TABLE (account_id uuid,display_name varchar(80),created_at timestamptz,
                       updated_at timestamptz,created boolean)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
          RETURN QUERY INSERT INTO public.student_profiles AS p (account_id,display_name)
          VALUES(p_account_id,p_display_name) ON CONFLICT ON CONSTRAINT pk_student_profiles DO NOTHING
          RETURNING p.account_id,p.display_name,p.created_at,p.updated_at,true;
          IF FOUND THEN RETURN; END IF;
          RETURN QUERY SELECT p.account_id,p.display_name,p.created_at,p.updated_at,false
          FROM public.student_profiles p WHERE p.account_id=p_account_id;
        END $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_student_profile(p_account_id uuid,p_display_name text)
        RETURNS TABLE (account_id uuid,display_name varchar(80),created_at timestamptz,updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          PERFORM 1 FROM public.student_profiles AS profile
          WHERE profile.account_id=p_account_id FOR UPDATE;
          RETURN QUERY UPDATE public.student_profiles AS profile
          SET display_name=p_display_name,updated_at=CURRENT_TIMESTAMP
          WHERE profile.account_id=p_account_id
            AND profile.display_name IS DISTINCT FROM p_display_name
          RETURNING profile.account_id,profile.display_name,profile.created_at,profile.updated_at;
          IF FOUND THEN RETURN; END IF;
          RETURN QUERY SELECT profile.account_id,profile.display_name,
                              profile.created_at,profile.updated_at
          FROM public.student_profiles AS profile WHERE profile.account_id=p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.read_tutor_profile(p_account_id uuid)
        RETURNS TABLE (account_id uuid,display_name varchar(80),created_at timestamptz,updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          IF NOT public.lock_active_capability_grant(
            p_account_id,'TUTOR_PROFILE_MANAGE_OWN'
          ) THEN
            RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
          END IF;
          RETURN QUERY SELECT profile.account_id,profile.display_name,
                              profile.created_at,profile.updated_at
          FROM public.tutor_profiles AS profile WHERE profile.account_id=p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.create_tutor_profile(
          p_account_id uuid,p_display_name text,p_correlation_id uuid,p_request_id text
        ) RETURNS TABLE (account_id uuid,display_name varchar(80),created_at timestamptz,
                         updated_at timestamptz,created boolean)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_operation_id uuid;
        BEGIN
          IF NOT public.lock_active_capability_grant(
            p_account_id,'TUTOR_PROFILE_MANAGE_OWN'
          ) THEN
            RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
          END IF;
          RETURN QUERY INSERT INTO public.tutor_profiles AS profile (account_id,display_name)
          VALUES(p_account_id,p_display_name)
          ON CONFLICT ON CONSTRAINT pk_tutor_profiles DO NOTHING
          RETURNING profile.account_id,profile.display_name,
                    profile.created_at,profile.updated_at,true;
          IF FOUND THEN
            v_operation_id := gen_random_uuid();
            INSERT INTO public.audit_events (
              actor_type,actor_id,subject_type,subject_id,action,result,
              request_id,correlation_id,operation_id,metadata
            ) VALUES (
              'account',p_account_id::text,'tutor_profile',p_account_id::text,
              'tutor_profile.created','succeeded',p_request_id,
              COALESCE(p_correlation_id,v_operation_id),v_operation_id,
              jsonb_build_object('profile_type','tutor','reason_category','profile_created')
            );
            RETURN;
          END IF;
          RETURN QUERY SELECT profile.account_id,profile.display_name,
                              profile.created_at,profile.updated_at,false
          FROM public.tutor_profiles AS profile WHERE profile.account_id=p_account_id;
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION public.update_tutor_profile(p_account_id uuid,p_display_name text)
        RETURNS TABLE (account_id uuid,display_name varchar(80),created_at timestamptz,updated_at timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          IF NOT public.lock_active_capability_grant(
            p_account_id,'TUTOR_PROFILE_MANAGE_OWN'
          ) THEN
            RAISE EXCEPTION 'active tutor profile grant required' USING ERRCODE='42501';
          END IF;
          PERFORM 1 FROM public.tutor_profiles AS profile
          WHERE profile.account_id=p_account_id FOR UPDATE;
          RETURN QUERY UPDATE public.tutor_profiles AS profile
          SET display_name=p_display_name,updated_at=CURRENT_TIMESTAMP
          WHERE profile.account_id=p_account_id
            AND profile.display_name IS DISTINCT FROM p_display_name
          RETURNING profile.account_id,profile.display_name,
                    profile.created_at,profile.updated_at;
          IF FOUND THEN RETURN; END IF;
          RETURN QUERY SELECT profile.account_id,profile.display_name,
                              profile.created_at,profile.updated_at
          FROM public.tutor_profiles AS profile WHERE profile.account_id=p_account_id;
        END;
        $$
        """
    )
    for signature in OLD_SIGNATURES:
        _secure_runtime_function(signature)

    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.create_external_identity(text,text,text) "
        "FROM electro_tutor_auth_runtime"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.create_external_identity(text,text,text) "
        "TO electro_tutor_runtime"
    )
    for table in ("auth_transactions", "application_sessions"):
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_auth_runtime")
        op.execute(f"GRANT SELECT, INSERT, DELETE ON TABLE public.{table} TO electro_tutor_runtime")
    op.execute(
        "REVOKE ALL PRIVILEGES ON TABLE public.external_identities FROM electro_tutor_auth_runtime"
    )
    op.execute("GRANT SELECT ON TABLE public.external_identities TO electro_tutor_runtime")
    op.execute(
        "GRANT UPDATE (email,updated_at) ON TABLE public.external_identities TO electro_tutor_runtime"
    )
