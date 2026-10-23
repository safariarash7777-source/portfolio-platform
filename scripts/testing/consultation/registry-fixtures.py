"""Generate synthetic SQL fixtures from the EXACT reviewed registry transaction.
No runtime access. stdout is deliberately synthetic SQL, never real identities.
"""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('registry', Path(__file__).with_name('registry-native.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ids = {'owner': '00000000-0000-4000-8000-000000000003',
       'a': '00000000-0000-4000-8000-000000000001',
       'b': '00000000-0000-4000-8000-000000000002',
       'admin': '00000000-0000-4000-8000-000000000004'}
seed = {'action': 'seedSynthetic', 'expectedIds': ids}
bind = {'action': 'bindReal', 'expectedIds': ids, 'expectedOwnerEmail': 'confirmed-owner@example.test'}
wrong = {**bind, 'expectedOwnerEmail': 'absent-owner@example.test'}
print(json.dumps({key: module.transaction(module.validate(value)) for key, value in
                  [('seed', seed), ('bind', bind), ('wrong', wrong)]}))
