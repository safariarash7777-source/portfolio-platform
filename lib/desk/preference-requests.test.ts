import { test } from "node:test";
import assert from "node:assert/strict";
import { PreferenceRequests } from "./preference-requests";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
test("deferred GET excludes PUT synchronously; PUT excludes reload and duplicate PUT", async () => {
  const requests = new PreferenceRequests();
  const pending = deferred();
  const get = requests.begin("read")!;
  const response = pending.promise.then(() => {
    assert.equal(requests.accepts(get), true);
    requests.finish(get);
  });
  assert.equal(requests.begin("save"), null);
  pending.resolve();
  await response;
  const put = requests.begin("save")!;
  assert.equal(requests.begin("read"), null);
  assert.equal(requests.begin("save"), null);
  assert.equal(requests.accepts(put), true);
  requests.finish(put);
  assert.ok(requests.begin("read"));
});
test("late GET ignoring abort cannot overwrite a newer GET or successful PUT receipt", async () => {
  const requests = new PreferenceRequests();
  const old = deferred();
  const get = requests.begin("read")!;
  let revision = 1;
  const response = old.promise.then(() => {
    if (requests.accepts(get)) revision = 1;
    requests.finish(get);
  });
  const next = requests.begin("read")!;
  assert.equal(get.controller.signal.aborted, true);
  revision = 2;
  requests.finish(next);
  const put = requests.begin("save")!;
  revision = 3;
  requests.finish(put);
  old.resolve();
  await response;
  assert.equal(revision, 3);
  const live = requests.begin("save")!;
  assert.equal(requests.accepts(live), true);
});
test("unmount cancels response application and a stale finalizer cannot release a new request", () => {
  const requests = new PreferenceRequests();
  const old = requests.begin("read")!;
  requests.cancel();
  const current = requests.begin("read")!;
  assert.equal(requests.accepts(old), false);
  assert.equal(requests.finish(old), false);
  assert.equal(requests.begin("save"), null);
  assert.equal(requests.accepts(current), true);
});
