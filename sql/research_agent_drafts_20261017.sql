-- Apply only after private backup and isolated restore acceptance.
-- Repository standalone SQL convention; not a Supabase CLI migration-history entry.
-- Deliberately fail on existing objects, including the writer role.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE ROLE research_agent_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- The existing maintenance login is not a superuser on this PostgreSQL 17 host.
-- Permit deliberate SET ROLE only, never automatic privilege inheritance.
GRANT research_agent_writer TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public TO research_agent_writer;
CREATE TABLE public.research_agent_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_digest text NOT NULL UNIQUE CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'openai-codex' CHECK (provider = 'openai-codex'),
  model text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  body jsonb NOT NULL,
  provenance jsonb NOT NULL,
  CONSTRAINT research_draft_body_shape CHECK (
    octet_length(body::text) <= 65536
    AND jsonb_typeof(body) = 'object'
    AND body ?& ARRAY['summary','claims','scenarios','limitations']
    AND body - ARRAY['summary','claims','scenarios','limitations'] = '{}'::jsonb
    AND jsonb_typeof(body->'summary') = 'string'
    AND jsonb_typeof(body->'claims') = 'array'
    AND jsonb_array_length(body->'claims') BETWEEN 1 AND 20
    AND jsonb_typeof(body->'scenarios') = 'array'
    AND jsonb_array_length(body->'scenarios') = 3
    AND jsonb_typeof(body->'limitations') = 'array'
    AND jsonb_array_length(body->'limitations') BETWEEN 1 AND 20
  ),
  CONSTRAINT research_draft_provenance_shape CHECK (
    octet_length(provenance::text) <= 65536
    AND jsonb_typeof(provenance) = 'array'
    AND jsonb_array_length(provenance) BETWEEN 1 AND 20
    AND NOT jsonb_path_exists(provenance, '$[*] ? (
      @.type() != "object" ||
      !exists(@.evidence) || @.evidence.type() != "string" || !(@.evidence like_regex "^E[1-9][0-9]*$") ||
      !exists(@.symbol) || @.symbol.type() != "string" ||
      !exists(@.reportId) || (@.reportId.type() != "string" && @.reportId.type() != "number") ||
      (@.reportId.type() == "number" && (@.reportId <= 0 || @.reportId.floor() != @.reportId)) ||
      !exists(@.sourceUrl) || @.sourceUrl.type() != "string" ||
      !exists(@.periodEnd) || @.periodEnd.type() != "string" ||
      !exists(@.publishedAt) || @.publishedAt.type() != "string"
    )')
  )
);
CREATE INDEX research_agent_drafts_created_idx ON public.research_agent_drafts (created_at DESC, id);

ALTER TABLE public.research_agent_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_agent_drafts FORCE ROW LEVEL SECURITY;
-- Override legacy permissive default ACLs on this object only.
REVOKE ALL ON public.research_agent_drafts FROM PUBLIC, anon, authenticated, service_role, research_agent_writer;
GRANT SELECT ON public.research_agent_drafts TO authenticated;
GRANT SELECT, INSERT ON public.research_agent_drafts TO research_agent_writer;
CREATE POLICY research_drafts_admin_read ON public.research_agent_drafts
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY research_drafts_worker_read ON public.research_agent_drafts
  FOR SELECT TO research_agent_writer USING (true);
CREATE POLICY research_drafts_worker_append ON public.research_agent_drafts
  FOR INSERT TO research_agent_writer WITH CHECK (status = 'draft' AND provider = 'openai-codex');
-- No authenticator grant. A fixed privileged bridge SET ROLEs
-- before parameterized INSERT/SELECT. No token or public write RPC is created.
NOTIFY pgrst, 'reload schema';
COMMIT;
