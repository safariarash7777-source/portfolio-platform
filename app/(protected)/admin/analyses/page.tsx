// پنل ادمین کارنامه — دادهٔ سروری + پیش‌فرض چشم‌انداز از موتور رژیم بازار.
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWatchlist } from "@/lib/core/watchlist";
import AnalysesManager, {
  type AdminAnalysis,
  type AdminWeekly,
  type RegimePrefill,
} from "@/components/admin/AnalysesManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "کارنامهٔ قابل راستی‌آزمایی — پنل مدیریت",
  robots: { index: false, follow: false },
};

/** شنبهٔ آیندهٔ تقویم (شروع هفتهٔ معاملاتی تهران) به‌صورت YYYY-MM-DD */
function nextSaturday(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (6 - day + 7) % 7 || 7; // شنبهٔ بعدی (نه امروز)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return d.toISOString().slice(0, 10);
}

export default async function AdminAnalysesPage() {
  const admin = createAdminClient();

  const [sigs, outs, weeks, weekResults, watch] = await Promise.all([
    admin
      .from("signals")
      .select("id, seq, symbol, direction, entry_price, entry_date, horizon, reasons, published_at, record_hash")
      .order("seq", { ascending: false })
      .limit(100),
    admin.from("signal_outcomes").select("signal_id"),
    admin
      .from("weekly_outlooks")
      .select("id, seq, week_start, label, score, note_md, published_at, record_hash")
      .order("seq", { ascending: false })
      .limit(60),
    admin.from("weekly_outlook_results").select("outlook_id"),
    buildWatchlist().catch(() => null),
  ]);

  const closedIds = new Set((outs.data ?? []).map((o) => o.signal_id));
  const analyses: AdminAnalysis[] = (sigs.data ?? []).map((s) => ({
    ...(s as Omit<AdminAnalysis, "closed">),
    closed: closedIds.has(s.id),
  }));

  const closedWeekIds = new Set((weekResults.data ?? []).map((r) => r.outlook_id));
  const weekly: AdminWeekly[] = (weeks.error ? [] : weeks.data ?? []).map((w) => ({
    ...(w as Omit<AdminWeekly, "closed">),
    closed: closedWeekIds.has(w.id),
  }));

  const regime: RegimePrefill = watch?.regime
    ? {
        ok: watch.regime.data_ok,
        label: watch.regime.label ?? null,
        score: watch.regime.score ?? null,
        drivers: (watch.regime.drivers ?? []).map((d) => ({
          label: String(d.label ?? ""),
          value: String(d.value ?? ""),
          effect: String(d.effect ?? ""),
        })),
        assumptions: watch.regime.assumptions ?? [],
      }
    : { ok: false, label: null, score: null, drivers: [], assumptions: [] };

  return (
    <AnalysesManager
      analyses={analyses}
      weekly={weekly}
      weeklyTableMissing={Boolean(weeks.error)}
      regime={regime}
      nextWeekStart={nextSaturday()}
    />
  );
}
