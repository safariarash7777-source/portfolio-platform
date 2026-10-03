import sys,unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'work/liara-deploy-20260929'))
from liara_connection import proxy_mapping
class Connection(unittest.TestCase):
 def test_closed_local_proxy_uses_verified_direct_route(self):
  probe=Mock(side_effect=ConnectionRefusedError());self.assertEqual(proxy_mapping('auto',probe),{});probe.assert_called_once_with(('127.0.0.1',2080),timeout=.5)
 def test_open_existing_proxy_preserved(self):
  connection=Mock();probe=Mock(return_value=connection);self.assertEqual(proxy_mapping('auto',probe),{'https':'http://127.0.0.1:2080'});connection.close.assert_called_once()
 def test_explicit_proxy_has_no_silent_fallback(self):
  probe=Mock();self.assertEqual(proxy_mapping('https://127.0.0.1:2080',probe),{'https':'https://127.0.0.1:2080'});probe.assert_not_called()
 def test_explicit_direct_requires_no_probe(self):
  probe=Mock();self.assertEqual(proxy_mapping('direct',probe),{});probe.assert_not_called()
 def test_invalid_setting_rejected(self):
  with self.assertRaises(ValueError):proxy_mapping('file:///wrong')
if __name__=='__main__':unittest.main()
