import { createClient } from "@/lib/supabase/server";
import { classifyQueryError } from "@/lib/health/status";
import { formatJalali } from "@/lib/format";
import IntelligenceDesk from "@/components/admin/IntelligenceDesk";
import {
  buildToday, buildInbox, buildScenarioBoard, buildPortfolioImpact, buildRehearsalView,
  type BriefRow, type ClaimRow, type EffectRow, type HistoryRow, type PositionRow,
} from "@/lib/intelligence/board";
import type { RehearsalDay } from "@/lib/intelligence/workflow";

export const metadata = {
  title: "میزِ هوشمندی دستی | پنل مدیریت",
  robots: { index: false, follow: false },
};

// دسترسی در `app/(protected)/admin/layout.tsx` گیت می‌شود، و مسیرهای
// `/api/admin/intelligence*` مستقلاً همان بررسی را تکرار می‌کنند. هیچ‌کدام از
// این دو به‌تنهایی کافی نیست.
export const dynamic = "force-dynamic";

/**
 * ⚠️ اگر `phase22` روی این محیط اجرا نشده باشد، جدول‌ها وجود ندارند. آن حالت
 * صریحاً **«در دسترس نیست»** گزارش می‌شود و به صفر تبدیل **نمی‌شود** — همان
 * تمایزی که `B-038` را ساخت: شاخصی که «نمی‌بینم» را «مشکلی نیست» بخواند،
 * بدتر از نداشتنِ شاخص است.
 */
