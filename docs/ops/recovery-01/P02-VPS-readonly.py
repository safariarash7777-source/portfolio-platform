"""Read-only Docker metadata allowlist; never prints env secrets or command lines."""
import datetime
import json
import subprocess
from urllib.parse import urlsplit

names = subprocess.check_output(['docker', 'ps', '-a', '--filter', 'name=portfolio-stage-', '--format', '{{.Names}}'], text=True).splitlines()
rows = []
for name in names:
    if not name.startswith('portfolio-stage-'):
        continue
    c = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]
    env = dict(item.split('=', 1) for item in c['Config'].get('Env', []) if '=' in item)
    endpoints = {}
    for key in ('API_EXTERNAL_URL', 'SUPABASE_URL', 'SITE_URL', 'GOTRUE_SITE_URL', 'GOTRUE_API_EXTERNAL_URL', 'PGRST_DB_URI'):
        if key not in env:
            continue
        u = urlsplit(env[key])
        endpoints[key] = {'scheme': u.scheme, 'hostname': u.hostname, 'port': u.port, 'path': u.path}
    labels = c['Config'].get('Labels') or {}
    rows.append({'name': name, 'image': c['Config']['Image'], 'imageId': c['Image'],
                 'running': c['State']['Running'], 'status': c['State']['Status'],
                 'startedAt': c['State']['StartedAt'], 'restartCount': c['RestartCount'],
                 'health': (c['State'].get('Health') or {}).get('Status'),
                 'portBindings': c['NetworkSettings'].get('Ports'),
                 'composeService': labels.get('com.docker.compose.service'),
                 'revision': labels.get('org.opencontainers.image.revision'),
                 'endpoints': endpoints})
print(json.dumps({'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': '62.60.191.24', 'readOnly': True, 'containers': rows}))
