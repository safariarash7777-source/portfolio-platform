import type { ReadCoverage } from "@/lib/supabase/paged-read";

export default function ReadCoverageNotice({ coverage, label }: { coverage: ReadCoverage; label: string }) {
  if (coverage.state === "complete") return null;
  return <p role="status" className="mb-3 rounded-lg border p-3 text-xs leading-6" style={{ borderColor: "var(--line)", color: "var(--warning)", background: "var(--surface-2)" }}>
    {label}: {coverage.state === "stale" ? "خواندن کامل دادهٔ تازه انجام نشد؛ آخرین نتیجهٔ کامل قبلی نمایش داده می‌شود و ممکن است کهنه باشد." : "خواندن کامل داده انجام نشد؛ نبود نتیجه به معنی نبود داده در پایگاه نیست."}
  </p>;
}
