import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import ts from "typescript";
import { createFinancialEditor, type FinancialEditor } from "./financialEditor";
// Executes the real TSX handlers with bounded hooks; not DOM or Native acceptance.
type Element = React.ReactElement<Record<string, unknown>>;
const children = (node: unknown): Element[] => Array.isArray(node) ? node.flatMap(children) : React.isValidElement(node) ? [node as Element, ...children((node.props as { children?: unknown }).children)] : [];
const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text((node.props as { children?: unknown }).children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
export function mountFinancialForm(path: string, props: Record<string, unknown>, editor: FinancialEditor = createFinancialEditor()) {
 const slots: unknown[] = [], navigation: string[] = []; let index = 0, tree: unknown, refreshes = 0;
 const events = new EventTarget();
 const effects: (() => void)[] = [];
 const hooks = { ...React,
  useContext() { return editor; },
  useEffect(effect: () => void | (() => void), deps: unknown[]) {
   const key = index++, old = slots[key] as { deps: unknown[]; cleanup?: () => void } | undefined;
   if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
    effects.push(() => { old?.cleanup?.(); const cleanup = effect(); slots[key] = { deps, cleanup }; });
   }
  },
  useState(initial: unknown) { const key = index++; if(!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial; return [slots[key], (next: unknown) => { slots[key] = typeof next === "function" ? next(slots[key]) : next; }]; },
  useRef(initial: unknown) { const key = index++; if(!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
 };
 const filename = resolve(path), localRequire = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
 const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
 const groupFile = resolve("components/portfolio/FinancialEditors.tsx"), group = { exports: {} };
 const groupCode = ts.transpileModule(readFileSync(groupFile, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: groupFile }).outputText;
 new Function("require", "module", "exports", "React", groupCode)((name: string) => name === "react" ? hooks : createRequire(groupFile)(name), group, group.exports, React);
 const load = (name: string) => name === "./FinancialEditors" ? group.exports : name === "react" ? hooks : name === "next/navigation" ? { useRouter: () => ({ push: (url: string) => navigation.push(url), refresh() { refreshes++; } }) } : localRequire(name.startsWith("@/") ? resolve(name.slice(2)) : name);
 new Function("require", "module", "exports", "React", "window", compiled)(load, taskModule, taskModule.exports, React, events);
 const render = () => { index = 0; tree = taskModule.exports.default(props); effects.splice(0).forEach(effect => effect()); };
 const elements = () => children(tree);
 function find(type: React.ElementType, predicate: (element: Element) => boolean) { const found = elements().find(node => node.type === type && predicate(node)); assert.ok(found, `UI ${type} not found`); return found; }
 const button = (label: string) => find("button", element => text(element).includes(label));
 async function submit(label: string) { const element = button(label); assert.equal(Boolean(element.props.disabled), false); const form = elements().find(node => node.type === "form"); await (element.props.onClick ? (element.props.onClick as () => Promise<void>)() : (form!.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })); render(); }
 render(); return { beforeUnload: () => { const event = new Event("beforeunload", { cancelable: true }); events.dispatchEvent(event); return event.defaultPrevented; }, render, elements, find, button, submit, navigation, get refreshes() { return refreshes; }, text: () => text(tree) };
}
