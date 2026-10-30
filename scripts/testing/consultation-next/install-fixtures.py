"""Export installer SQL for the isolated synthetic runner; never executes it."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-native.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(json.dumps({'payload': m.atomic_payload({p: (m.REPO / p).read_bytes() for p in m.SQL_HASHES}),
                  'inventory': m.INVENTORY, 'preflight': m.PREFLIGHT, 'checks': m.CHECKS}))
