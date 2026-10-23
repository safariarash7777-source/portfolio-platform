"""Pure attestation tests only. Never connects to Docker or a database."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-native.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AttestationTests(unittest.TestCase):
    def fixture(self):
        return {'Name': '/' + m.TARGET, 'Id': 'synthetic-copy', 'Image': m.IMAGE,
                'State': {'Running': False}, 'HostConfig': {'NetworkMode': 'none', 'PortBindings': {}},
                'NetworkSettings': {'Ports': {'5432/tcp': None}},
                'Config': {'Labels': {'portfolio.recovery': 'isolated-proof'}, 'Cmd': ['postgres', '-c', 'cron.launch_active_jobs=off']},
                'Mounts': [{'Type': 'bind', 'Source': str(m.CHECKPOINT), 'Destination': '/recovery', 'RW': False},
                           {'Type': 'volume', 'Source': '/synthetic-volume', 'Destination': '/var/lib/postgresql/data', 'RW': True}]}

    def test_expected_stopped_copy(self):
        m.copy_safe(self.fixture(), {'Mounts': [{'Source': '/operational-volume'}]}, False)

    def test_target_identity_network_mounts_cron_fail_closed(self):
        for edit in [lambda x: x.update(Id=m.SOURCE_ID),
                     lambda x: x['HostConfig'].update(NetworkMode='bridge'),
                     lambda x: x['Mounts'][0].update(RW=True),
                     lambda x: x['Mounts'][1].update(Source='/operational-volume'),
                     lambda x: x['Config'].update(Cmd=['postgres']),
                     lambda x: x['NetworkSettings'].update(Ports={'5432/tcp': [{'HostPort': '5432'}]})]:
            state = copy.deepcopy(self.fixture())
            edit(state)
            with self.assertRaises(RuntimeError):
                m.copy_safe(state, {'Mounts': [{'Source': '/operational-volume'}]}, False)

    def test_installer_matches_pinned_atomic_sql(self):
        self.assertEqual(m.digest((m.REPO / 'sql/consultation_workflow.sql').read_bytes()), m.SQL_SHA)


if __name__ == '__main__':
    unittest.main()
