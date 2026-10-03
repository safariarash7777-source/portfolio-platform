import pathlib, subprocess, json, re
script=pathlib.Path('/root/portfolio-recovery-backups/scripts/p01-native-backup-restore-20261003.py').read_text()
prefix=script.split('snapshot_proc=None')[0]
prefix=re.sub(r'^STAMP = .*$', 'STAMP = "20261003T101406Z"',prefix,flags=re.M)
prefix=prefix.replace('ROOT.mkdir(parents=True, mode=0o700)', 'ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)')
exec(compile(prefix,'backup-definitions','exec'))
receipt=json.loads((ROOT/'receipt.json').read_text())
receipt['stage']='isolated_restore_retry_maintenance_role'
receipt['status']='started'
receipt['restoreRetryReason']='target postgres is non-superuser; use native target-only maintenance role'
save()
try:
    for _ in range(60):
        p=subprocess.run(['docker','exec',TARGET,'pg_isready','-U','supabase_admin','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if p.returncode==0: break
        time.sleep(1)
    globals_sql=(ROOT/'globals.private.sql').read_text()
    globals_sql=re.sub(r"^CREATE ROLE ([^\n;]+);$",lambda m:
        "DO $recovery_roles$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '"
        +m.group(1).strip('"').replace("''","'").replace("'","''")+"') THEN CREATE ROLE "+m.group(1)
        +"; END IF; END $recovery_roles$;",globals_sql,flags=re.M)
    sql(TARGET,globals_sql,user="supabase_admin")
    run(["docker","exec",TARGET,"pg_restore","-U","supabase_admin","-d","postgres","--clean","--if-exists",
         "--single-transaction","--exit-on-error","/recovery/postgres.dump"],timeout=900)
    target_inventory=sql(TARGET,"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+INVENTORY+"\nCOMMIT;")
    (ROOT/"target-inventory.private").write_text(target_inventory)
    src=normalize_inventory((ROOT/"source-inventory.private").read_text())
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
    after=json.loads(run(["docker","inspect",SOURCE]))[0]
    receipt["sourceContainerUnchanged"]=after["Id"]==receipt["sourceContainerId"]
    receipt["sourceHealthyAfter"]=after["State"]["Health"]["Status"]=="healthy"
    isolation=receipt["network"]=="none" and not receipt["portsPublished"] and not receipt["cronEnabledOnTarget"]
    receipt["status"]="passed" if src==dst and isolation else "comparison_failed"
    receipt.pop("failureClass",None)
except Exception as e:
    receipt["status"]="failed";receipt["failureClass"]=type(e).__name__
finally:
    run(["docker","stop","-t","10",TARGET],timeout=30)
    receipt["targetStopped"]=True
    receipt["finishedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
print(json.dumps(receipt))
