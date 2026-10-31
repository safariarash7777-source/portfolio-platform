import "server-only";
import { liaraPublicEnv } from "../liara-public-env.js";

export const FUNDAMENTAL_READ_ORIGIN = "https://62.60.191.24/liara-preview";

/** Local configuration checks only; the upstream still verifies the JWT signature. */
export function fundamentalReadPair(environment: Readonly<Record<string, string | undefined>>): { url: string; anon: string; expiresAt: number } | null {
  try {
    const url = environment.FUNDAMENTAL_READ_URL;
    const anon = environment.FUNDAMENTAL_READ_ANON_KEY;
    if (typeof url !== "string" || typeof anon !== "string" || url !== FUNDAMENTAL_READ_ORIGIN) return null;
    const key = anon.trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return null;
    const header = JSON.parse(Buffer.from(key.split(".")[0], "base64url").toString());
    if (!header || header.typ !== "JWT" || typeof header.alg !== "string" || !header.alg || header.alg.toLowerCase() === "none") return null;
    const isolated = Object.freeze({ NEXT_PUBLIC_LIARA_API_URL: url, NEXT_PUBLIC_LIARA_ANON_KEY: key });
    // CJS inference says ProcessEnv; the inspected pure helper reads only these two fields.
    const selected = liaraPublicEnv(isolated as unknown as Parameters<typeof liaraPublicEnv>[0]);
    if (selected.NEXT_PUBLIC_SUPABASE_URL !== FUNDAMENTAL_READ_ORIGIN || !selected.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    return { url: selected.NEXT_PUBLIC_SUPABASE_URL, anon: selected.NEXT_PUBLIC_SUPABASE_ANON_KEY, expiresAt: claims.exp };
  } catch {
    return null;
  }
}
