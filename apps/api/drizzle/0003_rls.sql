-- Row-Level Security for tenancy tables.
-- The app runs each tenant query inside a transaction that does `SET LOCAL ROLE app_user`
-- and sets app.* context via set_config(..., true). app_user is not the table owner and has
-- no BYPASSRLS; FORCE makes the owner subject to the policies as well.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
-- Let the connecting role switch to app_user (needed on PG16+ where the creator only gets ADMIN).
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
--> statement-breakpoint

-- ── Context helpers ──
CREATE FUNCTION app_agency_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.agency_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_client_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.client_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
-- Host and slug lookups: the narrow "resolver" context used before a tenant is known.
CREATE FUNCTION app_host() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.host', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_slug() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.slug', true), '') $$;
--> statement-breakpoint

-- ── Seed system roles (agency_id NULL) so the app never writes them ──
INSERT INTO roles (level, key, name) VALUES
  ('agency', 'agency_owner', 'Agency owner'),
  ('agency', 'agency_admin', 'Agency admin'),
  ('agency', 'agency_user',  'Agency user'),
  ('client', 'client_admin', 'Client admin'),
  ('client', 'client_user',  'Client user')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ── agencies ──
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agencies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Read: my current agency, agencies I belong to, the agency owning the host being resolved, a slug lookup.
CREATE POLICY agencies_read ON agencies FOR SELECT USING (
  id = app_agency_id()
  OR id IN (SELECT agency_id FROM memberships WHERE user_id = app_user_id())
  OR id IN (SELECT agency_id FROM agency_domains WHERE hostname = app_host() AND status = 'active')
  OR slug = app_slug()
);
--> statement-breakpoint
CREATE POLICY agencies_write ON agencies FOR ALL
  USING (id = app_agency_id()) WITH CHECK (id = app_agency_id());
--> statement-breakpoint

-- ── agency_domains ──
ALTER TABLE agency_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_domains FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_domains_read ON agency_domains FOR SELECT USING (
  agency_id = app_agency_id()
  OR agency_id IN (SELECT agency_id FROM memberships WHERE user_id = app_user_id())
  OR (hostname = app_host() AND status = 'active')
);
--> statement-breakpoint
CREATE POLICY agency_domains_write ON agency_domains FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint

-- ── clients (agency context sees all its clients; client context sees only itself) ──
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clients_tenant ON clients
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id() AND app_client_id() IS NULL);
--> statement-breakpoint

-- ── roles: system roles are readable by everyone; custom roles by their agency ──
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_read ON roles FOR SELECT USING (agency_id IS NULL OR agency_id = app_agency_id());
--> statement-breakpoint
CREATE POLICY roles_write ON roles FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint

-- ── memberships: an agency sees its own; a person sees their own across agencies ──
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_read ON memberships FOR SELECT USING (
  agency_id = app_agency_id() OR user_id = app_user_id()
);
--> statement-breakpoint
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint

-- ── invitations ──
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitations_tenant ON invitations
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint

-- ── usage_events ──
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY usage_events_tenant ON usage_events
  USING (agency_id = app_agency_id() AND (app_client_id() IS NULL OR client_id = app_client_id()))
  WITH CHECK (agency_id = app_agency_id());
