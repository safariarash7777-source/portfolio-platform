import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CommodityBoard from './CommodityBoard';
import { toMarket } from '../../lib/market-ir';
Object.assign(globalThis, { React });

test('stored commodity mapping and SSR preserve unknown values, source unit and independent clocks', () => {
  const market = toMarket({
    fetchedAt: 1700000000000,
    commodities: [{ id: 'TEST', name: 'Synthetic commodity', price: null, changePercent: null, unit: null, date: null, time: null, timeUnix: null }],
    commodityState: 'stale',
  });
  assert.equal(market.commodityFetchedAt, null);
  assert.equal(market.commodities?.[0].price, null);
  const html = renderToStaticMarkup(React.createElement(CommodityBoard, { rows: market.commodities!, fetchedAt: market.commodityFetchedAt!, state: market.commodityState }));
  assert.match(html, /Synthetic commodity/);
  assert.match(html, /زمان دریافت نامعلوم/);
  assert.match(html, /واحد نامعلوم/);
  assert.match(html, /زمان کامل قیمت نامعلوم/);
  assert.match(html, /آخرین دادهٔ ذخیره‌شده/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, /هم‌اکنون/);
});

test('received quotes retain source unit, zero change and seconds without synthesizing dates', () => {
  const market = toMarket({ commodities: [null, { id: '' }, { id: 'TEST', price: 12.25, changePercent: 0, unit: 'USD/test', timeUnix: 1700000000 }], commodityFetchedAt: 1700000005000, commodityState: 'received' });
  assert.equal(market.commodities?.length, 1);
  assert.equal(market.commodities?.[0].timeUnix, 1700000000);
  assert.equal(market.commodities?.[0].date, null);
  const html = renderToStaticMarkup(React.createElement(CommodityBoard, { rows: market.commodities!, fetchedAt: market.commodityFetchedAt!, state: market.commodityState }));
  assert.match(html, /USD\/test/);
  assert.match(html, /زمان ثبت منبع/);
  assert.doesNotMatch(html, /تغییر نامعلوم/);
  assert.deepEqual(toMarket({}).commodities, []);
  assert.equal(toMarket({ commodityState: 'private-error' }).commodityState, 'unknown');
});
