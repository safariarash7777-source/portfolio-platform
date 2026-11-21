const paths = new Set([
  "/supabase/auth/v1/user",
  "/supabase/rest/v1/member_holding_versions",
  "/supabase/rest/v1/member_holding_positions",
  "/supabase/rest/v1/member_debt_positions",
]);

/** The isolated preview gateway occasionally times out before a connection opens.
 * Retry only idempotent dossier reads directed to that same gateway. */
export function previewDossierFetch(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (method !== "GET" || url.origin !== "https://62.60.191.24:8443" || !paths.has(url.pathname)) {
      return send(input, init);
    }
    const signal = init?.signal ?? request?.signal;
    try {
      const first = await send(input, init);
      if (![502,503,504].includes(first.status) || signal?.aborted) return first;
      await first.body?.cancel();
    } catch (error) {
      const cause = (error as {cause?: {code?: string}} | null)?.cause?.code;
      if (signal?.aborted || !cause || !["UND_ERR_CONNECT_TIMEOUT","ECONNRESET","ETIMEDOUT"].includes(cause)) throw error;
    }
    return send(input, init);
  };
}
