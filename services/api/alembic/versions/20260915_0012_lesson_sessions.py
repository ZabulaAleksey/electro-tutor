"""Booking-bound lesson sessions and post-lock entitlement clock."""

# SQL bodies intentionally preserve exact PostgreSQL signatures.
# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "20260915_0012"
down_revision: str | None = "20260914_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RESOLVE_ACTIVE_SESSION_SQL = """CREATE OR REPLACE FUNCTION public.resolve_active_session_principal() RETURNS TABLE(account_id uuid,identity_id uuid,issuer text,subject text,email text,session_expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_digest text:=current_setting('electro_tutor.session_digest',true); BEGIN IF v_digest IS NULL OR v_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'active session required' USING ERRCODE='28000'; END IF; RETURN QUERY SELECT identity.account_id,identity.id,identity.issuer,identity.subject,identity.email,session.expires_at FROM public.application_sessions AS session JOIN public.external_identities AS identity ON identity.id=session.identity_id WHERE session.token_digest=v_digest AND session.expires_at>clock_timestamp() FOR KEY SHARE OF session; IF NOT FOUND THEN RAISE EXCEPTION 'active session required' USING ERRCODE='28000'; END IF; END $$"""
RESOLVE_ACTIVE_SESSION_0011_SQL = """CREATE OR REPLACE FUNCTION public.resolve_active_session_principal() RETURNS TABLE(account_id uuid,identity_id uuid,issuer text,subject text,email text,session_expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_digest text:=current_setting('electro_tutor.session_digest',true); BEGIN IF v_digest IS NULL OR v_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'active session required' USING ERRCODE='28000'; END IF; RETURN QUERY SELECT identity.account_id,identity.id,identity.issuer,identity.subject,identity.email,session.expires_at FROM public.application_sessions AS session JOIN public.external_identities AS identity ON identity.id=session.identity_id WHERE session.token_digest=v_digest AND session.expires_at>CURRENT_TIMESTAMP FOR KEY SHARE OF session; IF NOT FOUND THEN RAISE EXCEPTION 'active session required' USING ERRCODE='28000'; END IF; END $$"""


def upgrade() -> None:
    op.create_table(
        "lesson_sessions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(16), server_default="READY", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_lesson_sessions"),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name="fk_lesson_sessions_booking", ondelete="RESTRICT"
        ),
        sa.UniqueConstraint("booking_id", name="uq_lesson_sessions_booking"),
        sa.CheckConstraint("version >= 1", name="ck_lesson_sessions_version"),
        sa.CheckConstraint(
            "(status='READY' AND started_at IS NULL AND ended_at IS NULL AND cancelled_at IS NULL) OR (status='ACTIVE' AND started_at IS NOT NULL AND ended_at IS NULL AND cancelled_at IS NULL) OR (status='ENDED' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at >= started_at AND cancelled_at IS NULL) OR (status='CANCELLED' AND started_at IS NULL AND ended_at IS NULL AND cancelled_at IS NOT NULL)",
            name="ck_lesson_sessions_state",
        ),
    )
    op.create_table(
        "lesson_session_operations",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("actor_account_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("intent_digest", sa.String(64), nullable=False),
        sa.Column("result_payload", JSONB(), nullable=False),
        sa.Column("audit_operation_id", sa.Uuid(), nullable=True),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("operation_id", name="pk_lesson_session_operations"),
        sa.ForeignKeyConstraint(
            ["actor_account_id"],
            ["accounts.id"],
            name="fk_lesson_session_operations_actor",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["lesson_sessions.id"],
            name="fk_lesson_session_operations_session",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["audit_operation_id"],
            ["audit_events.operation_id"],
            name="fk_lesson_session_operations_audit",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "action IN ('create','start','end')", name="ck_lesson_session_operations_action"
        ),
        sa.CheckConstraint(
            "action='create' OR audit_operation_id IS NOT NULL",
            name="ck_lesson_session_operations_audit_presence",
        ),
        sa.CheckConstraint(
            "intent_digest ~ '^[0-9a-f]{64}$'", name="ck_lesson_session_operations_digest"
        ),
        sa.UniqueConstraint("audit_operation_id", name="uq_lesson_session_operations_audit"),
    )
    for table in ("lesson_sessions", "lesson_session_operations"):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON public.{table} FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    _extend_audit()
    _replace_clocks()
    _create_functions()
    _replace_cancel()
    _cross_domain_guard()


def _extend_audit() -> None:
    op.drop_constraint("ck_audit_events_subject_type", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_subject_type",
        "audit_events",
        "subject_type IN ('account','capability_grant','tutor_profile','tutor_offer','booking','lesson_access_grant','lesson_session')",
    )
    op.drop_constraint("ck_audit_events_action", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_action",
        "audit_events",
        "action IN ('tutor_capability.granted','tutor_capability.revoked','tutor_profile.created','tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled','lesson_access_grant.issued','lesson_access_grant.revoked','lesson_session.created','lesson_session.started','lesson_session.ended','lesson_session.cancelled')",
    )
    op.drop_constraint("ck_audit_events_metadata_keys", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_metadata_keys",
        "audit_events",
        "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[]='{}'::jsonb) OR (action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[]='{}'::jsonb) OR (action IN ('tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled') AND metadata - ARRAY['operation_action','result_version']::text[]='{}'::jsonb) OR (action='lesson_access_grant.issued' AND metadata - ARRAY['source','policy_version','capability_set_code','issuance_reason']::text[]='{}'::jsonb) OR (action='lesson_access_grant.revoked' AND metadata - ARRAY['source','policy_version','capability_set_code','revoke_reason']::text[]='{}'::jsonb) OR (action IN ('lesson_session.created','lesson_session.started','lesson_session.ended','lesson_session.cancelled') AND metadata - ARRAY['transition_code','result_status']::text[]='{}'::jsonb))",
    )
    op.drop_constraint("ck_audit_events_metadata_values", "audit_events", type_="check")
    # Retain every 0011 restriction, adding only the session allowlist clauses.
    op.create_check_constraint(
        "ck_audit_events_metadata_values",
        "audit_events",
        "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND metadata->>'capability_code' IN ('TUTOR_PROFILE_MANAGE_OWN','TUTOR_BOOKING_MANAGE_OWN'))) AND (NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND (NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND (NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND (NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'operation_action' OR (jsonb_typeof(metadata->'operation_action')='string' AND metadata->>'operation_action' IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel'))) AND (NOT metadata ? 'result_version' OR (jsonb_typeof(metadata->'result_version')='string' AND metadata->>'result_version' ~ '^[1-9][0-9]*$')) AND (NOT metadata ? 'source' OR (jsonb_typeof(metadata->'source')='string' AND metadata->>'source' IN ('BOOKING_FREE','BOOKING_EXTERNAL'))) AND (NOT metadata ? 'policy_version' OR (jsonb_typeof(metadata->'policy_version')='string' AND metadata->>'policy_version'='1')) AND (NOT metadata ? 'capability_set_code' OR (jsonb_typeof(metadata->'capability_set_code')='string' AND metadata->>'capability_set_code'='LESSON_SHELL_V1')) AND (NOT metadata ? 'issuance_reason' OR (jsonb_typeof(metadata->'issuance_reason')='string' AND metadata->>'issuance_reason' IN ('booking_accept','migration_backfill'))) AND (NOT metadata ? 'revoke_reason' OR (jsonb_typeof(metadata->'revoke_reason')='string' AND metadata->>'revoke_reason'='BOOKING_CANCELLED')) AND (NOT metadata ? 'transition_code' OR (jsonb_typeof(metadata->'transition_code')='string' AND metadata->>'transition_code' IN ('create','start','end','cancel'))) AND (NOT metadata ? 'result_status' OR (jsonb_typeof(metadata->'result_status')='string' AND metadata->>'result_status' IN ('READY','ACTIVE','ENDED','CANCELLED'))) AND (actor_type<>'service' OR actor_id<>'lesson-access-migration' OR (action='lesson_access_grant.issued' AND metadata->>'issuance_reason'='migration_backfill' AND request_id IS NULL)) AND (action<>'lesson_access_grant.issued' OR (subject_type='lesson_access_grant' AND metadata ?& ARRAY['source','policy_version','capability_set_code','issuance_reason'] AND ((metadata->>'issuance_reason'='booking_accept' AND actor_type='account') OR (metadata->>'issuance_reason'='migration_backfill' AND actor_type='service' AND actor_id='lesson-access-migration' AND request_id IS NULL)))) AND (action<>'lesson_access_grant.revoked' OR (subject_type='lesson_access_grant' AND actor_type='account' AND metadata ?& ARRAY['source','policy_version','capability_set_code','revoke_reason'])) AND (action NOT LIKE 'lesson_session.%' OR (subject_type='lesson_session' AND actor_type='account' AND metadata ?& ARRAY['transition_code','result_status']))",
    )


def _replace_clocks() -> None:
    op.execute(
        RESOLVE_ACTIVE_SESSION_SQL
    )
    op.execute(
        """CREATE OR REPLACE FUNCTION public.authorize_lesson_access(p_booking_id uuid) RETURNS TABLE(grant_id uuid,booking_id uuid,status text,participant_role text,valid_from timestamptz,valid_until timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_actor uuid:=public.current_session_account_id(); v_booking public.bookings%ROWTYPE; v_grant public.lesson_access_grants%ROWTYPE; v_status text; v_role text; BEGIN SELECT booking.* INTO v_booking FROM public.bookings AS booking WHERE booking.id=p_booking_id FOR SHARE; IF NOT FOUND OR v_actor NOT IN (v_booking.tutor_account_id,v_booking.student_account_id) THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF; v_role:=CASE WHEN v_actor=v_booking.tutor_account_id THEN 'tutor' ELSE 'student' END; SELECT grant_row.* INTO v_grant FROM public.lesson_access_grants AS grant_row WHERE grant_row.booking_id=p_booking_id FOR SHARE; IF NOT FOUND THEN IF v_booking.status='ACCEPTED' AND v_booking.payment_mode IN ('FREE','EXTERNAL') THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF; RAISE EXCEPTION 'lesson_access_unavailable' USING ERRCODE='P0001'; END IF; IF v_grant.source<>(CASE v_booking.payment_mode WHEN 'FREE' THEN 'BOOKING_FREE' WHEN 'EXTERNAL' THEN 'BOOKING_EXTERNAL' ELSE '' END) OR v_grant.policy_version<>1 OR v_grant.capability_set_code<>'LESSON_SHELL_V1' OR v_grant.valid_from<>v_booking.starts_at-make_interval(mins=>15) OR v_grant.valid_until<>v_booking.ends_at OR v_booking.status NOT IN ('ACCEPTED','CANCELLED') OR (v_booking.status='ACCEPTED' AND v_grant.revoked_at IS NOT NULL) OR (v_booking.status='CANCELLED' AND v_grant.revoked_at IS NULL) THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF; PERFORM public.resolve_active_session_principal(); v_status:=public.derive_lesson_access_status(v_grant.revoked_at,v_grant.valid_from,v_grant.valid_until,clock_timestamp()); RETURN QUERY SELECT v_grant.id,v_grant.booking_id,v_status,v_role,v_grant.valid_from,v_grant.valid_until; END $$"""
    )


def _create_functions() -> None:
    op.execute(
        """CREATE FUNCTION public.lesson_session_authority(p_booking_id uuid) RETURNS TABLE(actor uuid,role text,starts_at timestamptz,ends_at timestamptz,now_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_actor uuid:=public.current_session_account_id(); v_booking public.bookings%ROWTYPE; v_grant public.lesson_access_grants%ROWTYPE; v_now timestamptz; BEGIN SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id=p_booking_id FOR UPDATE; IF NOT FOUND OR v_actor NOT IN (v_booking.tutor_account_id,v_booking.student_account_id) THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; SELECT g.* INTO v_grant FROM public.lesson_access_grants g WHERE g.booking_id=p_booking_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF; PERFORM public.resolve_active_session_principal(); v_now:=clock_timestamp(); IF v_booking.status<>'ACCEPTED' OR v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'lesson_access_revoked' USING ERRCODE='P0001'; END IF; IF v_grant.source<>(CASE v_booking.payment_mode WHEN 'FREE' THEN 'BOOKING_FREE' WHEN 'EXTERNAL' THEN 'BOOKING_EXTERNAL' ELSE '' END) OR v_grant.policy_version<>1 OR v_grant.capability_set_code<>'LESSON_SHELL_V1' OR v_grant.valid_from<>v_booking.starts_at-make_interval(mins=>15) OR v_grant.valid_until<>v_booking.ends_at THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF; IF v_now<v_grant.valid_from THEN RAISE EXCEPTION 'lesson_access_not_yet_valid' USING ERRCODE='P0001'; END IF; IF v_now>=v_grant.valid_until THEN RAISE EXCEPTION 'lesson_access_expired' USING ERRCODE='P0001'; END IF; RETURN QUERY SELECT v_actor,CASE WHEN v_actor=v_booking.tutor_account_id THEN 'tutor' ELSE 'student' END,v_booking.starts_at,v_booking.ends_at,v_now; END $$"""
    )
    op.execute(
        """CREATE FUNCTION public.lesson_session_payload(p_row public.lesson_sessions,p_role text,p_starts_at timestamptz,p_ends_at timestamptz,p_now timestamptz) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('id',p_row.id,'booking_id',p_row.booking_id,'status',p_row.status,'effective_status',CASE WHEN p_row.status IN ('READY','ACTIVE') AND p_now>=p_ends_at THEN 'WINDOW_CLOSED' ELSE p_row.status END,'version',p_row.version,'participant_role',p_role,'capabilities',to_jsonb(ARRAY['SESSION_VIEW']::text[]) || CASE WHEN p_row.status='READY' AND p_role='tutor' AND p_now>=p_starts_at AND p_now<p_ends_at THEN to_jsonb(ARRAY['SESSION_START']::text[]) WHEN p_row.status='ACTIVE' AND p_role='tutor' THEN to_jsonb(ARRAY['SESSION_END']::text[]) ELSE '[]'::jsonb END,'created_at',p_row.created_at,'started_at',p_row.started_at,'ended_at',p_row.ended_at,'cancelled_at',p_row.cancelled_at,'current_topic_id',NULL) $$"""
    )
    op.execute(
        """CREATE FUNCTION public.lesson_session_key_guard(p_key uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,7811)); IF EXISTS (SELECT 1 FROM public.booking_operations WHERE operation_id=p_key) OR EXISTS (SELECT 1 FROM public.capability_grant_operations WHERE operation_id=p_key) OR EXISTS (SELECT 1 FROM public.audit_events WHERE operation_id=p_key) THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF; END $$"""
    )
    op.execute(
        """CREATE FUNCTION public.lesson_session_recheck(p_booking_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_grant public.lesson_access_grants%ROWTYPE; v_now timestamptz; BEGIN SELECT g.* INTO v_grant FROM public.lesson_access_grants g WHERE g.booking_id=p_booking_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF; PERFORM public.resolve_active_session_principal(); v_now:=clock_timestamp(); IF v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'lesson_access_revoked' USING ERRCODE='P0001'; END IF; IF v_now<v_grant.valid_from THEN RAISE EXCEPTION 'lesson_access_not_yet_valid' USING ERRCODE='P0001'; END IF; IF v_now>=v_grant.valid_until THEN RAISE EXCEPTION 'lesson_access_expired' USING ERRCODE='P0001'; END IF; RETURN v_now; END $$"""
    )
    op.execute(
        """CREATE FUNCTION public.read_lesson_session(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_booking_id uuid; v_auth record; v_row public.lesson_sessions%ROWTYPE; BEGIN SELECT s.booking_id INTO v_booking_id FROM public.lesson_sessions s WHERE s.id=p_id; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; SELECT * INTO v_auth FROM public.lesson_session_authority(v_booking_id); SELECT s.* INTO v_row FROM public.lesson_sessions s WHERE s.id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; v_auth.now_at:=public.lesson_session_recheck(v_booking_id); RETURN public.lesson_session_payload(v_row,v_auth.role,v_auth.starts_at,v_auth.ends_at,v_auth.now_at); END $$"""
    )
    op.execute(
        """CREATE FUNCTION public.mutate_lesson_session(p_booking_id uuid,p_session_id uuid,p_action text,p_expected integer,p_key uuid,p_digest text,p_correlation_id uuid,p_request_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_auth record; v_row public.lesson_sessions%ROWTYPE; v_existing public.lesson_session_operations%ROWTYPE; v_payload jsonb; v_audit_id uuid; BEGIN IF p_action NOT IN ('create','start','end') OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_lesson_session_request' USING ERRCODE='P0001'; END IF; IF p_action='create' THEN SELECT * INTO v_auth FROM public.lesson_session_authority(p_booking_id); ELSE SELECT s.booking_id INTO p_booking_id FROM public.lesson_sessions s WHERE s.id=p_session_id; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; SELECT * INTO v_auth FROM public.lesson_session_authority(p_booking_id); END IF; IF p_action='create' THEN SELECT s.* INTO v_row FROM public.lesson_sessions s WHERE s.booking_id=p_booking_id FOR UPDATE; ELSE SELECT s.* INTO v_row FROM public.lesson_sessions s WHERE s.id=p_session_id AND s.booking_id=p_booking_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; END IF; PERFORM public.lesson_session_key_guard(p_key); v_auth.now_at:=public.lesson_session_recheck(p_booking_id); SELECT o.* INTO v_existing FROM public.lesson_session_operations o WHERE o.operation_id=p_key; IF FOUND THEN IF v_existing.actor_account_id=v_auth.actor AND v_existing.action=p_action AND v_existing.booking_id=p_booking_id AND (p_action='create' OR v_existing.session_id=p_session_id) AND v_existing.intent_digest=p_digest THEN RETURN v_existing.result_payload; END IF; RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF; IF p_action='create' THEN IF v_row.id IS NULL THEN INSERT INTO public.lesson_sessions(booking_id) VALUES(p_booking_id) RETURNING * INTO v_row; v_audit_id:=gen_random_uuid(); INSERT INTO public.audit_events(actor_type,actor_id,subject_type,subject_id,action,result,request_id,correlation_id,operation_id,metadata) VALUES('account',v_auth.actor::text,'lesson_session',v_row.id::text,'lesson_session.created','succeeded',p_request_id,p_correlation_id,v_audit_id,jsonb_build_object('transition_code','create','result_status','READY')); END IF; ELSE IF v_auth.role<>'tutor' THEN RAISE EXCEPTION 'lesson_session_not_found' USING ERRCODE='P0001'; END IF; IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF; IF p_action='start' THEN IF v_row.status<>'READY' THEN RAISE EXCEPTION 'invalid_lesson_session_transition' USING ERRCODE='P0001'; END IF; IF v_auth.now_at<v_auth.starts_at THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF; UPDATE public.lesson_sessions s SET status='ACTIVE',version=s.version+1,started_at=clock_timestamp() WHERE s.id=v_row.id RETURNING * INTO v_row; ELSE IF v_row.status<>'ACTIVE' THEN RAISE EXCEPTION 'invalid_lesson_session_transition' USING ERRCODE='P0001'; END IF; UPDATE public.lesson_sessions s SET status='ENDED',version=s.version+1,ended_at=clock_timestamp() WHERE s.id=v_row.id RETURNING * INTO v_row; END IF; v_audit_id:=gen_random_uuid(); INSERT INTO public.audit_events(actor_type,actor_id,subject_type,subject_id,action,result,request_id,correlation_id,operation_id,metadata) VALUES('account',v_auth.actor::text,'lesson_session',v_row.id::text,'lesson_session.' || CASE WHEN p_action='start' THEN 'started' ELSE 'ended' END,'succeeded',p_request_id,p_correlation_id,v_audit_id,jsonb_build_object('transition_code',p_action,'result_status',v_row.status)); END IF; v_payload:=public.lesson_session_payload(v_row,v_auth.role,v_auth.starts_at,v_auth.ends_at,clock_timestamp()); INSERT INTO public.lesson_session_operations(operation_id,actor_account_id,action,booking_id,session_id,intent_digest,result_payload,audit_operation_id) VALUES(p_key,v_auth.actor,p_action,p_booking_id,v_row.id,p_digest,v_payload,v_audit_id); RETURN v_payload; END $$"""
    )
    for signature in (
        "lesson_session_authority(uuid)",
        "lesson_session_payload(lesson_sessions,text,timestamptz,timestamptz,timestamptz)",
        "lesson_session_key_guard(uuid)",
        "lesson_session_recheck(uuid)",
    ):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON FUNCTION public.{signature} FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    for signature in (
        "read_lesson_session(uuid)",
        "mutate_lesson_session(uuid,uuid,text,integer,uuid,text,uuid,text)",
    ):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON FUNCTION public.{signature} FROM PUBLIC, electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{signature} TO electro_tutor_runtime")


def _replace_cancel() -> None:
    # The original booking mutation already holds Booking then grant; this hook runs only there.
    op.execute(
        """CREATE FUNCTION public.cancel_ready_lesson_session(p_booking_id uuid,p_actor uuid,p_correlation_id uuid,p_request_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v_row public.lesson_sessions%ROWTYPE; v_audit_id uuid; BEGIN SELECT s.* INTO v_row FROM public.lesson_sessions s WHERE s.booking_id=p_booking_id FOR UPDATE; IF NOT FOUND THEN RETURN; END IF; IF v_row.status<>'READY' THEN RAISE EXCEPTION 'invalid_lesson_session_transition' USING ERRCODE='P0001'; END IF; UPDATE public.lesson_sessions s SET status='CANCELLED',version=s.version+1,cancelled_at=clock_timestamp() WHERE s.id=v_row.id RETURNING * INTO v_row; v_audit_id:=gen_random_uuid(); INSERT INTO public.audit_events(actor_type,actor_id,subject_type,subject_id,action,result,request_id,correlation_id,operation_id,metadata) VALUES('account',p_actor::text,'lesson_session',v_row.id::text,'lesson_session.cancelled','succeeded',p_request_id,p_correlation_id,v_audit_id,jsonb_build_object('transition_code','cancel','result_status','CANCELLED')); END $$"""
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.cancel_ready_lesson_session(uuid,uuid,uuid,text) FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    # Reuse the audited 0011 SQL source verbatim except the in-transaction hook.
    import importlib.util
    from pathlib import Path

    source = Path(__file__).with_name("20260914_0011_lesson_access_grants.py")
    spec = importlib.util.spec_from_file_location("lesson_access_0011", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    captured: list[str] = []
    original = op.execute
    try:
        op.execute = captured.append  # type: ignore[method-assign]
        module._replace_booking_transitions()
    finally:
        op.execute = original  # type: ignore[method-assign]
    cancel = next(
        sql for sql in captured if "CREATE OR REPLACE FUNCTION public.cancel_booking" in sql
    )
    cancel = cancel.replace(
        "PERFORM public.revoke_lesson_access_grant(v_row.id,v_actor,p_correlation_id,p_request_id);",
        "PERFORM public.revoke_lesson_access_grant(v_row.id,v_actor,p_correlation_id,p_request_id); PERFORM public.cancel_ready_lesson_session(v_row.id,v_actor,p_correlation_id,p_request_id);",
    )
    op.execute(cancel)


def _cross_domain_guard() -> None:
    op.execute(
        """CREATE FUNCTION public.check_lesson_session_key_collision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.operation_id::text,7811)); IF EXISTS (SELECT 1 FROM public.lesson_session_operations o WHERE o.operation_id=NEW.operation_id) THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$"""
    )
    for table in ("booking_operations", "capability_grant_operations"):
        op.execute(
            f"CREATE TRIGGER {table}_session_key_guard BEFORE INSERT ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.check_lesson_session_key_collision()"
        )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.check_lesson_session_key_collision() FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )


def downgrade() -> None:
    for table in ("booking_operations", "capability_grant_operations"):
        op.execute(f"DROP TRIGGER {table}_session_key_guard ON public.{table}")
    op.execute("DROP FUNCTION public.check_lesson_session_key_collision()")
    # A destructive downgrade is intended only for an explicit disposable database.
    _restore_0011_booking_and_access()
    op.execute("DROP FUNCTION IF EXISTS public.cancel_ready_lesson_session(uuid,uuid,uuid,text)")
    for signature in (
        "mutate_lesson_session(uuid,uuid,text,integer,uuid,text,uuid,text)",
        "read_lesson_session(uuid)",
        "lesson_session_key_guard(uuid)",
        "lesson_session_recheck(uuid)",
        "lesson_session_payload(lesson_sessions,text,timestamptz,timestamptz,timestamptz)",
        "lesson_session_authority(uuid)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{signature}")
    op.drop_table("lesson_session_operations")
    op.drop_table("lesson_sessions")
    op.execute("DELETE FROM public.audit_events WHERE action LIKE 'lesson_session.%'")
    _restore_0011_audit()


def _load_0011() -> object:
    import importlib.util
    from pathlib import Path

    source = Path(__file__).with_name("20260914_0011_lesson_access_grants.py")
    spec = importlib.util.spec_from_file_location("lesson_access_0011", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _restore_0011_booking_and_access() -> None:
    module = _load_0011()
    module._replace_booking_transitions()
    op.execute("DROP FUNCTION public.authorize_lesson_access(uuid)")
    module._create_authorization_function()
    op.execute(RESOLVE_ACTIVE_SESSION_0011_SQL)


def _restore_0011_audit() -> None:
    module = _load_0011()
    module._extend_audit_contract()
