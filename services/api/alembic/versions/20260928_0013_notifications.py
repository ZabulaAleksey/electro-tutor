"""In-app notification outbox and private inbox.

Only the migrator owns the tables. Runtime access is through narrow,
session-scoped SECURITY DEFINER functions; the worker's batch function
accepts no recipient, payload or SQL identifiers from its caller.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260928_0013"
down_revision: str | None = "20260915_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_outbox",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("recipient_account_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("last_sqlstate", sa.String(5)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_notification_outbox"),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_notification_outbox_recipient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_notification_outbox_booking",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "event_type",
            "booking_id",
            "recipient_account_id",
            name="uq_notification_outbox_business",
        ),
        sa.CheckConstraint(
            "event_type='booking.accepted'", name="ck_notification_outbox_event_type"
        ),
        sa.CheckConstraint("attempts BETWEEN 0 AND 5", name="ck_notification_outbox_attempts"),
        sa.CheckConstraint(
            "last_sqlstate IS NULL OR last_sqlstate ~ '^[0-9A-Z]{5}$'",
            name="ck_notification_outbox_sqlstate",
        ),
        sa.CheckConstraint(
            "delivered_at IS NULL OR delivered_at >= created_at",
            name="ck_notification_outbox_delivery",
        ),
    )
    op.create_index(
        "ix_notification_outbox_pending",
        "notification_outbox",
        ["next_attempt_at", "id"],
        postgresql_where=sa.text("delivered_at IS NULL AND attempts < 5"),
    )
    op.create_index("ix_notification_outbox_retention", "notification_outbox", ["created_at"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("recipient_account_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_notifications_recipient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name="fk_notifications_booking", ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "event_type", "booking_id", "recipient_account_id", name="uq_notifications_business"
        ),
        sa.CheckConstraint("event_type='booking.accepted'", name="ck_notifications_event_type"),
        sa.CheckConstraint(
            "expires_at = created_at + interval '30 days'", name="ck_notifications_retention"
        ),
        sa.CheckConstraint(
            "read_at IS NULL OR read_at >= created_at", name="ck_notifications_read"
        ),
    )
    op.create_index(
        "ix_notifications_owner_inbox",
        "notifications",
        ["recipient_account_id", sa.text("created_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "ix_notifications_owner_unread",
        "notifications",
        ["recipient_account_id", "expires_at"],
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.create_index("ix_notifications_expiry", "notifications", ["expires_at"])
    for table in ("notification_outbox", "notifications"):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON public.{table} FROM PUBLIC, electro_tutor_runtime, "
            "electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    _create_functions()


def _create_functions() -> None:
    op.execute("""
    CREATE FUNCTION public.enqueue_booking_accepted_notification()
    RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
    BEGIN
      INSERT INTO public.notification_outbox
        (recipient_account_id,event_type,booking_id,created_at,next_attempt_at)
      VALUES (NEW.student_account_id,'booking.accepted',NEW.id,NEW.accepted_at,
              NEW.accepted_at)
      ON CONFLICT (event_type,booking_id,recipient_account_id) DO NOTHING;
      RETURN NEW;
    END $$""")
    op.execute("""
    CREATE TRIGGER bookings_notification_accepted
    AFTER UPDATE OF status ON public.bookings
    FOR EACH ROW WHEN (OLD.status='REQUESTED' AND NEW.status='ACCEPTED')
    EXECUTE FUNCTION public.enqueue_booking_accepted_notification()""")
    op.execute("""
    CREATE FUNCTION public.deliver_notification_outbox(p_limit integer)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_event public.notification_outbox%ROWTYPE; v_delivered integer:=0;
    BEGIN
      IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
        RAISE EXCEPTION 'invalid_notification_batch' USING ERRCODE='22023';
      END IF;
      FOR v_event IN
        SELECT event.* FROM public.notification_outbox AS event
        WHERE event.delivered_at IS NULL AND event.attempts<5
          AND event.next_attempt_at<=clock_timestamp()
          AND event.created_at>clock_timestamp()-interval '30 days'
        ORDER BY event.next_attempt_at,event.id
        LIMIT p_limit FOR UPDATE SKIP LOCKED
      LOOP
        BEGIN
          INSERT INTO public.notifications
            (recipient_account_id,event_type,booking_id,created_at,expires_at)
          VALUES (v_event.recipient_account_id,v_event.event_type,v_event.booking_id,
                  v_event.created_at,v_event.created_at+interval '30 days')
          ON CONFLICT (event_type,booking_id,recipient_account_id) DO NOTHING;
          UPDATE public.notification_outbox
          SET delivered_at=clock_timestamp(),attempts=attempts+1,
              last_sqlstate=NULL
          WHERE id=v_event.id;
          v_delivered:=v_delivered+1;
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.notification_outbox
          SET attempts=attempts+1,last_sqlstate=SQLSTATE,
              next_attempt_at=clock_timestamp()+make_interval(mins=>power(2,attempts)::integer)
          WHERE id=v_event.id;
        END;
      END LOOP;
      RETURN v_delivered;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.list_notifications(p_limit integer,p_offset integer)
    RETURNS TABLE(id uuid,event_type text,booking_id uuid,created_at timestamptz,
                  expires_at timestamptz,read_at timestamptz)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_actor uuid:=public.current_session_account_id();
    BEGIN
      IF p_limit IS NULL OR p_limit<1 OR p_limit>50 OR
         p_offset IS NULL OR p_offset<0 THEN
        RAISE EXCEPTION 'invalid_notification_page' USING ERRCODE='22023';
      END IF;
      RETURN QUERY
      SELECT n.id,n.event_type::text,n.booking_id,n.created_at,n.expires_at,n.read_at
      FROM public.notifications AS n
      WHERE n.recipient_account_id=v_actor AND n.expires_at>clock_timestamp()
      ORDER BY n.created_at DESC,n.id DESC LIMIT p_limit OFFSET p_offset;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.count_unread_notifications()
    RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_actor uuid:=public.current_session_account_id(); v_count bigint;
    BEGIN
      SELECT count(*) INTO v_count FROM public.notifications AS n
      WHERE n.recipient_account_id=v_actor AND n.read_at IS NULL
        AND n.expires_at>clock_timestamp();
      RETURN v_count;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.mark_notification_read(p_id uuid)
    RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_actor uuid:=public.current_session_account_id();
    BEGIN
      UPDATE public.notifications AS n
      SET read_at=coalesce(n.read_at,clock_timestamp())
      WHERE n.id=p_id AND n.recipient_account_id=v_actor
        AND n.expires_at>clock_timestamp();
      RETURN FOUND;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.cleanup_expired_notifications(p_limit integer)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_removed integer:=0; v_count integer:=0;
    BEGIN
      IF p_limit IS NULL OR p_limit<1 OR p_limit>1000 THEN
        RAISE EXCEPTION 'invalid_notification_batch' USING ERRCODE='22023';
      END IF;
      DELETE FROM public.notifications AS n WHERE n.id IN (
        SELECT target.id FROM public.notifications AS target
        WHERE target.expires_at<=clock_timestamp()
        ORDER BY target.expires_at,target.id LIMIT p_limit FOR UPDATE SKIP LOCKED
      );
      GET DIAGNOSTICS v_removed=ROW_COUNT;
      DELETE FROM public.notification_outbox AS event WHERE event.id IN (
        SELECT target.id FROM public.notification_outbox AS target
        WHERE target.created_at<=clock_timestamp()-interval '30 days'
        ORDER BY target.created_at,target.id LIMIT p_limit FOR UPDATE SKIP LOCKED
      );
      GET DIAGNOSTICS v_count=ROW_COUNT;
      RETURN v_removed+v_count;
    END $$""")
    for signature in (
        "enqueue_booking_accepted_notification()",
        "deliver_notification_outbox(integer)",
        "list_notifications(integer,integer)",
        "count_unread_notifications()",
        "mark_notification_read(uuid)",
        "cleanup_expired_notifications(integer)",
    ):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON FUNCTION public.{signature} FROM PUBLIC, "
            "electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    for signature in (
        "deliver_notification_outbox(integer)",
        "list_notifications(integer,integer)",
        "count_unread_notifications()",
        "mark_notification_read(uuid)",
        "cleanup_expired_notifications(integer)",
    ):
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{signature} TO electro_tutor_runtime")


def downgrade() -> None:
    # Destructive downgrade: only an explicitly disposable database may run it.
    op.execute("DROP TRIGGER bookings_notification_accepted ON public.bookings")
    for signature in (
        "cleanup_expired_notifications(integer)",
        "mark_notification_read(uuid)",
        "count_unread_notifications()",
        "list_notifications(integer,integer)",
        "deliver_notification_outbox(integer)",
        "enqueue_booking_accepted_notification()",
    ):
        op.execute(f"DROP FUNCTION public.{signature}")
    op.drop_table("notifications")
    op.drop_table("notification_outbox")
