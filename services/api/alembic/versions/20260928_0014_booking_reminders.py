"""ET-14.2 durable Booking reminders and owner-scoped preferences."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260928_0014"
down_revision: str | None = "20260928_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EVENTS = "('booking.accepted','booking.reminder.24h','booking.reminder.1h','booking.reminder.15m')"


def upgrade() -> None:
    op.create_table(
        "reminder_settings",
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("time_zone", sa.String(64)),
        sa.Column("remind_24h", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("remind_1h", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("remind_15m", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "quiet_hours_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("quiet_hours_start", sa.Time()),
        sa.Column("quiet_hours_end", sa.Time()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("clock_timestamp()"),
        ),
        sa.PrimaryKeyConstraint("account_id", name="pk_reminder_settings"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_reminder_settings_account",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "time_zone IS NULL OR (char_length(time_zone) BETWEEN 1 AND 64 "
            "AND time_zone !~ '[[:cntrl:]]')",
            name="ck_reminder_settings_zone",
        ),
        sa.CheckConstraint(
            "(quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR "
            "(quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL "
            "AND quiet_hours_start<>quiet_hours_end)",
            name="ck_reminder_settings_quiet_range",
        ),
        sa.CheckConstraint(
            "NOT quiet_hours_enabled OR "
            "(quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)",
            name="ck_reminder_settings_quiet_enabled",
        ),
    )
    op.create_table(
        "booking_reminders",
        sa.Column("id", sa.Uuid(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_account_id", sa.Uuid(), nullable=False),
        sa.Column("offset_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("planned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="scheduled"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("clock_timestamp()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_booking_reminders"),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_booking_reminders_booking",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_booking_reminders_recipient",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "booking_id",
            "recipient_account_id",
            "offset_minutes",
            name="uq_booking_reminders_business",
        ),
        sa.CheckConstraint("offset_minutes IN (1440,60,15)", name="ck_booking_reminders_offset"),
        sa.CheckConstraint("due_at>=planned_at", name="ck_booking_reminders_due"),
        sa.CheckConstraint(
            "status IN ('scheduled','queued','delivered','skipped','cancelled')",
            name="ck_booking_reminders_status",
        ),
    )
    op.create_index(
        "ix_booking_reminders_due",
        "booking_reminders",
        ["due_at", "id"],
        postgresql_where=sa.text("status='scheduled'"),
    )
    op.create_index("ix_booking_reminders_booking", "booking_reminders", ["booking_id", "status"])
    for table in ("reminder_settings", "booking_reminders"):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON public.{table} FROM PUBLIC, electro_tutor_runtime, "
            "electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    for table in ("notification_outbox", "notifications"):
        op.drop_constraint(f"ck_{table}_event_type", table_name=table, type_="check")
        op.create_check_constraint(f"ck_{table}_event_type", table, f"event_type IN {EVENTS}")
    _create_functions()


def _create_functions() -> None:
    op.execute("""
    CREATE FUNCTION public.get_reminder_settings()
    RETURNS TABLE(time_zone varchar,remind_24h boolean,remind_1h boolean,
                  remind_15m boolean,quiet_hours_enabled boolean,
                  quiet_hours_start time,quiet_hours_end time)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_actor uuid:=public.current_session_account_id();
    BEGIN
      RETURN QUERY SELECT s.time_zone,s.remind_24h,s.remind_1h,s.remind_15m,
                          s.quiet_hours_enabled,s.quiet_hours_start,s.quiet_hours_end
      FROM public.reminder_settings AS s WHERE s.account_id=v_actor;
      IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::varchar,true,true,false,false,NULL::time,NULL::time;
      END IF;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.reminder_due_at(p_planned timestamptz,p_zone text,
      p_enabled boolean,p_start time,p_end time)
    RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
    DECLARE v_local timestamp; v_end timestamp;
    BEGIN
      IF NOT p_enabled THEN RETURN p_planned; END IF;
      v_local:=p_planned AT TIME ZONE p_zone;
      IF p_start<p_end THEN
        IF v_local::time<p_start OR v_local::time>=p_end THEN RETURN p_planned; END IF;
        v_end:=v_local::date+p_end;
      ELSE
        IF v_local::time>=p_start THEN
          v_end:=v_local::date+1+p_end;
        ELSIF v_local::time<p_end THEN
          v_end:=v_local::date+p_end;
        ELSE RETURN p_planned;
        END IF;
      END IF;
      -- PostgreSQL resolves nonexistent and ambiguous local wall times from the
      -- installed IANA time-zone database, identically on every scheduler run.
      RETURN GREATEST(p_planned,v_end AT TIME ZONE p_zone);
    END $$""")
    op.execute("""
    CREATE FUNCTION public.reminder_within_grace(p_due timestamptz,p_now timestamptz)
    RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
      SELECT p_now>=p_due AND p_now<=p_due+interval '15 minutes'
    $$""")

    op.execute("""
    CREATE FUNCTION public.schedule_booking_reminders(p_booking uuid,p_account uuid)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_booking public.bookings%ROWTYPE; v_settings public.reminder_settings%ROWTYPE;
            v_offset integer; v_planned timestamptz; v_due timestamptz;
            v_enabled boolean;
    BEGIN
      SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking FOR UPDATE;
      IF NOT FOUND OR p_account NOT IN (v_booking.student_account_id,v_booking.tutor_account_id)
         THEN RETURN; END IF;
      SELECT * INTO v_settings FROM public.reminder_settings WHERE account_id=p_account;
      -- A queued event belongs to the old preference snapshot. Booking is
      -- locked before outbox/job rows, matching the delivery lock order.
      DELETE FROM public.notification_outbox AS event
      WHERE event.booking_id=p_booking AND event.recipient_account_id=p_account
        AND event.event_type LIKE 'booking.reminder.%'
        AND event.delivered_at IS NULL;
      UPDATE public.booking_reminders SET status='cancelled',updated_at=clock_timestamp()
      WHERE booking_id=p_booking AND recipient_account_id=p_account
        AND status IN ('scheduled','queued');
      IF v_booking.status<>'ACCEPTED' OR v_booking.starts_at<=clock_timestamp()
         OR v_settings.time_zone IS NULL THEN RETURN; END IF;
      FOREACH v_offset IN ARRAY ARRAY[1440,60,15] LOOP
        v_enabled:=CASE v_offset WHEN 1440 THEN v_settings.remind_24h
                     WHEN 60 THEN v_settings.remind_1h ELSE v_settings.remind_15m END;
        IF NOT v_enabled THEN CONTINUE; END IF;
        v_planned:=v_booking.starts_at-make_interval(mins=>v_offset);
        v_due:=public.reminder_due_at(v_planned,v_settings.time_zone,
            v_settings.quiet_hours_enabled,v_settings.quiet_hours_start,v_settings.quiet_hours_end);
        INSERT INTO public.booking_reminders
          (booking_id,recipient_account_id,offset_minutes,planned_at,due_at,status)
        VALUES (p_booking,p_account,v_offset,v_planned,v_due,
                CASE WHEN v_due>=v_booking.starts_at THEN 'skipped' ELSE 'scheduled' END)
        ON CONFLICT (booking_id,recipient_account_id,offset_minutes) DO UPDATE
        SET planned_at=EXCLUDED.planned_at,due_at=EXCLUDED.due_at,
            status=EXCLUDED.status,updated_at=clock_timestamp()
        WHERE booking_reminders.status IN ('scheduled','cancelled','skipped');
      END LOOP;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.put_reminder_settings(p_zone text,p_24h boolean,p_1h boolean,
      p_15m boolean,p_quiet boolean,p_start time,p_end time)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_actor uuid:=public.current_session_account_id(); v_booking uuid;
    BEGIN
      IF p_24h IS NULL OR p_1h IS NULL OR p_15m IS NULL OR p_quiet IS NULL OR
         (p_quiet AND (p_start IS NULL OR p_end IS NULL)) OR
         ((p_start IS NULL)<>(p_end IS NULL)) OR
         (p_start IS NOT NULL AND p_start=p_end) OR
         (p_zone IS NOT NULL AND
          (char_length(p_zone)>64 OR p_zone !~ '^[A-Za-z0-9_+/-]+$' OR
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_zone)))
      THEN RAISE EXCEPTION 'invalid_reminder_settings' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.reminder_settings
        (account_id,time_zone,remind_24h,remind_1h,remind_15m,
         quiet_hours_enabled,quiet_hours_start,quiet_hours_end)
      VALUES (v_actor,p_zone,p_24h,p_1h,p_15m,p_quiet,p_start,p_end)
      ON CONFLICT (account_id) DO UPDATE SET
        time_zone=EXCLUDED.time_zone,remind_24h=EXCLUDED.remind_24h,
        remind_1h=EXCLUDED.remind_1h,remind_15m=EXCLUDED.remind_15m,
        quiet_hours_enabled=EXCLUDED.quiet_hours_enabled,
        quiet_hours_start=EXCLUDED.quiet_hours_start,
        quiet_hours_end=EXCLUDED.quiet_hours_end,updated_at=clock_timestamp();
      FOR v_booking IN SELECT id FROM public.bookings
        WHERE status='ACCEPTED' AND starts_at>clock_timestamp()
          AND v_actor IN (student_account_id,tutor_account_id)
        ORDER BY id
      LOOP
        PERFORM public.schedule_booking_reminders(v_booking,v_actor);
      END LOOP;
    END $$""")
    op.execute("""
    CREATE FUNCTION public.booking_reminders_on_transition()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    BEGIN
      IF OLD.status='REQUESTED' AND NEW.status='ACCEPTED' THEN
        PERFORM public.schedule_booking_reminders(NEW.id,NEW.student_account_id);
        PERFORM public.schedule_booking_reminders(NEW.id,NEW.tutor_account_id);
      ELSIF OLD.status='ACCEPTED' AND NEW.status='CANCELLED' THEN
        UPDATE public.booking_reminders SET status='cancelled',updated_at=clock_timestamp()
        WHERE booking_id=NEW.id AND status IN ('scheduled','queued');
      END IF;
      RETURN NEW;
    END $$""")
    op.execute("""
    CREATE TRIGGER bookings_reminders_transition
    AFTER UPDATE OF status ON public.bookings FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.booking_reminders_on_transition()""")
    op.execute("""
    CREATE FUNCTION public.process_due_booking_reminders(p_limit integer)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_candidate record; v_job public.booking_reminders%ROWTYPE;
            v_booking public.bookings%ROWTYPE; v_settings public.reminder_settings%ROWTYPE;
            v_processed integer:=0; v_now timestamptz; v_event text;
    BEGIN
      IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
        RAISE EXCEPTION 'invalid_reminder_batch' USING ERRCODE='22023';
      END IF;
      FOR v_candidate IN SELECT id,booking_id,recipient_account_id
        FROM public.booking_reminders
        WHERE status='scheduled' AND due_at<=clock_timestamp()
        ORDER BY due_at,id LIMIT p_limit
      LOOP
        -- Settings -> Booking -> intent is the same lock order as settings updates;
        -- cancellation already holds Booking before its trigger touches intents.
        SELECT * INTO v_settings FROM public.reminder_settings
          WHERE account_id=v_candidate.recipient_account_id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN CONTINUE; END IF;
        SELECT * INTO v_booking FROM public.bookings
          WHERE id=v_candidate.booking_id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN CONTINUE; END IF;
        SELECT * INTO v_job FROM public.booking_reminders
          WHERE id=v_candidate.id AND status='scheduled' FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN CONTINUE; END IF;
        v_now:=clock_timestamp();
        IF v_booking.status<>'ACCEPTED' OR v_booking.starts_at<=v_now OR
           NOT public.reminder_within_grace(v_job.due_at,v_now) THEN
          UPDATE public.booking_reminders SET status='skipped',updated_at=v_now
          WHERE id=v_job.id;
        ELSE
          v_event:=CASE v_job.offset_minutes WHEN 1440 THEN 'booking.reminder.24h'
                     WHEN 60 THEN 'booking.reminder.1h' ELSE 'booking.reminder.15m' END;
          INSERT INTO public.notification_outbox
            (recipient_account_id,event_type,booking_id,created_at,next_attempt_at)
          VALUES (v_job.recipient_account_id,v_event,v_job.booking_id,v_now,v_now)
          ON CONFLICT (event_type,booking_id,recipient_account_id) DO NOTHING;
          UPDATE public.booking_reminders SET status='queued',updated_at=v_now
          WHERE id=v_job.id;
        END IF;
        v_processed:=v_processed+1;
      END LOOP;
      RETURN v_processed;
    END $$""")
    # Existing ET-14.1 outbox retains ownership of inbox delivery. Reminder
    # events are revalidated after queuing, so a later cancellation stays stale.
    op.execute("""
    CREATE OR REPLACE FUNCTION public.deliver_notification_outbox(p_limit integer)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
    DECLARE v_candidate record; v_event public.notification_outbox%ROWTYPE;
            v_booking public.bookings%ROWTYPE; v_job public.booking_reminders%ROWTYPE;
            v_delivered integer:=0; v_now timestamptz; v_offset integer;
    BEGIN
      IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
        RAISE EXCEPTION 'invalid_notification_batch' USING ERRCODE='22023';
      END IF;
      FOR v_candidate IN
        SELECT event.id,event.booking_id,event.event_type
        FROM public.notification_outbox AS event
        WHERE event.delivered_at IS NULL AND event.attempts<5
          AND event.next_attempt_at<=clock_timestamp()
          AND event.created_at>clock_timestamp()-interval '30 days'
        ORDER BY event.next_attempt_at,event.id LIMIT p_limit
      LOOP
        BEGIN
          IF v_candidate.event_type LIKE 'booking.reminder.%' THEN
            -- Booking -> outbox -> job matches settings recompute and cancellation.
            SELECT * INTO v_booking FROM public.bookings
            WHERE id=v_candidate.booking_id FOR UPDATE SKIP LOCKED;
            IF NOT FOUND THEN CONTINUE; END IF;
          END IF;
          SELECT * INTO v_event FROM public.notification_outbox
          WHERE id=v_candidate.id AND delivered_at IS NULL AND attempts<5
            AND next_attempt_at<=clock_timestamp() FOR UPDATE SKIP LOCKED;
          IF NOT FOUND THEN CONTINUE; END IF;
          IF v_event.event_type LIKE 'booking.reminder.%' THEN
            v_offset:=CASE v_event.event_type WHEN 'booking.reminder.24h' THEN 1440
                        WHEN 'booking.reminder.1h' THEN 60 ELSE 15 END;
            SELECT * INTO v_job FROM public.booking_reminders
            WHERE booking_id=v_event.booking_id
              AND recipient_account_id=v_event.recipient_account_id
              AND offset_minutes=v_offset FOR UPDATE SKIP LOCKED;
            v_now:=clock_timestamp();
            IF NOT FOUND OR v_job.status<>'queued' OR
               v_booking.status<>'ACCEPTED' OR v_booking.starts_at<=v_now OR
               (v_job.due_at<=v_now AND
               NOT public.reminder_within_grace(v_job.due_at,v_now)) THEN
              UPDATE public.notification_outbox
              SET delivered_at=v_now,attempts=attempts+1,last_sqlstate=NULL
              WHERE id=v_event.id;
              IF v_job.id IS NOT NULL AND v_job.status='queued' THEN
                UPDATE public.booking_reminders SET status='skipped',updated_at=v_now
                WHERE id=v_job.id;
              END IF;
              CONTINUE;
            END IF;
            IF v_job.due_at>v_now THEN
              UPDATE public.notification_outbox
              SET next_attempt_at=v_job.due_at WHERE id=v_event.id;
              CONTINUE;
            END IF;
          END IF;
          INSERT INTO public.notifications
            (recipient_account_id,event_type,booking_id,created_at,expires_at)
          VALUES (v_event.recipient_account_id,v_event.event_type,v_event.booking_id,
                  v_event.created_at,v_event.created_at+interval '30 days')
          ON CONFLICT (event_type,booking_id,recipient_account_id) DO NOTHING;
          UPDATE public.notification_outbox
          SET delivered_at=clock_timestamp(),attempts=attempts+1,last_sqlstate=NULL
          WHERE id=v_event.id;
          IF v_event.event_type LIKE 'booking.reminder.%' THEN
            UPDATE public.booking_reminders SET status='delivered',updated_at=clock_timestamp()
            WHERE id=v_job.id AND status='queued';
          END IF;
          v_delivered:=v_delivered+1;
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.notification_outbox
          SET attempts=attempts+1,last_sqlstate=SQLSTATE,
              next_attempt_at=clock_timestamp()+make_interval(mins=>power(2,attempts)::integer)
          WHERE id=v_candidate.id;
        END;
      END LOOP;
      RETURN v_delivered;
    END $$""")

    for signature in (
        "get_reminder_settings()",
        "reminder_due_at(timestamptz,text,boolean,time,time)",
        "reminder_within_grace(timestamptz,timestamptz)",
        "schedule_booking_reminders(uuid,uuid)",
        "put_reminder_settings(text,boolean,boolean,boolean,boolean,time,time)",
        "booking_reminders_on_transition()",
        "process_due_booking_reminders(integer)",
    ):
        op.execute(
            f"REVOKE ALL PRIVILEGES ON FUNCTION public.{signature} FROM PUBLIC, "
            "electro_tutor_runtime, electro_tutor_auth_runtime, electro_tutor_provisioner"
        )
    for signature in (
        "get_reminder_settings()",
        "put_reminder_settings(text,boolean,boolean,boolean,boolean,time,time)",
        "process_due_booking_reminders(integer)",
    ):
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{signature} TO electro_tutor_runtime")


def downgrade() -> None:
    # Only for a proven disposable database. Remove ET-14.2 rows before the
    # original ET-14.1 event-type CHECK is restored.
    op.execute("DROP TRIGGER bookings_reminders_transition ON public.bookings")
    for signature in (
        "process_due_booking_reminders(integer)",
        "booking_reminders_on_transition()",
        "put_reminder_settings(text,boolean,boolean,boolean,boolean,time,time)",
        "schedule_booking_reminders(uuid,uuid)",
        "reminder_due_at(timestamptz,text,boolean,time,time)",
        "reminder_within_grace(timestamptz,timestamptz)",
        "get_reminder_settings()",
    ):
        op.execute(f"DROP FUNCTION public.{signature}")
    op.execute("DELETE FROM public.notifications WHERE event_type LIKE 'booking.reminder.%'")
    op.execute("DELETE FROM public.notification_outbox WHERE event_type LIKE 'booking.reminder.%'")
    op.drop_constraint("ck_notifications_event_type", "notifications", type_="check")
    op.drop_constraint("ck_notification_outbox_event_type", "notification_outbox", type_="check")
    for table in ("notifications", "notification_outbox"):
        op.create_check_constraint(f"ck_{table}_event_type", table, "event_type='booking.accepted'")
    op.drop_table("booking_reminders")
    op.drop_table("reminder_settings")
    # 0013 function semantics, with no ET-14.2 table references.
    op.execute("""
    CREATE OR REPLACE FUNCTION public.deliver_notification_outbox(p_limit integer)
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
          SET delivered_at=clock_timestamp(),attempts=attempts+1,last_sqlstate=NULL
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
