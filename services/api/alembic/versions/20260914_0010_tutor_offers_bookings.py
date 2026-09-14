"""Add session-bound tutor offers, bookings, and idempotent operation ledger."""

# SQL signatures and constraint expressions are intentionally kept contiguous.
# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260914_0010"
down_revision: str | None = "20260912_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


RUNTIME_FUNCTIONS = (
    "public.read_booking_operation(uuid)",
    "public.create_tutor_offer(uuid,text,timestamptz,timestamptz,text,integer,text,bigint,text,smallint,uuid,text,uuid,text)",
    "public.revise_tutor_offer(uuid,integer,text,timestamptz,timestamptz,text,integer,text,bigint,text,smallint,uuid,text,uuid,text)",
    "public.publish_tutor_offer(uuid,integer,uuid,text,uuid,text)",
    "public.retire_tutor_offer(uuid,integer,uuid,text,uuid,text)",
    "public.read_tutor_offer(uuid)",
    "public.list_own_tutor_offers()",
    "public.request_booking(uuid,uuid,integer,text,uuid,text,uuid,text)",
    "public.read_booking(uuid)",
    "public.list_own_bookings(text)",
    "public.accept_booking(uuid,integer,uuid,text,uuid,text)",
    "public.decline_booking(uuid,integer,uuid,text,uuid,text)",
    "public.cancel_booking(uuid,integer,uuid,text,uuid,text)",
)


def _secure_runtime_function(signature: str) -> None:
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {signature} FROM PUBLIC")
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {signature} FROM electro_tutor_auth_runtime")
    op.execute(f"REVOKE ALL PRIVILEGES ON FUNCTION {signature} FROM electro_tutor_provisioner")
    op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO electro_tutor_runtime")


