import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the real component with deterministic hooks, events and rectangles.
// This is component-logic coverage, not React DOM, layout or browser acceptance.
type Element = { type: string; props: Record<string, any> };
type Effect = { deps: unknown[]; cleanup?: () => void };
type Instance = { slots: any[]; effects: (() => void)[]; dirty: boolean; mounted: boolean; lateUpdates: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type Listener = { name: string; run: (event: any) => void; capture: boolean };
const source = readFileSync(process.env.TERM_TEST_SOURCE || new URL("./Term.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
} }).outputText;

function host() {
  class TestNode {
    children: TestNode[] = [];
    contains(target: unknown): boolean { return this === target || this.children.some(child => child.contains(target)); }
  }
  let active: Instance, index = 0, nextId = 0;
  const listeners: Listener[] = [];
  let clock = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const setTimeout = (run: () => void, delay: number) => {
    const id = ++nextTimer; timers.set(id, { at: clock + delay, run }); return id;
  };
  const clearTimeout = (id: number) => { timers.delete(id); };
  const advance = (ms: number) => {
    clock += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.run(); }
  };
  const focusPaths = new Map<unknown, (event: unknown) => void>();
  const document = { body: {}, activeElement: {} as unknown, documentElement: { clientWidth: 390 } };
  const window = {
    innerHeight: 844,
    addEventListener(name: string, run: Listener["run"], capture = false) { listeners.push({ name, run, capture }); },
    removeEventListener(name: string, run: Listener["run"], capture = false) {
      const i = listeners.findIndex(x => x.name === name && x.run === run && x.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const hooks = {
    useCallback(callback: unknown, deps: unknown[]) {
      const key = index++, old = active.slots[key];
      if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) active.slots[key] = { callback, deps };
      return active.slots[key].callback;
    },
    useState(initial: unknown) {
      const instance = active, key = index++;
      if (!(key in instance.slots)) instance.slots[key] = initial;
      return [instance.slots[key], (value: unknown) => {
        if (!instance.mounted) instance.lateUpdates++;
        if (!Object.is(instance.slots[key], value)) { instance.slots[key] = value; instance.dirty = true; }
      }];
    },
    useRef(initial: unknown) {
      const key = index++;
      if (!(key in active.slots)) active.slots[key] = { current: initial };
      return active.slots[key];
    },
    useId() {
      const key = index++;
      if (!(key in active.slots)) active.slots[key] = `term-${++nextId}`;
      return active.slots[key];
    },
    useLayoutEffect(setup: () => void | (() => void), deps: unknown[]) {
      const instance = active, key = index++, old = instance.slots[key] as Effect | undefined;
      if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) instance.effects.push(() => {
        old?.cleanup?.();
        const effect: Effect = { deps };
        const cleanup = setup();
        if (cleanup) effect.cleanup = cleanup;
        instance.slots[key] = effect;
      });
    },
  };
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const term = { id: "nav", term: "NAV", short: "description" };
  const exports = {} as { default: (props: { id: string }) => Element };
  runInNewContext(code, { exports, document, window, Node: TestNode, setTimeout, clearTimeout, require(name: string) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react-dom") return { createPortal: (child: Element) => child };
    if (name === "next/link") return { default: "Link" };
    if (name === "@/lib/glossary") return { getTerm: () => term };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  function mount() {
    const instance: Instance = { slots: [], effects: [], dirty: false, mounted: true, lateUpdates: 0 };
    const rect: Rect = { left: 20, right: 90, top: 42, bottom: 86 };
    const linkNode = Object.assign(new TestNode(), { focus() { assert.fail("component must not move focus"); } });
    const linkTextNode = new TestNode(); linkNode.children.push(linkTextNode);
    const anchorNode = Object.assign(new TestNode(), { getBoundingClientRect: () => rect });
    anchorNode.children.push(linkNode);
    const tipTextNode = new TestNode();
    const tipNode = Object.assign(new TestNode(), { getBoundingClientRect: () => ({ width: 256, height: 118 }) });
    tipNode.children.push(tipTextNode);
    let tree: Element;
    let previousTip: Element | null = null;
    focusPaths.set(linkNode, event => tree.props.onKeyDown?.(event));
    const render = () => {
      for (let pass = 0; pass < 10; pass++) {
        active = instance; index = 0; instance.dirty = false;
        tree = exports.default({ id: "nav" });
        tree.props.ref.current = anchorNode;
        const tip = tree.props.children[1] as Element | null;
        if (!tip && previousTip) previousTip.props.ref.current = null;
        if (tip) tip.props.ref.current = tipNode;
        previousTip = tip;
        for (const effect of instance.effects.splice(0)) effect();
        if (!instance.dirty) return;
      }
      assert.fail("component did not settle");
    };
    render();
    return {
      rect, linkNode, linkTextNode, tipNode, tipTextNode, instance, render,
      get tip(): Element | null { return tree.props.children[1]; },
      get link(): Element { return tree.props.children[0]; },
      hover(relatedTarget: unknown = null) {
        tree.props.onMouseEnter({ target: linkNode, currentTarget: anchorNode, relatedTarget }); render();
      },
      leave(relatedTarget: unknown = null) {
        tree.props.onMouseLeave({ target: linkNode, currentTarget: anchorNode, relatedTarget }); render();
      },
      enterTip(relatedTarget: unknown = null) {
        tree.props.children[1].props.onMouseEnter({ target: tipNode, currentTarget: tipNode, relatedTarget }); render();
      },
      leaveTip(relatedTarget: unknown = null) {
        tree.props.children[1].props.onMouseLeave({ target: tipNode, currentTarget: tipNode, relatedTarget }); render();
      },
      focus() { document.activeElement = linkNode; tree.props.children[0].props.onFocus(); render(); },
      blur() { document.activeElement = document.body; tree.props.children[0].props.onBlur(); render(); },
      unmount() {
        for (const slot of instance.slots) if (slot && typeof slot.cleanup === "function") slot.cleanup();
        focusPaths.delete(linkNode);
        instance.mounted = false;
      },
    };
  }
  const emit = (name: string, key?: string) => {
    const event = { key, target: document.activeElement,
      preventDefault() { assert.fail("must not consume other controls' events"); },
      stopPropagation() { assert.fail("must not stop other tooltip/control listeners"); },
      stopImmediatePropagation() { assert.fail("must not stop other tooltip/control listeners"); },
    };
    for (const x of [...listeners]) if (x.name === name) x.run(event);
    if (name === "keydown") focusPaths.get(document.activeElement)?.(event);
  };
  return { mount, emit, listeners, document, window, timers, advance };
}

test("hover + Escape dismisses without moving focus from another control", () => {
  const h = host(), c = h.mount(), other = h.document.activeElement;
  c.hover(); assert.ok(c.tip); assert.equal(c.link.props["aria-describedby"], c.tip.props.id);
  h.emit("keydown", "Escape"); c.render();
  assert.equal(c.tip, null); assert.equal(c.link.props["aria-describedby"], undefined);
  assert.equal(h.document.activeElement, other); assert.equal(h.listeners.length, 0);
});

test("keyboard focus + Escape dismisses and preserves link focus; can reopen", () => {
  const h = host(), c = h.mount(); c.focus(); assert.ok(c.tip);
  h.emit("keydown", "Escape"); c.render();
  assert.equal(c.tip, null); assert.equal(h.document.activeElement, c.linkNode);
  c.blur(); c.focus(); assert.ok(c.tip); c.unmount();
});

test("other keys do not dismiss; leave and blur remove listeners", () => {
  const h = host(), c = h.mount(); c.hover(); h.emit("keydown", "Enter"); c.render();
  assert.ok(c.tip); c.leave(); h.advance(150); c.render(); assert.equal(c.tip, null); assert.equal(h.listeners.length, 0);
  c.focus(); c.blur(); h.advance(150); c.render(); assert.equal(c.tip, null); assert.equal(h.listeners.length, 0);
});

test("scroll closes when focused anchor leaves any viewport edge without moving focus", () => {
  const cases: Partial<Rect>[] = [{ top: 1000, bottom: 1044 }, { top: -44, bottom: 0 }, { left: 390, right: 460 }, { left: -70, right: 0 }];
  for (const rect of cases) {
    const h = host(), c = h.mount(); c.focus(); Object.assign(c.rect, rect);
    h.emit("scroll"); c.render(); assert.equal(c.tip, null, JSON.stringify(rect));
    assert.equal(h.document.activeElement, c.linkNode); assert.equal(h.listeners.length, 0);
    Object.assign(c.rect, { left: 20, right: 90, top: 42, bottom: 86 }); h.emit("scroll"); c.render();
    assert.equal(c.tip, null, "scrolling back must not reopen a dismissed tooltip");
  }
});

test("visible anchors reposition on scroll/resize and stay inside tested viewport", () => {
  const h = host(), c = h.mount(); c.hover();
  assert.equal(c.tip!.props.style.left, 8); assert.equal(c.tip!.props.style.top, 92);
  Object.assign(c.rect, { top: 830, bottom: 874 }); h.emit("scroll"); c.render();
  assert.ok(c.tip); assert.ok(c.tip.props.style.top + 118 <= 836);
  h.window.innerHeight = 600; Object.assign(c.rect, { top: 580, bottom: 624 });
  h.emit("resize"); c.render(); assert.ok(c.tip); assert.ok(c.tip.props.style.top + 118 <= 592);
  Object.assign(c.rect, { top: 0, bottom: 700 }); h.emit("scroll"); c.render();
  assert.ok(c.tip); assert.ok(c.tip.props.style.top + 118 <= 592);
  c.unmount();
});

test("multiple instances keep distinct descriptions; Escape dismisses all without consuming event", () => {
  const h = host(), a = h.mount(), b = h.mount(); a.focus(); b.hover();
  assert.notEqual(a.tip!.props.id, b.tip!.props.id);
  h.emit("keydown", "Escape"); a.render(); b.render();
  assert.equal(a.tip, null); assert.equal(b.tip, null);
  assert.equal(h.document.activeElement, a.linkNode); assert.equal(h.listeners.length, 0);
});

test("unmount removes only its own listeners, leaves another tooltip working, and causes no late updates", () => {
  const h = host(), a = h.mount(), b = h.mount(); a.hover(); b.hover();
  assert.equal(h.listeners.length, 6); a.unmount(); assert.equal(h.listeners.length, 3);
  h.emit("scroll"); b.render(); assert.ok(b.tip);
  h.emit("keydown", "Escape"); b.render(); assert.equal(b.tip, null);
  b.unmount(); h.emit("resize"); h.emit("scroll"); h.emit("keydown", "Escape");
  assert.equal(h.listeners.length, 0); assert.equal(a.instance.lateUpdates, 0); assert.equal(b.instance.lateUpdates, 0);
});

test("three open/Escape cycles keep exactly one listener of each kind (not StrictMode)", () => {
  const h = host(), c = h.mount();
  for (let i = 0; i < 3; i++) {
    c.hover(); assert.equal(h.listeners.length, 3);
    assert.equal(h.listeners.filter(x => x.name === "keydown" && x.capture).length, 1);
    h.emit("keydown", "Escape"); c.render(); assert.equal(h.listeners.length, 0);
  }
  c.unmount();
});

test("trigger leave then tooltip enter within grace period keeps hover until both surfaces are left", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave();
  assert.ok(c.tip); assert.equal(h.timers.size, 1);
  h.advance(100); c.render(); c.enterTip(); assert.equal(h.timers.size, 0);
  h.advance(1000); c.render(); assert.ok(c.tip);
  c.leaveTip(); h.advance(149); c.render(); assert.ok(c.tip);
  h.advance(1); c.render(); assert.equal(c.tip, null);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.length, 0);
});

