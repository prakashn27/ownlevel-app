ALTER TABLE "calendars" ADD COLUMN "ai_booking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ai_booking" boolean DEFAULT false NOT NULL;