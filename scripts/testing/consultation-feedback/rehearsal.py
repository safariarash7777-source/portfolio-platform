"""Owned PG17 rehearsal of actual adapter payload/queries. No target argument/SSH.

Claims are synthetic SQL claims, not native GoTrue/PostgREST acceptance.
"""
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('feedback_adapter', Path(__file__).with_name('install-feedback.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
IMAGE = 'sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
OWNER = uuid4().hex
NAME = 'start-a-rehearsal-'+OWNER[:12]
A,B,O,X = ['00000000-0000-4000-8000-%012d' % n for n in range(1,5)]
KEY,ACTION = ['10000000-0000-4000-8000-%012d' % n for n in (1,2)]


def docker(args, data=None, allow_failure=False):
    p=subprocess.run(['docker',*args],input=data,capture_output=True,timeout=45)
    if p.returncode and not allow_failure:
        raise RuntimeError(p.stderr.decode(errors='replace'))
    return p


def attest():
    c=json.loads(docker(['inspect',NAME]).stdout)[0]
    assert c['Config']['Labels']['start-a.rehearsal-owner']==OWNER and c['Image']==IMAGE
    assert c['HostConfig']['NetworkMode']=='none' and c['HostConfig']['ReadonlyRootfs']
    assert not c['HostConfig'].get('PortBindings') and not c['HostConfig'].get('Binds')
    assert all(x['Type']=='tmpfs' for x in c['Mounts'])


def sql(value, database='postgres', error=None):
    attest()
    p=docker(['exec','-i',NAME,'psql','-XqAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],value.encode(),allow_failure=error is not None)
    if error:
        assert p.returncode!=0 and error in p.stderr.decode(),p.stderr.decode()
        return None
    return p.stdout.decode().strip()


def quoted(value):
    return "'"+(json.dumps(value,ensure_ascii=False) if isinstance(value,(dict,list)) else value).replace("'","''")+"'"


def run():
    results=[]
    created=False
    with tempfile.TemporaryDirectory(prefix='start-a-sql-helper-') as temporary:
        helper=Path(temporary)/'repo/scripts/testing/consultation-next/install-native.py'
        helper.parent.mkdir(parents=True)
        raw=(ROOT/'scripts/testing/consultation-next/install-native.py').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=m.SAFETY_SHA:
            raw=subprocess.check_output(['git','show','HEAD:scripts/testing/consultation-next/install-native.py'],cwd=ROOT)
        helper.write_bytes(raw)
        safety=m.load_safety(helper)
        try:
            docker(['create','--pull','never','--name',NAME,'--label','start-a.rehearsal-owner='+OWNER,'--network','none','--read-only',
                    '--memory','512m','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456',
                    '--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=16777216','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216',
                    '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE]);created=True
            attest();docker(['start',NAME])
            for _ in range(80):
                ready=docker(['exec',NAME,'pg_isready','-U','postgres'],allow_failure=True)
                pid=docker(['exec',NAME,'cat','/proc/1/comm'],allow_failure=True)
                if ready.returncode==0 and pid.stdout.strip()==b'postgres':break
                time.sleep(.2)
            else:raise RuntimeError('owned_pg_not_ready')
            server=sql('SELECT version()')
            for profile in ['explicit','legacy']:
                db='start_a_'+profile
                sql('CREATE DATABASE '+db)
                query=lambda text,error=None:sql(text,db,error)
                def record(name):results.append({'profile':profile,'name':name,'status':'PASS'});print('PASS '+profile+': '+name,flush=True)
                def claim(actor,text):return "BEGIN;SELECT set_config('request.jwt.claims',"+quoted({'sub':actor,'role':'authenticated'})+",true);SET LOCAL ROLE authenticated;"+text+";COMMIT;"
                def pick(text,contract):
                    for line in text.splitlines():
                        try:value=json.loads(line)
                        except ValueError:continue
                        if isinstance(value,dict) and value.get('contractVersion')==contract:return value
                    raise RuntimeError('expected_contract_missing')
                counter=0
                def send(actor,command,error=None):
                    nonlocal counter
                    counter+=1
                    request={'contractVersion':'consultation-request.v1','expectedActorId':actor,'clientToken':'synthetic-rehearsal-'+str(counter),'command':command}
                    raw=query(claim(actor,'SELECT public.command_consultation('+quoted(request)+'::jsonb)'),error)
                    return None if error else pick(raw,'consultation-write.v1')
                def read(actor,relation):return pick(query(claim(actor,"SELECT public.load_consultation('"+relation+"','2026-10-01','2026-10-31')")),'consultation-read.v1')
                def snapshot():return {'catalog':json.loads(query(m.INVENTORY)),'history':json.loads(query(m.HISTORY))}
                def verify(extended):
                    value=json.loads(query(m.checks(safety,extended)))
                    assert len(value)==9 and all(v is True for v in value.values()),value
                for file in ['sql/test/supabase_bootstrap.sql','sql/test/profile_'+('explicit_grants' if profile=='explicit' else 'legacy_default_privileges')+'.sql','sql/test/portfolio_precondition.sql',
                             'sql/phase32_member_holdings.sql','supabase/migrations/20261003094257_recovery_personal_balance_sheet_core.sql',
                             'sql/phase34_research_workbook_versions.sql','supabase/migrations/20261019215549_personal_cash_flow_versions.sql','sql/member_goals_versions_20261023.sql','sql/consultation_workflow.sql']:
                    query((ROOT/file).read_text(encoding='utf8'))
                query("CREATE TABLE public.risk_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,total_score integer NOT NULL,risk_category text NOT NULL,answers_json jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE TABLE public.risk_revalidations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,expired_at timestamptz NOT NULL DEFAULT now(),reason text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now());ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;ALTER TABLE public.risk_revalidations ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.risk_assessments,public.risk_revalidations FROM PUBLIC,anon,authenticated,service_role;")
                files={path:subprocess.check_output(['git','show','HEAD:'+path],cwd=ROOT) for path in safety.SQL_HASHES}
                query(safety.atomic_payload(files))
                query("INSERT INTO auth.users(id) VALUES('"+A+"'),('"+B+"'),('"+O+"'),('"+X+"');INSERT INTO public.profiles(id,role) VALUES('"+A+"','user'),('"+B+"','user'),('"+O+"','admin'),('"+X+"','admin');INSERT INTO public.consultation_advisors(user_id,display_name,is_owner) VALUES('"+O+"','Synthetic owner',true),('"+X+"','Synthetic unrelated',false);")
                query(claim(A,"SELECT public.record_member_goals('{\"contractVersion\":1,\"goals\":[]}'::jsonb,'synthetic-goals-v1',0)"))
                relation=send(A,{'kind':'grant','advisorId':O,'clientLabel':'Synthetic member A'})['id']
                basis=read(O,relation)['dossier']['basis']
                body={'topic':'Synthetic topic','goal':'Synthetic goal','clientSummary':'Synthetic summary','rationale':'Synthetic reason','limitations':'Synthetic only','reviewOn':'2099-12-31','basis':basis,'researchVersionIds':[],
                      'evidence':[{'label':'Synthetic source','url':None,'asOf':'2026-10-29'}],'actions':[{'actionKey':ACTION,'title':'Synthetic action','dueOn':'2099-12-31','responsible':'member'}]}
                saved=send(O,{'kind':'save','relationshipId':relation,'sessionKey':KEY,'baseVersion':0,'body':body,'privateNote':'SYNTHETIC_PRIVATE_CANARY'})
                def transition(kind,session=saved):
                    current=next(x for x in read(O,relation)['sessions'] if x['id']==session['id'])
                    return {'kind':kind,'relationshipId':relation,'sessionId':session['id'],'contentHash':current['contentHash'],'note':None}
                for stage in ['submit','approve','publish']:send(O,transition(stage))
                feedback={'kind':'feedback','relationshipId':relation,'sessionId':saved['id'],'actionKey':ACTION,'baseVersion':0,'status':'doing','text':None}
                send(A,feedback)
                verify(False);before=snapshot()
                query(m.payload(safety,'apply'));verify(True)
                assert snapshot()==before
                assert query(m.ROLLOUT_DEFAULT_OFF)=='t'
                assert read(A,relation)['capabilities']['extendedFeedbackWrite'] is False
                send(A,{**feedback,'baseVersion':1,'status':'partial','text':'Synthetic partial'},'42501')
                send(A,{**feedback,'baseVersion':1,'status':'not_done','text':'Synthetic not done'},'42501')
                query(claim(X,"UPDATE consultation_private.feedback_rollout SET enabled=true"),'42501')
                record('atomic apply preserves all preexisting catalog/history/financial fingerprints; default-off blocks direct RPC and admin-profile gate write')
                query(m.payload(safety,'rollback'));verify(False);assert snapshot()==before
                record('rollback before new history restores kernel/constraint and preserves existing doing history')
                # Real PostgreSQL commit, followed by a deliberately discarded response.
                fault_intent={'operation':'apply','payloadSha256':hashlib.sha256(m.payload(safety,'apply').encode()).hexdigest(),'beforeSha256':hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest()}
                attempts=0
                try:
                    attempts+=1;query(m.payload(safety,'apply'))
                    raise TimeoutError('synthetic response loss AFTER real commit')
                except TimeoutError:
                    verify(True);observed=snapshot()
                    assert observed==before and query(m.ROLLOUT_DEFAULT_OFF)=='t' and attempts==1
                record('lost response after actual commit reconciled by read-only catalog/history/financial checks; one DDL request and no replay')
                # Only the owned synthetic DB is enabled to exercise new history.
                query("UPDATE consultation_private.feedback_rollout SET enabled=true,reader_sha='"+'a'*40+"',reviewed_at=now() WHERE singleton")
                assert read(A,relation)['capabilities']['extendedFeedbackWrite'] is True
                financial=lambda: {k:v for k,v in json.loads(query(m.HISTORY)).items() if k.startswith('member_')}
                balances=financial()
                send(A,{**feedback,'baseVersion':1,'status':'partial','text':'Synthetic partial'})
                send(A,{**feedback,'baseVersion':2,'status':'not_done','text':'Synthetic not done'})
                assert financial()==balances
                history=read(A,relation)
                assert [r['status'] for r in history['actions']]==['doing','partial','not_done']
                assert history['notes']==[] and 'SYNTHETIC_PRIVATE_CANARY' not in json.dumps(history)
                query("UPDATE consultation_private.feedback_rollout SET enabled=false WHERE singleton")
                assert read(A,relation)['capabilities']['extendedFeedbackWrite'] is False
                send(A,{**feedback,'baseVersion':3,'status':'partial','text':'Denied while off'},'42501')
                current=snapshot();query(m.payload(safety,'rollback'),'PT409');assert snapshot()==current
                assert read(A,relation)['actions']==history['actions'];verify(True)
                record('partial/not_done append with balances unchanged; gate off retains readable history and blocks incompatible rollback')
                for actor in [B,X]:query(claim(actor,"SELECT public.load_consultation('"+relation+"','2026-10-01','2026-10-31')"),'42501')
                record('member B and unrelated advisor cannot read member A; private notes absent for member')
                second=send(O,{'kind':'save','relationshipId':relation,'sessionKey':KEY,'baseVersion':1,'body':body,'privateNote':None})
                send(O,transition('submit',second))
                query(claim(A,"SELECT public.record_member_goals('{\"contractVersion\":1,\"goals\":[]}'::jsonb,'synthetic-goals-v2',1)"))
                send(O,transition('approve',second),'PT409')
                assert read(O,relation)['dossier']['basis']['goalsVersionId']!=basis['goalsVersionId']
                record('second financial basis blocks approval of the prior draft basis')
                send(A,{'kind':'revoke','relationshipId':relation})
                query(claim(O,"SELECT public.load_consultation('"+relation+"','2026-10-01','2026-10-31')"),'42501')
                assert read(A,relation)['actions']==history['actions']
                record('revoke blocks advisor while member keeps both new history entries')
                results[-1]['faultIntent']=fault_intent
            return {'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'PASS_OWNED_PG_REHEARSAL','image':IMAGE,'server':server,'passed':len(results),'failed':0,'results':results,
                    'network':'none','ports':[],'hostMounts':False,'realAccounts':0,'transport':'SQL_CLAIMS_NOT_NATIVE_AUTH_API','primaryInstallation':False,'nativeOnlineAcceptance':False}
        finally:
            if created:
                attest();docker(['rm','-f',NAME]);print('Owned PostgreSQL container removed.',flush=True)


if __name__=='__main__':
    result=run();print(json.dumps(result,ensure_ascii=True))
