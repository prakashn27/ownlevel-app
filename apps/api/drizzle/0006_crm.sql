CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_by_source" text NOT NULL,
	"created_by_user_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name_first_name" text,
	"name_last_name" text,
	"emails_primary_email" text,
	"emails_additional_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phones_primary_phone_number" text,
	"phones_primary_phone_country_code" text,
	"phones_primary_phone_calling_code" text,
	"phones_additional_phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_title" text,
	"city" text,
	"linkedin_primary_link_url" text,
	"linkedin_primary_link_label" text,
	"linkedin_secondary_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_url" text,
	CONSTRAINT "contacts_client_id_id" UNIQUE("client_id","id")
);
--> statement-breakpoint
CREATE TABLE "crm_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"object" text NOT NULL,
	"key" text NOT NULL,
	"standard" boolean NOT NULL,
	"type" text,
	"label" text,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb,
	"default_value" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"contact_input" boolean DEFAULT false NOT NULL,
	"position" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_fields_client_object_key" UNIQUE("client_id","object","key")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_fields" ADD CONSTRAINT "crm_fields_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_fields" ADD CONSTRAINT "crm_fields_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_client_email" ON "contacts" USING btree ("client_id","emails_primary_email") WHERE "contacts"."emails_primary_email" is not null;--> statement-breakpoint
CREATE INDEX "contacts_client_phone" ON "contacts" USING btree ("client_id","phones_primary_phone_number");--> statement-breakpoint
CREATE INDEX "contacts_client_position" ON "contacts" USING btree ("client_id","position");--> statement-breakpoint
CREATE INDEX "contacts_search" ON "contacts" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contacts_data" ON "contacts" USING gin ("data" jsonb_path_ops);
--> statement-breakpoint

-- ── RLS ──
-- Contacts never leave the client: no agency-context branch, so agency context (app.client_id unset)
-- compares against NULL and sees nothing.
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY contacts_client_only ON contacts
  USING (agency_id = app_agency_id() AND client_id = app_client_id())
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
--> statement-breakpoint
-- Field configuration holds no contact data: standard tenant policy.
ALTER TABLE crm_fields ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE crm_fields FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY crm_fields_tenant ON crm_fields
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND client_id = app_client_id());
