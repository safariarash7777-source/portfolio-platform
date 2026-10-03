import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React from 'react';
import ts from 'typescript';
// Actual TSX and handlers; bounded hook host, not DOM/browser reconciliation.
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
export function mountComponent(path: string, props: Record<string, unknown>) {
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
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const key = index++, previous = dependencies.get(key);
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) slots[key] = callback;
      dependencies.set(key, deps); return slots[key];
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
  const filename = resolve(path);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const localRequire = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
  const load = (name: string) => name === 'react' ? hooks : localRequire(name.startsWith('@/') ? resolve(name.slice(2)) : name);
  new Function('require', 'module', 'exports', 'React', compiled)(load, taskModule, taskModule.exports, React);
  const component = taskModule.exports.default;
  function render() { index = 0; tree = component(props); }
  async function settle() {
    // Bounded microtask turns accommodate void async UI handlers and mount effects.
    for (let turn = 0; turn < 5; turn++) {
      render(); for (const effect of pending.splice(0)) effect();
      await new Promise<void>(done => setImmediate(done));
    }
    render();
  }
  function find(type: React.ElementType, predicate: (element: Element) => boolean) {
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
