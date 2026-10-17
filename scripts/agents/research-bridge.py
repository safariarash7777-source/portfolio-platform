"""Forced-command SSH bridge. No shell, arbitrary SQL, JWT or model credentials.

Install root-owned, 0755; dedicated authorized_keys entry uses restrict + command.
Input/output are private transport, never application logs. All SQL is fixed;
JSON values become hex literals. Database grants enforce append-only access.
"""
import json
import re
import subprocess
import sys

CONTAINER = 'portfolio-stage-db-1'


def sql(query, role):
    assert role in ('anon', 'research_agent_writer')
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres',
         '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input="BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL ROLE " + role + ';' + query + ';COMMIT;',
        text=True, encoding='utf-8', capture_output=True, timeout=30)
    if result.returncode:
        raise ValueError('database_operation_failed')
    return json.loads(result.stdout.strip())


def literal(value):
    encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode().hex()
    return "convert_from(decode('" + encoded + "','hex'),'UTF8')::jsonb"


def main():
    raw = sys.stdin.buffer.read(131073)
    if len(raw) > 131072:
        raise ValueError('request_too_large')
    request = json.loads(raw)
    action = request.get('action')
    if action == 'read' and set(request) == {'action'}:
        # Most recently ingested issuers, bounded and deterministic. Source rows
        # remain untouched; the TS canonical selector rejects ambiguous reports.
        result = sql("""
          WITH issuers AS (
            SELECT symbol, max(id) AS newest FROM public.codal_reports
            WHERE report_kind = 'ن-۱۰'
            GROUP BY symbol ORDER BY newest DESC, symbol LIMIT 8
          ), selected AS (
            SELECT r.* FROM issuers i CROSS JOIN LATERAL (
              SELECT id,symbol,report_kind,period_end,title,source_url,data,raw,published_at,captured_at
              FROM public.codal_reports WHERE symbol=i.symbol AND report_kind='ن-۱۰'
              ORDER BY id DESC LIMIT 401
            ) r
          ) SELECT json_build_object('symbols',(SELECT json_agg(symbol ORDER BY newest DESC,symbol) FROM issuers),
            'rows',coalesce((SELECT json_agg(selected) FROM selected),'[]'::json),
            'readAt',now(), 'feedStateAt',(SELECT updated_at FROM public.ir_market_snapshots WHERE key='codal_engine_state'))
        """, 'anon')
    elif action == 'find' and set(request) == {'action', 'digest'}:
        digest = request['digest']
        if not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('invalid_digest')
        result = sql("SELECT coalesce((SELECT json_build_object('id',id,'createdAt',created_at) FROM public.research_agent_drafts WHERE input_digest='" + digest + "'),'null'::json)", 'research_agent_writer')
    elif action == 'append' and set(request) == {'action', 'draft'}:
        draft = request['draft']
        if set(draft) != {'input_digest', 'model', 'body', 'provenance'}:
            raise ValueError('invalid_draft')
        if not re.fullmatch('[a-f0-9]{64}', draft['input_digest']) or draft['model'] != 'gpt-6-luna':
            raise ValueError('invalid_draft')
        # Fixed INSERT only. Conflict returns existing ID after a lost response.
        result = sql("""DO $$ BEGIN PERFORM pg_advisory_xact_lock(731904221); END $$;
          WITH payload AS (SELECT """ + literal(draft) + """ AS p), inserted AS (
            INSERT INTO public.research_agent_drafts(input_digest,model,body,provenance)
            SELECT p->>'input_digest',p->>'model',p->'body',p->'provenance' FROM payload
            WHERE (SELECT count(*) FROM public.research_agent_drafts WHERE created_at>now()-interval '1 day')<24
            ON CONFLICT(input_digest) DO NOTHING RETURNING id,created_at
          ) SELECT coalesce((SELECT json_build_object('id',id,'createdAt',created_at) FROM inserted),
            (SELECT json_build_object('id',id,'createdAt',created_at) FROM public.research_agent_drafts
              WHERE input_digest=(SELECT p->>'input_digest' FROM payload)),'null'::json)
        """, 'research_agent_writer')
        if not result:
            raise ValueError('daily_storage_limit')
    else:
        raise ValueError('unsupported_action')
    print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'ok': False, 'reason': 'bridge_request_failed'}))
        sys.exit(1)
