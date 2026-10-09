import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import ts from "typescript";
// Executes the real TSX handlers with bounded hooks; not DOM or Native acceptance.
type Element = React.ReactElement<Record<string, unknown>>;
const children = (node: unknown): Element[] => Array.isArray(node) ? node.flatMap(children) : React.isValidElement(node) ? [node as Element, ...children((node.props as { children?: unknown }).children)] : [];
const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text((node.props as { children?: unknown }).children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
export function mountFinancialForm(path: string, props: Record<string, unknown>) {
 const slots: unknown[] = [], navigation: string[] = []; let index = 0, tree: unknown, refreshes = 0;
 const hooks = { ...React,
  useState(initial: unknown) { const key = index++; if(!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial; return [slots[key], (next: unknown) => { slots[key] = typeof next === "function" ? next(slots[key]) : next; }]; },
  useRef(initial: unknown) { const key = index++; if(!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
 };
 const filename = resolve(path), localRequire = createRequire(filename), taskModule = { exports: {} as { default: (props: unknown) => unknown } };
 const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename }).outputText;
 const load = (name: string) => name === "react" ? hooks : name === "next/navigation" ? { useRouter: () => ({ push: (url: string) => navigation.push(url), refresh() { refreshes++; } }) } : localRequire(name.startsWith("@/") ? resolve(name.slice(2)) : name);
 new Function("require", "module", "exports", "React", compiled)(load, taskModule, taskModule.exports, React);
 const render = () => { index = 0; tree = taskModule.exports.default(props); };
 const elements = () => children(tree);
 function find(type: React.ElementType, predicate: (element: Element) => boolean) { const found = elements().find(node => node.type === type && predicate(node)); assert.ok(found, `UI ${type} not found`); return found; }
 const button = (label: string) => find("button", element => text(element).includes(label));
 async function submit(label: string) { const element = button(label); assert.equal(Boolean(element.props.disabled), false); const form = elements().find(node => node.type === "form"); await (element.props.onClick ? (element.props.onClick as () => Promise<void>)() : (form!.props.onSubmit as (event: { preventDefault(): void }) => Promise<void>)({ preventDefault() {} })); render(); }
 render(); return { render, elements, find, button, submit, navigation, get refreshes() { return refreshes; }, text: () => text(tree) };
}
