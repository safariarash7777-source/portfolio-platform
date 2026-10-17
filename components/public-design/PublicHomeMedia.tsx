import Link from "next/link";
import {
  ArrowUpLeft,
  ExternalLink,
  Instagram,
  Send,
  Twitter,
} from "lucide-react";
import { KIND_LABEL, PLATFORM_META, type ContentItem } from "@/lib/content-hub";
import { formatJalali } from "@/lib/format";
import { editorialCover, sourceUrl } from "@/lib/media/presentation";
import type { HomeMediaRead } from "@/lib/public-design/home-media";
import PublicMediaArtwork from "./PublicMediaArtwork";
import s from "./PublicDesign.module.css";

function dateLabel(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? formatJalali(value)
    : "نامشخص";
}
function MediaCard({ item }: { item: ContentItem }) {
  const meta = PLATFORM_META[item.platform];
  const Icon =
    item.platform === "telegram"
      ? Send
      : item.platform === "instagram"
        ? Instagram
        : Twitter;
  const url = sourceUrl(item.content_url);
  return (
    <article className={`${s.panel} ${s.homeMediaCard}`}>
      <div className={s.mediaNetwork}>
        <span>
          <Icon size={17} aria-hidden />
          {meta.label}
        </span>
        <span>{KIND_LABEL[item.kind]}</span>
      </div>
      {url ? (
        <a
          className={s.mediaArtworkLink}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`مشاهده در ${meta.label}: ${item.title || "محتوای بدون عنوان"}`}
        >
          <PublicMediaArtwork src={editorialCover(item)} />
        </a>
      ) : (
        <PublicMediaArtwork src={editorialCover(item)} />
      )}
      <div className={s.homeMediaCopy}>
        <h3>{item.title || "محتوای بدون عنوان"}</h3>
        <p>تاریخ ثبت‌شده: {dateLabel(item.published_at)}</p>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            مشاهده در {meta.label}
            <ExternalLink size={15} aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}

export default function PublicHomeMedia({ read }: { read: HomeMediaRead }) {
  const dates = read.items
    .map((item) => item.published_at)
    .filter(
      (date): date is string => !!date && Number.isFinite(Date.parse(date)),
    );
  const latest = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const oldRecords =
    latest &&
    Date.parse(read.readAt) - Date.parse(latest) > 7 * 24 * 60 * 60 * 1000;
  return (
    <section
      id="home-media"
      className={s.homeMedia}
      aria-labelledby="home-media-title"
    >
      <header className={s.homeSectionHeading}>
        <div>
          <p className={s.eyebrow}>نوشته‌ها و محتوای منتشرشده</p>
          <h2 id="home-media-title">رسانهٔ آرش</h2>
        </div>
        <Link href="/insights">
          مشاهدهٔ همهٔ مطالب <ArrowUpLeft size={17} aria-hidden />
        </Link>
      </header>
      <nav className={s.mediaChannels} aria-label="شبکه‌های آرش">
        <a
          href={PLATFORM_META.telegram.followUrl!}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Send size={17} aria-hidden />
          تلگرام آرش
        </a>
        <a
          href={PLATFORM_META.instagram.followUrl!}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Instagram size={17} aria-hidden />
          اینستاگرام آرش
        </a>
      </nav>
      {read.state === "ready" ? (
        <>
          <p className={s.mediaStatus}>
            {oldRecords
              ? "آخرین تاریخ ثبت‌شدهٔ این فهرست بیش از هفت روز قبل است."
              : "محتوا از فهرست موجود سایت خوانده شده است."}{" "}
            آخرین تاریخ ثبت‌شده: {dateLabel(latest)}.
          </p>
          <div className={s.homeMediaGrid}>
            {read.items.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </>
      ) : (
        <div
          className={`${s.panel} ${s.mediaEmpty}`}
          role={read.state === "unavailable" ? "alert" : "status"}
        >
          <h3>
            {read.state === "unavailable"
              ? "خواندن فهرست رسانه اکنون ممکن نیست"
              : "هنوز محتوای قابل‌نمایشی در فهرست موجود نیست"}
          </h3>
          <p>
            {read.state === "unavailable"
              ? "این خطا به معنی نبود محتوا در شبکه‌های آرش نیست."
              : "برای دیدن محتوای اصلی، صفحهٔ رسانه یا شبکه‌های آرش را باز کنید."}
          </p>
          <Link href="/insights">
            رفتن به رسانهٔ آرش <ArrowUpLeft size={16} aria-hidden />
          </Link>
        </div>
      )}
      <p className={s.mediaProvenance}>
        تاریخ ثبت‌شدهٔ قبلی الزاماً زمان انتشار در منبع نیست. زمان انتشار و
        آخرین همگام‌سازی جداگانه در این فهرست موجود نیستند. خواندن این صفحه:{" "}
        {dateLabel(read.readAt)}. تصویر اصلی یا فایل قابل‌پخش از این اتصال
        دریافت نشده است.
      </p>
    </section>
  );
}
