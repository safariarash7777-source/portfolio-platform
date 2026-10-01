"""Load checksum-verified official vintages without silently changing definitions."""
import hashlib
import json
import re
import pandas as pd
import numpy as np
from source_health import DATA_DIR

SERIES = {'CPIAUCSL', 'M2SL', 'GDPC1', 'DFF', 'DCOILBRENTEU'}

def load(series_id, directory=DATA_DIR):
    if series_id not in SERIES:
        return pd.Series(dtype=float)
    try:
        folder = directory / 'official-documents' / series_id
        metadata = json.loads((folder / 'latest.json').read_text(encoding='utf-8'))
        checksum = metadata['sha256']
        if metadata['status'] != 'validated_snapshot' or not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('Unvalidated snapshot')
        raw = (folder / (checksum + '.csv')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != checksum:
            raise ValueError('Snapshot checksum mismatch')
        from io import BytesIO
        frame = pd.read_csv(BytesIO(raw))
        if len(frame.columns) != 2 or series_id not in frame:
            raise ValueError('Unexpected columns')
        dates = pd.to_datetime(frame.iloc[:, 0], errors='coerce')
        values = pd.to_numeric(frame[series_id], errors='coerce')
        if dates.isna().any() or dates.duplicated().any() or not dates.is_monotonic_increasing:
            raise ValueError('Invalid dates')
        if (dates > pd.Timestamp.now(tz='UTC').tz_localize(None).normalize()).any():
            raise ValueError('Future observation')
        if np.isinf(values).any() or not values.notna().any():
            raise ValueError('Invalid observations')
        result = pd.Series(values.to_numpy(), index=pd.DatetimeIndex(dates), name=series_id)
        age = pd.Timestamp.now(tz='UTC') - pd.Timestamp(metadata['checked_at'])
        result.attrs.update({'source': metadata['url'], 'sha256': checksum,
                             'last_period': metadata['last_period'], 'checked_at': metadata['checked_at'],
                             'stale': age > pd.Timedelta(days=7), 'snapshot': True})
        return result
    except (OSError, ValueError, TypeError, KeyError):
        return pd.Series(dtype=float)

def version(directory=DATA_DIR):
    checksums = []
    for sid in sorted(SERIES):
        path = directory / 'official-documents' / sid / 'latest.json'
        checksums.append(hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else 'missing')
    return ':'.join(checksums)
