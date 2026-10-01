import type { ReadState } from "./read-state";
export interface Webinar {
  id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
  registration_open: boolean; max_capacity: number | null; price_toman: number;
  platform: string; platform_url: string | null; status: string; registered_count: number | null;
}
export async function fetchWebinars(fetcher: typeof fetch = fetch): Promise<ReadState<Webinar[]>> {
  try {
    const res = await fetcher("/api/webinars/list", { cache: "no-store" });
    if (!res.ok) return { status: "error", data: null, code: "WEBINARS_HTTP_ERROR" };
    const body: unknown = await res.json();
    const list = body && typeof body === "object" && "webinars" in body ? body.webinars : null;
    if (!Array.isArray(list) || !list.every(validWebinar)) return { status: "error", data: null, code: "WEBINARS_INVALID_RESPONSE" };
    return list.length ? { status: "ready", data: list } : { status: "empty", data: null };
  } catch { return { status: "error", data: null, code: "WEBINARS_UNAVAILABLE" }; }
}
function validWebinar(row: unknown): row is Webinar {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return ["id", "title", "platform", "status", "starts_at"].every(k => typeof r[k] === "string")
    && Number.isFinite(Date.parse(String(r.starts_at))) && typeof r.registration_open === "boolean"
    && typeof r.price_toman === "number" && Number.isFinite(r.price_toman) && r.price_toman >= 0
    && ["max_capacity", "registered_count"].every(k => r[k] === null || (typeof r[k] === "number" && Number.isFinite(r[k]) && Number.isInteger(r[k]) && (r[k] as number) >= 0));
}
