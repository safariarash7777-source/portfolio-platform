import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isPlatform, isKind, PLATFORM_META, KIND_LABEL } from "@/lib/content-hub";
import PublicNotice from "@/components/public/PublicNotice";
const tehranDay = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric" });

export default async function InsightsPreview() {
  let unavailable = false;
  const items: { id: string; title: string; url: string; platform: string; kind: string; publishedAt: string }[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("content_hub").select("id, platform, kind, content_url, title, published_at").is("deleted_at", null).not("published_at", "is", null).order("published_at", { ascending: false }).limit(60);
    unavailable = Boolean(error);
    const seen = new Set<string>();
    for (const row of error ? [] : data ?? []) {
      if (!isPlatform(row.platform) || !isKind(row.kind) || typeof row.content_url !== "string" || typeof row.published_at !== "string" || !Number.isFinite(Date.parse(row.published_at))) continue;
      let url: URL; try { url = new URL(row.content_url.trim()); } catch { continue; }
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      const key = url.href.replace(/\/+$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id: row.id, title: row.title?.trim() || "مشاهدهٔ مطلب منتشرشده", url: url.href, platform: PLATFORM_META[row.platform].label, kind: KIND_LABEL[row.kind], publishedAt: row.published_at });
      if (items.length === 4) break;
    }
  } catch { unavailable = true; }
  return <section className="public-section public-surface" aria-labelledby="published-content-title"><div className="public-container"><div className="public-section-heading"><div><p className="public-eyebrow">مطالب منتشرشده</p><h2 id="published-content-title">از آموزش تا مطالعهٔ بازار</h2></div><Link href="/insights" className="btn btn-outline">مشاهدهٔ مطالب</Link></div>
    {unavailable ? <PublicNotice title="مطالب اکنون دریافت نشد"><p>برای بررسی دوباره، وارد صفحهٔ مطالب شوید. محتوای نمونه جایگزین مطالب منتشرشده نمی‌شود.</p></PublicNotice> : items.length === 0 ? <PublicNotice title="مطلبی در این فهرست منتشر نشده است"><p>محتوای تأییدشده پس از انتشار در این قسمت نمایش داده می‌شود.</p></PublicNotice> : <div className="public-two-grid">{items.map(item => <a href={item.url} key={item.id} target="_blank" rel="noopener noreferrer" className="public-entry-card"><span className="public-badge">{item.platform} · {item.kind}</span><h3 className="mt-4">{item.title}</h3><p><time dateTime={item.publishedAt}>{tehranDay.format(new Date(item.publishedAt))}</time></p><span>خواندن در منبع <ExternalLink size={16} aria-hidden className="inline" /><span className="sr-only">، پنجرهٔ جدید</span></span></a>)}</div>}
  </div></section>;
}
