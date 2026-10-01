"""Existing authorized SSH; status-only incident window. Never raw env/logs/actor IDs."""
import json
import subprocess
start,end="2026-10-01T09:46:00Z","2026-10-01T09:52:00Z"
logs=subprocess.run(["docker","logs","--since",start,"--until",end,"portfolio-stage-auth-1"],capture_output=True,text=True,check=True)
events=[]
for line in (logs.stdout+logs.stderr).splitlines():
    try:
        row=json.loads(line)
    except ValueError:
        continue
    path=str(row.get("path","" )).split("?",1)[0]
    if path not in ["/token","/user","/logout","/verify","/recover","/health"]:
        continue
    events.append({key:row.get(key) for key in ["time","method","status","component"]}|{"path":path})
query="""select json_build_object('action',coalesce(payload->>'action','UNKNOWN'),'count',count(*),'first',min(created_at),'last',max(created_at)) from auth.audit_log_entries where created_at between '2026-10-01T09:46:00Z' and '2026-10-01T09:52:00Z' and payload->>'actor_id' in(select id::text from public.profiles where role='admin') group by payload->>'action';
select json_build_object('createdSessions',count(*),'first',min(created_at),'last',max(created_at)) from auth.sessions where user_id in(select id from public.profiles where role='admin') and created_at between '2026-10-01T09:46:00Z' and '2026-10-01T09:52:00Z';"""
result=subprocess.run(["docker","exec","-i","portfolio-stage-db-1","psql","-U","postgres","-d","postgres","-qAt","-v","ON_ERROR_STOP=1"],input=query,capture_output=True,text=True,check=True)
print(json.dumps({"windowUtc":{"start":start,"end":end},"liveReadOnly":True,"authHttpStatusOnly":events,"adminAggregateOnly":[json.loads(line) for line in result.stdout.splitlines() if line.strip()]},indent=2))
