/**
 * صندوقِ ورودیِ رخدادهای مهم — Wave 4.
 *
 * این ماژول **موتورِ تازه نیست**. رخداد، شاهد و منبعی که گردشِ دستی از قبل
 * ثبت کرده را کنارِ هم می‌گذارد و به سه پرسش جواب می‌دهد: چه شد، پشتش چه
 * شاهدی هست، و چقدر می‌شود به آن شاهد تکیه کرد.
 *
 * ── سه قاعدهٔ سختِ این فایل ────────────────────────────────────────────────
 *
 * ۱. **حذفِ تکرار با اثرِ انگشتِ محتوا.** دو شاهد با `contentHash` یکسان یک
 *    محتوای واحدند حتی اگر دو رکورد باشند. شمردنشان به‌عنوان دو تأیید، یک
 *    رخدادِ ضعیف را قوی جلوه می‌دهد.
 *
 * ۲. **منبعِ تأییدنشده پنهان نمی‌شود، شمرده می‌شود.** حذفِ بی‌صدا یعنی آرش
 *    نمی‌فهمد چیزی هست که هنوز تأیید نشده. عددش را می‌بیند.
 *
 * ۳. **پستِ خامِ شبکهٔ اجتماعی شاهدِ تأییدشده نیست.** `telegram` و `instagram`
 *    با ردهٔ `unverified` می‌توانند سرنخ باشند، ولی به‌تنهایی رخداد را
 *    «مستند» نمی‌کنند. این تفکیک در خروجی صریح است.
 *
 * ژئوپلیتیک (`politics_geo`) در v1 **فقط دستی** است: هیچ اسکرپ و هیچ تولیدِ
 * خودکاری. این ماژول رخدادِ ژئوپلیتیک را فقط وقتی «مستند» می‌شمارد که شاهدش
 * از منبعِ تأییدشده بیاید.
 */
import type { DataState } from "@/lib/desk/contracts";
import {
  DOMAIN_LABEL,
  type IntelDomain,
  type IntelEvent,
  type IntelEvidence,
  type IntelSource,
  type SourceKind,
  type TrustTier,
} from "./contracts";

/** منابعی که به‌تنهایی یک رخداد را مستند نمی‌کنند. */
const SOCIAL_KINDS: readonly SourceKind[] = ["telegram", "instagram"];

export interface EventEvidenceLink {
  eventId: string;
  evidenceId: string;
}

export interface EventInboxItem {
  eventId: string;
  domain: IntelDomain;
  domainLabel: string;
  title: string;
  occurredAt: string;
  scope: IntelEvent["scope"];
  symbol: string | null;
  /** شاهدِ یکتا پس از حذفِ تکرار بر اساسِ `contentHash`. */
  evidenceCount: number;
  /** چند رکوردِ تکراری کنار گذاشته شد — شفافیت، نه پنهان‌کاری. */
  duplicatesDropped: number;
  /** بالاترین ردهٔ اعتمادِ موجود؛ `null` یعنی هیچ شاهدی نیست. */
  strongestTrust: TrustTier | null;
  /** شاهدهایی که منبعشان هنوز تأیید نشده. */
  unapprovedEvidence: number;
  /** فقط پستِ خامِ شبکهٔ اجتماعی پشتش است. */
  socialOnly: boolean;
  state: DataState;
  note: string;
}

export interface EventInbox {
  /** رخدادهایی که شاهدِ قابلِ اتکا دارند. */
  documented: readonly EventInboxItem[];
  /** ثبت شده‌اند ولی هنوز شاهدشان کامل نیست — پنهان نمی‌شوند. */
  needsEvidence: readonly EventInboxItem[];
  totalEvidenceRows: number;
  totalDuplicatesDropped: number;
}

const TRUST_RANK: Record<TrustTier, number> = { primary: 2, secondary: 1, unverified: 0 };

