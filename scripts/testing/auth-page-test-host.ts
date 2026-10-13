import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as returnPaths from "../../components/account/returnPath";

type Element = React.ReactElement<Record<string, unknown>>;
type Effect = { deps: unknown[]; setup: () => void | (() => void); cleanup?: () => void };
type Instance = { slots: unknown[]; effects: (() => void)[]; mounted: boolean; lateUpdates: number };
export type SignIn = (values: { email: string; password: string }) => Promise<{ error: { message: string } | null }>;
const elements = (node: unknown): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node as Element, ...elements((node.props as { children?: unknown }).children)] : [];
const text = (node: unknown): string => Array.isArray(node) ? node.map(text).join("")
  : React.isValidElement(node) ? text((node.props as { children?: unknown }).children)
    : typeof node === "string" || typeof node === "number" ? String(node) : "";

// Execute the actual page and its handlers with deterministic hooks/timers and SDK mocks.
// This is component behavior coverage, not browser/DOM or live Auth acceptance.
export function loginPageHost(signIn: SignIn, query = "") {
  let active: Instance, index = 0, clock = 0, timerId = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const navigation: string[] = [], calls: { email: string; password: string }[] = [];
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const instance = active, key = index++;
      if (!(key in instance.slots)) instance.slots[key] = typeof initial === "function" ? initial() : initial;
      return [instance.slots[key], (next: unknown) => {
        if (!instance.mounted) instance.lateUpdates++;
        instance.slots[key] = typeof next === "function" ? next(instance.slots[key]) : next;
      }];
    },
    useRef(initial: unknown) {
      const key = index++;
      if (!(key in active.slots)) active.slots[key] = { current: initial };
      return active.slots[key];
    },
    useEffect(setup: Effect["setup"], deps: unknown[]) {
      const instance = active, key = index++, old = instance.slots[key] as Effect | undefined;
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        instance.effects.push(() => {
          old?.cleanup?.();
          const effect: Effect = { deps, setup };
          const cleanup = setup();
          if (cleanup) effect.cleanup = cleanup;
          instance.slots[key] = effect;
        });
      }
    },
  };
  const filename = resolve("app/(auth)/login/page.tsx");
  const loaded = { exports: {} as { default: () => Element } };
  const passthrough = (props: Record<string, unknown>) => React.createElement("a", props, props.children as React.ReactNode);
  runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename,
  }).outputText, {
    exports: loaded.exports, React,
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams(query) };
      if (name === "next/link" || name === "@/components/ui/Logo") return { __esModule: true, default: passthrough };
      if (name === "lucide-react") return { Eye: () => null, EyeOff: () => null, LogIn: () => null };
      if (name === "@/components/account/returnPath") return returnPaths;
      if (name === "@/lib/supabase/client") return { createClient: () => ({ auth: {
        signInWithPassword: (values: { email: string; password: string }) => { calls.push(values); return signIn(values); },
        signOut: () => assert.fail("a UI deadline must never sign out"),
      } }) };
      throw new Error("Unexpected page dependency: " + name);
    },
    window: { location: { assign: (url: string) => navigation.push(url) } },
    setTimeout: (run: () => void, milliseconds: number) => { const id = ++timerId; timers.set(id, { at: clock + milliseconds, run }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  function mount() {
    const instance: Instance = { slots: [], effects: [], mounted: true, lateUpdates: 0 };
    let tree: unknown;
    function render() {
      active = instance; index = 0;
      const wrapper = loaded.exports.default();
      const content = wrapper.props.children as Element;
      tree = (content.type as (props: unknown) => unknown)(content.props);
      instance.effects.splice(0).forEach(effect => effect());
    }
    const find = (type: string, predicate: (node: Element) => boolean = () => true) => {
      const node = elements(tree).find(item => item.type === type && predicate(item));
      assert.ok(node, "Page element missing: " + type); return node;
    };
    const submitHandler = () => find("form").props.onSubmit as (event: { preventDefault(): void }) => Promise<void>;
    const cleanup = () => instance.slots.forEach(slot => (slot as Effect)?.cleanup?.());
    render(); render();
    return {
      render, find, submitHandler,
      submit: () => submitHandler()({ preventDefault() {} }),
      fill(email = "fixture@example.test", password = "offline-test-only") {
        for (const [id, value] of [["login-email", email], ["login-password", password]]) {
          (find("input", node => node.props.id === id).props.onChange as (event: unknown) => void)({ target: { value } });
        }
        render();
      },
      text: () => text(tree), html: () => renderToStaticMarkup(tree as React.ReactElement),
      unmount() { cleanup(); instance.mounted = false; },
      replayEffects() { cleanup(); instance.slots.forEach(slot => { const effect = slot as Effect; if (effect?.setup) effect.cleanup = effect.setup() || undefined; }); render(); },
      get lateUpdates() { return instance.lateUpdates; },
    };
  }
  return {
    mount, navigation, calls,
    advance(milliseconds: number) { clock += milliseconds; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.run(); } },
    get timerCount() { return timers.size; },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
