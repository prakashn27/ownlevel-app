ALTER TABLE "calendars" ALTER COLUMN "require_email" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "calendars" ALTER COLUMN "require_phone" SET DEFAULT false;
--> statement-breakpoint
-- Phone and email may now both be optional: a booking then has to give one of the two (checked by the service).
-- New calendars default to that "phone or email" rule; existing calendars keep what they had.
ALTER TABLE calendars DROP CONSTRAINT calendars_contact_required_check;
