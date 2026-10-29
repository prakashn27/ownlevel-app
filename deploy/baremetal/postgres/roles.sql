-- Run once as superuser on the DB host.
CREATE ROLE ownlevel_owner  LOGIN PASSWORD 'CHANGE_ME';                 -- migrations, owns tables
CREATE ROLE ownlevel_app    LOGIN PASSWORD 'CHANGE_ME' NOBYPASSRLS;     -- api + mcp
CREATE ROLE ownlevel_worker LOGIN PASSWORD 'CHANGE_ME' NOBYPASSRLS;     -- workers + pg-boss
CREATE ROLE ownlevel_admin  LOGIN PASSWORD 'CHANGE_ME' BYPASSRLS;       -- platform-admin jobs (logged)

CREATE DATABASE ownlevel OWNER ownlevel_owner;
\c ownlevel
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ownlevel_app, ownlevel_worker, ownlevel_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE ownlevel_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ownlevel_app, ownlevel_worker, ownlevel_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE ownlevel_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ownlevel_app, ownlevel_worker, ownlevel_admin;

-- pg-boss queue schema (workers own it)
CREATE SCHEMA pgboss AUTHORIZATION ownlevel_worker;
GRANT USAGE ON SCHEMA pgboss TO ownlevel_app;  -- api enqueues only
