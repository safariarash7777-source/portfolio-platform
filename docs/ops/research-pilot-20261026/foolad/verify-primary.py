"""Parse pinned official HTML as text only; row/cell refs are zero-based, colspan not expanded."""
import hashlib
import json
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
root = Path(__file__).resolve().parent
class Rows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.row = []; self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th'): self.cell = []
    def handle_data(self, text):
        if self.cell is not None: self.cell.append(text)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split())); self.cell = None
        if tag == 'tr' and self.row: self.rows.append(self.row); self.row = []
expected = {'N10':'90009e9eba89ae41eea7d581687585d25b070b3962398fafcb46941f5f2b879e','N30':'11c089fae22de79e4986b37677e3ce2af3f594642cff0f546b2bc0feb84c2a62'}
parsed = {}
for name, digest in expected.items():
    raw = (root / 'primary' / (name + '.html')).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == digest
    parser = Rows(); parser.feed(raw.decode('utf8')); parsed[name] = parser.rows
    (root / 'primary' / (name + '-rows.json')).write_text(json.dumps(parser.rows, ensure_ascii=False, indent=2)+'\n')
trans = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
def num(value):
    text = value.translate(trans).replace(',', '').replace('٬', '').strip()
    return -Decimal(text[1:-1]) if text.startswith('(') else Decimal(text)
def cell(doc, row, col): return num(parsed[doc][row][col])
def pct(a,b): return a/b*100
n10,n30=parsed['N10'],parsed['N30']
assert '۱۴۰۵/۰۳/۳۱' in n10[0][1] and '۱۴۰۴/۰۳/۳۱' in n10[0][2]
assert 'تجديد ارائه' in n10[0][2]
assert '۱۴۰۵/۰۶/۳۱' in n30[0][4] and '۱۴۰۴/۰۶/۳۱' in n30[0][6]
assert n30[1][16] == 'مبلغ فروش (میلیون ریال)'
assert n30[2][0]=='فروش داخلی:' and n30[10][0]=='فروش صادراتی:' and n30[18][0]=='درآمد ارائه خدمات:'
assert cell('N10',3,1)+cell('N10',4,1)==cell('N10',5,1)
assert cell('N10',236,2)+cell('N10',237,2)==cell('N10',238,2)==-cell('N10',4,1)
parts={'domestic':9,'exports':17,'services':21}
monthly={k:cell('N30',r,16) for k,r in parts.items()}; cumulative={k:cell('N30',r,20) for k,r in parts.items()};prior={k:cell('N30',r,24) for k,r in parts.items()}
total=cell('N30',25,16);cum=cell('N30',25,20);old=cell('N30',25,24)
assert sum(monthly.values())==total and sum(cumulative.values())==cum and sum(prior.values())==old
product_rows=[3,4,5,6,7,8,11,12,13,14,15,16,19,20]
products=[]
for r in product_rows:
    assert n30[r][1].replace(' ','')=='هزارتن'
    amount=cell('N30',r,16); quantity=cell('N30',r,14)
    rate=cell('N30',r,15) if n30[r][15] else None
    diff=None if rate is None else amount-quantity*rate/1000000
    if diff is not None: assert abs(diff)<=Decimal('0.5')
    products.append({'row':r,'product':n30[r][0],'category':'domestic' if r<10 else 'exports' if r<18 else 'services','quantityUnit':'thousand tonnes','salesQuantity':quantity,'rateRialPerThousandTonnes':rate,'salesMillionRial':amount,'amountMinusQuantityTimesRateMillionRial':diff})
packet=json.loads((root/'stored-source-packet.json').read_text());stored10=packet['packets'][0]['rows'][0]['data'];stored30=packet['packets'][1]['rows'][0]['data']
for key,row in [('revenue',3),('gross_profit',5),('operating_profit',10),('net_profit',20)]:
    assert cell('N10',row,1)==stored10['standalone'][key]
    assert cell('N10',row,2)==stored10['standalone']['prior'][key]
assert total==stored30['period_total_amount'] and cum==stored30['fy_cumulative_amount']
result={'scope':'Independent fixed primary-document reconstruction; no database mutation or forecast', 'references':'zero-based tr rows and td/th cell indices in exported rows; spans not expanded',
'primaryHashes':expected,'n10':{'period':'1405-03-31/3','priorPeriod':'1404-03-31/3','priorColumnRestated':True,'restatedFlagMismatch':stored10['restated_prior'] is False,'revenue':cell('N10',3,1),'cogs':-cell('N10',4,1),'grossProfit':cell('N10',5,1),'netProfit':cell('N10',20,1),'basicEPSRial':cell('N10',26,1),'netProfitPerShareRial':cell('N10',27,1),'storedEPSDefinition':'63 matches basic EPS; do not relabel as the separate net-profit-per-share row', 'costOfGoods':cell('N10',236,2),'costOfServices':cell('N10',237,2),'directMaterials':cell('N10',225,2),'directLabour':cell('N10',226,2),'productionOverhead':cell('N10',227,2),'costOfServicesSharePct':pct(cell('N10',237,2),cell('N10',238,2))},
'n30':{'period':'1405-06-31/1','unit':'million IRR','monthly':monthly,'monthlyTotal':total,'monthlySharePct':{k:pct(v,total) for k,v in monthly.items()},'cumulative':cumulative,'cumulativePriorSamePeriod':prior,'cumulativeTotal':cum,'priorCumulativeTotal':old,'cumulativeGrowthPct':pct(cum-old,old),'products':products,'sourceNoteRow61':n30[61][0],'classificationMismatch':'Stored export and service rows labeled domestic; raw qty_unit missing despite primary thousand-tonne cells.'},
'sensitivity':{'kind':'Mechanical sensitivity, not a forecast or calibrated scenario','scope':'Only domestic hot-products monthly revenue; other revenue held fixed; no cost/profit projection','sourceRow':4,'baseRevenue':total,'baseAffectedAmount':cell('N30',4,16),'upsideRateChangePct':10,'upsideRevenue':total+cell('N30',4,16)*Decimal('.1'),'downsideRateChangePct':-10,'downsideRevenue':total-cell('N30',4,16)*Decimal('.1'),'totalRevenueChangePct':pct(cell('N30',4,16)*Decimal('.1'),total),'assumptions':'Quantity, other product rates/mix, service revenue and exchange conversion held constant; no probability assigned.'}}
(root/'primary-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str)+'\n')
print(json.dumps({k:result[k] for k in ['n10','sensitivity']},ensure_ascii=False,indent=2,default=str))
