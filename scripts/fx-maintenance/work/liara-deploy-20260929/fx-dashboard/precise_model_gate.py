import json
from streamlit.testing.v1 import AppTest
at=AppTest.from_file('/app/app.py',default_timeout=180).run()
print(json.dumps({'exceptions':[e.message for e in at.exception],'tabs':len(at.tabs)}))
assert not at.exception and len(at.tabs)==12
