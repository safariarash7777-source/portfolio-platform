"""RECOVERY-01: native PG17 backup and isolated restore; sanitized status only.
Run only on the authorized Liara host. Private artifacts never enter Git.
"""
import datetime, hashlib, json, os, pathlib, re, secrets, subprocess, time
SOURCE = "portfolio-stage-db-1"
IMAGE = "sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb"
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
ROOT = pathlib.Path("/root/portfolio-recovery-backups") / STAMP
TARGET = "portfolio-recovery-proof-" + STAMP.lower()
ROOT.mkdir(parents=True, mode=0o700)
os.chmod(ROOT.parent, 0o700)
os.umask(0o077)
receipt = {"task":"RECOVERY-01","source":SOURCE,"startedAt":STAMP,"sourceImage":IMAGE,
           "target":TARGET,"status":"started","productionDdl":False,"sourceCredentialRead":False,
           "storageBinaryBackup":False,"cronEnabledOnTarget":False,"portsPublished":False,
           "network":"none","privateDirectory":str(ROOT)}
def save():
    tmp=ROOT/"receipt.tmp"
    tmp.write_text(json.dumps(receipt,indent=2))
    tmp.replace(ROOT/"receipt.json")
def run(args, inp=None, timeout=600, output=None):
    with (ROOT/"private-errors.log").open("ab") as err:
        if output:
            with output.open("wb") as out:
                p=subprocess.run(args,input=inp,stdout=out,stderr=err,timeout=timeout)
            if p.returncode: raise RuntimeError("command_failed")
            return ""
        p=subprocess.run(args,input=inp,stdout=subprocess.PIPE,stderr=err,timeout=timeout)
        if p.returncode: raise RuntimeError("command_failed")
        return p.stdout.decode()
def sql(container, query, timeout=300, user="postgres"):
    return run(["docker","exec","-i",container,"psql","-X","-q","-t","-A","-U",user,
                "-d","postgres","-v","ON_ERROR_STOP=1"],query.encode(),timeout)
def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()
def normalize_inventory(text):
    # ACL array order has no authorization meaning. Preserve every full entry,
    # grantor and grant-option marker; normalize only order, never permissions.
    # This source role catalog has simple unquoted role names (captured privately).
    def acl(match):
        values=match.group(1).split(',')
        if any('"' in value for value in values):
            raise RuntimeError('quoted_acl_requires_sql_normalization')
        return 'acl={'+','.join(sorted(values))+'}'
    return set(re.sub(r'acl=\{([^}]*)\}',acl,line) for line in text.splitlines() if line)
