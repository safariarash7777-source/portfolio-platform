// Separate public configuration lets an operator keep legacy Vercel Secrets
// intact for rollback. Only an anon JWT can ever enter a browser bundle here.
function liaraPublicEnv(env = process.env) {
  const url = env.NEXT_PUBLIC_LIARA_API_URL?.trim();
  const key = env.NEXT_PUBLIC_LIARA_ANON_KEY?.trim();
  if (!url && !key) return {};
  if (!url || !key) throw new Error("Both public Liara settings must be configured together");
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new Error("Invalid public Liara URL"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Public Liara URL must use HTTPS without credentials or query parameters");
  }
  let claims;
  try {
    const parts = key.split(".");
    if (parts.length !== 3) throw new Error();
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch { throw new Error("Public Liara key must be an anon JWT"); }
  if (claims.role !== "anon" || claims.iss !== "supabase" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) {
    throw new Error("Public Liara key must be an unexpired anon JWT; server keys are forbidden");
  }
  return { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key };
}
module.exports = { liaraPublicEnv };
