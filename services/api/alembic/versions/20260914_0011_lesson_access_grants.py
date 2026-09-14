"""Add booking-derived lesson access grants and authorization boundary."""

# SQL signatures and constraint expressions are intentionally kept contiguous.
# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260914_0011"
down_revision: str | None = "20260914_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


AUTHORIZE_SIGNATURE = "public.authorize_lesson_access(uuid)"


def upgrade() -> None:
    _extend_audit_contract()
    op.create_table(
        "lesson_access_grants",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("policy_version", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column(
            "capability_set_code",
            sa.String(32),
            server_default="LESSON_SHELL_V1",
            nullable=False,
        ),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("issue_operation_id", sa.Uuid(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_actor_type", sa.String(16), nullable=True),
        sa.Column("revoked_by_actor_id", sa.String(64), nullable=True),
        sa.Column("revoke_operation_id", sa.Uuid(), nullable=True),
        sa.Column("revoke_reason", sa.String(32), nullable=True),
        sa.CheckConstraint(
            "source IN ('BOOKING_FREE','BOOKING_EXTERNAL')",
            name="ck_lesson_access_grants_source",
        ),
        sa.CheckConstraint(
            "policy_version=1 AND capability_set_code='LESSON_SHELL_V1'",
            name="ck_lesson_access_grants_policy",
        ),
        sa.CheckConstraint(
            "valid_from < valid_until",
            name="ck_lesson_access_grants_validity",
        ),
        sa.CheckConstraint(
            "(revoked_at IS NULL AND revoked_by_actor_type IS NULL "
            "AND revoked_by_actor_id IS NULL AND revoke_operation_id IS NULL "
            "AND revoke_reason IS NULL) OR "
            "(revoked_at IS NOT NULL AND revoked_at >= issued_at "
            "AND revoked_by_actor_type='account' "
            "AND revoked_by_actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "
            "AND revoke_operation_id IS NOT NULL AND revoke_reason='BOOKING_CANCELLED')",
            name="ck_lesson_access_grants_revoke_tuple",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_lesson_access_grants_booking",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lesson_access_grants"),
        sa.UniqueConstraint("booking_id", name="uq_lesson_access_grants_booking"),
        sa.UniqueConstraint(
            "issue_operation_id", name="uq_lesson_access_grants_issue_operation"
        ),
    )
    op.create_index(
        "uq_lesson_access_grants_revoke_operation",
        "lesson_access_grants",
        ["revoke_operation_id"],
        unique=True,
        postgresql_where=sa.text("revoke_operation_id IS NOT NULL"),
    )
    op.create_index(
        "ix_lesson_access_grants_active_until",
        "lesson_access_grants",
        ["valid_until"],
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON TABLE public.lesson_access_grants "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, "
        "electro_tutor_provisioner"
    )
    _create_internal_functions()
    _replace_booking_transitions()
    _create_authorization_function()
    _backfill_accepted_bookings()


def _extend_audit_contract() -> None:
    for constraint in (
        "ck_audit_events_actor_id",
        "ck_audit_events_subject_type",
        "ck_audit_events_action",
        "ck_audit_events_metadata_keys",
        "ck_audit_events_metadata_values",
    ):
        op.drop_constraint(constraint, "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_actor_id",
        "audit_events",
        "CASE actor_type WHEN 'account' THEN actor_id ~ "
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "
        "WHEN 'service' THEN actor_id IN ('tutor-provisioner','lesson-access-migration') "
        "ELSE false END",
    )
    op.create_check_constraint(
        "ck_audit_events_subject_type",
        "audit_events",
        "subject_type IN ('account','capability_grant','tutor_profile','tutor_offer','booking','lesson_access_grant')",
    )
    op.create_check_constraint(
        "ck_audit_events_action",
        "audit_events",
        "action IN ('tutor_capability.granted','tutor_capability.revoked','tutor_profile.created',"
        "'tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired',"
        "'booking.requested','booking.accepted','booking.declined','booking.cancelled',"
        "'lesson_access_grant.issued','lesson_access_grant.revoked')",
    )
    op.create_check_constraint(
        "ck_audit_events_metadata_keys",
        "audit_events",
        "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[]='{}'::jsonb) OR "
        "(action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[]='{}'::jsonb) OR "
        "(action IN ('tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled') AND metadata - ARRAY['operation_action','result_version']::text[]='{}'::jsonb) OR "
        "(action='lesson_access_grant.issued' AND metadata - ARRAY['source','policy_version','capability_set_code','issuance_reason']::text[]='{}'::jsonb) OR "
        "(action='lesson_access_grant.revoked' AND metadata - ARRAY['source','policy_version','capability_set_code','revoke_reason']::text[]='{}'::jsonb))",
    )
    op.create_check_constraint(
        "ck_audit_events_metadata_values",
        "audit_events",
        "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND metadata->>'capability_code' IN ('TUTOR_PROFILE_MANAGE_OWN','TUTOR_BOOKING_MANAGE_OWN'))) AND "
        "(NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND "
        "(NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND "
        "(NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND "
        "(NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND "
        "(NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND "
        "(NOT metadata ? 'operation_action' OR (jsonb_typeof(metadata->'operation_action')='string' AND metadata->>'operation_action' IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel'))) AND "
        "(NOT metadata ? 'result_version' OR (jsonb_typeof(metadata->'result_version')='string' AND metadata->>'result_version' ~ '^[1-9][0-9]*$')) AND "
        "(NOT metadata ? 'source' OR (jsonb_typeof(metadata->'source')='string' AND metadata->>'source' IN ('BOOKING_FREE','BOOKING_EXTERNAL'))) AND "
        "(NOT metadata ? 'policy_version' OR (jsonb_typeof(metadata->'policy_version')='string' AND metadata->>'policy_version'='1')) AND "
        "(NOT metadata ? 'capability_set_code' OR (jsonb_typeof(metadata->'capability_set_code')='string' AND metadata->>'capability_set_code'='LESSON_SHELL_V1')) AND "
        "(NOT metadata ? 'issuance_reason' OR (jsonb_typeof(metadata->'issuance_reason')='string' AND metadata->>'issuance_reason' IN ('booking_accept','migration_backfill'))) AND "
        "(NOT metadata ? 'revoke_reason' OR (jsonb_typeof(metadata->'revoke_reason')='string' AND metadata->>'revoke_reason'='BOOKING_CANCELLED')) AND "
        "(actor_type<>'service' OR actor_id<>'lesson-access-migration' OR (action='lesson_access_grant.issued' AND metadata->>'issuance_reason'='migration_backfill' AND request_id IS NULL)) AND "
        "(action<>'lesson_access_grant.issued' OR (subject_type='lesson_access_grant' AND metadata ?& ARRAY['source','policy_version','capability_set_code','issuance_reason'] AND ((metadata->>'issuance_reason'='booking_accept' AND actor_type='account') OR (metadata->>'issuance_reason'='migration_backfill' AND actor_type='service' AND actor_id='lesson-access-migration' AND request_id IS NULL)))) AND "
        "(action<>'lesson_access_grant.revoked' OR (subject_type='lesson_access_grant' AND actor_type='account' AND metadata ?& ARRAY['source','policy_version','capability_set_code','revoke_reason']))",
    )


def _create_internal_functions() -> None:
    op.execute(
        """
        CREATE FUNCTION public.derive_lesson_access_status(
          p_revoked_at timestamptz,p_valid_from timestamptz,
          p_valid_until timestamptz,p_now timestamptz
        ) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
          SELECT CASE WHEN p_revoked_at IS NOT NULL THEN 'REVOKED'
                      WHEN p_now>=p_valid_until THEN 'EXPIRED'
                      WHEN p_now<p_valid_from THEN 'NOT_YET_VALID'
                      ELSE 'ACTIVE' END
        $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION "
        "public.derive_lesson_access_status(timestamptz,timestamptz,timestamptz,timestamptz) "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, "
        "electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.new_lesson_access_operation_id() RETURNS uuid
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_id uuid;
        BEGIN
          LOOP
            v_id := gen_random_uuid();
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.audit_events WHERE operation_id=v_id)
              AND NOT EXISTS (SELECT 1 FROM public.booking_operations WHERE operation_id=v_id)
              AND NOT EXISTS (SELECT 1 FROM public.capability_grant_operations WHERE operation_id=v_id)
              AND NOT EXISTS (SELECT 1 FROM public.lesson_access_grants WHERE issue_operation_id=v_id OR revoke_operation_id=v_id);
          END LOOP;
          RETURN v_id;
        END $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.new_lesson_access_operation_id() "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.prevent_lesson_access_grant_rewrite() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog AS $$
        BEGIN
          IF OLD.revoked_at IS NOT NULL THEN
            RAISE EXCEPTION 'revoked_lesson_access_grant_immutable' USING ERRCODE='P0001';
          END IF;
          IF ROW(NEW.id,NEW.booking_id,NEW.source,NEW.policy_version,NEW.capability_set_code,
                 NEW.valid_from,NEW.valid_until,NEW.issued_at,NEW.issue_operation_id)
             IS DISTINCT FROM
             ROW(OLD.id,OLD.booking_id,OLD.source,OLD.policy_version,OLD.capability_set_code,
                 OLD.valid_from,OLD.valid_until,OLD.issued_at,OLD.issue_operation_id)
          THEN RAISE EXCEPTION 'lesson_access_grant_immutable' USING ERRCODE='P0001'; END IF;
          IF NEW.revoked_at IS NULL THEN
            RAISE EXCEPTION 'lesson_access_grant_update_must_revoke' USING ERRCODE='P0001';
          END IF;
          RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER lesson_access_grants_one_way_revoke BEFORE UPDATE ON "
        "public.lesson_access_grants FOR EACH ROW EXECUTE FUNCTION "
        "public.prevent_lesson_access_grant_rewrite()"
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_lesson_access_grant_rewrite() "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.prevent_lesson_access_migration_impersonation() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog AS $$
        BEGIN
          IF NEW.actor_type='service' AND NEW.actor_id='lesson-access-migration'
             AND session_user<>'electro_tutor_migrator'
          THEN RAISE EXCEPTION 'lesson_access_migration_actor_forbidden' USING ERRCODE='42501';
          END IF;
          RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER audit_events_lesson_access_migration_actor BEFORE INSERT ON "
        "public.audit_events FOR EACH ROW EXECUTE FUNCTION "
        "public.prevent_lesson_access_migration_impersonation()"
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_lesson_access_migration_impersonation() "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.append_lesson_access_audit(
          p_actor_type text,p_actor_id text,p_grant_id uuid,p_action text,p_source text,
          p_operation_id uuid,p_correlation_id uuid,p_request_id text,p_reason text
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_metadata jsonb;
        BEGIN
          IF p_action='lesson_access_grant.issued' THEN
            IF NOT ((p_reason='booking_accept' AND p_actor_type='account') OR
                    (p_reason='migration_backfill' AND p_actor_type='service'
                     AND p_actor_id='lesson-access-migration' AND p_request_id IS NULL))
            THEN RAISE EXCEPTION 'lesson_access_audit_actor_invalid' USING ERRCODE='P0001'; END IF;
            v_metadata:=jsonb_build_object('source',p_source,'policy_version','1',
              'capability_set_code','LESSON_SHELL_V1','issuance_reason',p_reason);
          ELSIF p_action='lesson_access_grant.revoked' AND p_actor_type='account'
                AND p_reason='BOOKING_CANCELLED' THEN
            v_metadata:=jsonb_build_object('source',p_source,'policy_version','1',
              'capability_set_code','LESSON_SHELL_V1','revoke_reason',p_reason);
          ELSE
            RAISE EXCEPTION 'lesson_access_audit_action_invalid' USING ERRCODE='P0001';
          END IF;
          INSERT INTO public.audit_events(actor_type,actor_id,subject_type,subject_id,action,
            result,request_id,correlation_id,operation_id,metadata)
          VALUES(p_actor_type,p_actor_id,'lesson_access_grant',p_grant_id::text,p_action,
            'succeeded',p_request_id,p_correlation_id,p_operation_id,v_metadata);
        END $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.append_lesson_access_audit(text,text,uuid,text,text,uuid,uuid,text,text) "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.issue_lesson_access_grant(
          p_booking_id uuid,p_actor_type text,p_actor_id text,p_correlation_id uuid,
          p_request_id text,p_reason text
        ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_booking public.bookings%ROWTYPE; v_grant public.lesson_access_grants%ROWTYPE;
                v_source text; v_operation_id uuid;
        BEGIN
          SELECT booking.* INTO v_booking FROM public.bookings AS booking
          WHERE booking.id=p_booking_id FOR UPDATE;
          IF NOT FOUND OR v_booking.status<>'ACCEPTED' THEN
            RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001';
          END IF;
          v_source:=CASE v_booking.payment_mode WHEN 'FREE' THEN 'BOOKING_FREE'
                    WHEN 'EXTERNAL' THEN 'BOOKING_EXTERNAL' ELSE NULL END;
          IF v_source IS NULL THEN
            RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001';
          END IF;
          SELECT grant_row.* INTO v_grant FROM public.lesson_access_grants AS grant_row
          WHERE grant_row.booking_id=p_booking_id FOR UPDATE;
          IF FOUND THEN
            IF v_grant.source<>v_source OR v_grant.policy_version<>1 OR
               v_grant.capability_set_code<>'LESSON_SHELL_V1' OR
               v_grant.valid_from<>v_booking.starts_at-make_interval(mins=>15) OR
               v_grant.valid_until<>v_booking.ends_at
            THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF;
            RETURN v_grant.id;
          END IF;
          v_operation_id:=public.new_lesson_access_operation_id();
          INSERT INTO public.lesson_access_grants(booking_id,source,valid_from,valid_until,
            issue_operation_id) VALUES(p_booking_id,v_source,
            v_booking.starts_at-make_interval(mins=>15),v_booking.ends_at,v_operation_id)
          RETURNING * INTO v_grant;
          PERFORM public.append_lesson_access_audit(p_actor_type,p_actor_id,v_grant.id,
            'lesson_access_grant.issued',v_source,v_operation_id,p_correlation_id,
            p_request_id,p_reason);
          RETURN v_grant.id;
        END $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.issue_lesson_access_grant(uuid,text,text,uuid,text,text) "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.revoke_lesson_access_grant(
          p_booking_id uuid,p_actor_id uuid,p_correlation_id uuid,p_request_id text
        ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_grant public.lesson_access_grants%ROWTYPE; v_operation_id uuid;
        BEGIN
          SELECT grant_row.* INTO v_grant FROM public.lesson_access_grants AS grant_row
          WHERE grant_row.booking_id=p_booking_id FOR UPDATE;
          IF NOT FOUND THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF;
          IF v_grant.revoked_at IS NOT NULL THEN RETURN v_grant.id; END IF;
          v_operation_id:=public.new_lesson_access_operation_id();
          UPDATE public.lesson_access_grants AS grant_row
          SET revoked_at=clock_timestamp(),revoked_by_actor_type='account',
              revoked_by_actor_id=p_actor_id::text,revoke_operation_id=v_operation_id,
              revoke_reason='BOOKING_CANCELLED'
          WHERE grant_row.id=v_grant.id RETURNING * INTO v_grant;
          PERFORM public.append_lesson_access_audit('account',p_actor_id::text,v_grant.id,
            'lesson_access_grant.revoked',v_grant.source,v_operation_id,p_correlation_id,
            p_request_id,'BOOKING_CANCELLED');
          RETURN v_grant.id;
        END $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.revoke_lesson_access_grant(uuid,uuid,uuid,text) "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
    )


def _replace_booking_transitions() -> None:
    op.execute(f"""
      CREATE OR REPLACE FUNCTION public.accept_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        SELECT booking.* INTO v_row FROM public.bookings AS booking
        WHERE booking.id=p_id AND booking.tutor_account_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(p_operation_id,v_actor,'booking.accept','booking',p_digest);
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF v_row.status<>'REQUESTED' THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
        IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id<>v_row.id AND b.status='ACCEPTED' AND b.starts_at<v_row.ends_at AND v_row.starts_at<b.ends_at AND (b.tutor_account_id IN (v_row.tutor_account_id,v_row.student_account_id) OR b.student_account_id IN (v_row.tutor_account_id,v_row.student_account_id))) THEN RAISE EXCEPTION 'booking_overlap' USING ERRCODE='P0001'; END IF;
        UPDATE public.bookings AS booking SET status='ACCEPTED',version=booking.version+1,
          accepted_at=clock_timestamp() WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.issue_lesson_access_grant(v_row.id,'account',v_actor::text,
          p_correlation_id,p_request_id,'booking_accept');
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.accept','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.accepted','booking.accept',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)
    op.execute(f"""
      CREATE OR REPLACE FUNCTION public.cancel_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE; v_role text; v_was_accepted boolean;
      BEGIN
        SELECT booking.* INTO v_row FROM public.bookings AS booking
        WHERE booking.id=p_id AND v_actor IN (booking.tutor_account_id,booking.student_account_id) FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(p_operation_id,v_actor,'booking.cancel','booking',p_digest);
        v_role:=CASE WHEN v_actor=v_row.tutor_account_id THEN 'tutor' ELSE 'student' END;
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF NOT ((v_row.status='REQUESTED' AND v_role='student') OR v_row.status='ACCEPTED') THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        v_was_accepted:=v_row.status='ACCEPTED';
        IF v_was_accepted THEN
          PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
          IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        END IF;
        UPDATE public.bookings AS booking SET status='CANCELLED',version=booking.version+1,
          cancelled_at=clock_timestamp(),cancelled_by_role=v_role
        WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        IF v_was_accepted THEN
          PERFORM public.revoke_lesson_access_grant(v_row.id,v_actor,p_correlation_id,p_request_id);
        END IF;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.cancel','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.cancelled','booking.cancel',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)


def _create_authorization_function() -> None:
    op.execute(
        """
        CREATE FUNCTION public.authorize_lesson_access(p_booking_id uuid)
        RETURNS TABLE(grant_id uuid,booking_id uuid,status text,participant_role text,
                      valid_from timestamptz,valid_until timestamptz)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_actor uuid:=public.current_session_account_id(); v_booking public.bookings%ROWTYPE;
                v_grant public.lesson_access_grants%ROWTYPE; v_status text; v_role text;
        BEGIN
          SELECT booking.* INTO v_booking FROM public.bookings AS booking
          WHERE booking.id=p_booking_id FOR SHARE;
          IF NOT FOUND OR v_actor NOT IN (v_booking.tutor_account_id,v_booking.student_account_id)
          THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
          v_role:=CASE WHEN v_actor=v_booking.tutor_account_id THEN 'tutor' ELSE 'student' END;
          SELECT grant_row.* INTO v_grant FROM public.lesson_access_grants AS grant_row
          WHERE grant_row.booking_id=p_booking_id FOR SHARE;
          IF NOT FOUND THEN
            IF v_booking.status='ACCEPTED' AND v_booking.payment_mode IN ('FREE','EXTERNAL')
            THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF;
            RAISE EXCEPTION 'lesson_access_unavailable' USING ERRCODE='P0001';
          END IF;
          IF v_grant.source<>(CASE v_booking.payment_mode WHEN 'FREE' THEN 'BOOKING_FREE' WHEN 'EXTERNAL' THEN 'BOOKING_EXTERNAL' ELSE '' END)
             OR v_grant.policy_version<>1 OR v_grant.capability_set_code<>'LESSON_SHELL_V1'
             OR v_grant.valid_from<>v_booking.starts_at-make_interval(mins=>15)
             OR v_grant.valid_until<>v_booking.ends_at
             OR v_booking.status NOT IN ('ACCEPTED','CANCELLED')
             OR (v_booking.status='ACCEPTED' AND v_grant.revoked_at IS NOT NULL)
             OR (v_booking.status='CANCELLED' AND v_grant.revoked_at IS NULL)
          THEN RAISE EXCEPTION 'lesson_access_policy_unavailable' USING ERRCODE='P0001'; END IF;
          v_status:=public.derive_lesson_access_status(
            v_grant.revoked_at,v_grant.valid_from,v_grant.valid_until,CURRENT_TIMESTAMP);
          RETURN QUERY SELECT v_grant.id,v_grant.booking_id,v_status,v_role,
                              v_grant.valid_from,v_grant.valid_until;
        END $$
        """
    )
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {AUTHORIZE_SIGNATURE} FROM PUBLIC")
    op.execute(
        f"REVOKE ALL PRIVILEGES ON FUNCTION {AUTHORIZE_SIGNATURE} "
        "FROM electro_tutor_auth_runtime, electro_tutor_provisioner"
    )
    op.execute(f"GRANT EXECUTE ON FUNCTION {AUTHORIZE_SIGNATURE} TO electro_tutor_runtime")


def _backfill_accepted_bookings() -> None:
    op.execute(
        """
        DO $$
        DECLARE v_booking record; v_run_correlation uuid:=gen_random_uuid();
        BEGIN
          FOR v_booking IN SELECT id FROM public.bookings
                           WHERE status='ACCEPTED' AND payment_mode IN ('FREE','EXTERNAL')
                           ORDER BY id
          LOOP
            PERFORM public.issue_lesson_access_grant(v_booking.id,'service',
              'lesson-access-migration',v_run_correlation,NULL,'migration_backfill');
          END LOOP;
        END $$
        """
    )


def downgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {AUTHORIZE_SIGNATURE}")
    _restore_booking_transitions()
    op.execute(
        "DROP TRIGGER IF EXISTS audit_events_lesson_access_migration_actor "
        "ON public.audit_events"
    )
    op.execute("DROP FUNCTION IF EXISTS public.prevent_lesson_access_migration_impersonation()")
    for signature in (
        "public.revoke_lesson_access_grant(uuid,uuid,uuid,text)",
        "public.issue_lesson_access_grant(uuid,text,text,uuid,text,text)",
        "public.append_lesson_access_audit(text,text,uuid,text,text,uuid,uuid,text,text)",
        "public.new_lesson_access_operation_id()",
        "public.derive_lesson_access_status(timestamptz,timestamptz,timestamptz,timestamptz)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
    op.execute("DROP TRIGGER IF EXISTS lesson_access_grants_one_way_revoke ON public.lesson_access_grants")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_lesson_access_grant_rewrite()")
    op.execute("DELETE FROM public.audit_events WHERE action IN ('lesson_access_grant.issued','lesson_access_grant.revoked')")
    op.drop_table("lesson_access_grants")
    _restore_audit_contract()


def _restore_booking_transitions() -> None:
    op.execute(f"""
      CREATE OR REPLACE FUNCTION public.accept_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        SELECT booking.* INTO v_row FROM public.bookings AS booking WHERE booking.id=p_id AND booking.tutor_account_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(p_operation_id,v_actor,'booking.accept','booking',p_digest);
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF v_row.status<>'REQUESTED' THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
        IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id<>v_row.id AND b.status='ACCEPTED' AND b.starts_at<v_row.ends_at AND v_row.starts_at<b.ends_at AND (b.tutor_account_id IN (v_row.tutor_account_id,v_row.student_account_id) OR b.student_account_id IN (v_row.tutor_account_id,v_row.student_account_id))) THEN RAISE EXCEPTION 'booking_overlap' USING ERRCODE='P0001'; END IF;
        UPDATE public.bookings AS booking SET status='ACCEPTED',version=booking.version+1,accepted_at=clock_timestamp() WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.accept','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.accepted','booking.accept',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)
    op.execute(f"""
      CREATE OR REPLACE FUNCTION public.cancel_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE; v_role text;
      BEGIN
        SELECT booking.* INTO v_row FROM public.bookings AS booking WHERE booking.id=p_id AND v_actor IN (booking.tutor_account_id,booking.student_account_id) FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(p_operation_id,v_actor,'booking.cancel','booking',p_digest);
        v_role:=CASE WHEN v_actor=v_row.tutor_account_id THEN 'tutor' ELSE 'student' END;
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF NOT ((v_row.status='REQUESTED' AND v_role='student') OR v_row.status='ACCEPTED') THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        IF v_row.status='ACCEPTED' THEN
          PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
          IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        END IF;
        UPDATE public.bookings AS booking SET status='CANCELLED',version=booking.version+1,cancelled_at=clock_timestamp(),cancelled_by_role=v_role WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.cancel','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.cancelled','booking.cancel',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)


def _restore_audit_contract() -> None:
    for constraint in (
        "ck_audit_events_actor_id",
        "ck_audit_events_subject_type",
        "ck_audit_events_action",
        "ck_audit_events_metadata_keys",
        "ck_audit_events_metadata_values",
    ):
        op.drop_constraint(constraint, "audit_events", type_="check")
    op.create_check_constraint("ck_audit_events_actor_id", "audit_events", "CASE actor_type WHEN 'account' THEN actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' WHEN 'service' THEN actor_id='tutor-provisioner' ELSE false END")
    op.create_check_constraint("ck_audit_events_subject_type", "audit_events", "subject_type IN ('account','capability_grant','tutor_profile','tutor_offer','booking')")
    op.create_check_constraint("ck_audit_events_action", "audit_events", "action IN ('tutor_capability.granted','tutor_capability.revoked','tutor_profile.created','tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled')")
    op.create_check_constraint("ck_audit_events_metadata_keys", "audit_events", "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[]='{}'::jsonb) OR (action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[]='{}'::jsonb) OR (action IN ('tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired','booking.requested','booking.accepted','booking.declined','booking.cancelled') AND metadata - ARRAY['operation_action','result_version']::text[]='{}'::jsonb))")
    op.create_check_constraint("ck_audit_events_metadata_values", "audit_events", "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND metadata->>'capability_code' IN ('TUTOR_PROFILE_MANAGE_OWN','TUTOR_BOOKING_MANAGE_OWN'))) AND (NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND (NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND (NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND (NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'operation_action' OR (jsonb_typeof(metadata->'operation_action')='string' AND metadata->>'operation_action' IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel'))) AND (NOT metadata ? 'result_version' OR (jsonb_typeof(metadata->'result_version')='string' AND metadata->>'result_version' ~ '^[1-9][0-9]*$'))")


def _booking_return_table() -> str:
    return """RETURNS TABLE(id uuid,offer_id uuid,tutor_account_id uuid,student_account_id uuid,status varchar,version integer,snapshot_version smallint,offer_version integer,offer_title varchar,starts_at timestamptz,ends_at timestamptz,tutor_time_zone varchar,student_time_zone varchar,duration_minutes integer,minimum_notice_minutes integer,payment_mode varchar,amount_minor bigint,currency varchar,currency_exponent smallint,cancellation_policy_code varchar,requested_at timestamptz,accepted_at timestamptz,declined_at timestamptz,cancelled_at timestamptz,cancelled_by_role varchar)"""
