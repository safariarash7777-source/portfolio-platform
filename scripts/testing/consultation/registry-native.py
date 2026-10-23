"""Coordinator-only registry bootstrap. Prepare locally; never automatic replay.

Private stdin: {"action":"seedSynthetic"|"bindReal", "expectedIds":
 {"owner":uuid,"a":uuid,"b":uuid,"admin":uuid}, "expectedOwnerEmail":...}
Email is required only for bindReal. No email/credential is printed or saved.
Use --readback with the same private input after an uncertain result.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import datetime

DB = 'portfolio-stage-db-1'
DB_ID = '9193dfe09afa17a6270bc6be4db0b08473cd82023b5d14fd11e3adaf863d855c'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
ROOT = Path('/root/portfolio-recovery-backups/20261023T204308Z/consultation-install')
ROLES = ('owner', 'a', 'b', 'admin')


def check(value, reason):
    if not value:
        raise ValueError(reason)


def validate(value):
    check(isinstance(value, dict) and value.get('action') in ('seedSynthetic', 'bindReal'), 'invalid_action')
    expected = {'action', 'expectedIds'} | ({'expectedOwnerEmail'} if value['action'] == 'bindReal' else set())
    check(set(value) == expected and isinstance(value['expectedIds'], dict) and set(value['expectedIds']) == set(ROLES), 'invalid_keys')
    ids = {key: str(value['expectedIds'][key]).lower() for key in ROLES}
    check(all(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', uid) for uid in ids.values())
          and len(set(ids.values())) == 4, 'invalid_native_ids')
    result = {'action': value['action'], 'expectedIds': ids}
    if value['action'] == 'bindReal':
        email = value['expectedOwnerEmail']
        check(isinstance(email, str) and len(email) <= 254 and re.fullmatch(r'[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+', email), 'invalid_private_email')
        check(not email.lower().endswith('@example.invalid'), 'synthetic_email_not_real_owner')
        check('$registry$' not in email, 'invalid_private_email')
        result['expectedOwnerEmail'] = email.lower()
    return result


def command(args, body=None):
    result = subprocess.run(args, input=body, capture_output=True, timeout=60)
    check(result.returncode == 0, 'operation_failed_readback_required')
    return result.stdout.decode()


def attest():
    state = json.loads(command(['docker', 'inspect', DB]))[0]
    check(state['Id'] == DB_ID and state['Image'] == IMAGE and state['State']['Running'] is True
          and state['State'].get('Health', {}).get('Status') == 'healthy', 'database_identity_changed')


def query(sql):
    attest()
    return command(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c lock_timeout=5s -c statement_timeout=30s',
                    DB, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql.encode())


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def selection(request):
    rows = ','.join('(' + literal(role) + ',' + literal(request['expectedIds'][role]) + '::uuid,'
                    + literal('consultation-20261024-' + role) + ')' for role in ROLES)
    return 'WITH expected(role,id,marker) AS (VALUES ' + rows + ') '


def readback(request):
    # Exact IDs plus metadata+email; no search for arbitrary members.
    prefix = selection(request)
    owner_match = ("EXISTS(SELECT FROM public.consultation_advisors a JOIN auth.users u ON u.id=a.user_id WHERE a.enabled AND a.is_owner AND lower(u.email)=" + literal(request['expectedOwnerEmail']) + ")") if request['action']=='bindReal' else ("EXISTS(SELECT FROM public.consultation_advisors WHERE user_id='" + request['expectedIds']['owner'] + "' AND enabled AND is_owner)")
    return json.loads(query('BEGIN READ ONLY;SET LOCAL standard_conforming_strings=on;' + prefix + "SELECT json_build_object('actors',"
        "(SELECT json_agg(json_build_object('actor',e.role,'id',e.id,'role',p.role,'banned',coalesce(u.banned_until>now(),false),"
        "'owned',u.raw_app_meta_data->>'acceptance_run'=e.marker AND lower(u.email)=e.marker||'-a@example.invalid') ORDER BY e.role) "
        "FROM expected e LEFT JOIN auth.users u ON u.id=e.id LEFT JOIN public.profiles p ON p.id=e.id),"
        "'expectedOwnerActive'," + owner_match + ","
        "'registry',(SELECT coalesce(json_agg(json_build_object('id',a.user_id,'enabled',a.enabled,'isOwner',a.is_owner) ORDER BY a.user_id),'[]') FROM public.consultation_advisors a));COMMIT;"))


def transaction(request):
    payload = literal(json.dumps(request, separators=(',', ':')))
    # All mutations below are explicit profiles/registry operations. The
    # canonical member financial/history tables have no write statements.
    return "BEGIN;SET LOCAL standard_conforming_strings=on;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';" + r"""
