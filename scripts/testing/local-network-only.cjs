// Verification-only preloader. Refuse upstream data calls from isolated UI servers.
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return new Response(JSON.stringify({ error: 'Synthetic verification: upstream disabled' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(input, init);
};
