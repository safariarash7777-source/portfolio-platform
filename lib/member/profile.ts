import type { MemberRequest } from "./http";
export type ProfileRead = { state: "recorded" | "incomplete"; phoneVerified: boolean; version: number | null }
  | { state: "not_connected" } | { state: "sign_in_required" } | { state: "unavailable" };
// Consume auth.identity.v1 without retaining names, national IDs, contact or an Auth model.
export async function readMemberProfile(request: MemberRequest = fetch): Promise<ProfileRead> {
  try {
    const r = await request("/api/auth/identity", { cache: "no-store", credentials: "same-origin" });
    if (r.status === 404) return { state: "not_connected" };
    if (r.status === 401) return { state: "sign_in_required" };
    if (!r.ok) return { state: "unavailable" };
    const b: unknown = await r.json();
    if (!b || typeof b !== "object") return { state: "unavailable" };
    const d = b as Record<string, unknown>;
    if (typeof d.phoneVerified !== "boolean" || d.identityMatch !== "pending" || d.phoneNationalIdMatch !== "pending") return { state: "unavailable" };
    if (d.profile === null) return { state: "incomplete", phoneVerified: d.phoneVerified, version: null };
    if (!d.profile || typeof d.profile !== "object" || Array.isArray(d.profile) || !Number.isInteger(d.version) || Number(d.version) < 1) return { state: "unavailable" };
    const p = d.profile as Record<string, unknown>;
    if (![p.firstName, p.lastName, p.nationalId].every(v => typeof v === "string")) return { state: "unavailable" };
    return { state: "recorded", phoneVerified: d.phoneVerified, version: Number(d.version) };
  } catch { return { state: "unavailable" }; }
}
