(() => {
  const originalNow = Date.now;
  window.__marketClock = { offset: 0, hidden: false, timers: new Map(), next: 100000, requests: 0, active: 0, maxActive: 0 };
  Date.now = () => originalNow() + window.__marketClock.offset;
  const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => {
    if (ms !== 1000 && ms !== 30000) return interval(fn, ms, ...args);
    const id = ++window.__marketClock.next;
    window.__marketClock.timers.set(id, () => fn(...args)); return id;
  };
  window.clearInterval = id => { if (!window.__marketClock.timers.delete(id)) clear(id); };
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__marketClock.hidden ? 'hidden' : 'visible' });
  const fetcher = window.fetch.bind(window);
  window.fetch = async (...args) => {
    if (!String(args[0]).includes('_rsc=')) return fetcher(...args);
    const c = window.__marketClock; c.requests++; c.active++; c.maxActive = Math.max(c.maxActive, c.active);
    try { if (c.hold) await c.hold; return await fetcher(...args); } finally { c.active--; }
  };
})();