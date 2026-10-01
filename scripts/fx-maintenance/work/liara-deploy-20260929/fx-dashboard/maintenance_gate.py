"""Candidate UI check uses archived data; no external provider request."""
import json
from pathlib import Path
from unittest.mock import patch
import requests
from streamlit.testing.v1 import AppTest

with (patch.object(requests.Session,'request',side_effect=requests.ConnectionError('Candidate verification is offline')),
      patch('urllib.request.urlopen',side_effect=OSError('Candidate verification is offline'))):
    at=AppTest.from_file(str(Path(__file__).with_name('app.py')),default_timeout=180).run()
assert not at.exception and len(at.tabs)==12, 'Candidate UI failed'
bodies=[getattr(widget,'value','') for widget in at.markdown]
assert any('نتیجهٔ اجرا:' in str(body) for body in bodies)
assert any('سلامت منابع:' in str(body) for body in bodies)
assert any('کامل‌بودن داده‌ها:' in str(body) for body in bodies)
print(json.dumps({'status':'offline_candidate_passed','tabs':12,'exceptions':0,'separate_status_axes':True,'external_provider_requests':0}))
