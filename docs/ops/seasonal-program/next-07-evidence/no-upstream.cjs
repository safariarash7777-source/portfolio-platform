// Preload for the local preview only. No remote provider, Auth or DB can be contacted.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
  if (/^http:\/\/(127\.0\.0\.1|localhost):876[79]\//.test(url)) return original(input, init);
  return new Response(null, { status: 503 });
};
