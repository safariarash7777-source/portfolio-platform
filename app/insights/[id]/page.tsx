import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { PLATFORM_META } from "@/lib/content-hub";
import { formatJalali } from "@/lib/format";
import { readPublicMedia } from "@/lib/media/public-read.server";
import { publicContentId, articleText, articleTitle } from "@/lib/media/public-media";
import { sourceUrl } from "@/lib/media/presentation";
import s from "@/components/public-design/PublicDesign.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function PublicArticlePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!publicContentId(id)) notFound();
  const [read, search] = await Promise.all([readPublicMedia(id), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const returnTo = typeof search.returnTo === "string" && /^\/insights(?:[?#]|$)/.test(search.returnTo) ? search.returnTo : "/insights";
  const item = read.items.find(row => row.id === id);
  if (read.state !== "unavailable" && !item) notFound();
  const url = item ? sourceUrl(item.content_url) : null;
  return <><Navbar /><main className={s.publicArticle}>
    <Link className={s.articleBack} href={returnTo}>بازگشت به آرشیو رسانه</Link>
    {item ? <article className={`${s.panel} ${s.articlePanel}`}>
      <p className={s.eyebrow}>نوشتهٔ عمومی آرش · {PLATFORM_META[item.platform].label}</p>
      <h1>{articleTitle(item)}</h1>
      <p className={s.articleMeta}><time dateTime={item.published_at!}>انتشار ثبت‌شده: {formatJalali(item.published_at!)}</time></p>
      {item.stored_at && <p className={s.articleMeta}>دریافت ذخیره‌شده: <time dateTime={item.stored_at}>{formatJalali(item.stored_at)}</time>؛ مستقل از زمان انتشار</p>}
      <div className={s.articleText}>{articleText(item) || "متن بیشتری برای این مطلب ذخیره نشده است."}</div>
      {url && <a className={s.articleSource} href={url} target="_blank" rel="noopener noreferrer">متن و رسانه در منبع اصلی · {PLATFORM_META[item.platform].label}</a>}
      <details className={s.mediaProvenance}><summary>منبع این متن و وضعیت دریافت</summary><p>
        این متن از فهرست عمومیِ ذخیره‌شده خوانده شده است. فایل پخش یا ادامه‌ای که در داده وجود ندارد ساخته نمی‌شود.
        زمان آخرین همگام‌سازی در قرارداد فعلی ثبت نشده؛ زمان خواندن صفحه جای آن یا تاریخ انتشار نیست.
      </p></details>
    </article> : <section className={`${s.panel} ${s.articlePanel}`} role="alert">
      <h1>خواندن این نوشته اکنون ممکن نیست</h1><p>این خطا به معنی حذف یا خصوصی‌بودن نوشته نیست. دوباره تلاش کنید یا رسانهٔ رسمی آرش را باز کنید.</p>
      <Link href={`/insights/${id}`}>تلاش مجدد</Link>{" · "}<a href={PLATFORM_META.telegram.followUrl!} target="_blank" rel="noopener noreferrer">تلگرام عمومی آرش</a>
    </section>}
  </main><Footer /></>;
}
