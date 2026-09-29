-- restore-prelude.sql - runs INSIDE the restore transaction, after roles.sql
-- and before schema.sql.
--
-- Objects in schema.sql are created by the restoring session role
-- (supabase_admin) and only then handed to their owner. Any DEFAULT
-- PRIVILEGES that role has fire at creation time. On a fresh Supabase stack
-- supabase_admin's defaults in `public` grant ALL to anon, authenticated and
-- service_role. pg_dump writes the object's real ACL as GRANT/REVOKE relative
-- to the built-in default only, so a privilege production had REVOKED
-- (e.g. anon on a private table) was silently granted again in the restore.
-- Measured on the owner's laptop with synthetic data, 2026-09-23: after a
-- clean restore, anon held DELETE/INSERT/UPDATE/... on a table where the
-- source had `REVOKE ALL ... FROM anon`; the inventory comparison caught it.
--
-- Removing the session role's default privileges makes every restored
-- object carry exactly the ACL written in schema.sql - nothing more. It
-- touches only default privileges of the role running this transaction, on
-- a throwaway target, and rolls back with everything else on failure.
-- ASCII only.

DO $$
DECLARE
  d record;
  g record;
  kind text;
  scope text;
BEGIN
  FOR d IN
    SELECT defaclnamespace, defaclobjtype, defaclacl
    FROM pg_default_acl
    WHERE defaclrole = current_user::regrole
  LOOP
    kind := CASE d.defaclobjtype
              WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES'
              WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES'
              WHEN 'n' THEN 'SCHEMAS' END;
    scope := CASE WHEN d.defaclnamespace = 0 THEN ''
                  ELSE ' IN SCHEMA ' || quote_ident(d.defaclnamespace::regnamespace::text) END;
    FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(d.defaclacl) a LOOP
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s',
                     current_user, scope, kind,
                     CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
END $$;