def upgrade() -> None:
    op.drop_constraint("ck_capability_grants_code", "capability_grants", type_="check")
    op.create_check_constraint(
        "ck_capability_grants_code",
        "capability_grants",
        "capability_code IN ('TUTOR_PROFILE_MANAGE_OWN', 'TUTOR_BOOKING_MANAGE_OWN')",
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.lock_active_capability_grant(
            p_account_id uuid, p_capability_code text
        ) RETURNS boolean
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        BEGIN
            IF p_capability_code NOT IN (
                'TUTOR_PROFILE_MANAGE_OWN', 'TUTOR_BOOKING_MANAGE_OWN'
            ) THEN RETURN false; END IF;
            PERFORM 1 FROM public.capability_grants
            WHERE subject_account_id=p_account_id
              AND capability_code=p_capability_code
              AND scope_kind='account' AND scope_id=p_account_id
              AND revoked_at IS NULL
            FOR UPDATE;
            RETURN FOUND;
        END $$
        """
    )

    for constraint in (
        "ck_audit_events_subject_type",
        "ck_audit_events_action",
        "ck_audit_events_metadata_keys",
        "ck_audit_events_metadata_values",
    ):
        op.drop_constraint(constraint, "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_subject_type",
        "audit_events",
        "subject_type IN ('account','capability_grant','tutor_profile','tutor_offer','booking')",
    )
    op.create_check_constraint(
        "ck_audit_events_action",
        "audit_events",
        "action IN ('tutor_capability.granted','tutor_capability.revoked',"
        "'tutor_profile.created','tutor_offer.created','tutor_offer.revised',"
        "'tutor_offer.published','tutor_offer.retired','booking.requested',"
        "'booking.accepted','booking.declined','booking.cancelled')",
    )
    op.create_check_constraint(
        "ck_audit_events_metadata_keys",
        "audit_events",
        "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND "
        "metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[] = '{}'::jsonb) OR "
        "(action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[] = '{}'::jsonb) OR "
        "(action IN ('tutor_offer.created','tutor_offer.revised','tutor_offer.published','tutor_offer.retired',"
        "'booking.requested','booking.accepted','booking.declined','booking.cancelled') AND "
        "metadata - ARRAY['operation_action','result_version']::text[] = '{}'::jsonb))",
    )
    op.create_check_constraint(
        "ck_audit_events_metadata_values",
        "audit_events",
        "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND "
        "metadata->>'capability_code' IN ('TUTOR_PROFILE_MANAGE_OWN','TUTOR_BOOKING_MANAGE_OWN'))) AND "
        "(NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND "
        "(NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND "
        "(NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND "
        "metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND "
        "(NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ "
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND "
        "(NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ "
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND "
        "(NOT metadata ? 'operation_action' OR (jsonb_typeof(metadata->'operation_action')='string' AND "
        "metadata->>'operation_action' IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire',"
        "'booking.request','booking.accept','booking.decline','booking.cancel'))) AND "
        "(NOT metadata ? 'result_version' OR (jsonb_typeof(metadata->'result_version')='string' AND "
        "metadata->>'result_version' ~ '^[1-9][0-9]*$'))",
    )

    op.create_table(
        "tutor_offers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tutor_account_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(16), server_default="DRAFT", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_zone", sa.String(64), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("minimum_notice_minutes", sa.Integer(), nullable=False),
        sa.Column("payment_mode", sa.String(16), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("currency_exponent", sa.SmallInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('DRAFT','ACTIVE','RETIRED')", name="ck_tutor_offers_status"),
        sa.CheckConstraint("version >= 1", name="ck_tutor_offers_version"),
        sa.CheckConstraint("char_length(title) BETWEEN 1 AND 120 AND title !~ '[[:cntrl:]]'", name="ck_tutor_offers_title"),
        sa.CheckConstraint("starts_at < ends_at", name="ck_tutor_offers_interval"),
        sa.CheckConstraint("duration_minutes BETWEEN 15 AND 480 AND duration_minutes % 15 = 0 AND ends_at = starts_at + make_interval(mins => duration_minutes)", name="ck_tutor_offers_duration"),
        sa.CheckConstraint("minimum_notice_minutes BETWEEN 0 AND 10080", name="ck_tutor_offers_notice"),
        sa.CheckConstraint("char_length(time_zone) BETWEEN 1 AND 64 AND time_zone !~ '[[:cntrl:]]'", name="ck_tutor_offers_time_zone"),
        sa.CheckConstraint("(payment_mode='FREE' AND amount_minor=0 AND currency IS NULL AND currency_exponent IS NULL) OR (payment_mode='EXTERNAL' AND amount_minor BETWEEN 1 AND 100000000 AND currency IN ('UAH','EUR','USD') AND currency_exponent=2)", name="ck_tutor_offers_money"),
        sa.CheckConstraint("(status='DRAFT' AND published_at IS NULL AND retired_at IS NULL) OR (status='ACTIVE' AND published_at IS NOT NULL AND retired_at IS NULL) OR (status='RETIRED' AND retired_at IS NOT NULL)", name="ck_tutor_offers_lifecycle"),
        sa.CheckConstraint("updated_at >= created_at AND (published_at IS NULL OR published_at >= created_at) AND (retired_at IS NULL OR retired_at >= created_at)", name="ck_tutor_offers_timestamps"),
        sa.ForeignKeyConstraint(["tutor_account_id"], ["accounts.id"], name="fk_tutor_offers_tutor_account", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_tutor_offers"),
    )
    op.create_index("ix_tutor_offers_owner_updated", "tutor_offers", ["tutor_account_id", "updated_at"])
    op.create_index("ix_tutor_offers_active_start", "tutor_offers", ["starts_at"], postgresql_where=sa.text("status='ACTIVE'"))

    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("offer_id", sa.Uuid(), nullable=False),
        sa.Column("tutor_account_id", sa.Uuid(), nullable=False),
        sa.Column("student_account_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(16), server_default="REQUESTED", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("snapshot_version", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column("offer_version", sa.Integer(), nullable=False),
        sa.Column("offer_title", sa.String(120), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tutor_time_zone", sa.String(64), nullable=False),
        sa.Column("student_time_zone", sa.String(64), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("minimum_notice_minutes", sa.Integer(), nullable=False),
        sa.Column("payment_mode", sa.String(16), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("currency_exponent", sa.SmallInteger(), nullable=True),
        sa.Column("cancellation_policy_code", sa.String(64), server_default="participant_before_start_v1", nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("declined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by_role", sa.String(16), nullable=True),
        sa.CheckConstraint("tutor_account_id <> student_account_id", name="ck_bookings_distinct_participants"),
        sa.CheckConstraint("status IN ('REQUESTED','ACCEPTED','DECLINED','CANCELLED')", name="ck_bookings_status"),
        sa.CheckConstraint("version >= 1 AND snapshot_version=1 AND offer_version >= 1", name="ck_bookings_versions"),
        sa.CheckConstraint("starts_at < ends_at AND duration_minutes BETWEEN 15 AND 480 AND duration_minutes % 15=0 AND ends_at=starts_at+make_interval(mins=>duration_minutes)", name="ck_bookings_interval"),
        sa.CheckConstraint("minimum_notice_minutes BETWEEN 0 AND 10080", name="ck_bookings_notice"),
        sa.CheckConstraint("char_length(offer_title) BETWEEN 1 AND 120 AND offer_title !~ '[[:cntrl:]]'", name="ck_bookings_title"),
        sa.CheckConstraint("char_length(tutor_time_zone) BETWEEN 1 AND 64 AND char_length(student_time_zone) BETWEEN 1 AND 64", name="ck_bookings_time_zones"),
        sa.CheckConstraint("(payment_mode='FREE' AND amount_minor=0 AND currency IS NULL AND currency_exponent IS NULL) OR (payment_mode='EXTERNAL' AND amount_minor BETWEEN 1 AND 100000000 AND currency IN ('UAH','EUR','USD') AND currency_exponent=2)", name="ck_bookings_money"),
        sa.CheckConstraint("cancellation_policy_code='participant_before_start_v1'", name="ck_bookings_cancel_policy"),
        sa.CheckConstraint("(status='REQUESTED' AND accepted_at IS NULL AND declined_at IS NULL AND cancelled_at IS NULL AND cancelled_by_role IS NULL) OR (status='ACCEPTED' AND accepted_at IS NOT NULL AND declined_at IS NULL AND cancelled_at IS NULL AND cancelled_by_role IS NULL) OR (status='DECLINED' AND accepted_at IS NULL AND declined_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_role IS NULL) OR (status='CANCELLED' AND declined_at IS NULL AND cancelled_at IS NOT NULL AND cancelled_by_role IN ('student','tutor'))", name="ck_bookings_lifecycle"),
        sa.ForeignKeyConstraint(["offer_id"], ["tutor_offers.id"], name="fk_bookings_offer", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tutor_account_id"], ["accounts.id"], name="fk_bookings_tutor_account", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_account_id"], ["accounts.id"], name="fk_bookings_student_account", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_bookings"),
    )
    op.create_index("uq_bookings_offer_open", "bookings", ["offer_id"], unique=True, postgresql_where=sa.text("status IN ('REQUESTED','ACCEPTED')"))
    op.create_index("ix_bookings_tutor_list", "bookings", ["tutor_account_id", "requested_at"])
    op.create_index("ix_bookings_student_list", "bookings", ["student_account_id", "requested_at"])
    op.create_index("ix_bookings_tutor_accepted_overlap", "bookings", ["tutor_account_id", "starts_at", "ends_at"], postgresql_where=sa.text("status='ACCEPTED'"))
    op.create_index("ix_bookings_student_accepted_overlap", "bookings", ["student_account_id", "starts_at", "ends_at"], postgresql_where=sa.text("status='ACCEPTED'"))

    op.create_table(
        "booking_operations",
        sa.Column("operation_id", sa.Uuid(), nullable=False),
        sa.Column("actor_account_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("intent_digest", sa.String(64), nullable=False),
        sa.Column("result_version", sa.Integer(), nullable=False),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("action IN ('tutor_offer.create','tutor_offer.revise','tutor_offer.publish','tutor_offer.retire','booking.request','booking.accept','booking.decline','booking.cancel')", name="ck_booking_operations_action"),
        sa.CheckConstraint("(target_type='tutor_offer' AND action LIKE 'tutor_offer.%') OR (target_type='booking' AND action LIKE 'booking.%')", name="ck_booking_operations_target"),
        sa.CheckConstraint("intent_digest ~ '^[0-9a-f]{64}$'", name="ck_booking_operations_digest"),
        sa.CheckConstraint("result_version >= 1", name="ck_booking_operations_result_version"),
        sa.CheckConstraint(
            "jsonb_typeof(result_payload)='object' AND "
            "octet_length(convert_to(result_payload::text,'UTF8')) <= 16384 AND "
            "NOT result_payload ?| ARRAY['tutor_account_id','student_account_id']",
            name="ck_booking_operations_result_payload",
        ),
        sa.ForeignKeyConstraint(["actor_account_id"], ["accounts.id"], name="fk_booking_operations_actor", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("operation_id", name="pk_booking_operations"),
    )
    op.create_index("ix_booking_operations_target", "booking_operations", ["target_type", "target_id", "completed_at"])

    op.execute(
        """
        CREATE FUNCTION public.prevent_booking_snapshot_rewrite() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog AS $$
        BEGIN
          IF ROW(NEW.offer_id,NEW.tutor_account_id,NEW.student_account_id,NEW.snapshot_version,
                 NEW.offer_version,NEW.offer_title,NEW.starts_at,NEW.ends_at,
                 NEW.tutor_time_zone,NEW.student_time_zone,NEW.duration_minutes,
                 NEW.minimum_notice_minutes,NEW.payment_mode,NEW.amount_minor,
                 NEW.currency,NEW.currency_exponent,NEW.cancellation_policy_code,NEW.requested_at)
             IS DISTINCT FROM
             ROW(OLD.offer_id,OLD.tutor_account_id,OLD.student_account_id,OLD.snapshot_version,
                 OLD.offer_version,OLD.offer_title,OLD.starts_at,OLD.ends_at,
                 OLD.tutor_time_zone,OLD.student_time_zone,OLD.duration_minutes,
                 OLD.minimum_notice_minutes,OLD.payment_mode,OLD.amount_minor,
                 OLD.currency,OLD.currency_exponent,OLD.cancellation_policy_code,OLD.requested_at)
          THEN RAISE EXCEPTION 'booking_snapshot_immutable' USING ERRCODE='P0001'; END IF;
          RETURN NEW;
        END $$
        """
    )
    op.execute("CREATE TRIGGER bookings_immutable_snapshot BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_snapshot_rewrite()")
    op.execute(
        """
        CREATE FUNCTION public.prevent_booking_operation_rewrite() RETURNS trigger
        LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
          RAISE EXCEPTION 'booking_operations_append_only' USING ERRCODE='P0001';
        END $$
        """
    )
    op.execute("CREATE TRIGGER booking_operations_append_only BEFORE UPDATE OR DELETE ON public.booking_operations FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_operation_rewrite()")

    _create_helpers_and_functions()

    for table in ("tutor_offers", "bookings", "booking_operations"):
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM PUBLIC")
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_runtime")
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_auth_runtime")
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM electro_tutor_provisioner")
    for signature in RUNTIME_FUNCTIONS:
        _secure_runtime_function(signature)


def _create_helpers_and_functions() -> None:
    op.execute(
        """
        CREATE FUNCTION public.begin_booking_operation(
          p_operation_id uuid,p_actor uuid,p_action text,p_target_type text,p_intent_digest text
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        DECLARE v_existing public.booking_operations%ROWTYPE;
        BEGIN
          PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(p_operation_id::text,7811)
          );
          SELECT operation.* INTO v_existing
          FROM public.booking_operations AS operation
          WHERE operation.operation_id=p_operation_id;
          IF FOUND THEN
            IF v_existing.actor_account_id=p_actor
               AND v_existing.action=p_action
               AND v_existing.target_type=p_target_type
               AND v_existing.intent_digest=p_intent_digest
            THEN
              RAISE EXCEPTION 'booking_operation_replay' USING ERRCODE='P0001';
            END IF;
            RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001';
          END IF;
          IF EXISTS (
               SELECT 1 FROM public.audit_events AS event
               WHERE event.operation_id=p_operation_id
             ) OR EXISTS (
               SELECT 1 FROM public.capability_grant_operations AS operation
               WHERE operation.operation_id=p_operation_id
             )
          THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF;
        END $$
        """
    )
    op.execute(
        "REVOKE ALL PRIVILEGES ON FUNCTION "
        "public.begin_booking_operation(uuid,uuid,text,text,text) "
        "FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, "
        "electro_tutor_provisioner"
    )
    op.execute(
        """
        CREATE FUNCTION public.reserve_booking_operation(
          p_operation_id uuid,p_actor uuid,p_action text,p_target_type text,
          p_target_id uuid,p_intent_digest text,p_result_version integer,p_result_payload jsonb
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM public.audit_events WHERE operation_id=p_operation_id)
             OR EXISTS (SELECT 1 FROM public.capability_grant_operations WHERE operation_id=p_operation_id)
          THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF;
          INSERT INTO public.booking_operations(operation_id,actor_account_id,action,target_type,
                                                target_id,intent_digest,result_version,result_payload)
          VALUES(p_operation_id,p_actor,p_action,p_target_type,p_target_id,p_intent_digest,
                 p_result_version,p_result_payload);
        EXCEPTION WHEN unique_violation THEN
          RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001';
        END $$
        """
    )
    op.execute("REVOKE ALL PRIVILEGES ON FUNCTION public.reserve_booking_operation(uuid,uuid,text,text,uuid,text,integer,jsonb) FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner")
    op.execute(
        """
        CREATE FUNCTION public.append_booking_audit(
          p_actor uuid,p_subject_type text,p_subject_id uuid,p_action text,
          p_operation_action text,p_result_version integer,p_operation_id uuid,
          p_correlation_id uuid,p_request_id text
        ) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
          INSERT INTO public.audit_events(
            actor_type,actor_id,subject_type,subject_id,action,result,
            request_id,correlation_id,operation_id,metadata
          ) VALUES (
            'account',p_actor::text,p_subject_type,p_subject_id::text,p_action,'succeeded',
            p_request_id,p_correlation_id,p_operation_id,
            jsonb_build_object('operation_action',p_operation_action,
                               'result_version',p_result_version::text)
          )
        $$
        """
    )
    op.execute("REVOKE ALL PRIVILEGES ON FUNCTION public.append_booking_audit(uuid,text,uuid,text,text,integer,uuid,uuid,text) FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner")
    op.execute(
        """
        CREATE FUNCTION public.lock_booking_participants(p_first uuid,p_second uuid) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
        BEGIN
          PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(LEAST(p_first,p_second)::text, 7810));
          PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(GREATEST(p_first,p_second)::text, 7810));
        END $$
        """
    )
    op.execute("REVOKE ALL PRIVILEGES ON FUNCTION public.lock_booking_participants(uuid,uuid) FROM PUBLIC, electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner")

    offer_cols = "id,tutor_account_id,status,version,title,starts_at,ends_at,time_zone,duration_minutes,minimum_notice_minutes,payment_mode,amount_minor,currency,currency_exponent,created_at,updated_at,published_at,retired_at"
    booking_cols = "id,offer_id,tutor_account_id,student_account_id,status,version,snapshot_version,offer_version,offer_title,starts_at,ends_at,tutor_time_zone,student_time_zone,duration_minutes,minimum_notice_minutes,payment_mode,amount_minor,currency,currency_exponent,cancellation_policy_code,requested_at,accepted_at,declined_at,cancelled_at,cancelled_by_role"
    op.execute("""
      CREATE FUNCTION public.read_booking_operation(p_operation_id uuid)
      RETURNS TABLE(operation_id uuid,actor_account_id uuid,action varchar,target_type varchar,target_id uuid,intent_digest varchar,result_version integer,result_payload jsonb,completed_at timestamptz)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT o.operation_id,o.actor_account_id,o.action,o.target_type,o.target_id,
               o.intent_digest,o.result_version,
               CASE o.target_type
                 WHEN 'tutor_offer' THEN o.result_payload || jsonb_build_object(
                   'tutor_account_id',offer.tutor_account_id)
                 WHEN 'booking' THEN o.result_payload || jsonb_build_object(
                   'tutor_account_id',booking.tutor_account_id,
                   'student_account_id',booking.student_account_id)
               END,
               o.completed_at
        FROM public.booking_operations o
        LEFT JOIN public.tutor_offers offer
          ON o.target_type='tutor_offer' AND offer.id=o.target_id
        LEFT JOIN public.bookings booking
          ON o.target_type='booking' AND booking.id=o.target_id
        WHERE o.operation_id=p_operation_id
          AND o.actor_account_id=public.current_session_account_id()
      $$
    """)
    op.execute(f"""
      CREATE FUNCTION public.create_tutor_offer(p_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_time_zone text,p_notice integer,p_payment_mode text,p_amount bigint,p_currency text,p_exponent smallint,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_offer_return_table()}
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.tutor_offers%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'tutor_offer.create','tutor_offer',p_digest
        );
        INSERT INTO public.tutor_offers(id,tutor_account_id,title,starts_at,ends_at,time_zone,duration_minutes,minimum_notice_minutes,payment_mode,amount_minor,currency,currency_exponent)
        VALUES(p_id,v_actor,p_title,p_starts_at,p_ends_at,p_time_zone,(EXTRACT(EPOCH FROM (p_ends_at-p_starts_at))/60)::integer,p_notice,p_payment_mode,p_amount,p_currency,p_exponent) RETURNING tutor_offers.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'tutor_offer.create','tutor_offer',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id');
        PERFORM public.append_booking_audit(v_actor,'tutor_offer',v_row.id,'tutor_offer.created','tutor_offer.create',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)
    op.execute(f"""
      CREATE FUNCTION public.revise_tutor_offer(p_id uuid,p_expected integer,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_time_zone text,p_notice integer,p_payment_mode text,p_amount bigint,p_currency text,p_exponent smallint,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      RETURNS TABLE({offer_cols}) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.tutor_offers%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        SELECT offer.* INTO v_row FROM public.tutor_offers AS offer
        WHERE offer.id=p_id AND offer.tutor_account_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'tutor_offer_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'tutor_offer.revise','tutor_offer',p_digest
        );
        IF v_row.status='RETIRED' THEN RAISE EXCEPTION 'tutor_offer_not_found' USING ERRCODE='P0001'; END IF;
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        UPDATE public.tutor_offers AS offer SET title=p_title,starts_at=p_starts_at,ends_at=p_ends_at,time_zone=p_time_zone,
          duration_minutes=(EXTRACT(EPOCH FROM (p_ends_at-p_starts_at))/60)::integer,minimum_notice_minutes=p_notice,
          payment_mode=p_payment_mode,amount_minor=p_amount,currency=p_currency,currency_exponent=p_exponent,
          version=offer.version+1,updated_at=CURRENT_TIMESTAMP
        WHERE offer.id=p_id RETURNING offer.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'tutor_offer.revise','tutor_offer',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id');
        PERFORM public.append_booking_audit(v_actor,'tutor_offer',v_row.id,'tutor_offer.revised','tutor_offer.revise',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """.replace(f"RETURNS TABLE({offer_cols})", _offer_return_table()))
    for name, action, status, timestamp in (
        ("publish_tutor_offer", "tutor_offer.publish", "ACTIVE", "published_at"),
        ("retire_tutor_offer", "tutor_offer.retire", "RETIRED", "retired_at"),
    ):
        allowed = "v_row.status='DRAFT'" if status == "ACTIVE" else "v_row.status IN ('DRAFT','ACTIVE')"
        op.execute(f"""
          CREATE FUNCTION public.{name}(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
          {_offer_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
          DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.tutor_offers%ROWTYPE;
          BEGIN
            IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
            SELECT offer.* INTO v_row FROM public.tutor_offers AS offer
            WHERE offer.id=p_id AND offer.tutor_account_id=v_actor FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'tutor_offer_not_found' USING ERRCODE='P0001'; END IF;
            PERFORM public.begin_booking_operation(
              p_operation_id,v_actor,'{action}','tutor_offer',p_digest
            );
            IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
            IF NOT ({allowed}) THEN RAISE EXCEPTION 'invalid_offer_transition' USING ERRCODE='P0001'; END IF;
            UPDATE public.tutor_offers AS offer SET status='{status}',version=offer.version+1,
              updated_at=CURRENT_TIMESTAMP,{timestamp}=CURRENT_TIMESTAMP
            WHERE offer.id=p_id RETURNING offer.* INTO v_row;
            PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'{action}','tutor_offer',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id');
            PERFORM public.append_booking_audit(v_actor,'tutor_offer',v_row.id,'{action.replace('.', '.') + ('ed' if action.endswith('publish') else 'd')}','{action}',v_row.version,p_operation_id,p_correlation_id,p_request_id);
            RETURN QUERY SELECT v_row.*;
          END $$
        """)
    op.execute(f"""CREATE FUNCTION public.read_tutor_offer(p_id uuid) {_offer_return_table()} LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT {','.join('o.'+c for c in offer_cols.split(','))} FROM public.tutor_offers o
      WHERE o.id=p_id AND (o.tutor_account_id=public.current_session_account_id() OR o.status='ACTIVE') $$""")
    op.execute(f"""CREATE FUNCTION public.list_own_tutor_offers() {_offer_return_table()} LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT {','.join('o.'+c for c in offer_cols.split(','))} FROM public.tutor_offers o
      WHERE o.tutor_account_id=public.current_session_account_id() ORDER BY o.created_at,o.id $$""")

    op.execute(f"""
      CREATE FUNCTION public.request_booking(p_id uuid,p_offer_id uuid,p_observed integer,p_student_zone text,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_offer public.tutor_offers%ROWTYPE; v_row public.bookings%ROWTYPE;
      BEGIN
        SELECT offer.* INTO v_offer FROM public.tutor_offers AS offer
        WHERE offer.id=p_offer_id AND offer.status='ACTIVE' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'tutor_offer_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'booking.request','booking',p_digest
        );
        IF v_offer.tutor_account_id=v_actor THEN RAISE EXCEPTION 'self_booking_forbidden' USING ERRCODE='P0001'; END IF;
        IF v_offer.version<>p_observed THEN RAISE EXCEPTION 'offer_changed' USING ERRCODE='P0001'; END IF;
        IF v_offer.starts_at <= clock_timestamp() + make_interval(mins=>v_offer.minimum_notice_minutes) THEN RAISE EXCEPTION 'offer_unavailable' USING ERRCODE='P0001'; END IF;
        INSERT INTO public.bookings(id,offer_id,tutor_account_id,student_account_id,offer_version,offer_title,starts_at,ends_at,tutor_time_zone,student_time_zone,duration_minutes,minimum_notice_minutes,payment_mode,amount_minor,currency,currency_exponent,requested_at)
        VALUES(p_id,v_offer.id,v_offer.tutor_account_id,v_actor,v_offer.version,v_offer.title,v_offer.starts_at,v_offer.ends_at,v_offer.time_zone,p_student_zone,v_offer.duration_minutes,v_offer.minimum_notice_minutes,v_offer.payment_mode,v_offer.amount_minor,v_offer.currency,v_offer.currency_exponent,clock_timestamp())
        RETURNING bookings.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.request','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.requested','booking.request',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'offer_unavailable' USING ERRCODE='P0001';
      END $$
    """)
    op.execute(f"""CREATE FUNCTION public.read_booking(p_id uuid) {_booking_return_table()} LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT {','.join('b.'+c for c in booking_cols.split(','))} FROM public.bookings b WHERE b.id=p_id AND public.current_session_account_id() IN (b.tutor_account_id,b.student_account_id) $$""")
    op.execute(f"""CREATE FUNCTION public.list_own_bookings(p_role text) {_booking_return_table()} LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT {','.join('b.'+c for c in booking_cols.split(','))} FROM public.bookings b WHERE (p_role='tutor' AND b.tutor_account_id=public.current_session_account_id()) OR (p_role='student' AND b.student_account_id=public.current_session_account_id()) ORDER BY b.requested_at,b.id $$""")

    op.execute(f"""
      CREATE FUNCTION public.accept_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        SELECT booking.* INTO v_row FROM public.bookings AS booking
        WHERE booking.id=p_id AND booking.tutor_account_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'booking.accept','booking',p_digest
        );
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF v_row.status<>'REQUESTED' THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
        IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id<>v_row.id AND b.status='ACCEPTED' AND b.starts_at<v_row.ends_at AND v_row.starts_at<b.ends_at AND (b.tutor_account_id IN (v_row.tutor_account_id,v_row.student_account_id) OR b.student_account_id IN (v_row.tutor_account_id,v_row.student_account_id))) THEN RAISE EXCEPTION 'booking_overlap' USING ERRCODE='P0001'; END IF;
        UPDATE public.bookings AS booking SET status='ACCEPTED',version=booking.version+1,
          accepted_at=clock_timestamp() WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.accept','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.accepted','booking.accept',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)
    op.execute(f"""
      CREATE FUNCTION public.decline_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE;
      BEGIN
        IF NOT public.lock_active_capability_grant(v_actor,'TUTOR_BOOKING_MANAGE_OWN') THEN RAISE EXCEPTION 'capability_required' USING ERRCODE='42501'; END IF;
        SELECT booking.* INTO v_row FROM public.bookings AS booking
        WHERE booking.id=p_id AND booking.tutor_account_id=v_actor FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'booking.decline','booking',p_digest
        );
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF v_row.status<>'REQUESTED' THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        UPDATE public.bookings AS booking SET status='DECLINED',version=booking.version+1,
          declined_at=CURRENT_TIMESTAMP WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.decline','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.declined','booking.decline',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)
    op.execute(f"""
      CREATE FUNCTION public.cancel_booking(p_id uuid,p_expected integer,p_operation_id uuid,p_digest text,p_correlation_id uuid,p_request_id text)
      {_booking_return_table()} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE v_actor uuid:=public.current_session_account_id(); v_row public.bookings%ROWTYPE; v_role text;
      BEGIN
        SELECT booking.* INTO v_row FROM public.bookings AS booking
        WHERE booking.id=p_id
          AND v_actor IN (booking.tutor_account_id,booking.student_account_id) FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE='P0001'; END IF;
        PERFORM public.begin_booking_operation(
          p_operation_id,v_actor,'booking.cancel','booking',p_digest
        );
        v_role:=CASE WHEN v_actor=v_row.tutor_account_id THEN 'tutor' ELSE 'student' END;
        IF v_row.version<>p_expected THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='P0001'; END IF;
        IF NOT ((v_row.status='REQUESTED' AND v_role='student') OR v_row.status='ACCEPTED') THEN RAISE EXCEPTION 'invalid_booking_transition' USING ERRCODE='P0001'; END IF;
        IF v_row.status='ACCEPTED' THEN
          PERFORM public.lock_booking_participants(v_row.tutor_account_id,v_row.student_account_id);
          IF v_row.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'booking_time_elapsed' USING ERRCODE='P0001'; END IF;
        END IF;
        UPDATE public.bookings AS booking SET status='CANCELLED',version=booking.version+1,
          cancelled_at=clock_timestamp(),cancelled_by_role=v_role
        WHERE booking.id=p_id RETURNING booking.* INTO v_row;
        PERFORM public.reserve_booking_operation(p_operation_id,v_actor,'booking.cancel','booking',v_row.id,p_digest,v_row.version,to_jsonb(v_row)-'tutor_account_id'-'student_account_id');
        PERFORM public.append_booking_audit(v_actor,'booking',v_row.id,'booking.cancelled','booking.cancel',v_row.version,p_operation_id,p_correlation_id,p_request_id);
        RETURN QUERY SELECT v_row.*;
      END $$
    """)


