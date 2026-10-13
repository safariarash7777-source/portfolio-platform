/** One in-flight read, paused for hidden/offline pages; no provider access here. */
export interface PollEnvironment {
  available(): boolean;
  every(callback: () => void, ms: number): () => void;
  onResume(callback: () => void): () => void;
  now(): number;
}

export function startVisiblePoll(
  read: (signal: AbortSignal) => Promise<void> | void,
  environment: PollEnvironment,
  intervalMs = 60_000,
  immediate = false,
): () => void {
  let stopped = false;
  let pending: AbortController | null = null;
  let lastAttempt = immediate ? -Infinity : environment.now();
  const tick = () => {
    if (stopped || pending || !environment.available() || environment.now() - lastAttempt < intervalMs) return;
    lastAttempt = environment.now();
    const controller = new AbortController();
    pending = controller;
    Promise.resolve().then(() => {
      if (!stopped) return read(controller.signal);
    }).catch(() => { /* The caller owns the error state; the next tick retries. */ })
      .finally(() => { if (pending === controller) pending = null; });
  };
  const cancelTimer = environment.every(tick, intervalMs);
  const cancelResume = environment.onResume(tick);
  if (immediate) tick();
  return () => { stopped = true; cancelTimer(); cancelResume(); pending?.abort(); };
}

export function browserPollEnvironment(): PollEnvironment {
  return {
    available: () => document.visibilityState === "visible" && navigator.onLine !== false,
    every: (callback, ms) => { const id = window.setInterval(callback, ms); return () => window.clearInterval(id); },
    onResume: callback => {
      document.addEventListener("visibilitychange", callback);
      window.addEventListener("online", callback);
      return () => { document.removeEventListener("visibilitychange", callback); window.removeEventListener("online", callback); };
    },
    now: () => Date.now(),
  };
}