export default async function AdminIntelligencePage() {
  // جدول‌های intel زیرِ سیاستِ `intel_admin_all` هستند
  // (`FOR ALL TO authenticated` با شرطِ ادمین، `sql/phase20`)، پس نشستِ ادمین
  // همان دسترسی را دارد. با service-role این RSC بدونِ کلید پرتاب می‌کرد و
  // کاربر صفحهٔ خطای خالی می‌دید؛ حالا اگر جدولی نباشد فقط همان پرس‌وجو خطا
  // برمی‌گرداند و صفحه سرِ پا می‌ماند.
  const admin = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [briefsRes, claimsRes, evidenceRes, effectsRes, historyRes, daysRes, versionRes] =
    await Promise.all([
      admin.from("intel_analyses")
        .select("id,title,domain,status,brief_date,updated_at,review_note")
        .order("updated_at", { ascending: false }).limit(100),
      admin.from("intel_claims")
        .select("id,analysis_id,kind,statement,confidence,scenario_label").limit(500),
      admin.from("intel_claim_evidence").select("claim_id").limit(2000),
      admin.from("intel_portfolio_effects")
        .select("analysis_id,asset_class,suggested_direction,horizon,confidence,rationale").limit(200),
      admin.from("intel_workflow_events")
        .select("analysis_id,event,occurred_at,note").order("occurred_at", { ascending: true }).limit(500),
      admin.from("intel_rehearsal_days")
        .select("rehearsal_date,day_index,brief_produced,minutes_to_approval,absent_sources,stale_sources,human_corrections,rejected_conclusions,missed_events")
        .order("rehearsal_date", { ascending: true }).limit(120),
      admin.from("intel_reference_versions")
        .select("id,status,finalized_at").eq("status", "finalized")
        .order("finalized_at", { ascending: false }).limit(1),
    ]);

  // یک شکستِ خواندن نباید کلِ صفحه را خالی کند (درسِ `B-024`)، ولی باید
  // **دیده شود**. جدولِ ناموجود پیامِ خودش را می‌گیرد.
  const failures = [briefsRes, claimsRes, historyRes, daysRes]
    .filter((r) => r.error)
    .map((r) => classifyQueryError(r.error!.code ?? "", r.error!.message));
  const unavailableReason = failures.length === 0
    ? null
    : failures.some((k) => k === "missing_table")
      ? "جدول‌های گردشِ دستی هنوز روی این محیط اجرا نشده‌اند — `phase22` هنوز اعمال نشده است."
      : "خواندن از دیتابیس مردود شد.";

  const evidenceByClaim = new Map<string, number>();
  for (const row of evidenceRes.data ?? []) {
    evidenceByClaim.set(row.claim_id, (evidenceByClaim.get(row.claim_id) ?? 0) + 1);
  }

  const briefs: BriefRow[] = (briefsRes.data ?? []).map((r) => ({
    id: r.id, title: r.title, domain: r.domain, status: r.status,
    briefDate: r.brief_date, updatedAt: r.updated_at, reviewNote: r.review_note,
  }));
  const claims: ClaimRow[] = (claimsRes.data ?? []).map((r) => ({
    id: r.id, analysisId: r.analysis_id, kind: r.kind, statement: r.statement,
    confidence: r.confidence, scenarioLabel: r.scenario_label,
    evidenceCount: evidenceByClaim.get(r.id) ?? 0,
  }));
  const history: HistoryRow[] = (historyRes.data ?? []).map((r) => ({
    analysisId: r.analysis_id, event: r.event, occurredAt: r.occurred_at, note: r.note,
  }));
  const effects: EffectRow[] = (effectsRes.data ?? []).map((r) => ({
    analysisId: r.analysis_id, assetClass: r.asset_class,
    direction: r.suggested_direction, horizon: r.horizon,
    confidence: r.confidence, rationale: r.rationale,
  }));
  const days: RehearsalDay[] = (daysRes.data ?? []).map((r) => ({
    rehearsalDate: r.rehearsal_date, dayIndex: r.day_index,
    briefProduced: r.brief_produced, minutesToApproval: r.minutes_to_approval,
    absentSources: r.absent_sources ?? [], staleSources: r.stale_sources ?? [],
    humanCorrections: r.human_corrections, rejectedConclusions: r.rejected_conclusions,
    missedEvents: r.missed_events,
  }));

  // وزن‌ها **فقط** از نسخهٔ نهایی‌شده خوانده می‌شوند. نبودِ نسخه یعنی
  // «تعریف‌نشده»، و هیچ وزنی جایش ساخته نمی‌شود.
  let positions: PositionRow[] = [];
  const finalized = versionRes.data?.[0]?.id;
  if (finalized) {
    const { data } = await admin.from("intel_reference_positions")
      .select("asset_class,weight_pct").eq("version_id", finalized);
    positions = (data ?? []).map((p) => ({ assetClass: p.asset_class, weightPct: Number(p.weight_pct) }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold" style={{ color: "var(--text)" }}>
          میزِ هوشمندی دستی
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-7" style={{ color: "var(--text-2)" }}>
          گردشِ کامل و <strong>کاملاً دستی</strong>: رخداد ← منبع و شاهد ← تحلیل و سناریو ← اثر بر
          سبد مرجع ← بازبینی انسانی ← تأیید داخلی. هیچ Agent، هیچ LLM و هیچ انتشارِ خودکاری در
          این مسیر وجود ندارد.
        </p>
        <p
          className="mt-2 max-w-2xl rounded-lg px-3 py-2 text-[12px] leading-6"
          style={{ background: "var(--gold-tint)", color: "var(--navy-deep)" }}
        >
          ⚠️ <strong>تأییدِ داخلی، انتشار نیست.</strong> چیزی که اینجا تأیید می‌شود برای استفادهٔ
          داخلی است و به‌خودیِ‌خود جلوی هیچ مشتری‌ای نمی‌رود. این تفکیک در سه جای مستقل — قیدِ
          دیتابیس، گاردِ گذار، و سیاستِ خواندنِ عمومی — نگه داشته می‌شود.
        </p>
      </div>

      <IntelligenceDesk
        today={buildToday(today, briefs, claims)}
        todayJalali={formatJalali(today)}
        inbox={buildInbox(briefs, claims, history)}
        scenarios={buildScenarioBoard(claims)}
        portfolio={buildPortfolioImpact(positions, effects)}
        rehearsal={buildRehearsalView(days)}
        unavailableReason={unavailableReason}
      />
    </div>
  );
}
