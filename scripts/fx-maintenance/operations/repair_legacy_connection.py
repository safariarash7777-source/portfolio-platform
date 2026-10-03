"""Apply only proxy selection to an original legacy helper; retain private-config paths."""
from pathlib import Path
import argparse,hashlib,json
NEEDLE=b'proxy = urllib.request.ProxyHandler({"https": "http://127.0.0.1:2080"})'
def patched_original(raw):
    assert raw.count(NEEDLE)==1,'Original legacy proxy block must be unambiguous'
    assert b'FX_VM_CONFIG_DIR' not in raw,'Portable helper needs explicit private config; do not treat it as legacy'
    newline=b'\r\n' if b'\r\n' in raw else b'\n'
    replacement=b'from liara_connection import proxy_mapping'+newline+b'proxy = urllib.request.ProxyHandler(proxy_mapping())'
    changed=raw.replace(NEEDLE,replacement)
    assert changed.replace(replacement,NEEDLE)==raw
    return changed
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--original',required=True);p.add_argument('--target',required=True);p.add_argument('--expected-original-sha256',required=True);a=p.parse_args()
    raw=Path(a.original).read_bytes();assert hashlib.sha256(raw).hexdigest()==a.expected_original_sha256
    target=Path(a.target);assert (target.parent/'liara_connection.py').exists();patched=patched_original(raw);target.write_bytes(patched)
    print(json.dumps({'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'only_proxy_block_changed':True,'private_config_paths_preserved':True}))
