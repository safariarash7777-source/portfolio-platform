import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CronLedgerStore, FinishRunInput, StartRunInput } from "@/lib/cron/ledger";

/**
 * پیاده‌سازیِ Supabase برای دفترِ اجرای cron — `P2-G2-012`.
 *
 * `server-only` عمدی است: این ماژول service-role می‌سازد. منطق در
 * `lib/cron/ledger.ts` است و بدونِ شبکه تست می‌شود؛ اینجا فقط اتصال است.
 *
 * ⚠️ جدولِ `public.cron_runs` هنوز **اجرا نشده** است
 * (`sql/phase21_cron_runs.sql` وضعیتش `NOT_APPLIED`). تا آن زمان همهٔ این
 * فراخوانی‌ها خطا می‌دهند — و عمداً **مهار می‌شوند**: نبودِ دفتر نباید jobِ
 * سالم را از کار بیندازد. رفتارِ سیستم پیش و پس از اجرای migration یکی است،
 * فقط بعدش دیده می‌شود.
 */
export function createCronLedgerStore(): CronLedgerStore {
  const admin = createAdminClient();

  return {
    async startRun(input: StartRunInput) {
      const { data, error } = await admin
        .from("cron_runs")
        .insert({
          job_key: input.jobKey,
          status: "running",
          deployment_sha: input.deploymentSha,
        })
        .select("id")
        .maybeSingle();
      if (error) return { id: null, error };
      return { id: (data as { id: string } | null)?.id ?? null };
    },

    async finishRun(id: string, input: FinishRunInput) {
      const { error } = await admin
        .from("cron_runs")
        .update({
          status: input.status,
          finished_at: new Date().toISOString(),
          processed_count: input.processedCount,
          error_code: input.errorCode,
          safe_error_summary: input.safeErrorSummary,
          duration_ms: input.durationMs,
        })
        .eq("id", id);
      return { error: error ?? undefined };
    },

    async countStaleRunning(jobKey: string, olderThanIso: string) {
      const { count, error } = await admin
        .from("cron_runs")
        .select("id", { count: "exact", head: true })
        .eq("job_key", jobKey)
        .eq("status", "running")
        .lt("started_at", olderThanIso);
      if (error) return { count: 0, error };
      return { count: count ?? 0 };
    },
  };
}

/**
 * شناسهٔ استقرارِ در حالِ اجرا — برای اینکه بعداً بشود گفت «کدام نسخه این را
 * اجرا کرد». Vercel این را خودش ست می‌کند؛ بیرون از Vercel `null` می‌ماند.
 */
export function currentDeploymentSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) ?? null;
}
