/**
 * میزِ آرش — مرزِ مجوز و تجمیع (`P2-G3-MEGA-004`).
 *
 * ── چرا این فایل وجود دارد ──────────────────────────────────────────────
 * نسخهٔ اولِ میز منطقِ مجوز را داخلِ route handler داشت، و تست‌هایش
 * **متنِ سورس** را می‌خواندند: «آیا شاخهٔ ۴۰۳ هنوز آنجاست؟». آن تست‌ها ثابت
 * می‌کردند کد حذف نشده، ولی **رفتار** را ثابت نمی‌کردند. یک بازآراییِ
 * بی‌دقت می‌توانست ترتیب را عوض کند و متن همچنان سبز بماند.
 *
 * پس مجوز و تجمیع از HTTP جدا شدند و وابستگی‌ها تزریق می‌شوند. حالا تست
 * می‌تواند **واقعاً** صدا بزند و ادعا کند: بدونِ نشست ۴۰۱، با نقشِ غیرادمین
 * ۴۰۳، و — مهم‌تر از هر دو — خواننده در آن دو حالت **اصلاً ساخته نمی‌شود**.
 * آن ادعا با خواندنِ متن قابلِ اثبات نبود.
 *
 * ⚠️ محدودهٔ اعتبار: این‌ها تستِ **رفتاریِ محلی/CI**اند. جایگزینِ تستِ HTTPِ
 * احرازشده با Supabaseِ زنده نیستند و جایگزینِ راستی‌آزماییِ زمانِ اجرا روی
 * Production هم نیستند. هر سه لازم‌اند و هیچ‌کدام دیگری را اثبات نمی‌کند.
 */

import {
  buildDeskView,
  buildPanel,
  classifySource,
  type DeskLink,
  type DeskSectionKey,
  type DeskSource,
  type DeskView,
  type SourceInput,
} from "@/lib/desk/contracts";
import { DESK_SOURCES, type DeskSourceSpec } from "@/lib/desk/sources";

/** یک خوانندهٔ منبع — در Production کلاینتِ نشست (زیرِ RLS)، در تست یک بدل. */
export interface DeskReader {
  probe(table: string, timeColumn: string | null): Promise<SourceInput>;
}

/**
 * وابستگی‌های میز. `createReader` عمداً یک **factory** است و نه یک نمونهٔ
 * ساخته‌شده: تنها این‌طور می‌شود ثابت کرد که هیچ خواندنی پیش از تأییدِ مجوز
 * آغاز نمی‌شود.
 */
export interface DeskGateway {
  getUser(): Promise<{ id: string } | null>;
  getRole(userId: string): Promise<string | null>;
  createReader(): DeskReader;
}

export type DeskResult =
  | { status: 200; body: DeskView }
  | { status: 401 | 403 | 500; body: { error: string } };

/** مقصدهای موجود. میز جای این داشبوردها را نمی‌گیرد، به آن‌ها راه می‌دهد. */
const PANEL_LINKS: Record<DeskSectionKey, DeskLink[]> = {
  today: [
    { label: "رصد بازار", href: "/admin/radar" },
    { label: "ابر داشبورد ارز", href: "/admin/fx" },
  ],
  intelligence: [
    { label: "هابِ محتوا", href: "/admin/content" },
    { label: "کدال", href: "/codal" },
  ],
  decisions: [
    { label: "کارنامه", href: "/admin/analyses" },
    { label: "یادداشت بازار", href: "/admin/notes" },
  ],
  reference: [{ label: "پرتفوی‌ها", href: "/admin/manage?tab=portfolio" }],
  operations: [{ label: "سلامتِ سامانه", href: "/admin/health" }],
};

const GROUPS: DeskSectionKey[] = ["today", "intelligence", "decisions", "reference", "operations"];

/**
 * یک منبع را می‌خواند و **هرگز پرتاب نمی‌کند**.
 *
 * درسِ `B-024`: یک پرس‌وجوی شکست‌خورده نباید کلِ نما را خالی کند. شکستِ یک
 * منبع فقط همان ردیف را `unavailable` می‌کند؛ بقیه سرِ جایشان می‌مانند.
 */
async function readSource(
  reader: DeskReader,
  spec: DeskSourceSpec,
  now: Date
): Promise<DeskSource> {
  let input: SourceInput;
  try {
    input = await reader.probe(spec.table, spec.timeColumn);
  } catch {
    input = {
      available: false,
      count: 0,
      unavailableReason: `پرس‌وجوی \`${spec.table}\` مردود شد`,
    };
  }
  return classifySource({ table: spec.table, label: spec.label, rule: spec.rule }, input, now);
}

export async function buildDesk(gateway: DeskGateway, now: Date): Promise<DeskResult> {
  // ── مجوز، پیش از هر چیزِ دیگر ──
  let user: { id: string } | null;
  try {
    user = await gateway.getUser();
  } catch {
    return { status: 401, body: { error: "دسترسی غیرمجاز." } };
  }
  if (!user) {
    return { status: 401, body: { error: "دسترسی غیرمجاز." } };
  }

  let role: string | null;
  try {
    role = await gateway.getRole(user.id);
  } catch {
    // نتوانستیم نقش را بخوانیم → **رد**، نه اجازه. شکست باید ببندد، نه باز کند.
    return { status: 403, body: { error: "دسترسی غیرمجاز." } };
  }
  if (role !== "admin") {
    return { status: 403, body: { error: "دسترسی غیرمجاز." } };
  }

  // ── فقط حالا خواننده ساخته می‌شود ──
  const reader = gateway.createReader();

  const panels = await Promise.all(
    GROUPS.map(async (key) => {
      const specs = DESK_SOURCES[key] as readonly DeskSourceSpec[];
      const sources = await Promise.all(specs.map((s) => readSource(reader, s, now)));
      return buildPanel({ key, links: PANEL_LINKS[key] }, sources);
    })
  );

  return { status: 200, body: buildDeskView(panels, now) };
}