# Pure catalog/aggregate inventory; no account/contact/amount/password fields.
INVENTORY = r"""
SELECT format('table|%s.%s|%s;owner=%s;rls=%s;forced=%s;acl=%s',
 n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,
 coalesce(c.relacl::text,'-'))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') AND c.relkind IN ('r','p','S','v','m') ORDER BY 1;
SELECT format('column|%s.%s.%s|%s;notnull=%s;default=%s;identity=%s;generated=%s',
 n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
 coalesce(md5(pg_get_expr(d.adbin,d.adrelid)),'-'),a.attidentity,a.attgenerated)
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname IN ('public','auth','storage','identity_private') AND c.relkind IN ('r','p')
 AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1;
SELECT format('constraint|%s.%s.%s|%s',n.nspname,c.relname,k.conname,md5(pg_get_constraintdef(k.oid)))
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('policy|%s.%s.%s|%s;%s;%s;%s;%s',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
 coalesce((SELECT string_agg(r.rolname,',' ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),'PUBLIC'),
 coalesce(md5(pg_get_expr(p.polqual,p.polrelid)),'-'),coalesce(md5(pg_get_expr(p.polwithcheck,p.polrelid)),'-'))
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('index|%s.%s|%s',schemaname,indexname,md5(indexdef)) FROM pg_indexes
WHERE schemaname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('function|%s.%s(%s)|owner=%s;acl=%s;def=%s',n.nspname,p.proname,
 pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),coalesce(p.proacl::text,'-'),md5(pg_get_functiondef(p.oid)))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') AND p.prokind IN ('f','p')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1;
SELECT format('trigger|%s.%s.%s|%s',n.nspname,c.relname,t.tgname,md5(pg_get_triggerdef(t.oid)))
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') AND NOT t.tgisinternal ORDER BY 1;
SELECT format('schema|%s|%s;%s',nspname,pg_get_userbyid(nspowner),coalesce(nspacl::text,'-'))
FROM pg_namespace WHERE nspname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('defaultacl|%s.%s.%s|%s',pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl)
FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('view|%s.%s|%s',schemaname,viewname,md5(definition)) FROM pg_views
WHERE schemaname IN ('public','auth','storage','identity_private') ORDER BY 1;
SELECT format('rowcount|%s.%s|%s',n.nspname,c.relname,
(xpath('/row/c/text()',query_to_xml(format('SELECT count(*) AS c FROM %I.%I',n.nspname,c.relname),false,true,'')))[1]::text::bigint)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','identity_private') AND c.relkind IN ('r','p')
 AND NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=c.oid) ORDER BY 1;
SELECT 'identity-ids|auth.users|' || coalesce(md5(string_agg(id::text,',' ORDER BY id)),'empty') FROM auth.users;
SELECT 'identity-ids|public.profiles|' || coalesce(md5(string_agg(id::text,',' ORDER BY id)),'empty') FROM public.profiles;
SELECT format('extension|%s|%s',extname,extversion) FROM pg_extension ORDER BY 1;
"""
snapshot_proc=None
target_created=False
try:
    before=json.loads(run(["docker","inspect",SOURCE]))[0]
    receipt["sourceContainerId"]=before["Id"]
    if before["Image"]!=IMAGE or before["State"]["Health"]["Status"]!="healthy": raise RuntimeError("source_preflight_failed")
    free=os.statvfs(ROOT).f_bavail*os.statvfs(ROOT).f_frsize
    if free<10*1024**3: raise RuntimeError("disk_preflight_failed")
    receipt["sourceCronJobsEnabled"]=sql(SOURCE,"SHOW cron.launch_active_jobs;").strip()
    receipt["stage"]="consistent_snapshot"
    save()
    snapshot_proc=subprocess.Popen(["docker","exec","-i",SOURCE,"psql","-X","-q","-t","-A","-U","postgres",
        "-d","postgres","-v","ON_ERROR_STOP=1"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
        stderr=(ROOT/"snapshot-private-errors.log").open("wb"),text=True,bufsize=1)
    snapshot_proc.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
    snapshot_proc.stdin.flush()
    snapshot=""
    for _ in range(5):
        snapshot=snapshot_proc.stdout.readline().strip()
        if snapshot: break
    if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+",snapshot): raise RuntimeError("snapshot_failed")
    prefix="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+snapshot+"';\n"
    source_inventory=sql(SOURCE,prefix+INVENTORY+"\nCOMMIT;")
    (ROOT/"source-inventory.private").write_text(source_inventory)
    receipt["stage"]="native_dump"; save()
    dump=ROOT/"postgres.dump"
    run(["docker","exec",SOURCE,"pg_dump","-U","postgres","-d","postgres","-Fc","-Z0","--snapshot="+snapshot],output=dump)
    run(["docker","exec",SOURCE,"pg_dumpall","-U","postgres","--globals-only"],output=ROOT/"globals.private.sql")
    # Explicit cron metadata/config backup remains private, no task execution.
    (ROOT/"cron.private.json").write_text(sql(SOURCE,prefix+"SELECT coalesce(json_agg(j),'[]')::text FROM cron.job j;\nCOMMIT;"))
    snapshot_proc.stdin.write("ROLLBACK;\n\\q\n"); snapshot_proc.stdin.flush()
    snapshot_proc.wait(timeout=10); snapshot_proc=None
    receipt["dumpBytes"]=dump.stat().st_size; receipt["dumpSha256"]=sha(dump)
    receipt["stage"]="isolated_restore"; save()
    env=ROOT/"target.private.env"
    env.write_text("POSTGRES_PASSWORD="+secrets.token_urlsafe(40)+"\nPOSTGRES_DB=postgres\n")
    run(["docker","run","--pull=never","-d","--name",TARGET,"--network","none","--memory","2g","--cpus","0.75",
         "--env-file",str(env),"--label","portfolio.recovery=isolated-proof",
         "--mount","type=bind,src="+str(ROOT)+",dst=/recovery,readonly",
         "--entrypoint","docker-entrypoint.sh",IMAGE,"postgres","-D","/etc/postgresql",
         "-c","cron.launch_active_jobs=off","-c","shared_buffers=128MB","-c","maintenance_work_mem=64MB",
         "-c","max_connections=15"])
    target_created=True
    ready=False
    for _ in range(90):
        p=subprocess.run(["docker","exec",TARGET,"pg_isready","-U","postgres","-d","postgres"],
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if p.returncode==0: ready=True; break
        time.sleep(2)
    if not ready: raise RuntimeError("target_not_ready")
    # Preserve source role attributes/memberships without duplicate CREATE ROLE failure on same-image defaults.
    globals_sql=(ROOT/"globals.private.sql").read_text()
    globals_sql=re.sub(r"^CREATE ROLE ([^\n;]+);$",lambda m:
        "DO $recovery_roles$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '"
        +m.group(1).strip('"').replace("''","'").replace("'","''")+"') THEN CREATE ROLE "+m.group(1)
        +"; END IF; END $recovery_roles$;",globals_sql,flags=re.M)
    # postgres intentionally is not a superuser in this image. The target-only
    # native maintenance role is required to restore reserved memberships/owners.
    sql(TARGET,globals_sql,user="supabase_admin")
    run(["docker","exec",TARGET,"pg_restore","-U","supabase_admin","-d","postgres","--clean","--if-exists",
         "--single-transaction","--exit-on-error","/recovery/postgres.dump"],timeout=900)
    target_inventory=sql(TARGET,"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+INVENTORY+"\nCOMMIT;")
    (ROOT/"target-inventory.private").write_text(target_inventory)
    src=normalize_inventory(source_inventory)
    dst=normalize_inventory(target_inventory)
    diff={"sourceOnly":sorted(src-dst),"targetOnly":sorted(dst-src)}
    (ROOT/"comparison.private.json").write_text(json.dumps(diff,indent=2))
    receipt["inventoryLines"]={"source":len(src),"target":len(dst)}
    receipt["comparisonEqual"]=src==dst
    receipt["mismatchCounts"]={"sourceOnly":len(src-dst),"targetOnly":len(dst-src)}
    for section in ["rowcount","identity-ids","policy","table","function","defaultacl","extension"]:
        receipt[section+"Equal"]={x for x in src if x.startswith(section+"|")}=={x for x in dst if x.startswith(section+"|")}
    target_state=json.loads(run(["docker","inspect",TARGET]))[0]
    receipt["network"]=target_state["HostConfig"]["NetworkMode"]
    receipt["portsPublished"]=bool(target_state["HostConfig"].get("PortBindings"))
    receipt["cronEnabledOnTarget"]=sql(TARGET,"SHOW cron.launch_active_jobs;").strip()!="off"
    if receipt["network"]!="none" or receipt["portsPublished"] or receipt["cronEnabledOnTarget"]:
        raise RuntimeError("isolation_failed")
    after=json.loads(run(["docker","inspect",SOURCE]))[0]
    receipt["sourceContainerUnchanged"]=after["Id"]==before["Id"]
    receipt["sourceHealthyAfter"]=after["State"]["Health"]["Status"]=="healthy"
    receipt["status"]="passed" if src==dst else "comparison_failed"
except Exception as e:
    receipt["status"]="failed"
    receipt["failureClass"]=type(e).__name__
finally:
    if snapshot_proc:
        try: snapshot_proc.stdin.write("ROLLBACK;\n\\q\n"); snapshot_proc.stdin.flush(); snapshot_proc.wait(timeout=10)
        except Exception: pass
    if target_created:
        try: run(["docker","stop","-t","10",TARGET],timeout=30); receipt["targetStopped"]=True
        except Exception: receipt["targetStopped"]=False
    receipt["finishedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
print(json.dumps(receipt))