test("crossing the gap back to trigger cancels pending close on explicit external re-entry", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave(); c.enterTip(); c.leaveTip();
  h.advance(100); c.hover(); h.advance(1000); c.render();
  assert.ok(c.tip); assert.equal(h.timers.size, 0); c.unmount();
});

test("portal -> trigger descendant relatedTarget preserves hover WITHOUT wrapper mouseenter", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave(); c.enterTip(h.document.body);
  c.leaveTip(c.linkTextNode); // Deliberately do not call c.hover().
  h.advance(1000); c.render(); assert.ok(c.tip); assert.equal(h.timers.size, 0);
  c.leave(); h.advance(150); c.render(); assert.equal(c.tip, null); c.unmount();
});

test("Escape removes hovered portal without mouseleave; subsequent keyboard focus/blur closes", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave(); c.enterTip(h.document.body);
  h.emit("keydown", "Escape"); c.render(); assert.equal(c.tip, null);
  // Portal removal emits no leave in this sequence. Do not invent that event.
  c.focus(); assert.ok(c.tip); c.blur(); h.advance(150); c.render();
  assert.equal(c.tip, null); assert.equal(h.timers.size, 0); assert.equal(h.listeners.length, 0);
  c.unmount();
});

test("trigger -> portal descendant relatedTarget cancels pending close without a new enter", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave();
  assert.equal(h.timers.size, 1);
  c.leave(c.tipTextNode); h.advance(1000); c.render(); assert.ok(c.tip); assert.equal(h.timers.size, 0);
  c.leaveTip(h.window); h.advance(150); c.render(); assert.equal(c.tip, null); c.unmount();
});

