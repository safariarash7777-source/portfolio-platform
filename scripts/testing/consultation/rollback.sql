-- LAB ONLY. No production rollback authorization.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('consultation_explicit','consultation_legacy') OR current_setting('portfolio.consultation_lab_marker',true) IS DISTINCT FROM 'consultation-isolated-20261023' THEN RAISE EXCEPTION 'rollback requires owned synthetic lab'; END IF;
END $$;
DROP FUNCTION public.command_consultation(jsonb),public.load_consultation(uuid,date,date);
DROP FUNCTION consultation_private.access(public.consultation_relationships,boolean,boolean),consultation_private.relation_json(public.consultation_relationships);
DROP TABLE public.consultation_command_receipts,public.consultation_actions,public.consultation_publications,public.consultation_events,public.consultation_private_notes,public.consultation_sessions,public.consultation_revocations,public.consultation_relationships,public.consultation_advisors;
DROP SCHEMA consultation_private CASCADE;
COMMIT;