def _offer_return_table() -> str:
    return """RETURNS TABLE(id uuid,tutor_account_id uuid,status varchar,version integer,title varchar,starts_at timestamptz,ends_at timestamptz,time_zone varchar,duration_minutes integer,minimum_notice_minutes integer,payment_mode varchar,amount_minor bigint,currency varchar,currency_exponent smallint,created_at timestamptz,updated_at timestamptz,published_at timestamptz,retired_at timestamptz)"""


def _booking_return_table() -> str:
    return """RETURNS TABLE(id uuid,offer_id uuid,tutor_account_id uuid,student_account_id uuid,status varchar,version integer,snapshot_version smallint,offer_version integer,offer_title varchar,starts_at timestamptz,ends_at timestamptz,tutor_time_zone varchar,student_time_zone varchar,duration_minutes integer,minimum_notice_minutes integer,payment_mode varchar,amount_minor bigint,currency varchar,currency_exponent smallint,cancellation_policy_code varchar,requested_at timestamptz,accepted_at timestamptz,declined_at timestamptz,cancelled_at timestamptz,cancelled_by_role varchar)"""


def downgrade() -> None:
    for signature in reversed(RUNTIME_FUNCTIONS):
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
    op.execute("DROP FUNCTION IF EXISTS public.lock_booking_participants(uuid,uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.append_booking_audit(uuid,text,uuid,text,text,integer,uuid,uuid,text)")
    op.execute("DROP FUNCTION IF EXISTS public.reserve_booking_operation(uuid,uuid,text,text,uuid,text,integer,jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.begin_booking_operation(uuid,uuid,text,text,text)")
    op.execute("DROP TRIGGER IF EXISTS booking_operations_append_only ON public.booking_operations")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_booking_operation_rewrite()")
    op.execute("DROP TRIGGER IF EXISTS bookings_immutable_snapshot ON public.bookings")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_booking_snapshot_rewrite()")
    op.drop_table("booking_operations")
    op.drop_table("bookings")
    op.drop_table("tutor_offers")

    op.execute(
        "DELETE FROM public.audit_events WHERE action IN ("
        "'tutor_offer.created','tutor_offer.revised','tutor_offer.published',"
        "'tutor_offer.retired','booking.requested','booking.accepted',"
        "'booking.declined','booking.cancelled')"
    )
    op.execute(
        "DELETE FROM public.audit_events "
        "WHERE metadata->>'capability_code'='TUTOR_BOOKING_MANAGE_OWN'"
    )
    op.execute(
        "DELETE FROM public.capability_grant_operations WHERE grant_id IN ("
        "SELECT id FROM public.capability_grants "
        "WHERE capability_code='TUTOR_BOOKING_MANAGE_OWN')"
    )
    op.execute(
        "DELETE FROM public.capability_grants "
        "WHERE capability_code='TUTOR_BOOKING_MANAGE_OWN'"
    )

    for constraint in ("ck_audit_events_subject_type","ck_audit_events_action","ck_audit_events_metadata_keys","ck_audit_events_metadata_values"):
        op.drop_constraint(constraint, "audit_events", type_="check")
    op.create_check_constraint("ck_audit_events_subject_type", "audit_events", "subject_type IN ('account','capability_grant','tutor_profile')")
    op.create_check_constraint("ck_audit_events_action", "audit_events", "action IN ('tutor_capability.granted','tutor_capability.revoked','tutor_profile.created')")
    op.create_check_constraint("ck_audit_events_metadata_keys", "audit_events", "((action IN ('tutor_capability.granted','tutor_capability.revoked') AND metadata - ARRAY['capability_code','grant_id','reason_category','scope_id','scope_kind']::text[]='{}'::jsonb) OR (action='tutor_profile.created' AND metadata - ARRAY['profile_type','reason_category']::text[]='{}'::jsonb))")
    op.create_check_constraint("ck_audit_events_metadata_values", "audit_events", "(NOT metadata ? 'capability_code' OR (jsonb_typeof(metadata->'capability_code')='string' AND metadata->>'capability_code'='TUTOR_PROFILE_MANAGE_OWN')) AND (NOT metadata ? 'scope_kind' OR (jsonb_typeof(metadata->'scope_kind')='string' AND metadata->>'scope_kind'='account')) AND (NOT metadata ? 'profile_type' OR (jsonb_typeof(metadata->'profile_type')='string' AND metadata->>'profile_type'='tutor')) AND (NOT metadata ? 'reason_category' OR (jsonb_typeof(metadata->'reason_category')='string' AND metadata->>'reason_category' IN ('profile_created','provisioned','reconciled','revoked','test'))) AND (NOT metadata ? 'grant_id' OR (jsonb_typeof(metadata->'grant_id')='string' AND metadata->>'grant_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) AND (NOT metadata ? 'scope_id' OR (jsonb_typeof(metadata->'scope_id')='string' AND metadata->>'scope_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))")
    op.drop_constraint("ck_capability_grants_code", "capability_grants", type_="check")
    op.create_check_constraint("ck_capability_grants_code", "capability_grants", "capability_code='TUTOR_PROFILE_MANAGE_OWN'")
    op.execute("""CREATE OR REPLACE FUNCTION public.lock_active_capability_grant(p_account_id uuid,p_capability_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF p_capability_code<>'TUTOR_PROFILE_MANAGE_OWN' THEN RETURN false; END IF; PERFORM 1 FROM public.capability_grants WHERE subject_account_id=p_account_id AND capability_code=p_capability_code AND scope_kind='account' AND scope_id=p_account_id AND revoked_at IS NULL FOR UPDATE; RETURN FOUND; END $$""")
