import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import OptionsBoard from './OptionsBoard';
import GoldCurrencyBoard from './GoldCurrencyBoard';
import type {IrOptionRow} from '../../lib/market-ir';

// tsx's isolated renderer uses the classic JSX runtime; Next uses its own build.
Object.assign(globalThis, {React});

const fixture: IrOptionRow = {
  id: 'ضنمونه', faName: 'قرارداد آزمایشی', baseId: 'نمونه', type: 'call',
  strike: 1000, dateEnd: '1405/08/01', dayRemain: 30, openInterest: 10,
  price: 250, closingPrice: 245, volume: 2, value: 1_000_000, trades: 1,
};

test('Legacy option payload cannot silently display unknown monetary units as toman', () => {
  const html = renderToStaticMarkup(React.createElement(OptionsBoard, {options: [fixture], fetchedAt: null}));
  assert.ok((html.match(/واحد نامعلوم/g) ?? []).length >= 3);
  assert.match(html, /زمان دریافت نامعلوم/);
  assert.match(html, /زمان منبع: نامعلوم/);
  assert.match(html, /اندازه قرارداد: نامعلوم/);
  assert.doesNotMatch(html, /۱ میلیون تومان/);
});

test('Attested units use canonical formatter and preserve source clock distinct from receipt', () => {
  const html = renderToStaticMarkup(React.createElement(OptionsBoard, {
    options: [{...fixture, priceUnit: 'toman', valueUnit: 'rial', sourceDate: '1405/07/11', sourceTime: '12:20:00', contractSize: 500}],
    fetchedAt: Date.UTC(2026, 9, 3, 9, 0),
  }));
  assert.match(html, /۱۰۰ هزار تومان/);
  assert.match(html, /دریافت اسنپ‌شات:/);
  assert.match(html, /۱۴۰۵\/۰۷\/۱۱ ۱۲:۲۰:۰۰/);
  assert.match(html, /اندازه قرارداد: ۵۰۰/);
  assert.doesNotMatch(html, /واحد نامعلوم/);
});

test('Gold quote without receipt time remains visible without epoch date or invented freshness', () => {
  const html = renderToStaticMarkup(React.createElement(GoldCurrencyBoard, {
    gold: [{id: 'gold-fixture', faName: 'طلای آزمایشی', price: 1000, unit: 'toman'}], currency: [], fetchedAt: null,
  }));
  assert.match(html, /زمان دریافت نامعلوم/);
  assert.match(html, /طلای آزمایشی/);
  assert.doesNotMatch(html, /آخرین به‌روزرسانی/);
});
