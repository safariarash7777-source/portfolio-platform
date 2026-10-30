// Synthetic read states only; no account, provider, database or operational task.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import AdminWorkdayPath from './AdminWorkdayPath';
import { mountComponent } from './p07-component-test-host';
import type { ArashDeskData } from '../../lib/desk/workspace-model';
Object.assign(globalThis,{React});
function data():ArashDeskData {
  return {market:{data:null,availability:{state:'error',sourceAt:null,receivedAt:null,validAt:null,readAt:0}},
    chart:{state:'unavailable',data:[],reason:'synthetic'},reports:{state:'unavailable',data:[],reason:'synthetic'},
    research:{drafts:[],unavailableReason:null,invalidCount:0},readAt:'2026-10-30T00:00:00Z'};
}
test('workday distinguishes failed, empty and omitted research; no source-free service entitlement',()=>{
  const input=data();input.research.unavailableReason='synthetic outage';
  let html=renderToStaticMarkup(<AdminWorkdayPath data={input}/>);
  assert.match(html,/خالی‌بودن صف احراز نشده/);
  assert.match(html,/حق خدمت نامعلوم/);
  assert.match(html,/مسئول ثبت‌شده/);
  assert.match(html,/موعد:/);
  input.research.unavailableReason=null;
  html=renderToStaticMarkup(<AdminWorkdayPath data={input}/>);
  assert.match(html,/پیش‌نویس تاریخی در این خواندن نیست/);
  input.research.invalidCount=2;
  html=renderToStaticMarkup(<AdminWorkdayPath data={input}/>);
  assert.match(html,/رکورد قابل نمایش نبود؛ صف خالی احراز نشده/);
  for(const path of ['/admin/research','/admin/consultation','/admin/users','/admin/health'])assert.ok(html.includes(`href="${path}"`));
});
test('priority and stop are temporary UI controls and cannot dispatch requests',async()=>{
  const fetch=globalThis.fetch;
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network forbidden');};
  try {
    const host=mountComponent('components/admin/AdminWorkdayPath.tsx',{data:data()});
    await host.settle();
    const select=host.find('select',()=>true);
    (select.props.onChange as (event:unknown)=>void)({target:{value:'service'}});await host.settle();
    assert.ok(JSON.stringify(host.find('li',()=>true).props.children).includes('بررسی خدمت عضو'));
    await host.click('توقف در این نما');
    host.find('p',element=>JSON.stringify(element.props.children).includes('توقف نمایشی؛ علت و مسئول واقعی'));
    await host.click('برداشتن توقف نمایشی');
    assert.equal(calls,0);
  } finally {globalThis.fetch=fetch;}
});
test('same existing admin page and role gate are retained',()=>{
  const entry=readFileSync('app/(protected)/admin/page.tsx','utf8');
  const gate=readFileSync('app/(protected)/admin/layout.tsx','utf8');
  const desk=readFileSync('components/admin/ArashDeskWorkspace.tsx','utf8');
  assert.match(entry,/redirect\("\/admin\/desk"\)/);
  assert.match(gate,/profile\?\.role !== "admin"/);
  assert.match(desk,/<AdminWorkdayPath data=\{data\} \/>/);
});
