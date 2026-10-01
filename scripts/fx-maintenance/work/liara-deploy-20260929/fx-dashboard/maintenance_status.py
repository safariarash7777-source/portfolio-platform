"""Pure status rules: execution, source health, coverage and publication differ."""
import datetime as dt
import hashlib

UTC = dt.timezone.utc

def stamp(value):
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (AttributeError, TypeError, ValueError):
        return None

def view(report, raw, receipt=None, now=None):
    now = now or dt.datetime.now(UTC)
    updated, finished = stamp(report.get('updated_at')), stamp(report.get('finished_at'))
    stale_running = not finished and (not updated or (now-updated).total_seconds()>1800)
    execution = report.get('execution_result') or ('completed' if finished and report.get('status')!='execution_failed' else 'unknown' if stale_running else 'running')
    next_due = stamp(report.get('schedule', {}).get('next_run_at'))
    if not next_due and finished:
        next_due = finished + dt.timedelta(days=report.get('cadence_days', 5))
    overdue = bool(next_due and now > next_due + dt.timedelta(minutes=30))
    verified = bool(receipt and receipt.get('status')=='verified' and receipt.get('run_id')==report.get('run_id') and receipt.get('sha256')==hashlib.sha256(raw).hexdigest())
    health='stale_unverified' if overdue or stale_running else report.get('source_health','unknown')
    return {'execution': execution, 'source_health': health,
            'data_completeness': report.get('data_completeness','incomplete' if report.get('all_data_current') is False else 'unknown'),
            'next_run_at': next_due.isoformat() if next_due else None, 'overdue': overdue,
            'stale_running': stale_running, 'publication_verified': verified,
            'updated_at': updated.isoformat() if updated else None}
