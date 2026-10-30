CREATE TABLE "appointment_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text NOT NULL,
	"attendee" jsonb NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_id" uuid,
	"manage_token_hash" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "appointment_hosts" (
	"appointment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"busy" "tstzrange" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "appointment_hosts_appointment_id_user_id_pk" PRIMARY KEY("appointment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"capacity" integer,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "appointments_client_id_id" UNIQUE("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "calendar_date_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"date" date NOT NULL,
	"intervals" jsonb NOT NULL,
	CONSTRAINT "calendar_date_overrides_calendar_date" UNIQUE("calendar_id","date")
);
--> statement-breakpoint
CREATE TABLE "calendar_hosts" (
	"calendar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"last_assigned_at" timestamp with time zone,
	CONSTRAINT "calendar_hosts_calendar_id_user_id_pk" PRIMARY KEY("calendar_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"timezone" text NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"slot_interval_min" integer DEFAULT 30 NOT NULL,
	"capacity" integer,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"min_notice_min" integer DEFAULT 60 NOT NULL,
	"max_days_ahead" integer DEFAULT 60 NOT NULL,
	"weekly_hours" jsonb NOT NULL,
	"booking_form" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendars_client_slug" UNIQUE("client_id","slug"),
	CONSTRAINT "calendars_client_id_id" UNIQUE("client_id","id")
);
--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_hosts" ADD CONSTRAINT "appointment_hosts_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_hosts" ADD CONSTRAINT "appointment_hosts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_date_overrides" ADD CONSTRAINT "calendar_date_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_date_overrides" ADD CONSTRAINT "calendar_date_overrides_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_hosts" ADD CONSTRAINT "calendar_hosts_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_hosts" ADD CONSTRAINT "calendar_hosts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_attendees_appointment" ON "appointment_attendees" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_attendees_client_contact" ON "appointment_attendees" USING btree ("client_id","contact_id");--> statement-breakpoint
CREATE INDEX "appointment_hosts_user" ON "appointment_hosts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointments_client_calendar_start" ON "appointments" USING btree ("client_id","calendar_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_class_session" ON "appointments" USING btree ("calendar_id","starts_at") WHERE "appointments"."status" = 'booked' and "appointments"."capacity" is not null;--> statement-breakpoint
CREATE INDEX "calendar_hosts_user" ON "calendar_hosts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendars_client_status" ON "calendars" USING btree ("client_id","status");
--> statement-breakpoint
-- ── Integrity not expressible in the Drizzle schema ──
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE calendars ADD CONSTRAINT calendars_type_check CHECK (type IN ('personal','round_robin','class','collective'));
--> statement-breakpoint
ALTER TABLE calendars ADD CONSTRAINT calendars_status_check CHECK (status IN ('draft','published','archived'));
--> statement-breakpoint
ALTER TABLE calendars ADD CONSTRAINT calendars_capacity_check CHECK ((type = 'class') = (capacity IS NOT NULL));
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('booked','cancelled','completed'));
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_range_check CHECK (ends_at > starts_at);
--> statement-breakpoint
ALTER TABLE appointment_attendees ADD CONSTRAINT appointment_attendees_status_check CHECK (status IN ('booked','cancelled','no_show','attended'));
--> statement-breakpoint
-- Every reference stays inside one client.
ALTER TABLE calendar_hosts ADD CONSTRAINT calendar_hosts_client_calendar_fk FOREIGN KEY (client_id, calendar_id) REFERENCES calendars (client_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE calendar_date_overrides ADD CONSTRAINT calendar_date_overrides_client_calendar_fk FOREIGN KEY (client_id, calendar_id) REFERENCES calendars (client_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_client_calendar_fk FOREIGN KEY (client_id, calendar_id) REFERENCES calendars (client_id, id);
--> statement-breakpoint
ALTER TABLE appointment_hosts ADD CONSTRAINT appointment_hosts_client_appointment_fk FOREIGN KEY (client_id, appointment_id) REFERENCES appointments (client_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE appointment_attendees ADD CONSTRAINT appointment_attendees_client_appointment_fk FOREIGN KEY (client_id, appointment_id) REFERENCES appointments (client_id, id) ON DELETE CASCADE;
--> statement-breakpoint
-- A host is never in two active appointments at once, across all calendars and clients.
-- Constraints are checked regardless of RLS, so this holds for staff who host for several clients.
ALTER TABLE appointment_hosts ADD CONSTRAINT appointment_hosts_no_overlap EXCLUDE USING gist (user_id WITH =, busy WITH &&) WHERE (active);
--> statement-breakpoint

-- ── RLS ──
-- Configuration (calendars, hosts, overrides): standard tenant policy.
-- Appointments hold attendee personal data, which never leaves the client: client context only, like contacts.
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendars FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendars_tenant ON calendars
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
ALTER TABLE calendar_hosts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_hosts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_hosts_tenant ON calendar_hosts
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
ALTER TABLE calendar_date_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_date_overrides FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_date_overrides_tenant ON calendar_date_overrides
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointments_client_only ON appointments
  USING (agency_id = app_agency_id() AND client_id = app_client_id())
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
ALTER TABLE appointment_hosts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointment_hosts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointment_hosts_client_only ON appointment_hosts
  USING (agency_id = app_agency_id() AND client_id = app_client_id())
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
-- Only host_busy() below sets app.busy_lookup; it exposes time ranges and nothing else.
CREATE POLICY appointment_hosts_busy_lookup ON appointment_hosts FOR SELECT
  USING (current_setting('app.busy_lookup', true) = '1');
--> statement-breakpoint
ALTER TABLE appointment_attendees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointment_attendees FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointment_attendees_client_only ON appointment_attendees
  USING (agency_id = app_agency_id() AND client_id = app_client_id())
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
-- A client never sees another client's bookings, but a host who works for several clients must not be offered
-- times they are already busy. This returns only (user, time range): no appointment, calendar, client or attendee.
CREATE FUNCTION host_busy(p_users text[], p_from timestamptz, p_to timestamptz)
RETURNS TABLE (user_id text, busy_start timestamptz, busy_end timestamptz) LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.busy_lookup', '1', true);
  RETURN QUERY
    SELECT h.user_id, lower(h.busy), upper(h.busy) FROM appointment_hosts h
    WHERE h.active AND h.user_id = ANY (p_users) AND h.busy && tstzrange(p_from, p_to, '[)');
  PERFORM set_config('app.busy_lookup', '', true);
END $$;
