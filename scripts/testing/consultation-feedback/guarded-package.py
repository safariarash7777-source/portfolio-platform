"""Offline guarded transfer builder/verifier. No install, target, network or credentials."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import zipfile

SOURCE='0d63a8b64e4975a3c9dab3f1f579f91302602b01'
PINS={
 'sql/consultation_workflow.sql':'4b2ca76e7839caba226870b3e4235df7346b79deb85d10916916d572c73a6a91',
 'sql/consultation_roster.sql':'03ccf7c622640ca508d8f60f6b1e8825de959ab038679c8cd798b87f331b5523',
 'sql/consultation_replies.sql':'57702c0090d643fa3eacd765ac19aecb36acd7254a161524dbe6b9326da4f49a',
 'scripts/testing/consultation-next/install-native.py':'5b5b082907609f8834fdc0f785579a00cda60f4b5ae8512875b5ea2935be6e5f',
 'scripts/testing/consultation-feedback/install-feedback.py':'b489a04e5beddf37cb5d175c1af4a43712ce6e0676ed2df33c3e1e8693bd40fe',
 'supabase/migrations/20261029142010_consultation_feedback_states.sql':'32f928eac23f02c1412301932f7a58ebe1707b987d9b78d09ba67b1117913dda',
 'supabase/migrations/20261029160723_consultation_feedback_rollout_guard.sql':'5b3538d2a4526c91ac0af092b86a81b3e7bb140dab88ad20aef30abff2ff03e2',
 'docs/ops/start-a-finance-v04-20261029/rollback-candidate.sql':'aa1a278bb0b1cecfca8ae119919a11bdd762772950bd57d1f147d2ef20989ffa',
 'docs/ops/start-a-finance-v04-20261029/rollback-rollout.sql':'bb8964f7d07df1575c8a70bf762987e4830600ccacfe72eac63e4af79e9377ba',
}
GUIDE='docs/ops/start-a-finance-v04-20261029/ADAPTER.fa.md'


def check(value,reason):
    if not value:raise RuntimeError(reason)


def digest(raw):return hashlib.sha256(raw).hexdigest()


def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value);return value


def verify(directory,expected_manifest):
    directory=directory.resolve(strict=True);raw=(directory/'MANIFEST.json').read_bytes()
    check(digest(raw)==expected_manifest,'independent_manifest_hash_mismatch')
    manifest=json.loads(raw)
    check(manifest['contract']=='consultation-feedback-guarded-transfer.v1' and manifest['sourceSha']==SOURCE,'manifest_contract_or_source_changed')
    expected=set(PINS)|{GUIDE,'verify-guarded.py'}
    check(len(manifest['files'])==len(expected) and {r['path'] for r in manifest['files']}==expected,'unexpected_transfer_files')
    for row in manifest['files']:
        path=directory/row['path']
        check(not path.is_symlink() and path.resolve(strict=True).is_relative_to(directory),'transfer_path_redirect')
        content=path.read_bytes()
        check(len(content)==row['size'] and digest(content)==row['sha256'],'transfer_bytes_changed')
        if row['path'] in PINS:check(row['sha256']==PINS[row['path']],'reviewed_pin_changed')
    check(manifest['installationAuthorized'] is False and manifest['readerAttestationIncluded'] is False,'transfer_cannot_authorize_installation')
    sys.dont_write_bytecode=True
    adapter=module(directory/'scripts/testing/consultation-feedback/install-feedback.py','sealed_adapter')
    safety=adapter.load_safety(directory/'scripts/testing/consultation-next/install-native.py')
    def forbidden(*args,**kwargs):raise RuntimeError('offline_verifier_cannot_execute_commands')
    safety.command=forbidden
    files={p:(directory/p).read_bytes() for p in safety.SQL_HASHES}
    files['sql/consultation_workflow.sql']=b'BASELINE_MUST_NEVER_EXECUTE'
    prerequisite=safety.atomic_payload(files)
    check('BASELINE_MUST_NEVER_EXECUTE' not in prerequisite,'baseline_in_executable_payload')
    apply=adapter.payload(safety,'apply',directory);rollback=adapter.payload(safety,'rollback',directory)
    check(digest(apply.encode())==manifest['applyPayloadSha256']=='c53de46a216a57b90afaff760c0474cb5d95911f56ff022832fd1536affae8a8','atomic_apply_changed')
    check(digest(rollback.encode())==manifest['rollbackPayloadSha256'],'atomic_rollback_changed')
    return {'status':'VERIFIED_GUARDED_TRANSFER_ONLY','sourceSha':SOURCE,'baselineInExecutablePayload':False,
            'applyPayloadSha256':manifest['applyPayloadSha256'],'rollbackPayloadSha256':manifest['rollbackPayloadSha256'],
            'readerAttestationIncluded':False,'installationExecuted':False,'gateActivated':False}


def create(directory):
    check(Path(__file__).name=='guarded-package.py','standalone_verifier_cannot_build')
    root=Path(__file__).resolve().parents[3]
    check(not directory.exists(),'destination_exists_no_overwrite')
    files={p:subprocess.check_output(['git','show',SOURCE+':'+p],cwd=root) for p in [*PINS,GUIDE]}
    baseline='sql/consultation_workflow.sql'
    check(digest(files[baseline])=='4e389c57b98827a8297f8bc0cfa26a43e0570ab4b125ec92f9844f970b27e236','baseline_source_changed')
    files[baseline]=files[baseline].replace(b'\n',b'\r\n')  # Exact PR314 guard-only bytes; never executable.
    for path,expected in PINS.items():check(digest(files[path])==expected,'source_pin_changed:'+path)
    files['verify-guarded.py']=Path(__file__).read_bytes().replace(b'\r\n',b'\n')
    directory.mkdir()
    for path,content in files.items():
        target=directory/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
    adapter=module(directory/'scripts/testing/consultation-feedback/install-feedback.py','packaged_adapter')
    safety=adapter.load_safety(directory/'scripts/testing/consultation-next/install-native.py')
    manifest={'contract':'consultation-feedback-guarded-transfer.v1','sourceSha':SOURCE,'prerequisiteSha':'2a8b50b0ce41f5fe15ba629cac4838314d8ce39c',
              'installationAuthorized':False,'readerAttestationIncluded':False,'gateDefault':'OFF','minimumFreeBytes':10*1024**3,
              'applyPayloadSha256':digest(adapter.payload(safety,'apply',directory).encode()),'rollbackPayloadSha256':digest(adapter.payload(safety,'rollback',directory).encode()),
              'files':[{'path':p,'sha256':digest(content),'size':len(content)} for p,content in sorted(files.items())]}
    (directory/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    seal=digest((directory/'MANIFEST.json').read_bytes());verified=verify(directory,seal)
    archive=directory.with_suffix('.zip');check(not archive.exists(),'archive_exists_no_overwrite')
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED) as zipped:
        for path in sorted(directory.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                item=zipfile.ZipInfo(path.relative_to(directory).as_posix(),(2026,10,29,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED;zipped.writestr(item,path.read_bytes())
    return {**verified,'archive':archive.name,'archiveSha256':digest(archive.read_bytes()),'manifestSha256':seal,'archiveBytes':archive.stat().st_size}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('--create',action='store_true')
    parser.add_argument('--manifest-sha256')
    args=parser.parse_args()
    check(args.create or args.manifest_sha256,'independent_manifest_sha_required')
    print(json.dumps(create(args.directory) if args.create else verify(args.directory,args.manifest_sha256)))
