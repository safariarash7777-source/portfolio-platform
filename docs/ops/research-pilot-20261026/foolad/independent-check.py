"""Independent integer/Decimal reconstruction of the frozen public financial input."""
import hashlib
import json
from decimal import Decimal
from pathlib import Path
root = Path(__file__).resolve().parent
f = json.loads((root / 'foolad-fundamentals-resolved.json').read_text())
n = f['n10']['data']['standalone']
m = f['n30']['data'][0]
D = Decimal
result = {
    'method': 'Independent Python integer/Decimal reconstruction; not primary-source verification',
    'grossProfitExpected': n['revenue'] - n['cogs'],
    'grossProfitMatches': n['revenue'] - n['cogs'] == n['gross_profit'],
    'monthlyProductSum': sum(x['sales_amount'] for x in m['products']),
    'monthlyTotalMatches': sum(x['sales_amount'] for x in m['products']) == m['period_total_amount'],
    'revenueGrowthPct': str((D(n['revenue']) / D(n['prior']['revenue']) - 1) * 100),
    'grossMarginPct': str(D(n['gross_profit']) / D(n['revenue']) * 100),
    'priorGrossMarginPct': str(D(n['prior']['gross_profit']) / D(n['prior']['revenue']) * 100),
    'cogsGrowthPct': str((D(n['cogs']) / D(n['prior']['cogs']) - 1) * 100),
    'hashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in [
        'foolad-fundamentals-resolved.json', 'foolad-calculations.json',
        'reproduce.mts', 'foolad-workbook.json', 'source-receipt.json']},
}
(root / 'independent-check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
