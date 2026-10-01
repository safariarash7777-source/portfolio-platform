import json
from streamlit.testing.v1 import AppTest
at=AppTest.from_file('/app/app.py',default_timeout=180).run()
assert not at.exception and len(at.tabs)==12
assert any('اخزای دارای تاریخ' in m.label for m in at.metric), 'Official bond panel was not rendered'
print(json.dumps({'status':'candidate_gate_passed','exceptions':0,'tabs':12,'official_bond_panel':True}))
