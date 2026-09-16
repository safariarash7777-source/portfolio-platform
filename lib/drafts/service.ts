/**
 * بازبینیِ پیش‌نویس‌ها — مرزِ مجوز و اقدام (`P2-INTELLIGENCE-DESK-FOLLOWUP-001`).
 *
 * ساختارش عمداً همان `lib/desk/service.ts` است: مجوز و منطق از HTTP جدا،
 * وابستگی‌ها تزریق‌شده. دلیلش همان دلیلِ آنجاست — تستی که **متنِ سورس** را
 * می‌خواند ثابت می‌کند شاخهٔ ۴۰۳ حذف نشده، ولی ثابت نمی‌کند اجرا می‌شود.
 * اینجا تست واقعاً صدا می‌زند.
 *
 * ── دو گیت، نه یکی ──────────────────────────────────────────────────────
 * ۱. **کد**: `requireAdmin` نشست و `profiles.role` را می‌خوانَد.
 * ۲. **دیتابیس**: خواندن و نوشتن با کلاینتِ **نشستِ کاربر** انجام می‌شود، نه
 *    service-role. پس سیاست‌های RLSِ `terminal_t0` (`admin select/update
 *    signal_drafts`) گیتِ دومِ **مستقل**اند.
 *
 * این عمدی است و با `/api/admin/analyses` فرق دارد: آنجا پس از بررسیِ نقش،
 * service-role استفاده می‌شود که RLS را دور می‌زند. برای صفحه‌ای که فقط
 * می‌خوانَد و یک ستون را می‌بندد، دورزدنِ RLS هیچ سودی ندارد و یک لایهٔ دفاعی
 * را رایگان از دست می‌دهد.
 *
 * ── آنچه اینجا نیست ─────────────────────────────────────────────────────
 * هیچ نوشتنی در `signals`. هیچ `action: "publish"`. هیچ راهی که یک نامزدِ
 * موتور به کارنامهٔ عمومی برسد. دلیلش در `lib/drafts/contracts.ts` نوشته شده.
 */

import {
  DISMISSED,
  PENDING,
  buildDraftQueue,
  validateDismissal,
  type DraftQueue,
  type DraftRow,
} from "@/lib/drafts/contracts";

/** خوانندهٔ ردیف‌ها — در Production کلاینتِ نشستِ کاربر، در تست یک بدل. */
export interface DraftReader {
  /** `null` یعنی پرس‌وجو مردود شد — با «صفر ردیف» یکی نیست. */
  readPending(): Promise<readonly DraftRow[] | null>;
  /** `false` یعنی نوشتن انجام نشد. */
  dismiss(id: string, note: string, reviewerId: string): Promise<boolean>;
}

export interface DraftGateway {
  getUser(): Promise<{ id: string } | null>;
  getRole(userId: string): Promise<string | null>;
  /** factory است تا بشود ثابت کرد پیش از تأییدِ مجوز ساخته نمی‌شود. */
  createReader(): DraftReader;
}

export type DraftListResult =
  | { status: 200; body: DraftQueue }
  | { status: 401 | 403; body: { error: string } };

export type DraftActionResult =
  | { status: 200; body: { dismissed: string } }
  | { status: 400 | 401 | 403 | 500; body: { error: string } };

const DENIED = "دسترسی غیرمجاز.";

/** مجوز، پیش از هر چیزِ دیگر. شکست می‌بندد، نه باز می‌کند. */
async function authorize(
  gateway: DraftGateway
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  let user: { id: string } | null;
  try {
    user = await gateway.getUser();
  } catch {
    return { ok: false, status: 401 };
  }
  if (!user) return { ok: false, status: 401 };

  let role: string | null;
  try {
    role = await gateway.getRole(user.id);
  } catch {
    // نتوانستیم نقش را بخوانیم → **رد**. نادانی مجوز نمی‌سازد.
    return { ok: false, status: 403 };
  }
  if (role !== "admin") return { ok: false, status: 403 };
  return { ok: true, userId: user.id };
}

export async function listDrafts(gateway: DraftGateway): Promise<DraftListResult> {
  const gate = await authorize(gateway);
  if (!gate.ok) return { status: gate.status, body: { error: DENIED } };

  // فقط حالا کلاینت ساخته می‌شود.
  const reader = gateway.createReader();

  let rows: readonly DraftRow[] | null;
  try {
    rows = await reader.readPending();
  } catch {
    rows = null;
  }
  return { status: 200, body: buildDraftQueue(rows) };
}

/**
 * تنها اقدامِ نوشتنیِ این ماژول.
 *
 * `dismiss` وضعیت را به `rejected` می‌برد و بس. حالتِ `approved` عمداً
 * پیاده‌سازی **نشده**: چون هیچ مسیرِ انتشاری وجود ندارد، یک نامزدِ
 * «تأییدشده» فقط یک وضعیتِ معلق می‌ساخت که شبیهِ «کاری انجام شد» است در
 * حالی که هیچ اتفاقی نیفتاده — دقیقاً همان سبزِ کسب‌نشده‌ای که این PR
 * دربارهٔ آن است.
 */
export async function dismissDraft(
  gateway: DraftGateway,
  input: { id: string; note: string }
): Promise<DraftActionResult> {
  const gate = await authorize(gateway);
  if (!gate.ok) return { status: gate.status, body: { error: DENIED } };

  const id = input.id.trim();
  if (!id) return { status: 400, body: { error: "شناسهٔ نامزد الزامی است." } };

  const invalid = validateDismissal(input.note);
  if (invalid) return { status: 400, body: { error: invalid } };

  const reader = gateway.createReader();
  let done: boolean;
  try {
    done = await reader.dismiss(id, input.note.trim(), gate.userId);
  } catch {
    done = false;
  }
  if (!done) {
    return { status: 500, body: { error: "کنارگذاشتنِ نامزد انجام نشد — وضعیت تغییر نکرد." } };
  }
  return { status: 200, body: { dismissed: id } };
}

/** وضعیت‌هایی که این ماژول می‌خوانَد و می‌نویسد — برای تست و برای خواننده. */
export const DRAFT_STATUS = { reads: PENDING, writes: DISMISSED } as const;
