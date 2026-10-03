import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import ts from 'typescript';
import { createP07WorkflowFixture, p07FixtureWorkbook } from '../../lib/intelligence/p07-workflow-fixture';
import type { WorkbookTransport } from './ResearchWorkbook';

// Execute the actual component and its event handlers with a minimal hook host.
// No copied approval expressions, DOM dependency, browser or Native DB acceptance.
type Element = React.ReactElement<Record<string, unknown>>;
function children(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(children);
  return React.isValidElement(node) ? [node, ...children((node.props as { children?: unknown }).children)] : [];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement(node)) return text((node.props as { children?: unknown }).children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function mount(transport: WorkbookTransport, workbookId: string) {
  const slots: unknown[] = [], pending: (() => unknown)[] = [];
  const dependencies = new Map<number, readonly unknown[]>();
  let index = 0, tree: unknown;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], (next: unknown) => { slots[key] = typeof next === 'function' ? next(slots[key]) : next; }];
    },
    useRef(initial: unknown) {
      const key = index++;
      if (!(key in slots)) slots[key] = { current: initial };
      return slots[key];
    },
    useEffect(effect: () => unknown, deps: readonly unknown[]) {
      const key = index++, previous = dependencies.get(key);
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) pending.push(effect);
      dependencies.set(key, deps);
    },
  };
  const filename = resolve('components/admin/ResearchWorkbook.tsx');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const localRequire = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const load = (name: string) => name === 'react' ? hooks : localRequire(name.startsWith('@/') ? resolve(name.slice(2)) : name);
  new Function('require', 'module', 'exports', 'React', compiled)(load, taskModule, taskModule.exports, React);
  const component = taskModule.exports.default;
  function render() { index = 0; tree = component({ transport, initialWorkbookId: workbookId }); }
  async function settle() {
    // Bounded microtask turns accommodate void async UI handlers and mount effects.
    for (let turn = 0; turn < 5; turn++) {
      render(); for (const effect of pending.splice(0)) effect();
      await new Promise<void>(done => setImmediate(done));
    }
    render();
  }
  function find(type: string, predicate: (element: Element) => boolean) {
    const found = children(tree).find(node => React.isValidElement(node) && node.type === type && predicate(node as Element));
    assert.ok(found, `UI ${type} not found`); return found as Element;
  }
  const button = (label: string) => find('button', element => text(element).includes(label));
  const badge = () => text(find('p', element => element.props['aria-live'] === 'polite')).includes('تأیید داخلی شده');
  async function click(label: string) {
    const element = button(label); assert.equal(Boolean(element.props.disabled), false, `${label} must be enabled`);
    (element.props.onClick as () => void)(); await settle();
  }
  return { settle, button, badge, click, find, render };
}

test('actual workbook UI clears approval after return and reopen, and permits reapproval', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  assert.equal(saved.status, 201);
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    const id = String(saved.body.workbookId);
    const ui = mount(fixture.transport, id); await ui.settle();
    assert.equal(ui.badge(), false);
    await ui.click('تأیید داخلی نسخه'); assert.equal(ui.badge(), true);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true);
    await ui.click('بازگرداندن با علت'); assert.equal(ui.badge(), false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, false);
    const reopened = mount(fixture.transport, id); await reopened.settle();
    assert.equal(reopened.badge(), false); assert.equal(reopened.button('تأیید داخلی نسخه').props.disabled, false);
    await reopened.click('تأیید داخلی نسخه'); assert.equal(reopened.badge(), true);
    assert.equal(fixture.snapshot().reviews.length, 3);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('actual UI respects returned ties, old versions, dirty state and in-flight decisions', async () => {
  const fixture = createP07WorkflowFixture(), path = '/api/admin/intelligence/workbooks';
  const saved = await fixture.transport(path, { method: 'POST', body: JSON.stringify({ action: 'save', workbookId: null, baseVersion: 0, workbook: p07FixtureWorkbook() }) });
  const id = String(saved.body.workbookId);
  const approved = { version: 1, decision: 'approved_internal', note: null, reviewedAt: '2026-10-03T10:00:00.000Z' };
  let mode: 'tie' | 'old' | 'plain' = 'tie';
  let release: (() => void) | undefined, writes = 0;
  const transport: WorkbookTransport = async (url, init) => {
    if (init?.method === 'POST') {
      writes++; await new Promise<void>(done => { release = done; });
      return fixture.transport(url, init);
    }
    const response = await fixture.transport(url, init);
    if (url.includes('?id=')) return { ...response, body: { ...response.body, latestVersion: mode === 'old' ? 2 : 1,
      reviews: mode === 'tie' ? [approved, { ...approved, decision: 'returned' }] : mode === 'old' ? [approved] : [] } };
    return response;
  };
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: () => true, prompt: () => 'Synthetic return', addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  try {
    let ui = mount(transport, id); await ui.settle();
    assert.equal(ui.badge(), false); assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, false);
    mode = 'old'; ui = mount(transport, id); await ui.settle();
    assert.equal(ui.badge(), false);
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
    mode = 'plain'; ui = mount(transport, id); await ui.settle();
    const approve = ui.button('تأیید داخلی نسخه').props.onClick as () => void;
    approve(); ui.render();
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
    approve(); assert.equal(writes, 1, 'busyRef prevents duplicate request from an earlier render');
    assert.ok(release); release(); await ui.settle();
    const input = ui.find('input', element => element.props.value === p07FixtureWorkbook().title);
    (input.props.onChange as (event: unknown) => void)({ target: { value: 'Changed synthetic title' } }); await ui.settle();
    assert.equal(ui.button('تأیید داخلی نسخه').props.disabled, true); assert.equal(ui.button('بازگرداندن با علت').props.disabled, true);
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
