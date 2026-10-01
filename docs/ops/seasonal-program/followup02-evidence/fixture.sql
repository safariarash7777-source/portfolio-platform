-- Synthetic fixture only. Run in followup02-read-db; NEVER on a user database.
CREATE ROLE fixture_reader NOLOGIN;
CREATE ROLE authenticator LOGIN;
GRANT fixture_reader TO authenticator;
CREATE TABLE symbol_history(id bigint PRIMARY KEY, symbol text, trade_date date);
INSERT INTO symbol_history SELECT i, 'synthetic-' || i, '2026-09-30'::date FROM generate_series(1,2407) i;
INSERT INTO symbol_history VALUES (2408,'outside-filter','2026-01-01');
CREATE TABLE codal_reports(id bigint PRIMARY KEY, symbol text, report_kind text, captured_at timestamptz, data jsonb);
INSERT INTO codal_reports SELECT i, 'synthetic-' || i, CASE WHEN i<=1208 THEN 'ن-۳۰' ELSE 'ن-۱۰' END, '2026-09-30'::timestamptz, '{}'::jsonb FROM generate_series(1,2416) i;
ALTER TABLE symbol_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE codal_reports ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO fixture_reader;
GRANT SELECT ON symbol_history,codal_reports TO fixture_reader;
CREATE POLICY read_fixture_history ON symbol_history FOR SELECT TO fixture_reader USING (true);
CREATE POLICY read_fixture_codal ON codal_reports FOR SELECT TO fixture_reader USING (true);