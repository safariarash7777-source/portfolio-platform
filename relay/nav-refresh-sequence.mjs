// One background NAV pass at a time. Completion must inspect the cache after
// the primary pass and must not retry the same symbol immediately on failure.
export function createNavRefreshSequence(primary, completion) {
  let pending = null;
  return function refresh(funds) {
    if (pending) return pending;
    const attempted = new Set();
    pending = Promise.resolve()
      .then(() => primary(funds, attempted))
      .then(() => completion(funds, attempted))
      .finally(() => { pending = null; });
    return pending;
  };
}
