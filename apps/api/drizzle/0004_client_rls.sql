-- Client-level scoping for memberships and invitations.
-- Same pattern as clients/usage_events: agency context (app.client_id unset) sees the whole agency;
-- client context sees only rows whose client_id matches, so agency-level rows (client_id NULL) are hidden.
DROP POLICY memberships_read ON memberships;
--> statement-breakpoint
DROP POLICY memberships_write ON memberships;
--> statement-breakpoint
CREATE POLICY memberships_read ON memberships FOR SELECT USING (
  (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  OR user_id = app_user_id()
);
--> statement-breakpoint
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()));
--> statement-breakpoint
DROP POLICY invitations_tenant ON invitations;
--> statement-breakpoint
CREATE POLICY invitations_tenant ON invitations
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()));
