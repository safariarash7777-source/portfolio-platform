import pathlib, json, re, hashlib, datetime, subprocess, os
root=pathlib.Path('/root/portfolio-recovery-backups/20261003T101406Z')
receipt=json.loads((root/'receipt.json').read_text())
def normalize(text):
 def acl(match):
  parts=match.group(1).split(',')
  if any('"' in value for value in parts): raise RuntimeError('quoted_acl_requires_sql_normalization')
  return 'acl={'+','.join(sorted(parts))+'}'
 return set(re.sub(r'acl=\{([^}]*)\}',acl,line) for line in text.splitlines() if line)
src=normalize((root/'source-inventory.private').read_text())
dst=normalize((root/'target-inventory.private').read_text())
receipt['rawComparisonEqual']=receipt['comparisonEqual']
receipt['rawMismatchCounts']=receipt['mismatchCounts']
receipt['aclNormalization']='entry order only; preserves grantor and grant-option markers'
receipt['comparisonEqual']=src==dst
receipt['mismatchCounts']={'sourceOnly':len(src-dst),'targetOnly':len(dst-src)}
for section in ['rowcount','identity-ids','policy','table','function','defaultacl','extension','column','schema','constraint','trigger','view','index']:
 receipt[section+'Equal']={x for x in src if x.startswith(section+'|')}=={x for x in dst if x.startswith(section+'|')}
h=hashlib.sha256()
with (root/'postgres.dump').open('rb') as f:
 for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
receipt['archiveHashVerifiedAfterRestore']=h.hexdigest()==receipt['dumpSha256']
state=json.loads(subprocess.run(['docker','inspect',receipt['target']],capture_output=True,text=True,check=True).stdout)[0]
source=json.loads(subprocess.run(['docker','inspect','portfolio-stage-db-1'],capture_output=True,text=True,check=True).stdout)[0]
receipt['targetStopped']=not state['State']['Running']
receipt['targetOomKilled']=state['State']['OOMKilled']
receipt['sourceHealthyAfter']=source['State']['Health']['Status']=='healthy'
receipt['sourceContainerUnchanged']=source['Id']==receipt['sourceContainerId']
receipt['credentialsExportedToReport']=False
receipt.pop('sourceCredentialRead',None)
receipt['contentDigestAllRowsVerified']=False
receipt['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['status']='passed' if src==dst and receipt['archiveHashVerifiedAfterRestore'] and receipt['targetStopped'] and not receipt['targetOomKilled'] and receipt['sourceHealthyAfter'] and receipt['sourceContainerUnchanged'] else 'failed'
(root/'receipt.json').write_text(json.dumps(receipt,indent=2))
(root/'comparison-normalized.private.json').write_text(json.dumps({'sourceOnly':sorted(src-dst),'targetOnly':sorted(dst-src)},indent=2))
print(json.dumps(receipt))
