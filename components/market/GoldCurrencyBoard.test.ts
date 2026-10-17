import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GoldCurrencyBoard from './GoldCurrencyBoard';
import { toMarket } from '../../lib/market-ir';
import { iranReadQuality } from '../../lib/market-quality';
import { formatJalali, formatTehranClock } from '../../lib/format';
Object.assign(globalThis, { React });
const now = Date.parse('2026-10-17T08:30:00Z');
const quote = { id: 'fixture', faName: 'طلای آزمایشی', price: 12345, unit: 'toman', sourceDate: '1405-07-25', sourceTime: '12:00:00', changePercent: 0 };

function render(payload: unknown) {
  const m = toMarket(payload), families = iranReadQuality(m, now).families;
  return renderToStaticMarkup(React.createElement(GoldCurrencyBoard, { gold: m.gold, currency: m.currency, fetchedAt: m.fetchedAt, availability: families, now }));
}
test('retained gold keeps its price and own old receipt instead of borrowing fresh batch time', () => {
  const old = now - 3600000;
  const html = render({ gold: [quote], fetchedAt: now, snapshotQuality: { version: 1, state: 'partial', families: { gold: { state: 'stale', receivedAt: old, retained: true }, currency: { state: 'received', receivedAt: now } } } });
  assert.match(html, /آخرین دادهٔ ذخیره‌شده حفظ شده/);
  assert.ok(html.includes(`${formatJalali(old)} · ${formatTehranClock(old)}`));
  assert.match(html, /۱۲٬۳۴۵ تومان/);
  assert.match(html, /۱۲:۰۰:۰۰/);
  assert.doesNotMatch(html, /دریافت این بخش در بازهٔ اخیر ثبت شده/);
});
test('fresh receipt and old quote are distinct; old quote does not claim collector outage', () => {
  const html = render({ gold: [{ ...quote, sourceTime: '10:00:00' }], fetchedAt: now });
  assert.match(html, /دریافت این بخش در بازهٔ اخیر ثبت شده/);
  assert.match(html, /آخرین قیمت ثبت‌شده قدیمی‌تر از نیم ساعت/);
  assert.doesNotMatch(html, /دریافت تازهٔ این بخش احراز نشده/);
});
test('unknown and future quote clocks preserve price and explicit uncertainty', () => {
  for (const sourceTime of [null, '15:00:00']) {
    const html = render({ gold: [{ ...quote, sourceTime }], fetchedAt: now });
    assert.match(html, /۱۲٬۳۴۵ تومان/);
    assert.match(html, sourceTime === null ? /زمان کامل قیمت نامعلوم/ : /زمان قیمت جلوتر از ساعت ارزیابی/);
  }
});
test('missing family receipt never borrows batch receipt; currency-only board shows currency immediately', () => {
  const html = render({ gold: [], currency: [{ ...quote, faName: 'ارز آزمایشی' }], fetchedAt: now, snapshotQuality: { version: 1, state: 'partial', families: { currency: { state: 'received', receivedAt: null } } } });
  assert.match(html, /ارز آزمایشی/);
  assert.match(html, /زمان دریافت این بخش نامعلوم/);
  assert.doesNotMatch(html, /دریافت این بخش در بازهٔ اخیر ثبت شده/);
});
