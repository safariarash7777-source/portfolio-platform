import test from 'node:test';
import assert from 'node:assert/strict';
import { readStoredAnnouncements } from './codal-stored-feed.mjs';

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
