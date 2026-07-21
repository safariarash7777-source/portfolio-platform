import { createClient } from "@/lib/supabase/server";
import { buildFxEmbedUrl } from "@/lib/fxToken";
import FxFrame from "@/components/admin/FxFrame";

export const metadata = {
  title: "داشبورد نرخ ارز",
  robots: { index: false, follow: false },
};

// توکن کوتاه‌عمر است، پس صفحه نباید کش شود؛ وگرنه ادمین با توکنِ منقضی روبه‌رو می‌شود.
export const dynamic = "force-dynamic";

export default async function AdminFxPage() {
  // لایهٔ admin در layout.tsx نقش را چک کرده؛ اینجا فقط شناسه برای امضا لازم است.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const embed = buildFxEmbedUrl(user?.id ?? "admin");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>
          داشبورد نرخ ارز
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
          تحلیل PPP، مدل پولی، اقتصادسنجی و آزمون رفتار انفجاری — روی سرورِ داخلِ ایران.
        </p>
      </header>

      {embed.ok ? (
        <FxFrame src={embed.url} />
      ) : (
        <div
          className="rounded-2xl border p-5 text-sm leading-8"
          style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text-2)" }}
        >
          <p className="font-bold" style={{ color: "var(--text-1)" }}>
            داشبورد هنوز وصل نشده است.
          </p>
          <p className="mt-2">
            {embed.reason === "no-url"
              ? "متغیر محیطی FX_DASHBOARD_URL روی Vercel تنظیم نشده — آدرس اپِ لیارا را در آن بگذارید."
              : "متغیر محیطی FX_EMBED_SECRET روی Vercel تنظیم نشده. همان مقدار باید روی لیارا هم ست شود."}
          </p>
          <p className="mt-2" style={{ color: "var(--text-3)" }}>
            راهنمای کامل در <code>fx-dashboard/DEPLOY.md</code>.
          </p>
        </div>
      )}
    </div>
  );
}