test("another instance is outside the current tooltip's two surfaces", () => {
  const h = host(), a = h.mount(), b = h.mount(); a.hover(); b.hover();
  a.leave(b.linkTextNode); h.advance(150); a.render(); b.render();
  assert.equal(a.tip, null); assert.ok(b.tip); b.unmount();
});

test("mouse leave preserves focused tooltip; blur preserves hovered tooltip", () => {
  const h = host(), c = h.mount(); c.focus(); c.hover(); c.leave();
  h.advance(1000); c.render(); assert.ok(c.tip); assert.equal(h.document.activeElement, c.linkNode);
  c.hover(); c.blur(); h.advance(1000); c.render(); assert.ok(c.tip);
  c.leave(); h.advance(150); c.render(); assert.equal(c.tip, null);
});

test("Escape during pending close cancels timer without moving focus or reopening", () => {
  const h = host(), c = h.mount(); c.focus(); c.hover(); c.leave(); assert.equal(h.timers.size, 1);
  h.emit("keydown", "Escape"); c.render();
  assert.equal(c.tip, null); assert.equal(h.timers.size, 0); assert.equal(h.document.activeElement, c.linkNode);
  h.advance(1000); c.render(); assert.equal(c.tip, null); assert.equal(h.listeners.length, 0);
  c.blur(); h.advance(150); c.render(); assert.equal(c.tip, null); c.unmount();
});

test("unmount with pending timer cleans only that instance, with no late updates", () => {
  const h = host(), a = h.mount(), b = h.mount(); a.hover(); b.hover(); a.leave(); b.leave();
  assert.equal(h.timers.size, 2); a.unmount(); assert.equal(h.timers.size, 1);
  b.enterTip(); assert.equal(h.timers.size, 0); h.advance(1000); b.render(); assert.ok(b.tip);
  b.leaveTip(); b.unmount(); h.advance(1000);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.length, 0);
  assert.equal(a.instance.lateUpdates, 0); assert.equal(b.instance.lateUpdates, 0);
});

test("offscreen scroll cancels pending hover-close timer", () => {
  const h = host(), c = h.mount(); c.hover(); c.leave(); assert.equal(h.timers.size, 1);
  c.rect.top = 1000; c.rect.bottom = 1044; h.emit("scroll"); c.render();
  assert.equal(c.tip, null); assert.equal(h.timers.size, 0);
  h.advance(1000); c.unmount(); assert.equal(c.instance.lateUpdates, 0);
});
