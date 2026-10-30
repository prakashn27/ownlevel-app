ALTER TABLE "appointment_attendees" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "default_country" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "require_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "require_phone" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_attendees_idempotency" ON "appointment_attendees" USING btree ("client_id","idempotency_key") WHERE "appointment_attendees"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_agency_slug" ON "clients" USING btree ("agency_id","slug") WHERE "clients"."slug" is not null;
--> statement-breakpoint
ALTER TABLE calendars ADD CONSTRAINT calendars_contact_required_check CHECK (require_email OR require_phone);
--> statement-breakpoint
ALTER TABLE calendars ADD CONSTRAINT calendars_country_check CHECK (default_country IS NULL OR default_country ~ '^[A-Z]{2}$');
--> statement-breakpoint
ALTER TABLE agencies ADD CONSTRAINT agencies_country_check CHECK (country ~ '^[A-Z]{2}$');
--> statement-breakpoint
ALTER TABLE clients ADD CONSTRAINT clients_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
--> statement-breakpoint
-- Every attendee link stays inside one client. Deleting a contact keeps the attendee row (the erase hook clears its details first).
ALTER TABLE appointment_attendees ADD CONSTRAINT appointment_attendees_client_contact_fk
  FOREIGN KEY (client_id, contact_id) REFERENCES contacts (client_id, id) ON DELETE SET NULL (contact_id);