function strongest(tiers: readonly TrustTier[]): TrustTier | null {
  if (tiers.length === 0) return null;
  return tiers.reduce((best, t) => (TRUST_RANK[t] > TRUST_RANK[best] ? t : best), tiers[0]);
}

/**
 * تابعِ خالص. هیچ رخداد، شاهد یا اطمینانی تولید نمی‌کند — فقط آنچه ثبت شده را
 * می‌چیند و کیفیتِ پشتوانه‌اش را صادقانه برچسب می‌زند.
 */
export function buildEventInbox(
  events: readonly IntelEvent[],
  evidence: readonly IntelEvidence[],
  sources: readonly IntelSource[],
  links: readonly EventEvidenceLink[]
): EventInbox {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  let totalDuplicatesDropped = 0;
  const items: EventInboxItem[] = [];

  for (const event of events) {
    const linked = links
      .filter((l) => l.eventId === event.id)
      .map((l) => evidenceById.get(l.evidenceId))
      .filter((e): e is IntelEvidence => Boolean(e));

    // قاعدهٔ ۱ — یک محتوا، یک شاهد.
    const seen = new Set<string>();
    const unique: IntelEvidence[] = [];
    for (const e of linked) {
      if (seen.has(e.contentHash)) continue;
      seen.add(e.contentHash);
      unique.push(e);
    }
    const duplicatesDropped = linked.length - unique.length;
    totalDuplicatesDropped += duplicatesDropped;

    const linkedSources = unique
      .map((e) => sourceById.get(e.sourceId))
      .filter((s): s is IntelSource => Boolean(s));

    const approved = linkedSources.filter((s) => s.approved);
    const unapprovedEvidence = unique.length - approved.length;
    const trust = strongest(approved.map((s) => s.trustTier));
    // قاعدهٔ ۳ — پستِ خام به‌تنهایی مستندسازی نیست.
    const socialOnly =
      approved.length > 0 && approved.every((s) => SOCIAL_KINDS.includes(s.kind));

    const documented = approved.length > 0 && !socialOnly;

    const item: EventInboxItem = {
      eventId: event.id,
      domain: event.domain,
      domainLabel: DOMAIN_LABEL[event.domain],
      title: event.title,
      occurredAt: event.occurredAt,
      scope: event.scope,
      symbol: event.symbol,
      evidenceCount: unique.length,
      duplicatesDropped,
      strongestTrust: trust,
      unapprovedEvidence,
      socialOnly,
      state: documented ? "ready" : unique.length === 0 ? "empty" : "awaiting_review",
      note: documented
        ? "شاهدِ تأییدشده دارد."
        : unique.length === 0
          ? "رخداد ثبت شده ولی هیچ شاهدی به آن وصل نیست."
          : socialOnly
            ? "فقط پستِ شبکهٔ اجتماعی پشتِ آن است — سرنخ هست، مستندسازی نیست."
            : "شاهد هست ولی منبعش هنوز تأیید نشده.",
    };

    items.push(item);
  }

  // ترتیب: تازه‌ترین رخداد اول. ترتیبِ ورودی نباید خروجی را عوض کند.
  const byRecency = (a: EventInboxItem, b: EventInboxItem) =>
    b.occurredAt.localeCompare(a.occurredAt);

  return {
    documented: items.filter((i) => i.state === "ready").sort(byRecency),
    needsEvidence: items.filter((i) => i.state !== "ready").sort(byRecency),
    totalEvidenceRows: evidence.length,
    totalDuplicatesDropped,
  };
}

/**
 * ژئوپلیتیکِ v1 دستی است. این تابع نمی‌گوید «درست است» — می‌گوید آیا با
 * قاعدهٔ v1 (منبعِ تأییدشده و دستی/رسمی، نه اسکرپ) جور است.
 */
export function isManualSourced(source: IntelSource | undefined): boolean {
  if (!source) return false;
  return source.approved && (source.kind === "manual" || source.kind === "official");
}
