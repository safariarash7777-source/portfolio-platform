"""Read-only fixture export of the actual pinned adapter payload. No transport."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import types
import subprocess
import tempfile

spec=importlib.util.spec_from_file_location('feedback_adapter',Path(__file__).with_name('install-feedback.py'))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,required=True)
    parser.add_argument('--operation',choices=('apply','rollback','inspect'),required=True)
    args=parser.parse_args()
    if args.operation=='inspect':
        with tempfile.TemporaryDirectory(prefix='start-a-inspect-fixture-') as directory:
            helper=Path(directory)/'repo/scripts/testing/consultation-next/install-native.py';helper.parent.mkdir(parents=True)
            raw=(args.repo/'scripts/testing/consultation-next/install-native.py').read_bytes()
            if hashlib.sha256(raw).hexdigest()!=m.SAFETY_SHA:
                raw=subprocess.check_output(['git','show','HEAD:scripts/testing/consultation-next/install-native.py'],cwd=args.repo)
            helper.write_bytes(raw);safety=m.load_safety(helper)
            print(json.dumps({'checks':m.checks(safety,True),'history':m.HISTORY,'rolloutDefaultOff':m.ROLLOUT_DEFAULT_OFF,'inventory':m.INVENTORY}))
    else:
        value=m.payload(types.SimpleNamespace(digest=lambda raw:hashlib.sha256(raw).hexdigest()),args.operation,args.repo)
        print(json.dumps({'payload':value,'sha256':hashlib.sha256(value.encode()).hexdigest()}))
