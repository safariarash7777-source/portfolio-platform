import test from 'node:test';
import assert from 'node:assert/strict';
import { readStoredAnnouncements, recentMonthlyBounds } from './codal-stored-feed.mjs';

const row = (id, overrides = {}) => ({id, symbol:'فولاد', company_name:'فولاد مبارکه', title:'گزارش 1405/06/31', report_code:'ن-۱۰',
  link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=abc%2B%3D',
  link_excel:'https://excel.codal.ir/service/Excel/GetAll/abc%2B%3D/0', ...overrides});
const read = (rows, cursor=null, status=200) => readStoredAnnouncements(cursor, {baseUrl:'https://storage.invalid', headers:{},
  fetch:async url => { const u=new URL(url); assert.equal(u.searchParams.get('order'),'id.desc');
    assert.equal(u.searchParams.get('id'),cursor===null?null:`lt.${cursor}`);
    return new Response(JSON.stringify(rows),{status}); }});

test('verified official identity retains metadata without inventing financial dates', async()=>{
  const [result]=await read([row('9007199254740993')]);
  assert.equal(result.id,'9007199254740993');
  assert.equal(result.announcement.l18,'فولاد');
  assert.equal('date_title' in result.announcement,false);
});
test('invalid order or schema rejects the entire page', async()=>{
  for(const rows of [[row(2),row(3)],[row(2),row(2)],[row(10)], [row(Number.MAX_SAFE_INTEGER+1)], {}, [null]])
    await assert.rejects(read(rows,'10'),/order|schema/);
  await assert.rejects(read([], '0'),/cursor/);
  await assert.rejects(read([],null,503),/HTTP 503/);
});
test('short pages retain cursor-bearing rows and empty pages remain distinguishable', async()=>{
  assert.equal((await read([row(2)],'3')).length,1);
  assert.deepEqual(await read([],'2'),[]);
});
test('untrusted source or mismatched serial cannot be downloaded', async()=>{
  for(const patch of [{company_name:null},{link_excel:null},{link:'https://evil.invalid/Reports/Decision.aspx?LetterSerial=abc%2B%3D'},
    {link_excel:'https://excel.codal.ir/service/Excel/GetAll/other/0'},
    {link:'https://codal.ir/Reports/Decision.aspx?LetterSerial=abc%2B%3D&LetterSerial=other'}]) {
    const [result]=await read([row(1,patch)]);
    assert.equal(result.announcement,null);
    assert.equal(result.id,'1');
  }
});

test('recent monthly publication bounds use the Tehran day and retain only real dates', async()=>{
 const bounds=recentMonthlyBounds(Date.parse('2026-11-15T16:00:00Z'));
 assert.deepEqual(bounds,{since:'1405/07/19',until:'1405/08/24'});
 assert.equal(recentMonthlyBounds(Date.parse('2026-11-15T20:30:00Z')).until,'1405/08/25');
 const dates=['۱۴۰۵/۰۸/۲۴','١٤٠٥-٠٨-٢٣','1405/07/19','1405/07/18','1405/08/25','1405/07/31',null];
 const found=await readStoredAnnouncements(null,{
  baseUrl:'https://storage.invalid',headers:{},monthlyOnly:true,monthlyBounds:bounds,
  fetch:async url=>{
   const qs=new URL(url).searchParams,filter=qs.get('or');
   assert.equal(qs.get('category'),'eq.ماهانه');
   assert.ok(filter.includes('publish_date.gte.1405/07/19'));
   assert.ok(filter.includes('publish_date.lte.۱۴۰۵/۰۸/۲۴'));
   return Response.json(dates.map((date,i)=>row(dates.length-i,{publish_date:date})));
  },
 });
 assert.deepEqual(found.map(x=>x.announcement?.date_publish??null),[...dates.slice(0,3),null,null,null,null]);
});


test('official monthly Decision-only records admit only exact reviewed report families', async () => {
  const link = "https://codal.ir/Reports/Decision.aspx?LetterSerial=abc%2B%3D&rt=0&let=58";
  const base = { report_code:"ن-۳۰", link, link_excel:null };
  for(const type of ["0","8","9"]){
    const [valid]=await read([row(1,{...base,link:link.replace("rt=0","rt="+type)})]);
    assert.equal(valid.announcement.link_excel,null);
  }
  for (const patch of [{link_excel:"https://excel.codal.ir/service/Excel/GetAll/other/0"},
    {link_excel:" "},{report_code:"ن-۱۰"},{link:link+"&rt=9"},{link:link+"&let=6"},
    {link:link.replace("rt=0","rt=5")},{link:link.replace("codal.ir","other.invalid")},
    {link:link+"&LetterSerial=other"},{link:link+"#fragment"}]) {
    const [invalid]=await read([row(1,{...base,...patch})]);
    assert.equal(invalid.announcement,null);
  }
});
