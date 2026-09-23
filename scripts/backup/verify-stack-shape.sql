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

DO $$
BEGIN
  IF to_regclass('storage.iceberg_namespaces') IS NOT NULL
     AND EXISTS (SELECT 1 FROM storage.iceberg_namespaces) THEN
    RAISE EXCEPTION 'storage.iceberg_namespaces is not empty - refusing to reshape the restore target';
  END IF;
  IF to_regclass('storage.iceberg_tables') IS NOT NULL
     AND EXISTS (SELECT 1 FROM storage.iceberg_tables) THEN
    RAISE EXCEPTION 'storage.iceberg_tables is not empty - refusing to reshape the restore target';
  END IF;
END $$;

DROP TABLE IF EXISTS storage.iceberg_tables;
DROP TABLE IF EXISTS storage.iceberg_namespaces;
