-- verify-stack-shape.sql - make the throwaway stack's `storage` look like the
-- hosted platform's, BEFORE managed-schemas.sql judges it.
--
-- storage-api branches its migrations on `storage.multitenant`. The hosted
-- platform runs Storage multitenant, so migrations 0038/0047/0048 never create
-- storage.iceberg_namespaces / storage.iceberg_tables there. A single-tenant
-- storage-api (the only kind a local stack can run) does create them, empty.
-- Measured 2026-09-23: after removing exactly these two tables, every section
-- of managed-schemas.sql (tables, columns, constraints, enums, functions,
-- migration history) is identical to production's.
--
-- This does not weaken the check: managed-schemas.sql still compares the
-- whole auth/storage structure in both directions afterwards, and this file
-- refuses to drop anything that holds a row.
-- ASCII only.

-- The row check is dynamic SQL on purpose: PL/pgSQL plans a whole IF
-- expression, so a static `EXISTS (SELECT ... FROM storage.iceberg_tables)`
-- fails with "relation does not exist" on a target that never had the table,
-- even behind a to_regclass() guard (caught by CI, 2026-09-23).
DO $$
DECLARE
  t text;
  has_rows boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['storage.iceberg_namespaces', 'storage.iceberg_tables'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', t) INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION '% is not empty - refusing to reshape the restore target', t;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS storage.iceberg_tables;
DROP TABLE IF EXISTS storage.iceberg_namespaces;
