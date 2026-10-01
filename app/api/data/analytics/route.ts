import { NextResponse } from "next/server";
import { ANALYTIC_KINDS, readAnalytics, type AnalyticKind } from "@/lib/data-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

/** Public anon/RLS aggregates only. Never joins Auth, saved presets or holdings. */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  if (!ANALYTIC_KINDS.includes(kind as AnalyticKind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const result = await readAnalytics(kind as AnalyticKind);
  return NextResponse.json(result, {
    status: result.coverage.state === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
