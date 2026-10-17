import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as preferences from "../../lib/desk/preferences";
import * as requests from "../../lib/desk/preference-requests";

/** Executes the actual hook with stable hook slots and deferred fetches; no network/DOM. */
function harness() {
  const slots: unknown[] = [];
  let cursor = 0;
  const effects: (() => unknown)[] = [];
  const calls: { method: string; resolve: (response: Response) => void }[] = [];
  const react = {
    useState(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next: unknown) => {
          slots[i] = typeof next === "function" ? next(slots[i]) : next;
        },
      ];
    },
    useRef(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(callback: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = callback;
      return slots[i];
    },
    useEffect(callback: () => unknown) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = true;
        effects.push(callback);
      }
    },
  };
  const hookModule = {
    exports: {} as {
      useDeskAccountPreferences: () => ReturnType<
        typeof import("./useDeskAccountPreferences").useDeskAccountPreferences
      >;
    },
  };
  const source = ts.transpileModule(
    readFileSync(
      new URL("./useDeskAccountPreferences.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports: hookModule.exports,
    module: hookModule,
    require: (id: string) => {
      if (id === "react") return react;
      if (id === "@/lib/desk/preferences") return preferences;
      if (id === "@/lib/desk/preference-requests") return requests;
      throw new Error(`unexpected dependency ${id}`);
    },
    AbortSignal,
    AbortController,
    DOMException,
    fetch: (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve) =>
        calls.push({ method: init.method ?? "GET", resolve }),
      ),
  });
  const render = () => {
    cursor = 0;
    const hook = hookModule.exports.useDeskAccountPreferences();
    while (effects.length) effects.shift()!();
    return hook;
  };
  return { calls, render };
}
const receipt = (revision: number, layout: 1 | 2 | 3) => ({
  preferences: { schemaVersion: 1, layout, hiddenTools: [] },
  revision,
  updatedAt: revision ? "2026-10-17T12:00:00Z" : null,
  allowedTools: [...preferences.DESK_TOOLS],
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function ready() {
  const h = harness();
  h.render();
  h.calls[0].resolve(Response.json(receipt(1, 1)));
  await flush();
  return h;
}
test("actual hook excludes PUT during deferred GET, and GET during PUT", async () => {
  const h = await ready();
  let hook = h.render();
  void hook.reload();
  void hook.save({ schemaVersion: 1, layout: 2, hiddenTools: [] });
  assert.deepEqual(
    h.calls.map((row) => row.method),
    ["GET", "GET"],
  );
  h.calls[1].resolve(Response.json(receipt(1, 1)));
  await flush();
  hook = h.render();
  void hook.save({ schemaVersion: 1, layout: 2, hiddenTools: [] });
  void hook.reload();
  assert.deepEqual(
    h.calls.map((row) => row.method),
    ["GET", "GET", "PUT"],
  );
  h.calls[2].resolve(Response.json(receipt(2, 2)));
  await flush();
  hook = h.render();
  assert.equal(hook.receipt?.revision, 2);
  assert.equal(hook.draft.layout, 2);
});
test("actual hook ignores an obsolete GET completing after a successful PUT", async () => {
  const h = await ready();
  let hook = h.render();
  void hook.reload();
  void hook.reload();
  h.calls[2].resolve(Response.json(receipt(1, 1)));
  await flush();
  hook = h.render();
  void hook.save({ schemaVersion: 1, layout: 2, hiddenTools: [] });
  h.calls[3].resolve(Response.json(receipt(2, 2)));
  await flush();
  h.calls[1].resolve(Response.json(receipt(1, 1)));
  await flush();
  hook = h.render();
  assert.equal(hook.receipt?.revision, 2);
  assert.equal(hook.draft.layout, 2);
  assert.equal(hook.loading, false);
  assert.equal(hook.saving, false);
});
test("actual hook preserves draft after unknown save result, and rejects revision rollback", async () => {
  const h = await ready();
  let hook = h.render();
  hook.setDraft({ schemaVersion: 1, layout: 3, hiddenTools: [] });
  hook = h.render();
  void hook.save();
  h.calls[1].resolve(new Response("", { status: 503 }));
  await flush();
  hook = h.render();
  assert.equal(hook.draft.layout, 3);
  assert.equal(hook.receipt?.revision, 1);
  assert.match(hook.message ?? "", /تأیید نشد/);
  void hook.reload();
  h.calls[2].resolve(Response.json(receipt(0, 1)));
  await flush();
  hook = h.render();
  assert.equal(hook.draft.layout, 3);
  assert.equal(hook.receipt?.revision, 1);
});
