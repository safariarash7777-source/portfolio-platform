-- managed-schemas.sql - the STRUCTURE of the managed schemas (auth, storage).
--
-- Read on production and on the restore target BEFORE anything is restored,
-- and compared with compare.mjs in both directions. Any difference stops the
-- run: the target would not be faithful, so a restore there proves nothing.
--
-- Why this exists (2026-09-23, measured):
--   * A version number is not a structure. The newest Supabase CLI shipped an
--     Auth whose last migration was older than production's; the earlier guard
--     caught that. But the storage image that CLI shipped had a DIFFERENT
--     storage.buckets (no lifecycle_configuration columns, extra iceberg
--     tables) and nothing compared it. inventory.sql only covers `public`
--     structure, because the schema dump leaves auth/storage out.
--   * The data dump DOES carry auth/storage rows, so their tables must match
--     exactly, column by column, or rows are refused - or worse, accepted
--     into a subtly different shape.
--
-- Output: `section|key|value` lines, sorted, same format as inventory.sql.
-- search_path is pinned so format_type()/pg_get_constraintdef() print the
-- same names on every connection (production's pooler and the local
-- supabase_admin session differ otherwise - measured: `auth.users(id)` vs
-- `users(id)` for the same constraint).
-- ASCII only: this file is mounted, never piped, but stays byte-identical
-- on every platform.

SET search_path = pg_catalog;
\pset tuples_only on
\pset format unaligned
\pset pager off

-- migration history of the services themselves: exact list, not max()
SELECT format('mschema_migrations|auth|%s', string_agg(version, ',' ORDER BY version))
FROM auth.schema_migrations;

SELECT format('mschema_migrations|storage|%s', string_agg(id || ':' || name, ',' ORDER BY id))
FROM storage.migrations;

-- tables
SELECT format('mtable|%s.%s|%s', n.nspname, c.relname, c.relkind)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('auth', 'storage') AND c.relkind IN ('r', 'p')
ORDER BY 1;

-- columns: type, nullability, default
SELECT format('mcolumn|%s.%s.%s|%s;notnull=%s;default=%s',
         n.nspname, c.relname, a.attname,
         format_type(a.atttypid, a.atttypmod), a.attnotnull,
         coalesce(md5(pg_get_expr(d.adbin, d.adrelid)), '-'))
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname IN ('auth', 'storage') AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1;

-- constraints
SELECT format('mconstraint|%s.%s.%s|%s',
         n.nspname, c.relname, con.conname, md5(pg_get_constraintdef(con.oid)))
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('auth', 'storage')
ORDER BY 1;

-- enum labels, in order
SELECT format('menum|%s.%s|%s', n.nspname, t.typname,
         string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder))
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname IN ('auth', 'storage')
GROUP BY n.nspname, t.typname
ORDER BY 1;

-- functions: signature only. Bodies are the service's own code; a platform
-- hot-fix to a body must not make a faithful target look unfaithful, and a
-- body change cannot make a row fail to load.
SELECT format('mfunction|%s.%s(%s)|-',
         n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('auth', 'storage')
ORDER BY 1;
