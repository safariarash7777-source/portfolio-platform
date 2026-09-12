import Link from "next/link";
import { Send, Instagram, Twitter, ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatJalali } from "@/lib/format";
import {
  type ContentItem,
  type Platform,
  isPlatform,
  isKind,
  PLATFORM_META,
  KIND_LABEL,
} from "@/lib/content-hub";

function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  if (platform === "telegram") return <Send size={size} />;
  if (platform === "instagram") return <Instagram size={size} />;
  return <Twitter size={size} />;
}

/**
 * پیش‌نمایشِ هابِ محتوا در صفحهٔ اصلی — ۴ موردِ آخر. اگر هیچ محتوایی منتشر نشده
 * باشد، سکشن اصلاً ظاهر نمی‌شود (بدونِ بخشِ خالیِ بی‌معنی). هوور فقط CSS (u-lift).
 */
export default async function InsightsPreview() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_hub")
    // ⚠️ `description` عمداً خوانده نمی‌شود.
    //
    // این کارت فقط عنوان، پلتفرم و تاریخِ **واقعیِ** رکورد را نشان می‌دهد و
    // لینک می‌دهد به خودِ منبع. متنی که خوانده شود ولی رندر نشود، دیر یا زود
    // یک نفر رندرش می‌کند — و آن‌وقت متنی که آرش تأییدش نکرده زیرِ نامِ او
    // به‌عنوان «چرا مهم است» ظاهر می‌شود. راهِ نرسیدن به آنجا، نخواندنش است.
    .select("id, platform, kind, content_url, title, published_at")
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(4);

  /**
   * فقط میدان‌هایی که این کارت واقعاً رندر می‌کند. `ContentItem` کاملِ
   * `lib/content-hub.ts` دست‌نخورده می‌ماند چون مصرف‌کننده‌های دیگری دارد؛
   * اینجا عمداً باریک‌تر است.
   */
  type PreviewItem = Pick<
    ContentItem,
    "id" | "platform" | "kind" | "content_url" | "title" | "published_at"
  >;

  const items: PreviewItem[] = (data ?? [])
    .filter((r) => isPlatform(r.platform) && isKind(r.kind))
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      kind: r.kind,
      content_url: r.content_url,
      title: r.title,
      published_at: r.published_at,
    }));

  if (items.length === 0) return null;

  return (
    <section className="section" style={{ background: "var(--surface-2)" }}>
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <h2
              className="font-display"
              style={{
                color: "var(--heading)",
                fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: "-0.02em",
              }}
            >
              آخرین تحلیل‌ها
            </h2>
            <div aria-hidden className="divider-gold mt-4" />
          </div>
          <Link href="/insights" className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
            مشاهدهٔ همه
            <ArrowLeft size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((item) => {
            const meta = PLATFORM_META[item.platform];
            return (
              <a
                key={item.id}
                href={item.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card u-lift relative flex flex-col overflow-hidden"
                style={{ minHeight: 170 }}
                aria-label={`${meta.label} — ${item.title ?? "مشاهدهٔ محتوا"}`}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: meta.colorVar, opacity: 0.85 }}
                />
                <div className="flex items-center justify-between gap-2 p-4 pb-2">
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: meta.tintVar, color: meta.colorVar }}
                  >
                    <PlatformIcon platform={item.platform} />
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--line)" }}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-4 pb-4">
                  {item.title && (
                    <h3
                      className="font-display font-bold text-sm leading-6"
                      style={{ color: "var(--heading)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      {item.title}
                    </h3>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {item.published_at ? formatJalali(item.published_at) : ""}
                    </span>
                    <ExternalLink size={13} style={{ color: meta.colorVar }} />
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