LOCK TABLE public.consultation_advisors IN SHARE ROW EXCLUSIVE MODE;
DO $registry$
DECLARE p jsonb := PAYLOAD::jsonb; k text; uid uuid; owner_id uuid; selected_id uuid; n integer;
BEGIN
 FOR k IN SELECT jsonb_object_keys(p->'expectedIds') LOOP
  uid := (p->'expectedIds'->>k)::uuid;
  PERFORM 1 FROM auth.users WHERE id=uid FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT EXISTS(SELECT FROM auth.users u JOIN public.profiles pr ON pr.id=u.id WHERE u.id=uid
    AND u.raw_app_meta_data->>'acceptance_run'='consultation-20261024-'||k
    AND lower(u.email)='consultation-20261024-'||k||'-a@example.invalid' AND u.email_confirmed_at IS NOT NULL)
  THEN RAISE EXCEPTION 'synthetic identity mismatch';END IF;
 END LOOP;
 owner_id := (p->'expectedIds'->>'owner')::uuid;
 IF p->>'action'='seedSynthetic' THEN
  IF EXISTS(SELECT FROM public.consultation_advisors) THEN RAISE EXCEPTION 'registry not empty';END IF;
  FOR k IN SELECT jsonb_object_keys(p->'expectedIds') LOOP
   uid := (p->'expectedIds'->>k)::uuid;
   IF NOT EXISTS(SELECT FROM auth.users u JOIN public.profiles pr ON pr.id=u.id WHERE u.id=uid AND pr.role='user'
      AND NOT coalesce(u.banned_until>now(),false)) THEN RAISE EXCEPTION 'initial synthetic state mismatch';END IF;
  END LOOP;
  UPDATE public.profiles SET role='admin' WHERE id IN (owner_id,(p->'expectedIds'->>'admin')::uuid);
  GET DIAGNOSTICS n=ROW_COUNT;IF n<>2 THEN RAISE EXCEPTION 'promotion count mismatch';END IF;
  INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(owner_id,'Synthetic acceptance owner',true,true);
 ELSE
  SELECT count(*) INTO n FROM auth.users WHERE lower(email)=p->>'expectedOwnerEmail';
  IF n<>1 THEN RAISE EXCEPTION 'real owner not unique';END IF;
  SELECT u.id INTO selected_id FROM auth.users u JOIN public.profiles pr ON pr.id=u.id
   WHERE lower(u.email)=p->>'expectedOwnerEmail' AND u.email_confirmed_at IS NOT NULL AND pr.role='admin'
    AND NOT coalesce(u.banned_until>now(),false) AND NOT(u.id IN(SELECT value::uuid FROM jsonb_each_text(p->'expectedIds')))
    AND coalesce(u.raw_app_meta_data->>'acceptance_run','') NOT LIKE 'consultation-%' FOR UPDATE OF u,pr;
  IF selected_id IS NULL THEN RAISE EXCEPTION 'confirmed active admin owner required';END IF;
  FOR k IN SELECT unnest(ARRAY['owner','admin']) LOOP
   uid := (p->'expectedIds'->>k)::uuid;
   IF NOT EXISTS(SELECT FROM auth.users u JOIN public.profiles pr ON pr.id=u.id WHERE u.id=uid
      AND coalesce(u.banned_until>now(),false) AND pr.role='admin')
      OR EXISTS(SELECT FROM auth.sessions WHERE user_id=uid)
      OR EXISTS(SELECT FROM auth.refresh_tokens WHERE user_id=uid::text AND revoked IS FALSE)
    THEN RAISE EXCEPTION 'synthetic admin not retired';END IF;
  END LOOP;
  IF NOT EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=owner_id AND enabled AND is_owner)
    OR EXISTS(SELECT FROM public.consultation_advisors WHERE user_id<>owner_id AND (enabled OR is_owner))
    OR EXISTS(SELECT FROM public.consultation_advisors WHERE user_id=selected_id)
   THEN RAISE EXCEPTION 'registry state changed';END IF;
  UPDATE public.consultation_advisors SET enabled=false,is_owner=false WHERE user_id=owner_id;
  UPDATE public.profiles SET role='user' WHERE id IN(owner_id,(p->'expectedIds'->>'admin')::uuid);
  GET DIAGNOSTICS n=ROW_COUNT;IF n<>2 THEN RAISE EXCEPTION 'demotion count mismatch';END IF;
  INSERT INTO public.consultation_advisors(user_id,display_name,enabled,is_owner) VALUES(selected_id,'آرش صفری',true,true);
 END IF;
 IF (SELECT count(*) FROM public.consultation_advisors WHERE enabled AND is_owner)<>1 THEN RAISE EXCEPTION 'owner invariant';END IF;
