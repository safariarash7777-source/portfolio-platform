/** Lightweight static React check. Not browser interaction or native/candidate acceptance. Run with tsx. */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import P07AudiencePreview from '../../../components/admin/P07AudiencePreview';
import P07ManualDesk from '../../../components/admin/P07ManualDesk';
import P07DeskScenario from '../../../components/admin/P07DeskScenario';
import ResearchWorkbook from '../../../components/admin/ResearchWorkbook';
import { p07FixtureWorkbook, createP07WorkflowFixture } from '../../../lib/intelligence/p07-workflow-fixture';

Object.assign(globalThis, { React }); // Standalone tsx classic JSX runtime; Next has its own transform.
assert.notEqual(process.env.NODE_ENV, 'development', 'Run this static gate check outside development mode.');
const fixture = createP07WorkflowFixture();
const draft = { workbookVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contentKind: 'brief' as const,
  title: 'عنوان مخاطب', summary: 'خلاصه مخاطب', content: 'متن مخاطب', sources: [{ url: 'https://example.invalid/fixture', asOf: '2026-10-01' }],
  audience: 'public' as const, cohortIds: [], channels: ['site' as const], privateNote: 'PRIVATE_METADATA', transcript: 'PRIVATE_METADATA' };
const preview = renderToStaticMarkup(React.createElement(P07AudiencePreview, { draft }));
assert.ok(preview.includes('عنوان مخاطب')); assert.ok(!preview.includes('PRIVATE_METADATA'));
assert.ok(preview.includes('aria-label="پیش‌نمایش مخاطب"'));
const desk = renderToStaticMarkup(React.createElement(P07ManualDesk, { sample: true, transport: fixture.transport, initialWorkbook: p07FixtureWorkbook() }));
for (const label of ['نمونهٔ نمایشی', 'اصل ورودی دستی', 'گزاره، شاهد', 'ابهام‌ها', 'صف امروز', 'متن مخاطب']) assert.ok(desk.includes(label), label);
assert.ok(desk.includes('role="status"')); assert.ok(desk.includes('hidden=""'));
const workbook = renderToStaticMarkup(React.createElement<NonNullable<React.ComponentProps<typeof ResearchWorkbook>>>(ResearchWorkbook, { initialWorkbook: p07FixtureWorkbook(), transport: fixture.transport }));
assert.ok(workbook.includes('نمونه ساختگی: بررسی یک تغییر')); assert.ok(workbook.includes('شاهد کاملاً ساختگی'));
assert.ok(renderToStaticMarkup(React.createElement(P07DeskScenario)).includes('نمونه فقط در محیط توسعه فعال است.'));
console.log('STATIC_REACT_UI_4_CASES_PASS; browser interactions/native NOT_RUN');
