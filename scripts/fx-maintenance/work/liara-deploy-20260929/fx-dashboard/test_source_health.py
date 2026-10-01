import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import requests
import source_health as source


class SourceHealthTest(unittest.TestCase):
    def test_failure_preserves_date_and_marks_cache_stale(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(source, "DATA_DIR", Path(directory)):
            today = dt.datetime.now(dt.timezone.utc)
            date = today.strftime("%Y/%m/%d")
            source.atomic_write(Path(directory) / "tgju-dollar.json", {
                "source": source.URL, "fetched_at": today.isoformat(),
                "data": [[1, 1, 1, 1, 0, "", date, "source-date"]]})
            with patch.object(source.requests, "get", side_effect=requests.ConnectionError):
                result = source.load_dollar()
            self.assertTrue(result["cached"])
            self.assertTrue(result["stale"])
            self.assertEqual(result["health"]["source_date"], date)

    def test_invalid_or_expired_snapshot_is_not_used(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(source, "DATA_DIR", Path(directory)):
            old = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=8)
            source.atomic_write(Path(directory) / "tgju-dollar.json", {
                "source": source.URL, "fetched_at": old.isoformat(),
                "data": [[1, 1, 1, 1, 0, "", old.strftime("%Y/%m/%d"), "source-date"]]})
            with patch.object(source.requests, "get", side_effect=requests.ConnectionError):
                result = source.load_dollar()
            self.assertEqual(result["data"], [])
            self.assertEqual(result["health"]["status"], "unavailable")
        with self.assertRaises(ValueError):
            source.validate_rows([[1, 1, 1, "NaN", 0, "", "2020/01/01", ""]])


if __name__ == "__main__":
    unittest.main()