END $registry$;
COMMIT;
""".replace('PAYLOAD', payload)


def exclusive(path, value):
    with path.open('x', encoding='utf-8') as file:
        json.dump(value, file, indent=2)
        file.flush()
        os.fsync(file.fileno())


def main():
    import fcntl
    check(sys.argv[1:] in ([], ['--readback']), 'invalid_arguments')
    raw = sys.stdin.buffer.read(8193)
    check(len(raw) <= 8192, 'input_too_large')
    request = validate(json.loads(raw))
    fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
    os.umask(0o077)
    with open('/root/portfolio-recovery-backups/.cashflow-release.lock', 'a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(ROOT.is_dir(), 'install_artifacts_missing')
        intent = ROOT / ('registry-' + request['action'] + '-intent.json')
        if sys.argv[1:] == ['--readback']:
            previous = json.loads(intent.read_text())
            check(previous['requestHash'] == fingerprint, 'readback_request_changed')
            print(json.dumps({'status': 'READBACK_ONLY', 'action': request['action'], **readback(request)}))
            return
        install = json.loads((ROOT / 'source-result.json').read_text())
        check(install['status'] == 'APPLIED' and install['existingCatalogUnchanged'] is True
              and install['checkpoint'] == '20261023T204308Z' and install['sourceId'] == DB_ID and install['sqlSha256'] == '4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91', 'verified_install_required')
        check(not intent.exists(), 'prior_attempt_readback_required')
        before = readback(request)
        check(all(actor['owned'] is True for actor in before['actors']), 'owned_actors_required')
        exclusive(intent, {'status': 'INTENT_RECORDED', 'action': request['action'], 'requestHash': fingerprint,
                           'sourceId': DB_ID, 'before': before, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        query(transaction(request))
        after = readback(request)
        check(after['expectedOwnerActive'] is True and sum(row['enabled'] and row['isOwner'] for row in after['registry']) == 1, 'owner_readback_mismatch')
        expected_roles = {'owner': 'admin', 'admin': 'admin', 'a': 'user', 'b': 'user'} if request['action']=='seedSynthetic' else dict.fromkeys(ROLES, 'user')
        check(all(actor['owned'] is True and actor['role']==expected_roles[actor['actor']] for actor in after['actors']), 'role_readback_mismatch')
        result = {'status': 'APPLIED', 'action': request['action'], 'requestHash': fingerprint,
                  'sourceId': DB_ID, 'financialWriteStatements': 0, 'after': after,
                  'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        exclusive(ROOT / ('registry-' + request['action'] + '-result.json'), result)
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'BLOCKED', 'reason': 'registry_verification_failed_readback_required', 'automaticReplay': False}))
        sys.exit(2)
