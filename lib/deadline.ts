export class DeadlineError extends Error {
  constructor() { super("Read deadline exceeded"); this.name = "DeadlineError"; }
}

/** Bounds the whole operation, including body parsing and providers ignoring abort. */
export async function withDeadline<T>(load: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DeadlineError()); };
    timer = setTimeout(abort, ms);
    if (parent?.aborted) abort();
    else parent?.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new DeadlineError();
      return load(controller.signal);
    }), stopped]);
  } finally {
    clearTimeout(timer);
    if (abort) parent?.removeEventListener("abort", abort);
  }
}
